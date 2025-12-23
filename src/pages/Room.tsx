import { useEffect, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { parseRoomAccount, getVaultPDA, RoomStatus, statusToName, isOpenStatus } from "@/lib/solana-program";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useTxLock } from "@/contexts/TxLockContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft, Loader2, Users, Coins, AlertTriangle } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";
import { TxDebugPanel } from "@/components/TxDebugPanel";
import { MobileWalletRedirect } from "@/components/MobileWalletRedirect";
import { PreviewDomainBanner, useSigningDisabled } from "@/components/PreviewDomainBanner";
import { validatePublicKey, isMobileDevice, hasInjectedSolanaWallet, getRoomPda } from "@/lib/solana-utils";
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
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { connection } = useConnection();
  const wallet = useSolanaWallet();
  const { activeRoom, joinRoom, createRoom, cancelRoom, txPending: hookTxPending, txDebugInfo, clearTxDebug } = useSolanaRooms();
  const { isTxInFlight, withTxLock } = useTxLock();
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [showMobileWalletRedirect, setShowMobileWalletRedirect] = useState(false);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdaError, setPdaError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [vaultLamports, setVaultLamports] = useState<bigint>(0n);
  const [vaultPdaStr, setVaultPdaStr] = useState<string>("");
  
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
  const canJoin = isOpenStatus(status) && !isPlayer && isConnected;
  const canCancel = isOpenStatus(status) && playerCount === 1 && isCreator && isConnected;
  const canCancelAbandoned = false; // Disabled: cancel_room_if_abandoned not in IDL
  const canPlayAgain = status === RoomStatus.Finished && isPlayer;
  
  // Fee calc using basis points (5% = 500 BPS)
  const FEE_BPS = 500n;
  const BPS = 10_000n;
  const winnerGetsFullLamports = (fullPotLamports * (BPS - FEE_BPS)) / BPS;

  const fetchRoom = async () => {
    if (!roomPdaParam) return;
    
    console.log("[Room] Fetching room by PDA:", roomPdaParam);
    
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
      
      console.log("[Room] Room loaded:", {
        roomId: roomAccount.roomId,
        status: roomAccount.status,
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

  const onJoinRoom = async () => {
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

    // Get room details for joinRoom
    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;
    const roomCreator = room.creator?.toBase58?.();
    
    if (!roomCreator) {
      toast.error("Invalid room data");
      return;
    }

    // Use withTxLock to prevent overlapping wallet prompts
    const result = await withTxLock(async () => {
      return await joinRoom(roomId, roomCreator);
    });

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
                  {activePlayers.map((p: any, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-2 h-2 rounded-full bg-green-400" />
                      <span className={p.toBase58() === address ? 'text-primary font-medium' : ''}>
                        {p.toBase58().slice(0, 8)}...{p.toBase58().slice(-4)}
                        {p.toBase58() === address && ' (You)'}
                        {p.toBase58() === room?.creator?.toBase58?.() && ' (Creator)'}
                      </span>
                    </li>
                  ))}
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
              {canJoin && !hasBlockingActiveRoom && (
                <Button 
                  onClick={onJoinRoom} 
                  size="lg" 
                  disabled={isTxInFlight || hookTxPending || signingDisabled}
                  className="min-w-32"
                >
                  {isTxInFlight ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Waiting for wallet...
                    </>
                  ) : signingDisabled ? (
                    "Signing Disabled"
                  ) : (
                    `Join Room (${stakeSOL} SOL)`
                  )}
                </Button>
              )}
              
              {canPlayAgain && !hasBlockingActiveRoom && (
                <Button 
                  onClick={onPlayAgain} 
                  size="lg" 
                  variant="outline"
                  disabled={isTxInFlight || hookTxPending || signingDisabled}
                  className="min-w-32"
                >
                  {isTxInFlight ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Waiting for wallet...
                    </>
                  ) : signingDisabled ? (
                    "Signing Disabled"
                  ) : (
                    'Play Again'
                  )}
                </Button>
              )}

              {isOpenStatus(status) && isPlayer && !isCreator && (
                <p className="text-muted-foreground text-sm">
                  Waiting for other players to join...
                </p>
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
