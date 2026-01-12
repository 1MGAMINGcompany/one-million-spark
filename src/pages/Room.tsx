import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, TransactionMessage } from "@solana/web3.js";

import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { parseRoomAccount, getVaultPDA, RoomStatus, statusToName, isOpenStatus, buildCloseRoomIx, PROGRAM_ID } from "@/lib/solana-program";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useTxLock } from "@/contexts/TxLockContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft, Loader2, Users, Coins, AlertTriangle, CheckCircle, Share2, Copy, ExternalLink, Wallet } from "lucide-react";
import { RecoverFundsButton } from "@/components/RecoverFundsButton";
import { WalletGateModal } from "@/components/WalletGateModal";
import { RivalryWidget } from "@/components/RivalryWidget";
import { WalletLink } from "@/components/WalletLink";
import { TxDebugPanel } from "@/components/TxDebugPanel";
import { MobileWalletRedirect } from "@/components/MobileWalletRedirect";
import { PreviewDomainBanner, useSigningDisabled } from "@/components/PreviewDomainBanner";
import { JoinRulesModal } from "@/components/JoinRulesModal";
import { validatePublicKey, isMobileDevice, hasInjectedSolanaWallet, getRoomPda } from "@/lib/solana-utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Presence feature disabled until program supports ping_room
// const CREATOR_TIMEOUT_SECS = 60;
// const PING_INTERVAL_MS = 60000;

const GAME_NAMES: Record<number, string> = {
  1: "Chess",
  2: "Dominos",
  3: "Backgammon",
  4: "Checkers",
  5: "Ludo",
};

function isDefaultPubkey(p: any) {
  try {
    return p?.toBase58?.() === PublicKey.default.toBase58();
  } catch {
    return false;
  }
}

