import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  SendTransactionError, 
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
} from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import { buildTxDebugInfo } from "@/components/TxDebugPanel";
import { normalizeSignature, isBlockingRoom } from "@/lib/solana-utils";
import { isRoomArchived, archiveRoom } from "@/lib/roomArchive";
import { supabase } from "@/integrations/supabase/client";
import { computeRulesHash, createRulesFromRoom } from "@/lib/gameAcceptance";
import { getSessionToken, getAuthHeaders, storeSessionToken } from "@/lib/sessionToken";
import {
  RoomDisplay,
  GameType,
  RoomStatus,
  isActiveStatus,
  statusToName,
  fetchOpenPublicRooms,
  fetchAllRooms,
  fetchRoomsByCreator,
  findCollisionFreeRoomId,
  fetchActiveRoomsForUser,
  buildCreateRoomIx,
  buildJoinRoomIx,
  buildCancelRoomIx,
  getRoomPDA,
} from "@/lib/solana-program";

// Debug info type for failed transactions
export interface TxDebugInfo {
  publicKey: string | null;
  feePayer: string | null;
  recentBlockhash: string | null;
  signatures: Array<{ pubkey: string; signature: string | null }>;
  errorMessage: string;
  methodUsed?: string;
  adapterName?: string;
  hasAdapterSendTx?: boolean;
  txType?: 'legacy' | 'versioned';
}

// Active room polling interval (5 seconds)
const ACTIVE_ROOM_POLL_INTERVAL = 5000;

// Debounce before starting polling after wallet connects
const POLLING_DEBOUNCE_MS = 500;

