import { useState, useCallback, useEffect, useRef } from "react";
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
import { normalizeSignature } from "@/lib/solana-utils";
import { isRoomArchived } from "@/lib/roomArchive";
import {
  RoomDisplay,
  GameType,
  RoomStatus,
  isActiveStatus,
  fetchOpenPublicRooms,
  fetchAllRooms,
  fetchRoomsByCreator,
  fetchNextRoomIdForCreator,
  buildCreateRoomIx,
  buildJoinRoomIx,
  buildCancelRoomIx,
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
  const [txDebugInfo, setTxDebugInfo] = useState<TxDebugInfo | null>(null);
  
  // Track polling interval ref
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
    
    // Send using adapter.sendTransaction (works for both legacy and versioned)
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

  // Fetch user's active room (created by them, status Created or Started)
  // Returns the newest active room by roomId (descending) to handle collisions
  // Also filters out archived rooms
  const fetchCreatorActiveRoom = useCallback(async (): Promise<RoomDisplay | null> => {
    if (!publicKey) {
      setActiveRoom(null);
      return null;
    }
    
    try {
      // Use creator-scoped fetch - filters by creator pubkey on-chain
      const creatorRooms = await fetchRoomsByCreator(connection, publicKey);
      
      // Filter to active statuses: Open (0 or 1) or Started (2)
      // Also exclude archived rooms
      const activeRooms = creatorRooms.filter(room => 
        isActiveStatus(room.status) && !isRoomArchived(room.pda)
      );
      
      if (activeRooms.length === 0) {
        setActiveRoom(null);
        return null;
      }
      
      // Pick newest by roomId (descending) to handle multiple active rooms
      // This ensures only ONE active room is returned (deduplication)
      const newestActiveRoom = activeRooms.reduce((newest, room) => 
        room.roomId > newest.roomId ? room : newest
      );
      
      console.log("[fetchCreatorActiveRoom] Found active room:", {
        pda: newestActiveRoom.pda,
        roomId: newestActiveRoom.roomId,
        status: newestActiveRoom.statusName,
        playerCount: newestActiveRoom.playerCount,
      });
      
      setActiveRoom(newestActiveRoom);
      return newestActiveRoom;
    } catch (err) {
      console.error("Error fetching active room:", err);
      setActiveRoom(null);
      return null;
    }
  }, [connection, publicKey]);

  // AUTO-POLL: Centralized active room polling (SINGLE SOURCE OF TRUTH)
  // Pages should NOT call fetchCreatorActiveRoom - they only consume activeRoom
  useEffect(() => {
    // Clear any existing interval
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Only poll when connected
    if (!connected || !publicKey) {
      setActiveRoom(null);
      return;
    }

    // Fetch immediately on connect
    console.log("[useSolanaRooms] Starting active room polling");
    fetchCreatorActiveRoom();

    // Set up polling interval
    pollIntervalRef.current = setInterval(() => {
      fetchCreatorActiveRoom();
    }, ACTIVE_ROOM_POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [connected, publicKey, fetchCreatorActiveRoom]);

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
  const createRoom = useCallback(async (
    gameType: GameType,
    entryFeeSol: number,
    maxPlayers: number
  ): Promise<number | null> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return null;
    }

    // Check for existing active room
    const existingRoom = await fetchCreatorActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before creating a new one",
        variant: "destructive",
      });
      return null;
    }

    setTxPending(true);
    setTxDebugInfo(null);
    
    try {
      // Get next unique room ID for this creator
      const roomId = await fetchNextRoomIdForCreator(connection, publicKey);
      
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
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchCreatorActiveRoom()]);
      
      return roomId;
    } catch (err: any) {
      console.error("Create room error:", err);
      
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
      
      // Extract better error message
      let errorMsg = err.message || "Transaction failed";
      if (err instanceof SendTransactionError) {
        errorMsg = err.message;
      }
      
      toast({
        title: "Failed to create room",
        description: errorMsg,
        variant: "destructive",
      });
      return null;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchCreatorActiveRoom]);

  // Join room - returns structured TxResult
  const joinRoom = useCallback(async (roomId: number, roomCreator: string): Promise<{ ok: boolean; signature?: string; reason?: string }> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return { ok: false, reason: "WALLET_NOT_CONNECTED" };
    }

    // Check for existing active room
    const existingRoom = await fetchCreatorActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before joining another",
        variant: "destructive",
      });
      return { ok: false, reason: "ACTIVE_ROOM_EXISTS" };
    }

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
        title: "Joined room!",
        description: `Successfully joined room #${roomId}`,
      });
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchCreatorActiveRoom()]);
      return { ok: true, signature };
    } catch (err: any) {
      console.error("Join room error:", err);
      
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
      if (errorMsg.includes("reject") || errorMsg.includes("cancel") || errorMsg.includes("user denied") || errorMsg.includes("blocked")) {
        toast({
          title: "Transaction cancelled",
          description: "Phantom blocked or you rejected the request. No changes were made. Please refresh and try again.",
          variant: "destructive",
        });
        return { ok: false, reason: "PHANTOM_BLOCKED_OR_REJECTED" };
      }
      
      toast({
        title: "Failed to join room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return { ok: false, reason: "ERROR" };
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchCreatorActiveRoom, hasAdapterSendTx, adapterName]);

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
        await Promise.all([fetchRooms(), fetchCreatorActiveRoom()]);

        return { ok: true, signature };
      } catch (err: any) {
        const msg = err?.message?.toLowerCase?.() || "";

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
    [publicKey, connected, connection, sendVersionedTx, toast, fetchRooms, fetchCreatorActiveRoom]
  );

  // pingRoom is disabled - ping_room instruction not in current on-chain program
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

  return {
    rooms,
    loading,
    error,
    txPending,
    activeRoom,
    txDebugInfo,
    clearTxDebug,
    fetchRooms,
    getRoom,
    createRoom,
    joinRoom,
    cancelRoom,
    pingRoom,
    cancelAbandonedRoom,
    getBalance,
    fetchCreatorActiveRoom,
  };
}