function formatSol(lamports: bigint | number | string, maxDecimals = 4): string {
  const v = typeof lamports === "bigint" ? lamports : BigInt(lamports.toString());
  const sol = Number(v) / LAMPORTS_PER_SOL;
  // Show up to maxDecimals, but trim trailing zeros
  return sol
    .toFixed(maxDecimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}

export default function Room() {
  const { roomPda: roomPdaParam } = useParams<{ roomPda: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { connection } = useConnection();
  const wallet = useSolanaWallet();
  const { activeRoom, joinRoom, createRoom, cancelRoom, txPending: hookTxPending, txDebugInfo, clearTxDebug } = useSolanaRooms();
  const { isTxInFlight, withTxLock } = useTxLock();
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [showMobileWalletRedirect, setShowMobileWalletRedirect] = useState(false);
  const [showJoinRulesModal, setShowJoinRulesModal] = useState(false);
  const [joinInProgress, setJoinInProgress] = useState(false);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdaError, setPdaError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [vaultLamports, setVaultLamports] = useState<bigint>(0n);
  const [vaultPdaStr, setVaultPdaStr] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);
  
  // Room mode from DB (single source of truth - NOT localStorage)
  const [roomMode, setRoomMode] = useState<'casual' | 'ranked'>('casual');
  const [roomModeLoaded, setRoomModeLoaded] = useState(false);
  
  // Check if this is a rematch room (either just created or from rematch param)
  const isRematchCreated = searchParams.get('rematch_created') === '1';
  const isRematch = searchParams.get('rematch') === '1' || isRematchCreated;
  
  // Generate room link
  const roomLink = `${window.location.origin}/room/${roomPdaParam}`;
  
  // Check if native share is available
  const canNativeShare = typeof navigator !== 'undefined' && !!navigator.share;
  
  // Dismiss rematch banner
  const dismissRematchBanner = () => {
    searchParams.delete('rematch_created');
    setSearchParams(searchParams, { replace: true });
  };
  
  // Copy room link
  const copyRoomLink = async () => {
    try {
      await navigator.clipboard.writeText(roomLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };
  
  // Native share
  const handleNativeShare = async () => {
    if (canNativeShare) {
      try {
        await navigator.share({
          title: 'Join my game!',
          text: 'Join my rematch game on 1M Gaming',
          url: roomLink,
        });
      } catch (err) {
        // User cancelled or share failed - fallback to copy
        if ((err as Error).name !== 'AbortError') {
          copyRoomLink();
        }
      }
    } else {
      copyRoomLink();
    }
  };
  
  // Check if signing is disabled (preview domain)
  const signingDisabled = useSigningDisabled();
  
  // Check if we need to redirect to wallet app
  const needsMobileWalletRedirect = isMobileDevice() && !hasInjectedSolanaWallet();
  
  // Validate PDA param on mount
  useEffect(() => {
    if (!roomPdaParam) {
      setPdaError("No room specified");
      return;
    }
    
    const validPda = validatePublicKey(roomPdaParam);
    if (!validPda) {
      setPdaError("Invalid room link");
      console.error("[Room] Invalid PDA param:", roomPdaParam);
    } else {
      setPdaError(null);
    }
  }, [roomPdaParam]);
  
  // Fetch room mode from DB (single source of truth - NOT localStorage)
  // The mode is set by the creator in createRoom and stored in game_sessions
  const [modeFetchAttempts, setModeFetchAttempts] = useState(0);
  const MAX_MODE_RETRIES = 5;
  
  useEffect(() => {
    if (!roomPdaParam) return;
    
    const fetchRoomMode = async () => {
      try {
        const { data, error } = await supabase
          .from("game_sessions")
          .select("mode")
          .eq("room_pda", roomPdaParam)
          .maybeSingle();
        
        if (data?.mode) {
          setRoomMode(data.mode as 'casual' | 'ranked');
          console.log("[RoomMode] DB mode:", data.mode);
          setRoomModeLoaded(true);
        } else if (modeFetchAttempts < MAX_MODE_RETRIES) {
          // Retry - game_session might not be created yet
          console.log("[RoomMode] No game_session found, retry", modeFetchAttempts + 1);
          setTimeout(() => setModeFetchAttempts(prev => prev + 1), 800);
        } else {
          // Max retries reached - this is an error state, not a default
          console.warn("[RoomMode] No game_session after retries - mode unknown");
          setRoomModeLoaded(true);
          // Keep default casual but log warning
        }
      } catch (err) {
        console.error("[RoomMode] Failed to fetch mode:", err);
        setRoomModeLoaded(true);
      }
    };
    
    fetchRoomMode();
  }, [roomPdaParam, modeFetchAttempts]);

  const status = room?.status ?? 0;
  const statusName = statusToName(status);
  const gameName = GAME_NAMES[room?.gameType] || `Game ${room?.gameType}`;
  
  // Get active players (non-default pubkeys)
  const activePlayers = room?.players?.filter((p: any) => 
    p?.toBase58 && p.toBase58() !== PublicKey.default.toBase58()
  ) || [];
  
  // Check if current wallet is already a player
  const isPlayer = activePlayers.some((p: any) => 
    p.toBase58() === address
  );

  // Check if current wallet is the room creator
  const isCreator = room?.creator?.toBase58?.() === address;
  
  // Abandoned room detection disabled - no ping_room / last_creator_ping on-chain
  // const lastCreatorPing = room?.lastCreatorPing ? Number(room.lastCreatorPing) * 1000 : 0;
  // const secondsSinceLastPing = lastCreatorPing ? Math.floor((currentTime - lastCreatorPing) / 1000) : 0;
  // const isAbandoned = status === STATUS_OPEN && !room?.isPrivate && lastCreatorPing > 0 && secondsSinceLastPing > CREATOR_TIMEOUT_SECS;
  const isAbandoned = false; // Disabled until program supports ping_room
  
  // Stake calculations
  const stakeLamports = room?.stakeLamports ? BigInt(room.stakeLamports.toString()) : 0n;
  const stakeSOL = formatSol(stakeLamports);
  const playerCount = room?.playerCount ?? 0;
  const maxPlayers = room?.maxPlayers ?? 2;
  
  // Full pot = entry fee × maxPlayers (what the winner will get from)
  const fullPotLamports = stakeLamports * BigInt(maxPlayers);
  // Current deposited = entry fee × current players (for debug)
  const currentPotLamports = stakeLamports * BigInt(playerCount);

  // Role-based button visibility
  // canJoin: room is Open, user NOT in players, room NOT full, wallet connected
  const canJoin = isOpenStatus(status) && !isPlayer && playerCount < maxPlayers && isConnected;
  const canCancel = isOpenStatus(status) && playerCount === 1 && isCreator && isConnected;
  const canCancelAbandoned = false; // Disabled: cancel_room_if_abandoned not in IDL
  const canPlayAgain = status === RoomStatus.Finished && isPlayer;
  
  // Fee calc using basis points (5% = 500 BPS)
  const FEE_BPS = 500n;
  const BPS = 10_000n;
  const winnerGetsFullLamports = (fullPotLamports * (BPS - FEE_BPS)) / BPS;

  const fetchRoom = async () => {
    if (!roomPdaParam) return;
    
    // Debug logging for room mode investigation
    console.log("[RoomMode] Fetching room:", {
      roomPda: roomPdaParam,
      localStorageKeys: Object.keys(localStorage).filter(k => k.includes(roomPdaParam.slice(0, 8))),
    });
    
    try {
      setLoading(true);
      setError(null);

      const roomPda = new PublicKey(roomPdaParam);
      
      // Fetch directly by PDA using web3.js (no Anchor)
      const accountInfo = await connection.getAccountInfo(roomPda);
      
      if (!accountInfo) {
        console.log("[Room] Room not found - accountInfo is null");
        setRoom(null);
        return;
      }
      
      // Parse using parseRoomAccount (no Anchor needed)
      const data = Buffer.from(accountInfo.data);
      const parsed = parseRoomAccount(data);
      
      
      if (!parsed) {
        console.log("[Room] Failed to parse room account");
        setError("Failed to parse room data");
        return;
      }
      
      // Convert to room-like object with PublicKey objects for compatibility
      const roomAccount = {
        roomId: parsed.roomId,
        creator: parsed.creator,
        gameType: parsed.gameType,
        maxPlayers: parsed.maxPlayers,
        playerCount: parsed.playerCount,
        status: parsed.status,
        stakeLamports: parsed.entryFee,
        players: parsed.players,
        winner: parsed.winner,
        lastCreatorPing: parsed.createdAt,
        isPrivate: parsed.isPrivate,
      };
      
      console.log("[RoomMode] Room loaded:", {
        roomPda: roomPdaParam,
        chainStatus: roomAccount.status,
        playerCount: roomAccount.playerCount,
        maxPlayers: roomAccount.maxPlayers,
        dbMode: roomMode,
        creator: roomAccount.creator?.toBase58()?.slice(0, 8),
      });

      setRoom(roomAccount);

      // Fetch vault balance
      try {
        const [vaultPda] = getVaultPDA(roomPda);
        setVaultPdaStr(vaultPda.toBase58());
        const vaultBal = await connection.getBalance(vaultPda, "confirmed");
        setVaultLamports(BigInt(vaultBal));
      } catch (vaultErr) {
        console.error("[Room] Failed to fetch vault balance:", vaultErr);
      }
    } catch (e: any) {
      console.error("[Room] Failed to fetch room:", e);
      setError(e?.message ?? "Failed to load room");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    console.log("[Room] useEffect triggered, roomPda:", roomPdaParam);
    fetchRoom();
  }, [roomPdaParam, connection, wallet]);

  // Real-time subscription to room changes
  useEffect(() => {
    if (!roomPdaParam) return;

    let subId: number | null = null;

    (async () => {
      try {
        const roomPda = new PublicKey(roomPdaParam);

        subId = connection.onAccountChange(
          roomPda,
          async (accountInfo) => {
            // Parse room directly from account change data (no Anchor)
            try {
              const data = Buffer.from(accountInfo.data);
              const parsed = parseRoomAccount(data);
              if (parsed) {
              const roomPda = new PublicKey(roomPdaParam);
                const roomAccount = {
                  roomId: parsed.roomId,
                  creator: parsed.creator,
                  gameType: parsed.gameType,
                  maxPlayers: parsed.maxPlayers,
                  playerCount: parsed.playerCount,
                  status: parsed.status,
                  stakeLamports: parsed.entryFee,
                  players: parsed.players,
                  winner: parsed.winner,
                  lastCreatorPing: parsed.createdAt,
                  isPrivate: parsed.isPrivate,
                };
                setRoom(roomAccount);

                // Refresh vault balance
                try {
                  const [vaultPda] = getVaultPDA(roomPda);
                  const vaultBal = await connection.getBalance(vaultPda, "confirmed");
                  setVaultLamports(BigInt(vaultBal));
                } catch (vaultErr) {
                  console.error("[Room] Failed to refresh vault balance:", vaultErr);
                }
              }
            } catch (e) {
              console.error("Failed to parse room on change", e);
            }
          },
          "confirmed"
        );
      } catch (e) {
        console.error("onAccountChange subscribe failed", e);
      }
    })();

    return () => {
      if (subId !== null) {
        connection.removeAccountChangeListener(subId);
      }
    };
  }, [roomPdaParam, connection, wallet]);

  // Auto-redirect when room status changes from Open to Started
  const prevStatusRef = useRef<number | null>(null);
  const hasNavigatedRef = useRef(false);
  
  useEffect(() => {
    if (!room || !roomPdaParam) {
      prevStatusRef.current = null;
      return;
    }
    
    const prevStatus = prevStatusRef.current;
    const currentStatus = room.status;
    
    // Detect transition: Open -> Started means game is ready
    if (prevStatus !== null && isOpenStatus(prevStatus) && currentStatus === RoomStatus.Started && !hasNavigatedRef.current) {
      console.log("[Room] Game started! Redirecting to play page");
      hasNavigatedRef.current = true;
      
      toast.success("Game is starting!", {
        description: `${gameName} match is ready. Entering game...`,
      });
      
      navigate(`/play/${roomPdaParam}`, { replace: true });
    }
    
    prevStatusRef.current = currentStatus;
  }, [room, roomPdaParam, navigate, gameName]);

  // Note: Active room polling is now centralized in useSolanaRooms
  // This page only CONSUMES activeRoom - it doesn't trigger fetches

  // Update current time every second for abandoned check
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Presence/ping feature disabled - ping_room not in current on-chain program
  // When the program is updated to include ping_room, re-enable this feature

  // Check if user has an active room that blocks joining (compare by PDA - the ONLY unique identifier)
  const hasBlockingActiveRoom = activeRoom && activeRoom.pda !== roomPdaParam;

  // Show join rules modal first (pre-validation)
  const handleJoinButtonClick = () => {
    if (!roomPdaParam || !room) return;

    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }
    
    // Check if we're on a preview domain
    if (signingDisabled) {
      toast.error("Wallet signing is disabled on preview domains. Please use 1mgaming.com");
      return;
    }
    
    // Check if we need mobile wallet redirect
    if (needsMobileWalletRedirect) {
      setShowMobileWalletRedirect(true);
      return;
    }

    // Check if user has an active room
    if (hasBlockingActiveRoom) {
      toast.error("You have an active room. Cancel it before joining another.");
      return;
    }

    // Show the rules modal - actual join happens on confirm
    setShowJoinRulesModal(true);
  };

  // Actually execute the join transaction (called after user confirms rules)
  const executeJoinRoom = async () => {
    if (!roomPdaParam || !room) return;

    setJoinInProgress(true);

    // Get room details for joinRoom
    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;
    const roomCreator = room.creator?.toBase58?.();
    
    if (!roomCreator) {
      toast.error("Invalid room data");
      setJoinInProgress(false);
      setShowJoinRulesModal(false);
      return;
    }

    // Use withTxLock to prevent overlapping wallet prompts
    const result = await withTxLock(async () => {
      return await joinRoom(roomId, roomCreator);
    });

    setJoinInProgress(false);
    setShowJoinRulesModal(false);

    if (result?.ok) {
      // Navigate to canonical play route - game type determined from on-chain data
      // NEVER use URL slug to determine game type
      navigate(`/play/${roomPdaParam}`);
    } else if (!result) {
      // null means blocked by tx lock - toast already shown
    } else if (result.reason === "PHANTOM_BLOCKED_OR_REJECTED") {
      // Error toast already shown by useSolanaRooms
    } else {
      // Show generic error if no signature produced
      if (!result.signature) {
        toast.error("Wallet signature was not created. Please try again.");
      }
    }
  };

  // Cancel room handler
  const onCancelRoom = async () => {
    if (!room) return;

    if (signingDisabled) {
      toast.error("Wallet signing is disabled on preview domains. Please use 1mgaming.com");
      return;
    }

    if (needsMobileWalletRedirect) {
      setShowMobileWalletRedirect(true);
      return;
    }

    const roomId = typeof room.roomId === "object" ? room.roomId.toNumber() : room.roomId;

    const result = await withTxLock(async () => {
      return await cancelRoom(roomId);
    });

    if (result?.ok) {
      navigate("/room-list");
    }
  };

  const onPlayAgain = async () => {
    // Check if we're on a preview domain
    if (signingDisabled) {
      toast.error("Wallet signing is disabled on preview domains. Please use 1mgaming.com");
      return;
    }
    
    // Check if we need mobile wallet redirect
    if (needsMobileWalletRedirect) {
      setShowMobileWalletRedirect(true);
      return;
    }
    
    // Check if user has an active room
    if (hasBlockingActiveRoom) {
      toast.error("You have an active room. Cancel it before creating a new one.");
      return;
    }

    if (isTxInFlight) return;

    const gameType = room?.gameType ?? 2;
    const entryFeeSol = Number(stakeLamports) / LAMPORTS_PER_SOL;

    // Use createRoom from useSolanaRooms with withTxLock
    const result = await withTxLock(async () => {
      return await createRoom(gameType, entryFeeSol, maxPlayers);
    });

    if (result && address) {
      toast.success("New room created!");
      // Navigate to the new room using PDA
      try {
        const creatorPubkey = new PublicKey(address);
        const newRoomPda = getRoomPda(creatorPubkey, result);
        navigate(`/room/${newRoomPda.toBase58()}`);
      } catch {
        navigate("/room-list");
      }
    }
  };

  // Close room handler - allows creator to reclaim rent after game is Finished
  const [closingRoom, setClosingRoom] = useState(false);
  
  const onCloseRoom = async () => {
    if (!room || !wallet.publicKey || !wallet.signTransaction) return;

    if (signingDisabled) {
      toast.error("Wallet signing is disabled on preview domains. Please use 1mgaming.com");
      return;
    }

    if (needsMobileWalletRedirect) {
      setShowMobileWalletRedirect(true);
      return;
    }

    // Verify user is the creator
    if (!isCreator) {
      toast.error("Only the room creator can close the room");
      return;
    }

    // Verify room is Finished
    if (status !== RoomStatus.Finished) {
      toast.error("Room can only be closed after the game has finished");
      return;
    }

    setClosingRoom(true);

    try {
      const roomId = typeof room.roomId === "object" ? room.roomId.toNumber() : room.roomId;
      const creatorPubkey = new PublicKey(wallet.publicKey.toBase58());

      // Build close_room instruction
      const closeIx = buildCloseRoomIx(creatorPubkey, roomId);

      // Build versioned transaction
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      
      const messageV0 = new TransactionMessage({
        payerKey: creatorPubkey,
        recentBlockhash: blockhash,
        instructions: [closeIx],
      }).compileToV0Message();

      const tx = new VersionedTransaction(messageV0);

      // Sign with wallet
      const signed = await wallet.signTransaction(tx);

      // Send and confirm
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("[CloseRoom] TX sent:", sig);

      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed"
      );

      toast.success("Room closed! Rent reclaimed.", {
        description: `TX: ${sig.slice(0, 8)}...`,
      });

      // Navigate away since room no longer exists
      navigate("/room-list");
    } catch (err: any) {
      console.error("[CloseRoom] Failed:", err);
      
      // Handle specific error cases
      const errMsg = err?.message || String(err);
      
      if (errMsg.includes("already been processed") || errMsg.includes("AlreadyInUse")) {
        toast.error("Room already closed");
        navigate("/room-list");
      } else if (errMsg.includes("User rejected") || errMsg.includes("rejected")) {
        toast.error("Transaction cancelled");
      } else if (errMsg.includes("AccountNotFound") || errMsg.includes("account does not exist")) {
        toast.info("Room already closed or doesn't exist");
        navigate("/room-list");
      } else {
        toast.error("Failed to close room", {
          description: errMsg.slice(0, 100),
        });
      }
    } finally {
      setClosingRoom(false);
    }
  };

  // Can close room: creator + room is Finished + wallet connected
  const canCloseRoom = status === RoomStatus.Finished && isCreator && isConnected && room;
  
  // Show friendly error UI for invalid PDA
  if (pdaError) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{pdaError}</h3>
            <p className="text-muted-foreground mb-6">
              The room link appears to be invalid or malformed.
            </p>
            <Button onClick={() => navigate("/room-list")}>
              Back to Room List
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
      </Button>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-cinzel flex items-center gap-3">
            <Construction className="h-6 w-6 text-primary" />
            Room {roomPdaParam ? `${roomPdaParam.slice(0, 8)}...` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-2 text-muted-foreground">Loading room…</span>
            </div>
          )}
          {error && <p className="text-destructive">{error}</p>}

          {room && !loading && (
            <div className="space-y-4">
              {/* Rematch Created Success Banner */}
              {isRematchCreated && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
                    <p className="text-emerald-400 font-medium">Rematch room created!</p>
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    Invite players with a link. Anyone can join if they have SOL.
                  </p>
                  
                  {/* Room URL input */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={roomLink}
                      className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm font-mono truncate"
                    />
                  </div>
                  
                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={copyRoomLink}
                      className="gap-1.5 flex-1"
                    >
                      {linkCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {linkCopied ? 'Copied!' : 'Copy Link'}
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={handleNativeShare}
                      className="gap-1.5 flex-1"
                    >
                      <Share2 className="h-4 w-4" />
                      Share…
                    </Button>
                  </div>
                  
                  <Button 
                    size="sm" 
                    variant="ghost"
                    onClick={dismissRematchBanner}
                    className="text-muted-foreground w-full"
                  >
                    Dismiss
                  </Button>
                </div>
              )}

              {/* Rivalry Widget - Show for 2-player rematch games */}
              {isRematch && activePlayers.length === 2 && address && (
                <RivalryWidget
                  playerA={address}
                  playerB={activePlayers.find((p: any) => p.toBase58() !== address)?.toBase58() || ''}
                  gameType={gameName.toLowerCase()}
                />
              )}

              {/* Active Room Warning */}
              {hasBlockingActiveRoom && !isCreator && (
                <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="text-amber-200 font-medium">You have an active room</p>
                    <p className="text-amber-200/70">Cancel your room before joining or creating another.</p>
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="text-amber-400 p-0 h-auto mt-1"
                      onClick={() => navigate(`/room/${activeRoom?.pda}`)}
                    >
                      Go to your room →
                    </Button>
                  </div>
                </div>
              )}

              {/* Abandoned Room Warning - Disabled until program supports ping_room */}

              {/* Status Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isAbandoned ? 'bg-red-500/20 text-red-400' :
                  isOpenStatus(status) ? 'bg-green-500/20 text-green-400' :
                  status === RoomStatus.Started ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {isAbandoned ? 'Abandoned' : statusName}
                </span>
                {/* Mode Badge - from DB (single source of truth) */}
                {!roomModeLoaded ? (
                  <span className="px-3 py-1 rounded-full text-sm font-medium border bg-muted/50 text-muted-foreground border-muted animate-pulse">
                    Loading...
                  </span>
                ) : (
                  <span className={`px-3 py-1 rounded-full text-sm font-medium border ${
                    roomMode === 'ranked' 
                      ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                      : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  }`}>
                    {roomMode === 'ranked' ? '🔴 Ranked' : '🟢 Casual'}
                  </span>
                )}
                {isPlayer && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/20 text-primary">
                    You're in this game
                  </span>
                )}
                {isCreator && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/20 text-blue-400">
                    Your Room
                  </span>
                )}
                {/* Creator presence indicator - Disabled until program supports ping_room */}
              </div>

              {/* Game Info Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground uppercase">Game</p>
                  <p className="text-lg font-semibold">{gameName}</p>
                </div>
                <div className="bg-muted/30 rounded-lg p-3">
                  <div className="flex items-center gap-1">
                    <Users className="h-3 w-3 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground uppercase">Players</p>
                  </div>
                  <p className="text-lg font-semibold">{activePlayers.length} / {maxPlayers}</p>
                </div>
              </div>

              {/* Stake Info */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-primary">
                  <Coins className="h-4 w-4" />
                  <span className="font-medium">Stake Information</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground">Entry Fee</p>
                    <p className="font-semibold">{stakeSOL} SOL</p>
                  </div>
                <div>
                    <p className="text-muted-foreground">Pot (when full)</p>
                    <p className="font-semibold">{formatSol(fullPotLamports)} SOL</p>
                    <p className="text-xs text-muted-foreground/70">Current deposited: {formatSol(vaultLamports)} SOL</p>
                    <p className="text-xs text-muted-foreground/50">[{vaultPdaStr.slice(0, 6)}...{vaultPdaStr.slice(-4)}]</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Winner Gets</p>
                    <p className="font-semibold text-green-400">{formatSol(winnerGetsFullLamports)} SOL</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">5% platform fee deducted from winnings</p>
              </div>

              {/* Players List */}
              <div>
                <p className="text-sm text-muted-foreground mb-2">Players:</p>
                <ul className="space-y-1">
                  {activePlayers.map((p: any, i: number) => {
                    const walletAddr = p.toBase58();
                    const isMe = walletAddr === address;
                    const isCreator = walletAddr === room?.creator?.toBase58?.();
                    return (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <span className="w-2 h-2 rounded-full bg-green-400" />
                        {isMe ? (
                          <span className="text-primary font-medium font-mono">
                            {walletAddr.slice(0, 4)}…{walletAddr.slice(-4)} (You)
                            {isCreator && ' · Creator'}
                          </span>
                        ) : (
                          <WalletLink 
                            wallet={walletAddr} 
                            suffix={isCreator ? ' (Creator)' : ''} 
                          />
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}

          {!loading && !error && !room && (
            <div className="text-center py-12">
              <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Room Not Found</h3>
              <p className="text-muted-foreground mb-6">
                This room may have been cancelled or doesn't exist.
              </p>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <div className="flex justify-center gap-3">
              {canJoin && (
                <Button 
                  onClick={handleJoinButtonClick} 
                  size="lg" 
                  variant="gold"
                  disabled={isTxInFlight || hookTxPending || signingDisabled || hasBlockingActiveRoom}
                  className="min-w-40"
                >
                  {isTxInFlight ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Waiting for wallet...
                    </>
                  ) : signingDisabled ? (
                    "Signing Disabled"
                  ) : hasBlockingActiveRoom ? (
                    "Resolve Active Room First"
                  ) : Number(stakeLamports) > 0 ? (
                    `Join Game & Stake ${stakeSOL} SOL`
                  ) : (
                    "Join Game"
                  )}
                </Button>
              )}
              
              {canPlayAgain && (
                <Button 
                  onClick={onPlayAgain} 
                  size="lg" 
                  variant="outline"
                  disabled={isTxInFlight || hookTxPending || signingDisabled || hasBlockingActiveRoom}
                  className="min-w-32"
                >
                  {isTxInFlight ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Waiting for wallet...
                    </>
                  ) : signingDisabled ? (
                    "Signing Disabled"
                  ) : hasBlockingActiveRoom ? (
                    "Resolve Active Room First"
                  ) : (
                    'Play Again'
                  )}
                </Button>
              )}

              {/* Player status messages */}
              {isOpenStatus(status) && isPlayer && !isCreator && (
                <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                  <span className="text-sm text-emerald-400">You're in this game. Waiting for opponent...</span>
                </div>
              )}
              
              {isOpenStatus(status) && isPlayer && isCreator && (
                <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border border-primary/30 rounded-lg">
                  <Users className="h-4 w-4 text-primary" />
                  <span className="text-sm text-primary">Waiting for opponent to join...</span>
                </div>
              )}

              {/* Room full message (for non-players) */}
              {status === RoomStatus.Started && !isPlayer && (
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  <span className="text-sm text-amber-400">Game in progress</span>
                </div>
              )}

              {/* Connect wallet prompt for non-connected users */}
              {!isConnected && isOpenStatus(status) && playerCount < maxPlayers && (
                <Button 
                  onClick={() => setShowWalletGate(true)} 
                  size="lg"
                  variant="outline"
                  className="min-w-40"
                >
                  Connect Wallet to Join
                </Button>
              )}
            </div>

            {/* Enable Presence Toggle - Disabled until program supports ping_room */}

            {/* Cancel Room Button */}
            {canCancel && (
              <Button
                onClick={onCancelRoom}
                size="lg"
                variant="destructive"
                disabled={isTxInFlight || hookTxPending || signingDisabled}
                className="min-w-32"
              >
                {isTxInFlight || hookTxPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Cancelling…
                  </>
                ) : signingDisabled ? (
                  "Signing Disabled"
                ) : (
                  "Cancel Room"
                )}
              </Button>
            )}

            {/* Close Room Button - for creator to reclaim rent after game ends */}
            {canCloseRoom && (
              <Button
                onClick={onCloseRoom}
                size="lg"
                variant="outline"
                disabled={isTxInFlight || hookTxPending || signingDisabled || closingRoom}
                className="min-w-32 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              >
                {closingRoom ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Closing…
                  </>
                ) : signingDisabled ? (
                  "Signing Disabled"
                ) : (
                  <>
                    <Wallet className="mr-2 h-4 w-4" />
                    Recover Rent (Close Room)
                  </>
                )}
              </Button>
            )}
            
            {/* Recover Funds Button - for stuck/orphaned rooms */}
            {room && isPlayer && (
              <RecoverFundsButton 
                roomPda={roomPdaParam || ""} 
                onRecovered={() => window.location.reload()}
              />
            )}
          </div>

          {/* Presence Info Message - Disabled until program supports ping_room */}
        </CardContent>
      </Card>

      <WalletGateModal 
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect a Solana Wallet to Play"
        description="Connect your wallet to join this room and compete for SOL prizes."
      />
      
      {/* Join Rules Modal - shown before joining */}
      <JoinRulesModal
        open={showJoinRulesModal}
        onConfirmJoin={executeJoinRoom}
        onCancel={() => setShowJoinRulesModal(false)}
        gameName={gameName}
        stakeSol={Number(stakeLamports) / LAMPORTS_PER_SOL}
        isRanked={roomMode === 'ranked'}
        isLoading={joinInProgress}
      />
      
      {/* Preview Domain Banner */}
      <PreviewDomainBanner />
      
      {/* Mobile Wallet Redirect Modal */}
      <MobileWalletRedirect 
        isOpen={showMobileWalletRedirect}
        onClose={() => setShowMobileWalletRedirect(false)}
      />

      {/* Cancel Room Confirmation Modal - Disabled until program supports cancel_room */}
      
      {/* Transaction Debug Panel - shown on tx failure */}
      <TxDebugPanel debugInfo={txDebugInfo} onClose={clearTxDebug} />
    </div>
  );
}