export function useSolanaRooms() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected, wallet } = useWallet();
  const { toast } = useToast();
  
  // Get the wallet adapter for mobile compatibility
  const adapter = wallet?.adapter as any;
  const adapterName = adapter?.name || 'unknown';
  const hasAdapterSendTx = typeof adapter?.sendTransaction === 'function';
  
  const [rooms, setRooms] = useState<RoomDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomDisplay | null>(null);
  const [activeRooms, setActiveRooms] = useState<RoomDisplay[]>([]); // Full array of active rooms
  const [txDebugInfo, setTxDebugInfo] = useState<TxDebugInfo | null>(null);
  
  // Track polling interval and fetch guard refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFetchingActiveRoomRef = useRef(false);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // CRITICAL: Prevent duplicate wallet tx prompts (React StrictMode/dev double-render safe)
  const createRoomInFlightRef = useRef(false);
  const joinRoomInFlightRef = useRef(false);

  // Memoized blocking room: first unresolved room from activeRooms, fallback to activeRoom
  const blockingRoom = useMemo(() => {
    // Prefer checking full array if populated
    if (activeRooms.length > 0) {
      const found = activeRooms.find(isBlockingRoom);
      if (found) {
        console.log("[useSolanaRooms] blockingRoom computed from activeRooms:", found.pda.slice(0, 8));
      }
      return found ?? null;
    }
    // Fallback to single activeRoom
    if (activeRoom && isBlockingRoom(activeRoom)) {
      console.log("[useSolanaRooms] blockingRoom computed from activeRoom:", activeRoom.pda.slice(0, 8));
      return activeRoom;
    }
    return null;
  }, [activeRooms, activeRoom]);

  // Clear debug info
  const clearTxDebug = useCallback(() => {
    setTxDebugInfo(null);
  }, []);

  // Helper: Build and send VersionedTransaction (MWA compatible)
  const sendVersionedTx = useCallback(async (
    instructions: TransactionInstruction[]
  ): Promise<{ signature: string; blockhash: string; lastValidBlockHeight: number }> => {
    if (!publicKey) throw new Error("Wallet not connected");
    
    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    
    // Build V0 message
    const messageV0 = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();
    
    // Create VersionedTransaction
    const vtx = new VersionedTransaction(messageV0);
    
    console.log("[Tx] VersionedTransaction prepared:", {
      txType: "versioned",
      payerKey: publicKey.toBase58().slice(0, 8),
      blockhash: blockhash.slice(0, 12),
      adapterName,
      hasAdapterSendTx,
    });
    
    // ✅ PRE-FLIGHT SIMULATION (NO WALLET POPUP)
    console.log("[TX_PREVIEW] Simulating...");
    const sim = await connection.simulateTransaction(vtx, {
      sigVerify: false,
      replaceRecentBlockhash: true,
    });
    
    if (sim.value.err) {
      console.error("[TX_PREVIEW] Failed:", sim.value.err, sim.value.logs);
      
      // Check for insufficient funds error
      const errJson = JSON.stringify(sim.value.err);
      const logs = sim.value.logs?.join(' ') || '';
      
      if (errJson.includes('InsufficientFundsForRent') || 
          errJson.includes('InsufficientFunds') || 
          logs.includes('insufficient lamports') ||
          logs.includes('insufficient funds') ||
          errJson.includes('0x1') // Custom program error for insufficient balance
      ) {
        throw new Error("INSUFFICIENT_BALANCE");
      }
      
      throw new Error("TX_SIMULATION_FAILED");
    }
    console.log("[TX_PREVIEW] OK");
    
    // ✅ ONLY NOW invoke wallet
    console.log("[TX_REQUEST] Wallet send...");
    let rawSignature: string | Uint8Array;
    if (hasAdapterSendTx) {
      console.log("[Tx] Using adapter.sendTransaction (VersionedTx) -", adapterName);
      rawSignature = await adapter.sendTransaction(vtx, connection);
    } else {
      console.log("[Tx] Using useWallet.sendTransaction (VersionedTx)");
      rawSignature = await sendTransaction(vtx, connection);
    }
    
    // Normalize signature to base58 (handles mobile wallet formats)
    const signature = normalizeSignature(rawSignature);
    console.log("[Tx] Signature (normalized):", signature);
    return { signature, blockhash, lastValidBlockHeight };
  }, [publicKey, connection, adapter, adapterName, hasAdapterSendTx, sendTransaction]);

  // Legacy sendTx helper (for cancelRoom, pingRoom, cancelAbandonedRoom)
  const sendTx = useCallback(async (tx: Transaction): Promise<string> => {
    console.log("[Tx] Legacy transaction:", {
      adapterName,
      hasAdapterSendTx,
      feePayer: tx.feePayer?.toBase58()?.slice(0, 8),
      blockhash: tx.recentBlockhash?.slice(0, 12),
    });
    
    let rawSignature: string | Uint8Array;
    if (hasAdapterSendTx) {
      console.log("[Tx] Using adapter.sendTransaction (legacy) -", adapterName);
      rawSignature = await adapter.sendTransaction(tx, connection);
    } else {
      console.log("[Tx] Using sendTransaction from useWallet (legacy)");
      rawSignature = await sendTransaction(tx, connection);
    }
    
    // Normalize signature to base58 (handles mobile wallet formats)
    const signature = normalizeSignature(rawSignature);
    console.log("[Tx] Signature (normalized):", signature);
    return signature;
  }, [adapter, adapterName, hasAdapterSendTx, sendTransaction, connection]);

  // Fetch user's active room (where user is a PLAYER - creator OR joiner)
  // This is critical for multiplayer: both creator and joiner need to see the same activeRoom
  // Returns the highest priority active room: Started first, then by roomId
  // Also filters out archived rooms
  const fetchUserActiveRoom = useCallback(async (): Promise<RoomDisplay | null> => {
    if (!publicKey) {
      setActiveRoom(null);
      return null;
    }
    
    // Prevent concurrent fetches
    if (isFetchingActiveRoomRef.current) {
      console.log("[fetchUserActiveRoom] Already fetching, skipping");
      return null;
    }
    
    isFetchingActiveRoomRef.current = true;
    
    try {
      // Fetch all active rooms where user is a player (creator OR joiner)
      const userRooms = await fetchActiveRoomsForUser(connection, publicKey);
      
      // Filter out archived rooms
      const filteredActiveRooms = userRooms.filter(room => !isRoomArchived(room.pda));
      
      // Store the full array for blockingRoom computation
      setActiveRooms(filteredActiveRooms);
      
      if (filteredActiveRooms.length === 0) {
        setActiveRoom(prev => prev === null ? prev : null);
        return null;
      }
      
      // Priority: 1) Started rooms first (in-progress games), 2) Then by highest roomId (newest)
      // This ensures both creator and joiner see the same Started room
      const sortedActiveRooms = [...filteredActiveRooms].sort((a, b) => {
        const aStarted = a.status === RoomStatus.Started ? 1 : 0;
        const bStarted = b.status === RoomStatus.Started ? 1 : 0;
        
        if (bStarted !== aStarted) {
          return bStarted - aStarted; // Started rooms first
        }
        
        // Same status: prefer higher roomId (newer)
        return b.roomId - a.roomId;
      });

      const newestActiveRoom = sortedActiveRooms[0];
      
      // Single-line log for easy debugging
      console.log(`[fetchUserActiveRoom] candidateCount=${filteredActiveRooms.length} | selected: status=${newestActiveRoom.statusName}, roomId=${newestActiveRoom.roomId}, game=${newestActiveRoom.gameTypeName}, pda=${newestActiveRoom.pda.slice(0, 8)}...`);
      
      // Only update state if PDA, status, or playerCount changed to prevent re-renders
      setActiveRoom(prev => {
        if (prev?.pda === newestActiveRoom.pda && 
            prev?.status === newestActiveRoom.status &&
            prev?.playerCount === newestActiveRoom.playerCount) {
          return prev; // No change, keep stable reference
        }
        return newestActiveRoom;
      });
      return newestActiveRoom;
    } catch (err) {
      console.error("Error fetching user active room:", err);
      setActiveRoom(prev => prev === null ? prev : null);
      return null;
    } finally {
      isFetchingActiveRoomRef.current = false;
    }
  }, [connection, publicKey]);

  // AUTO-POLL: Centralized active room polling (SINGLE SOURCE OF TRUTH)
  // Pages should NOT call fetchUserActiveRoom - they only consume activeRoom
  // Uses debounce to prevent rapid-fire fetches on wallet connect
  useEffect(() => {
    // Clear any existing interval and debounce timer
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Only poll when connected
    if (!connected || !publicKey) {
      setActiveRoom(prev => prev === null ? prev : null);
      setActiveRooms([]);
      return;
    }

    // Debounce: wait 500ms after connection before starting poll
    // This prevents rapid fetches when wallet connection state flickers
    console.log("[useSolanaRooms] Wallet connected, debouncing before poll start...");
    
    debounceTimerRef.current = setTimeout(() => {
      console.log("[useSolanaRooms] Starting active room polling (debounced)");
      fetchUserActiveRoom();

      // Set up polling interval
      pollIntervalRef.current = setInterval(() => {
        fetchUserActiveRoom();
      }, ACTIVE_ROOM_POLL_INTERVAL);
    }, POLLING_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connected, publicKey, fetchUserActiveRoom]);

  // Fetch all open public rooms
  const fetchRooms = useCallback(async () => {
    console.log("[RoomList] fetchRooms() called", {
      rpc: connection.rpcEndpoint,
      timestamp: new Date().toISOString(),
    });
    
    setLoading(true);
    setError(null);
    
    try {
      console.log("[RoomList] Calling fetchOpenPublicRooms...");
      const fetchedRooms = await fetchOpenPublicRooms(connection);
      console.log("[RoomList] fetchOpenPublicRooms returned", fetchedRooms.length, "rooms");
      setRooms(fetchedRooms);
    } catch (err) {
      console.error("[RoomList] Error fetching rooms:", err);
      setError("Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  }, [connection]);

  // Fetch single room by ID (searches all rooms)
  const getRoom = useCallback(async (roomId: number): Promise<RoomDisplay | null> => {
    const allRooms = await fetchAllRooms(connection);
    return allRooms.find(r => r.roomId === roomId) || null;
  }, [connection]);

  // Create room
  // mode is the AUTHORITATIVE mode - passed from CreateRoom form, stored in DB
  const createRoom = useCallback(async (
    gameType: GameType,
    entryFeeSol: number,
    maxPlayers: number,
    mode: 'casual' | 'ranked' | 'private' = 'casual'
  ): Promise<number | null> => {
    // CRITICAL: Prevent duplicate wallet prompts (React StrictMode safe)
    if (createRoomInFlightRef.current) {
      console.warn("[TXLOCK] blocked duplicate create - transaction already in flight");
      return null;
    }
    
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return null;
    }

    // Check for existing active room
    const existingRoom = await fetchUserActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before creating a new one",
        variant: "destructive",
      });
      return null;
    }

    // Set guard BEFORE any async wallet interaction
    createRoomInFlightRef.current = true;
    console.log("[TXLOCK] createRoom guard SET");
    
    setTxPending(true);
    setTxDebugInfo(null);
    
    // Collision-proof room ID selection with retry logic
    const attemptCreateRoom = async (isRetry: boolean = false): Promise<number | null> => {
      // Get collision-free room ID (verifies BOTH room PDA and vault PDA don't exist)
      const { roomId, roomPda, vaultPda } = await findCollisionFreeRoomId(connection, publicKey);
      
      console.log("[CreateRoom] Collision-free ID selected:", {
        roomId,
        roomPda: roomPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
        isRetry,
      });
      
      // Build instruction (for VersionedTransaction - MWA compatible)
      const ix = buildCreateRoomIx(
        publicKey,
        roomId,
        gameType,
        entryFeeSol,
        maxPlayers
      );
      
      console.log("[CreateRoom] Building VersionedTransaction:", {
        roomId,
        roomPda: roomPda.toBase58(),
        gameType,
        entryFeeSol,
        maxPlayers,
      });
      
      // Send as VersionedTransaction
      const { signature, blockhash, lastValidBlockHeight } = await sendVersionedTx([ix]);
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      toast({
        title: "Room created!",
        description: `Room #${roomId} created successfully`,
      });
      
      // Record acceptance using tx signature as proof (creator is always player 1)
      const stakeLamports = Math.floor(entryFeeSol * LAMPORTS_PER_SOL);
      try {
        // We already know the room PDA from findCollisionFreeRoomId
        const roomPdaStr = roomPda.toBase58();
        
        // CRITICAL: Create game_sessions with correct mode IMMEDIATELY
        // This ensures Player 2 sees the correct mode when they join
        console.log("[CreateRoom] Creating game_session with mode:", mode);
        await supabase.rpc("ensure_game_session", {
          p_room_pda: roomPdaStr,
          p_game_type: gameType.toString(),
          p_player1_wallet: publicKey.toBase58(),
          p_player2_wallet: null, // Will be set when player 2 joins via record_acceptance
          p_mode: mode, // Use authoritative mode from CreateRoom form
        });
        
        const rules = createRulesFromRoom(
          roomPdaStr,
          gameType,
          maxPlayers,
          stakeLamports,
          mode // Use authoritative mode, NOT stake-derived
        );
        const rulesHash = await computeRulesHash(rules);
        
        const { data: acceptResult, error: rpcError } = await supabase.rpc("record_acceptance", {
          p_room_pda: roomPdaStr,
          p_wallet: publicKey.toBase58(),
          p_tx_signature: signature,
          p_rules_hash: rulesHash,
          p_stake_lamports: stakeLamports,
          p_is_creator: true,
        });
        
        if (rpcError) {
          console.warn("[CreateRoom] RPC record_acceptance failed:", rpcError);
          // Check if 404 (function not found) - fallback to edge function
          if (rpcError.message?.includes("404") || rpcError.code === "PGRST116") {
            console.log("[CreateRoom] Trying verify-acceptance edge function fallback...");
            const { error: fnError } = await supabase.functions.invoke("verify-acceptance", {
              body: {
                acceptance: {
                  roomPda: roomPdaStr,
                  playerWallet: publicKey.toBase58(),
                  rulesHash,
                  nonce: crypto.randomUUID(),
                  timestamp: Date.now(),
                  signature,
                },
                rules: {
                  roomPda: roomPdaStr,
                  gameType,
                  mode,
                  maxPlayers,
                  stakeLamports,
                  feeBps: 250,
                  turnTimeSeconds: 60,
                  forfeitPolicy: "timeout",
                  version: 1,
                },
              },
            });
            
            if (fnError) {
              console.error("[CreateRoom] Both RPC and edge function failed:", fnError);
              toast({
                title: "Acceptance Recording Failed",
                description: "Game will proceed but ranked features may not work",
                variant: "destructive",
              });
            } else {
              console.log("[CreateRoom] Recorded acceptance via edge function fallback");
            }
          } else {
            toast({
              title: "Acceptance Recording Failed",
              description: rpcError.message || "Unknown error",
              variant: "destructive",
            });
          }
        } else {
          console.log("[CreateRoom] Recorded acceptance with tx signature and mode:", mode);
          
          // Store session token from record_acceptance for future auth
          // CRITICAL: Handle BOTH object response AND JSON string response (Supabase may return either)
          let sessionTokenFromRpc: string | undefined;
          
          if (typeof acceptResult === 'object' && acceptResult !== null) {
            // Direct object response
            sessionTokenFromRpc = (acceptResult as Record<string, unknown>).session_token as string | undefined;
          } else if (typeof acceptResult === 'string') {
            // JSON string response - parse it
            try {
              const parsed = JSON.parse(acceptResult);
              sessionTokenFromRpc = parsed?.session_token;
            } catch {
              console.warn("[CreateRoom] Failed to parse acceptResult as JSON:", acceptResult);
            }
          }
          
          if (sessionTokenFromRpc) {
            storeSessionToken(roomPdaStr, sessionTokenFromRpc);
            console.log(`[CreateRoom] stored session token for room ${roomPdaStr.slice(0, 8)}…`);
          } else {
            console.warn("[CreateRoom] No session_token in record_acceptance response:", acceptResult);
          }
          
          // PART A FIX: For ranked games, ALSO insert into game_acceptances table
          // record_acceptance only sets p1_ready flag, but rankedGate needs game_acceptances rows
          if (mode === 'ranked') {
            const sessionToken = getSessionToken(roomPdaStr);
            if (!sessionToken) {
              console.warn("[CreateRoom] No session token for ranked-accept (skipping)");
            } else {
              try {
                const { error: rankedAcceptError } = await supabase.functions.invoke("ranked-accept", {
                  body: {
                    roomPda: roomPdaStr,
                    mode: "simple",
                  },
                  headers: getAuthHeaders(sessionToken),
                });
                
                if (rankedAcceptError) {
                  console.warn("[CreateRoom] ranked-accept for creator failed:", rankedAcceptError);
                } else {
                  console.log("[CreateRoom] ✅ Creator acceptance recorded in game_acceptances for ranked game");
                }
              } catch (rankedErr) {
                console.warn("[CreateRoom] ranked-accept call failed:", rankedErr);
              }
            }
          }
        }
      } catch (acceptErr: any) {
        console.error("[CreateRoom] Failed to record acceptance:", acceptErr);
        toast({
          title: "Acceptance Error",
          description: acceptErr?.message || "Could not record game acceptance",
          variant: "destructive",
        });
      }
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchUserActiveRoom()]);
      
      return roomId;
    };
    
    try {
      return await attemptCreateRoom(false);
    } catch (err: any) {
      const errorMsg = err?.message?.toLowerCase() || "";
      const fullError = String(err?.logs || err?.message || err);
      
      console.error("Create room error:", err);
      
      // Check for "already in use" collision error - auto-retry once with new ID
      if (fullError.includes("already in use") || errorMsg.includes("allocate")) {
        // Extract the colliding address for debugging
        const addrMatch = fullError.match(/Address\s+(\w{32,})/i) || fullError.match(/account\s+(\w{32,})/i);
        const collidingAddr = addrMatch?.[1] || "unknown";
        console.error(`[CreateRoom] Collision on address: ${collidingAddr}`);
        console.warn("[CreateRoom] Room ID collision detected, auto-retrying with new ID...");
        toast({
          title: "Room ID collision",
          description: "Retrying with a new room ID...",
        });
        
        try {
          // Wait a moment and retry with a fresh collision-free ID
          await new Promise(resolve => setTimeout(resolve, 500));
          const result = await attemptCreateRoom(true);
          return result;
        } catch (retryErr: any) {
          console.error("[CreateRoom] Retry also failed:", retryErr);
          toast({
            title: "Failed to create room",
            description: "Room ID collision persists. Please try again.",
            variant: "destructive",
          });
          return null;
        }
      }
      
      // Handle simulation failure with clean message - NO wallet popup occurred
      // Handle insufficient balance error
      if (err?.message === "INSUFFICIENT_BALANCE") {
        toast({
          title: "Insufficient SOL",
          description: "You don't have enough SOL to create this room. Add funds and try again.",
          variant: "destructive",
        });
        return null;
      }
      
      if (err?.message === "TX_SIMULATION_FAILED") {
        // Check if simulation failed due to "already in use" as well
        const simLogs = err?.logs?.join?.(" ") || "";
        if (simLogs.includes("already in use") || simLogs.includes("Allocate")) {
          console.warn("[CreateRoom] Simulation failed with collision, auto-retrying...");
          toast({
            title: "Room ID collision",
            description: "Retrying with a new room ID...",
          });
          
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const result = await attemptCreateRoom(true);
            return result;
          } catch (retryErr) {
            console.error("[CreateRoom] Retry failed:", retryErr);
          }
        }
        
        // Detailed debug info for TX_SIMULATION_FAILED in createRoom
        const blockingInfo = blockingRoom 
          ? `Room ${blockingRoom.pda.slice(0, 12)}... | Status: ${blockingRoom.status} (${statusToName(blockingRoom.status)}) | Players: ${blockingRoom.playerCount}/${blockingRoom.maxPlayers} | Winner: ${blockingRoom.winner?.slice(0, 8) || 'none'}`
          : activeRoom
            ? `Active room ${activeRoom.pda.slice(0, 12)}... | Status: ${activeRoom.status} (${statusToName(activeRoom.status)}) | Players: ${activeRoom.playerCount}/${activeRoom.maxPlayers}`
            : 'No blocking/active room detected in state';
        
        console.error("[CreateRoom] TX_SIMULATION_FAILED debug:", {
          blockingRoom: blockingRoom ? {
            pda: blockingRoom.pda,
            status: blockingRoom.status,
            statusLabel: statusToName(blockingRoom.status),
            playerCount: blockingRoom.playerCount,
            maxPlayers: blockingRoom.maxPlayers,
            winner: blockingRoom.winner,
            source: 'blockingRoom'
          } : null,
          activeRoom: activeRoom ? {
            pda: activeRoom.pda,
            status: activeRoom.status,
            statusLabel: statusToName(activeRoom.status),
            playerCount: activeRoom.playerCount,
            maxPlayers: activeRoom.maxPlayers,
            source: 'activeRoom'
          } : null,
          activeRooms: activeRooms.map(r => ({
            pda: r.pda,
            status: r.status,
            statusLabel: statusToName(r.status),
            playerCount: r.playerCount
          })),
          simulationLogs: simLogs,
        });

        // Get room to link to
        const roomToNavigate = blockingRoom?.pda || activeRoom?.pda;
        
        // If no blocking room exists, show a more helpful error message
        if (!blockingRoom && !activeRoom) {
          toast({
            title: "Transaction failed",
            description: "Unable to create room. Please check your connection and try again.",
            variant: "destructive",
          });
          return null;
        }
        
        toast({
          title: "Action not available",
          description: `${blockingInfo}${roomToNavigate ? ` — Click to view room` : ''}`,
          variant: "destructive",
        });
        
        // Also log to help debug
        if (roomToNavigate) {
          console.log(`[CreateRoom] Blocking room link: /room/${roomToNavigate}`);
        }
        
        return null;
      }
      
      // Build debug info for versioned tx
      setTxDebugInfo({
        publicKey: publicKey?.toBase58() || null,
        feePayer: publicKey?.toBase58() || null,
        recentBlockhash: null,
        signatures: [],
        errorMessage: err instanceof Error ? err.message : String(err),
        methodUsed: hasAdapterSendTx ? 'adapter.sendTransaction' : 'useWallet.sendTransaction',
        adapterName,
        hasAdapterSendTx,
        txType: 'versioned',
      });
      
      // Check for user rejection / Phantom block
      if (errorMsg.includes("reject") || errorMsg.includes("cancel") || errorMsg.includes("user denied") || errorMsg.includes("blocked")) {
        toast({
          title: "Transaction cancelled",
          description: "No changes were made",
          variant: "destructive",
        });
        return null;
      }
      
      // Check for transaction expiration (block height exceeded)
      // This happens when the user waits too long to approve or network is slow
      if (
        errorMsg.includes("block height exceeded") ||
        errorMsg.includes("blockhash not found") ||
        errorMsg.includes("transaction expired") ||
        fullError.includes("BlockheightExceeded") ||
        fullError.includes("TransactionExpiredBlockheightExceeded")
      ) {
        console.warn("[CreateRoom] Transaction expired (block height exceeded)");
        toast({
          title: "Transaction expired",
          description: "Please try again. The transaction took too long to confirm.",
          variant: "destructive",
        });
        // Clean exit - do NOT call record_acceptance or game-session-set-settings
        return null;
      }
      
      toast({
        title: "Failed to create room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return null;
    } finally {
      createRoomInFlightRef.current = false;
      console.log("[TXLOCK] createRoom guard CLEARED");
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchUserActiveRoom]);

  // Join room - returns structured TxResult
  const joinRoom = useCallback(async (roomId: number, roomCreator: string): Promise<{ ok: boolean; signature?: string; reason?: string }> => {
    // CRITICAL: Prevent duplicate wallet prompts (React StrictMode safe)
    if (joinRoomInFlightRef.current) {
      console.warn("[TXLOCK] blocked duplicate join - transaction already in flight");
      return { ok: false, reason: "TX_IN_FLIGHT" };
    }
    
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return { ok: false, reason: "WALLET_NOT_CONNECTED" };
    }

    // Check for existing active room
    const existingRoom = await fetchUserActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before joining another",
        variant: "destructive",
      });
      return { ok: false, reason: "ACTIVE_ROOM_EXISTS" };
    }

    // Set guard BEFORE any async wallet interaction
    joinRoomInFlightRef.current = true;
    console.log("[TXLOCK] joinRoom guard SET");
    
    setTxPending(true);
    setTxDebugInfo(null);
    
    try {
      const creatorPubkey = new PublicKey(roomCreator);
      
      // Build instruction (for VersionedTransaction - MWA compatible)
      const ix = buildJoinRoomIx(publicKey, creatorPubkey, roomId);
      
      console.log("[JoinRoom] Building VersionedTransaction:", {
        roomId,
        roomCreator: roomCreator.slice(0, 8),
      });
      
      // Send as VersionedTransaction
      const { signature, blockhash, lastValidBlockHeight } = await sendVersionedTx([ix]);
      
      // 🔍 DEBUG LOG: Join tx sent
      console.log("[JoinRoom] ✅ Join tx sent:", {
        signature: signature.slice(0, 16) + "...",
        roomId,
        roomCreator: roomCreator.slice(0, 8),
        joiner: publicKey.toBase58().slice(0, 8),
      });
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      // 🔍 DEBUG LOG: Join tx confirmed
      console.log("[JoinRoom] ✅ Join tx CONFIRMED:", {
        signature: signature.slice(0, 16) + "...",
        roomId,
      });
      
      toast({
        title: "Joined room!",
        description: `Successfully joined room #${roomId}`,
      });
      
      // ═══════════════════════════════════════════════════════════════════════
      // CRITICAL: Sync participants + get session token IMMEDIATELY after join tx
      // This is the AUTHORITATIVE DB sync step for the joiner.
      // ═══════════════════════════════════════════════════════════════════════
      try {
        // 1) Fetch the room PDA from on-chain (just confirmed)
        const joinedRoom = await fetchUserActiveRoom();
        if (!joinedRoom?.pda) {
          console.warn("[JoinRoom] ⚠️ Could not fetch joined room after tx confirmation");
          return { ok: true, signature }; // Still success, but no session token
        }

        console.log("[JoinRoom] 🔄 Syncing participants via ranked-accept...", {
          roomPda: joinedRoom.pda.slice(0, 8),
          joiner: publicKey.toBase58().slice(0, 8),
        });

        // 2) First, ensure game_session exists with joiner as player2
        //    record_acceptance sets player2_wallet but NOT participants[]
        const stakeLamports = Math.floor(joinedRoom.entryFeeSol * LAMPORTS_PER_SOL);
        
        // Fetch mode from DB 
        const { data: sessionResp } = await supabase.functions.invoke("game-session-get", {
          body: { roomPda: joinedRoom.pda },
        });
        const mode = (sessionResp?.session?.mode as 'casual' | 'ranked' | 'private') || 'casual';
        console.log("[JoinRoom] DB mode:", mode);

        // 3) Call record_acceptance first to get a session token
        const rules = createRulesFromRoom(
          joinedRoom.pda,
          joinedRoom.gameType,
          joinedRoom.maxPlayers,
          stakeLamports,
          mode
        );
        const rulesHash = await computeRulesHash(rules);

        const { data: acceptResult, error: rpcError } = await supabase.rpc("record_acceptance", {
          p_room_pda: joinedRoom.pda,
          p_wallet: publicKey.toBase58(),
          p_tx_signature: signature,
          p_rules_hash: rulesHash,
          p_stake_lamports: stakeLamports,
          p_is_creator: false,
        });

        let sessionToken: string | null = null;

        if (rpcError) {
          console.warn("[JoinRoom] record_acceptance RPC failed:", rpcError.message);
        } else {
          const resultObj = typeof acceptResult === 'object' && acceptResult !== null 
            ? acceptResult as Record<string, unknown> 
            : null;
          sessionToken = (resultObj?.session_token as string) || null;
          
          if (sessionToken) {
            storeSessionToken(joinedRoom.pda, sessionToken);
            console.log("[JoinRoom] ✅ Session token stored from record_acceptance:", sessionToken.slice(0, 8));
          }
        }

        // 4) CRITICAL: Call ranked-accept to sync on-chain participants to DB
        //    This is the step that populates game_sessions.participants[]
        //    and ensures player2_wallet is set correctly.
        if (sessionToken) {
          console.log("[JoinRoom] 🔄 Calling ranked-accept to sync participants...");
          
          const { data: rankedData, error: rankedError } = await supabase.functions.invoke("ranked-accept", {
            body: {
              roomPda: joinedRoom.pda,
              mode: "simple", // Simple mode - session token provides identity
            },
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          });

          if (rankedError) {
            console.error("[JoinRoom] ranked-accept failed:", rankedError);
          } else if (rankedData?.success) {
            console.log("[JoinRoom] ✅ ranked-accept SUCCESS - participants synced:", {
              sessionToken: rankedData.sessionToken?.slice(0, 8),
            });
            
            // Update session token if ranked-accept returned a new one
            if (rankedData.sessionToken) {
              storeSessionToken(joinedRoom.pda, rankedData.sessionToken);
              console.log("[JoinRoom] ✅ Session token updated from ranked-accept");
            }
          } else {
            console.warn("[JoinRoom] ranked-accept returned:", rankedData);
          }
        } else {
          // No session token from record_acceptance - try ranked-accept directly
          // This will fail auth check, but we log for debugging
          console.warn("[JoinRoom] ⚠️ No session token - cannot call ranked-accept");
        }

        // ═══════════════════════════════════════════════════════════════════════
        // 5) FAIL-FAST DB SYNC CHECK: Poll game-session-get to verify joiner is registered
        //    If DB does not show joiner after 5 seconds, return error (do NOT navigate to /play)
        // ═══════════════════════════════════════════════════════════════════════
        const DB_SYNC_POLL_INTERVAL_MS = 500;
        const DB_SYNC_TIMEOUT_MS = 5000;
        const dbSyncStartTime = Date.now();
        let dbSyncSuccess = false;

        console.log("[JoinRoom] 🔍 Polling DB to verify joiner sync...");

        while (Date.now() - dbSyncStartTime < DB_SYNC_TIMEOUT_MS) {
          try {
            const { data: pollResp, error: pollError } = await supabase.functions.invoke("game-session-get", {
              body: { roomPda: joinedRoom.pda },
            });

            if (pollError) {
              console.warn("[JoinRoom] DB sync poll error:", pollError.message);
            } else {
              const debug = pollResp?.debug || {};
              const playerSessionsCount = debug.player_sessions_count ?? 0;
              const acceptancesCount = debug.game_acceptances_count ?? 0;
              const participantsCount = debug.participantsCount ?? pollResp?.session?.participants?.length ?? 0;
              
              console.log("[JoinRoom] DB sync poll:", {
                player_sessions_count: playerSessionsCount,
                game_acceptances_count: acceptancesCount,
                participantsCount: participantsCount,
                elapsed: Date.now() - dbSyncStartTime,
              });

              // Success if ANY of these counts >= 2 (joiner registered)
              if (playerSessionsCount >= 2 || acceptancesCount >= 2 || participantsCount >= 2) {
                dbSyncSuccess = true;
                console.log("[JoinRoom] ✅ DB sync verified - joiner is registered");
                break;
              }
            }
          } catch (pollErr) {
            console.warn("[JoinRoom] DB sync poll exception:", pollErr);
          }

          // Wait before next poll
          await new Promise(resolve => setTimeout(resolve, DB_SYNC_POLL_INTERVAL_MS));
        }

        // ═══════════════════════════════════════════════════════════════════════
        // FAIL-FAST: If DB did not register joiner within timeout, return error
        // ═══════════════════════════════════════════════════════════════════════
        if (!dbSyncSuccess) {
          console.error("[JoinRoom] ❌ DB sync failed - joiner not registered after 5s");
          toast({
            title: "Join failed to sync",
            description: `Room ${joinedRoom.pda.slice(0, 8)}... - Please retry.`,
            variant: "destructive",
          });
          return { ok: false, reason: "JOIN_DB_SYNC_FAILED" };
        }

      } catch (syncErr: any) {
        console.error("[JoinRoom] Failed to sync participants:", syncErr);
        toast({
          title: "Join failed to sync",
          description: `Sync error. Please retry.`,
          variant: "destructive",
        });
        return { ok: false, reason: "JOIN_DB_SYNC_FAILED" };
      }
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchUserActiveRoom()]);
      return { ok: true, signature };
    } catch (err: any) {
      console.error("Join room error:", err);
      
      // Handle insufficient balance error
      if (err?.message === "INSUFFICIENT_BALANCE") {
        toast({
          title: "Insufficient SOL",
          description: "You don't have enough SOL to join this room. Add funds and try again.",
          variant: "destructive",
        });
        return { ok: false, reason: "INSUFFICIENT_BALANCE" };
      }
      
      // Handle simulation failure with clean message - NO wallet popup occurred
      if (err?.message === "TX_SIMULATION_FAILED") {
        toast({
          title: "Action not available",
          description: "This room may be full or no longer accepting players.",
          variant: "destructive",
        });
        return { ok: false, reason: "TX_SIMULATION_FAILED" };
      }
      
      // Build debug info for versioned tx
      setTxDebugInfo({
        publicKey: publicKey?.toBase58() || null,
        feePayer: publicKey?.toBase58() || null,
        recentBlockhash: null,
        signatures: [],
        errorMessage: err instanceof Error ? err.message : String(err),
        methodUsed: hasAdapterSendTx ? 'adapter.sendTransaction' : 'useWallet.sendTransaction',
        adapterName,
        hasAdapterSendTx,
        txType: 'versioned',
      });
      
      // Check for user rejection / Phantom block
      const errorMsg = err?.message?.toLowerCase() || "";
      const fullError = String(err?.logs || err?.message || err);
      
      if (errorMsg.includes("reject") || errorMsg.includes("cancel") || errorMsg.includes("user denied") || errorMsg.includes("blocked")) {
        toast({
          title: "Transaction cancelled",
          description: "No changes were made",
          variant: "destructive",
        });
        return { ok: false, reason: "PHANTOM_BLOCKED_OR_REJECTED" };
      }
      
      // Check for transaction expiration (block height exceeded)
      if (
        errorMsg.includes("block height exceeded") ||
        errorMsg.includes("blockhash not found") ||
        errorMsg.includes("transaction expired") ||
        fullError.includes("BlockheightExceeded") ||
        fullError.includes("TransactionExpiredBlockheightExceeded")
      ) {
        console.warn("[JoinRoom] Transaction expired (block height exceeded)");
        toast({
          title: "Transaction expired",
          description: "Please try again. The transaction took too long to confirm.",
          variant: "destructive",
        });
        // Clean exit - do NOT call record_acceptance or ranked-accept
        return { ok: false, reason: "TX_EXPIRED" };
      }
      
      // Check for insufficient funds for rent
      if (errorMsg.includes("insufficientfundsforrent") || errorMsg.includes("insufficient funds for rent")) {
        toast({
          title: "Insufficient SOL",
          description: "Add more SOL to cover stake + rent (~0.003 SOL extra needed)",
          variant: "destructive",
        });
        return { ok: false, reason: "INSUFFICIENT_FUNDS" };
      }
      
      toast({
        title: "Failed to join room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return { ok: false, reason: "ERROR" };
    } finally {
      joinRoomInFlightRef.current = false;
      console.log("[TXLOCK] joinRoom guard CLEARED");
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchUserActiveRoom, hasAdapterSendTx, adapterName]);

  // cancelRoom - cancel an open room (only creator, only when playerCount == 1)
  const cancelRoom = useCallback(
    async (roomId: number): Promise<{ ok: boolean; signature?: string; reason?: string }> => {
      if (!publicKey || !connected) {
        toast({
          title: "Wallet not connected",
          variant: "destructive",
        });
        return { ok: false, reason: "WALLET_NOT_CONNECTED" };
      }

      setTxPending(true);
      setTxDebugInfo(null);

      try {
        const ix = buildCancelRoomIx(publicKey, roomId);

        // Send as VersionedTransaction (mobile-safe)
        const { signature, blockhash, lastValidBlockHeight } = await sendVersionedTx([ix]);

        toast({
          title: "Transaction sent",
          description: "Waiting for confirmation...",
        });

        // CRITICAL: wait for confirmation BEFORE success UI
        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed"
        );

        toast({
          title: "Room cancelled",
          description: "Your stake has been refunded",
        });

        // Refresh state AFTER confirmed
        await Promise.all([fetchRooms(), fetchUserActiveRoom()]);

        return { ok: true, signature };
      } catch (err: any) {
        const msg = err?.message?.toLowerCase?.() || "";

        // Handle simulation failure with detailed message
        if (err?.message === "TX_SIMULATION_FAILED") {
          console.error("[CancelRoom] TX_SIMULATION_FAILED - room may already be closed or in unexpected state");
          toast({
            title: "Action not available",
            description: "Room may already be closed or in an unexpected state. Refresh and try again.",
            variant: "destructive",
          });
          return { ok: false, reason: "TX_SIMULATION_FAILED" };
        }

        if (
          msg.includes("reject") ||
          msg.includes("denied") ||
          msg.includes("cancel") ||
          msg.includes("blocked")
        ) {
          toast({
            title: "Transaction cancelled",
            description: "No changes were made",
            variant: "destructive",
          });
          return { ok: false, reason: "PHANTOM_BLOCKED_OR_REJECTED" };
        }

        let displayError = err?.message || "Transaction failed";
        if (err?.logs) {
          const anchorErr = err.logs.find((l: string) => l.includes("Error Code:"));
          if (anchorErr) displayError = anchorErr;
        }

        toast({
          title: "Failed to cancel room",
          description: displayError,
          variant: "destructive",
        });

        return { ok: false, reason: "ERROR" };
      } finally {
        setTxPending(false);
      }
    },
    [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchUserActiveRoom]
  );

  // cancelRoomByPda - cancel a room using its PDA (fetches roomId internally)
  const cancelRoomByPda = useCallback(
    async (roomPda: string): Promise<{ ok: boolean; signature?: string; reason?: string }> => {
      if (!publicKey || !connected) {
        return { ok: false, reason: "WALLET_NOT_CONNECTED" };
      }

      try {
        // Fetch the room to get the roomId
        const { fetchRoomByPda } = await import("@/lib/solana-program");
        const room = await fetchRoomByPda(connection, roomPda);
        
        if (!room) {
          return { ok: false, reason: "ROOM_NOT_FOUND" };
        }

        // Use the standard cancelRoom with the fetched roomId
        const result = await cancelRoom(room.roomId);
        
        // On success, immediately clear room from local state for responsive UX
        if (result.ok) {
          console.log("[cancelRoomByPda] Success - clearing room from state:", roomPda.slice(0, 8));
          archiveRoom(roomPda);
          setActiveRooms(prev => prev.filter(r => r.pda !== roomPda));
          setActiveRoom(prev => (prev?.pda === roomPda ? null : prev));
        }
        
        return result;
      } catch (err: any) {
        console.error("[cancelRoomByPda] Error:", err);
        return { ok: false, reason: err?.message || "ERROR" };
      }
    },
    [publicKey, connected, connection, cancelRoom]
  );

  // When the program is updated, re-enable this function
  const pingRoom = useCallback(async (roomId: number, triggeredBy: 'userClick' | 'interval'): Promise<{ ok: boolean; signature?: string; reason?: string }> => {
    console.log("[PingRoom] Disabled - ping_room not in current program");
    return { ok: false, reason: "NOT_IN_PROGRAM" };
  }, []);

  // cancelAbandonedRoom is disabled - cancel_room_if_abandoned instruction not in current on-chain program
  // When the program is updated, re-enable this function
  const cancelAbandonedRoom = useCallback(async (roomId: number, roomCreator: string, players: PublicKey[]): Promise<boolean> => {
    toast({
      title: "Cancel Abandoned Room Unavailable",
      description: "This feature is not yet available on mainnet. Please wait for the next program update.",
      variant: "destructive",
    });
    return false;
  }, [toast]);

  // forfeitGame - forfeit a game in progress (2 players: opponent wins, Ludo 3+: player eliminated)
  const forfeitGame = useCallback(async (
    roomPda: string,
    gameType?: string
  ): Promise<{ ok: boolean; signature?: string; reason?: string; error?: string }> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        variant: "destructive",
      });
      return { ok: false, reason: "WALLET_NOT_CONNECTED" };
    }

    setTxPending(true);
    
    try {
      console.log("[forfeitGame] Calling forfeit-game edge function:", { roomPda, gameType });
      
      // Import supabase client dynamically to avoid circular dependency
      const { supabase } = await import("@/integrations/supabase/client");
      
      // Session token for authorization (edge function derives caller from token)
      const token =
        localStorage.getItem(`session_token_${roomPda}`) ||
        localStorage.getItem("session_token_latest") ||
        "";

      const { data, error } = await supabase.functions.invoke("forfeit-game", {
        body: { roomPda, gameType },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (error) {
        console.error("[forfeitGame] Edge function error:", error);
        toast({
          title: "Failed to forfeit",
          description: error.message || "Forfeit request failed",
          variant: "destructive",
        });
        return { ok: false, reason: error.message };
      }

      if (!data?.success) {
        const errorCode = data?.error || "Unknown error";
        console.error("[forfeitGame] Forfeit failed:", errorCode);
        toast({
          title: "Failed to forfeit",
          description: errorCode === "VAULT_UNFUNDED" 
            ? "Game funding not complete. Stakes were not fully deposited."
            : errorCode,
          variant: "destructive",
        });
        return { ok: false, reason: errorCode, error: errorCode };
      }

      console.log("[forfeitGame] Forfeit response:", data);
      if (data?.signature) console.log("[forfeitGame] Payout signature:", data.signature);
      
      if (data.action === "eliminated") {
        toast({
          title: "You left the game",
          description: "You have been eliminated. Game continues without you.",
        });
      } else if (data.action === "void_cleared") {
        archiveRoom(roomPda);
        console.log("[forfeitGame] Room void-cleared, archived locally:", roomPda);
        toast({
          title: "Room Cleared",
          description: "This match couldn't be settled on-chain. It has been removed from your active games.",
        });
      } else if (data.action === "already_closed") {
        archiveRoom(roomPda);
        console.log("[forfeitGame] Room already closed, archived locally:", roomPda);
        toast({
          title: "Room Already Closed",
          description: "This room was already closed and has been removed from your active games.",
        });
      } else {
        toast({
          title: "Match forfeited",
          description: data?.signature 
            ? `Opponent wins. Payout tx: ${data.signature.slice(0, 12)}...` 
            : "Opponent wins.",
        });
      }

      // CRITICAL: Clear local state immediately for the forfeited room
      // This prevents stale state from blocking create-room
      archiveRoom(roomPda);
      console.log("[forfeitGame] Archived room and clearing local state:", roomPda);
      
      // Immediately remove from local state arrays
      setActiveRooms(prev => prev.filter(r => r.pda !== roomPda));
      setActiveRoom(prev => (prev?.pda === roomPda ? null : prev));
      
      // Also refresh from on-chain to ensure consistency
      await fetchUserActiveRoom();

      return { ok: true, signature: data.signature };
    } catch (err: any) {
      console.error("[forfeitGame] Unexpected error:", err);
      toast({
        title: "Failed to forfeit",
        description: err.message || "Unexpected error",
        variant: "destructive",
      });
      return { ok: false, reason: "ERROR" };
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, toast, fetchUserActiveRoom]);

  // Get user's SOL balance - only after wallet is connected with publicKey
  const getBalance = useCallback(async (): Promise<number> => {
    if (!connected || !publicKey) {
      console.info('[Wallet] getBalance: Not connected or no publicKey');
      return 0;
    }
    try {
      // Use 'confirmed' commitment for reliable balance
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      const sol = lamports / LAMPORTS_PER_SOL;
      console.info(`[Wallet] getBalance: ${sol.toFixed(4)} SOL | Address: ${publicKey.toBase58().slice(0, 8)}...`);
      return sol;
    } catch (err) {
      console.warn('[Wallet] getBalance failed:', err);
      return 0;
    }
  }, [connected, publicKey, connection]);

  // Find all active game sessions where user is a participant (from Supabase)
  const findMyActiveGameSessions = useCallback(async (): Promise<Array<{
    roomPda: string;
    gameType: string;
    status: string;
    isPlayer1: boolean;
  }>> => {
    if (!publicKey) return [];
    
    try {
      // Import supabase client
      const { supabase } = await import("@/integrations/supabase/client");
      const walletAddress = publicKey.toBase58();
      
      // Use Edge Function instead of direct table access (RLS locked)
      const { data: resp, error } = await supabase.functions.invoke("game-sessions-list", {
        body: { type: "recoverable_for_wallet", wallet: walletAddress },
      });
      const data = resp?.rows ?? [];
      
      if (error) {
        console.error('[findMyActiveGameSessions] Error:', error);
        return [];
      }
      
      return (data || []).map(session => ({
        roomPda: session.room_pda,
        gameType: session.game_type,
        status: session.status,
        isPlayer1: session.player1_wallet === walletAddress,
      }));
    } catch (err) {
      console.error('[findMyActiveGameSessions] Error:', err);
      return [];
    }
  }, [publicKey]);

  // Clear a specific room from local state (used after settlement/forfeit)
  // This immediately removes the room from activeRooms/activeRoom to prevent blocking
  const clearRoomFromState = useCallback((roomPda: string) => {
    console.log("[clearRoomFromState] Clearing room from local state:", roomPda);
    archiveRoom(roomPda);
    setActiveRooms(prev => prev.filter(r => r.pda !== roomPda));
    setActiveRoom(prev => (prev?.pda === roomPda ? null : prev));
  }, []);

  return {
    rooms,
    loading,
    error,
    txPending,
    activeRoom,
    activeRooms,
    blockingRoom,
    txDebugInfo,
    clearTxDebug,
    fetchRooms,
    getRoom,
    createRoom,
    joinRoom,
    cancelRoom,
    cancelRoomByPda,
    forfeitGame,
    pingRoom,
    cancelAbandonedRoom,
    getBalance,
    fetchUserActiveRoom,
    findMyActiveGameSessions,
    clearRoomFromState,
  };
}
