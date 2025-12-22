import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { parseRoomAccount, getVaultPDA } from "@/lib/solana-program";
import { playAgain } from "@/lib/play-again";
import { joinRoomByPda } from "@/lib/join-room";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft, Loader2, Users, Clock, Coins, XCircle, AlertTriangle, Radio } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";
import { TxDebugPanel } from "@/components/TxDebugPanel";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const STATUS_OPEN = 1;
const STATUS_STARTED = 2;
const STATUS_FINISHED = 3;

// Presence timeout in seconds
const CREATOR_TIMEOUT_SECS = 60;
const PING_INTERVAL_MS = 60000; // 60 seconds (only runs when presence is manually enabled)

// Human-readable mappings
const STATUS_NAMES: Record<number, string> = {
  1: "Open",
  2: "In Progress",
  3: "Finished",
};

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
  const { activeRoom, fetchCreatorActiveRoom, cancelRoom, pingRoom, cancelAbandonedRoom, txPending: cancelPending, txDebugInfo, clearTxDebug } = useSolanaRooms();
  const [showWalletGate, setShowWalletGate] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [vaultLamports, setVaultLamports] = useState<bigint>(0n);
  const [vaultPdaStr, setVaultPdaStr] = useState<string>("");
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [presenceEnabled, setPresenceEnabled] = useState(false);

  const status = room?.status ?? 0;
  const statusName = STATUS_NAMES[status] || "Unknown";
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
  
  // Check if room is abandoned (creator hasn't pinged in > 60 seconds)
  // Private rooms never expire - only public rooms can be abandoned
  const lastCreatorPing = room?.lastCreatorPing ? Number(room.lastCreatorPing) * 1000 : 0; // Convert to ms
  const secondsSinceLastPing = lastCreatorPing ? Math.floor((currentTime - lastCreatorPing) / 1000) : 0;
  const isAbandoned = status === STATUS_OPEN && !room?.isPrivate && lastCreatorPing > 0 && secondsSinceLastPing > CREATOR_TIMEOUT_SECS;
  
  // Role-based button visibility
  const canJoin = status === STATUS_OPEN && !isPlayer && isConnected && !isAbandoned;
  const canCancel = status === STATUS_OPEN && isCreator;
  const canCancelAbandoned = status === STATUS_OPEN && isAbandoned && !isCreator && isConnected;
  const canPlayAgain = status === STATUS_FINISHED && isPlayer;
  
  // Stake calculations
  const stakeLamports = room?.stakeLamports ? BigInt(room.stakeLamports.toString()) : 0n;
  const stakeSOL = formatSol(stakeLamports);
  const playerCount = room?.playerCount ?? 0;
  const maxPlayers = room?.maxPlayers ?? 2;
  
  // Full pot = entry fee × maxPlayers (what the winner will get from)
  const fullPotLamports = stakeLamports * BigInt(maxPlayers);
  // Current deposited = entry fee × current players (for debug)
  const currentPotLamports = stakeLamports * BigInt(playerCount);
  
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

  // Fetch user's active room on mount
  useEffect(() => {
    if (isConnected) {
      fetchCreatorActiveRoom();
    }
  }, [isConnected, fetchCreatorActiveRoom]);

  // Update current time every second for abandoned check
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handler for manual presence enable (explicit user action)
  const handleEnablePresence = async () => {
    if (!room) return;
    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;
    
    if (!presenceEnabled) {
      // First click: ping immediately with explicit user action
      try {
        await pingRoom(roomId, 'userClick');
      } catch (e) {
        console.error("Failed to ping room:", e);
      }
    }
    setPresenceEnabled(!presenceEnabled);
  };

  // Creator presence ping - ONLY runs when presenceEnabled is true (manual toggle)
  useEffect(() => {
    // Only run if presence is manually enabled
    if (!presenceEnabled || !isCreator || !room || status !== STATUS_OPEN) {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      return;
    }

    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;

    // Ping every 60 seconds (rate limited, only after user enabled presence)
    pingIntervalRef.current = setInterval(async () => {
      try {
        await pingRoom(roomId, 'interval');
      } catch (e) {
        console.error("Failed to ping room:", e);
      }
    }, PING_INTERVAL_MS);

    return () => {
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
    };
  }, [presenceEnabled, isCreator, room?.roomId, status, pingRoom]);

  // Check if user has an active room that blocks joining
  const hasBlockingActiveRoom = activeRoom && activeRoom.roomId !== room?.roomId?.toNumber?.();

  const onJoinRoom = async () => {
    if (!roomPdaParam) return;

    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }

    // Check if user has an active room
    if (hasBlockingActiveRoom) {
      toast.error("You have an active room. Cancel it before joining another.");
      return;
    }

    try {
      setTxPending(true);
      const roomPda = new PublicKey(roomPdaParam);

      const res = await joinRoomByPda({
        connection,
        wallet,
        roomPda,
        entryFeeLamports: stakeLamports,
      });

      console.log("Joined room:", res);
      toast.success("Successfully joined room!");

      // Refresh room state
      await fetchRoom();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to join room");
    } finally {
      setTxPending(false);
    }
  };

  const handleCancelRoomClick = async () => {
    if (!room || !isCreator) return;
    
    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;
    
    try {
      const success = await cancelRoom(roomId);
      if (success) {
        navigate("/room-list");
      }
    } catch (e) {
      console.error("Cancel failed", e);
    }
  };

  const onCancelAbandonedRoom = async () => {
    if (!room?.roomId || !room?.creator) return;
    
    const roomId = typeof room.roomId === 'object' ? room.roomId.toNumber() : room.roomId;
    const roomCreator = room.creator.toBase58();
    
    // Get player pubkeys for refunds
    const playerPubkeys = activePlayers.map((p: any) => new PublicKey(p.toBase58()));
    
    const success = await cancelAbandonedRoom(roomId, roomCreator, playerPubkeys);
    
    if (success) {
      navigate("/room-list");
    }
  };

  const onPlayAgain = async () => {
    // Check if user has an active room
    if (hasBlockingActiveRoom) {
      toast.error("You have an active room. Cancel it before creating a new one.");
      return;
    }

    try {
      setTxPending(true);
      const gameType = room?.gameType ?? 2;
      const stakeLamportsValue = room?.stakeLamports ? BigInt(room.stakeLamports.toString()) : 200_000_000n;

      const res = await playAgain({
        connection,
        wallet,
        gameType,
        maxPlayers,
        stakeLamports: stakeLamportsValue,
      });

      console.log("Play again created room:", res);
      toast.success("New room created!");
      navigate(`/room/${res.roomPda}`);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Failed to create new room");
    } finally {
      setTxPending(false);
    }
  };

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
                      onClick={() => navigate(`/room/${activeRoom?.roomId}`)}
                    >
                      Go to your room →
                    </Button>
                  </div>
                </div>
              )}

              {/* Abandoned Room Warning */}
              {isAbandoned && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                  <div className="text-sm">
                    <p className="text-red-200 font-medium">Room Abandoned</p>
                    <p className="text-red-200/70">
                      Creator has been inactive for {secondsSinceLastPing} seconds. 
                      Anyone can cancel this room and get refunded.
                    </p>
                  </div>
                </div>
              )}

              {/* Status Badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  isAbandoned ? 'bg-red-500/20 text-red-400' :
                  status === STATUS_OPEN ? 'bg-green-500/20 text-green-400' :
                  status === STATUS_STARTED ? 'bg-yellow-500/20 text-yellow-400' :
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
                {/* Creator presence indicator with countdown */}
                {status === STATUS_OPEN && !isAbandoned && !room?.isPrivate && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-500/10 text-green-400 flex items-center gap-2">
                    <Radio className="h-3 w-3 animate-pulse" />
                    <span>Creator Online</span>
                    {lastCreatorPing > 0 && (
                      <span className="flex items-center gap-1 text-xs opacity-80">
                        <Clock className="h-3 w-3" />
                        {Math.max(0, CREATOR_TIMEOUT_SECS - secondsSinceLastPing)}s
                      </span>
                    )}
                  </span>
                )}
                {status === STATUS_OPEN && room?.isPrivate && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-blue-500/10 text-blue-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Private (no expiry)
                  </span>
                )}
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
                  disabled={txPending}
                  className="min-w-32"
                >
                  {txPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
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
                  disabled={txPending}
                  className="min-w-32"
                >
                  {txPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Play Again'
                  )}
                </Button>
              )}

              {status === STATUS_OPEN && isPlayer && !isCreator && (
                <p className="text-muted-foreground text-sm">
                  Waiting for other players to join...
                </p>
              )}
            </div>

            {/* Enable Presence Toggle - Only for creator when room is open */}
            {isCreator && status === STATUS_OPEN && !isAbandoned && (
              <div className="flex justify-center pt-2">
                <Button 
                  onClick={handleEnablePresence}
                  variant={presenceEnabled ? "default" : "outline"}
                  size="sm"
                  className="gap-2"
                >
                  <Radio className={`h-4 w-4 ${presenceEnabled ? 'animate-pulse' : ''}`} />
                  {presenceEnabled ? "Presence Active" : "Enable Presence"}
                </Button>
              </div>
            )}

            {/* Cancel Room Button - Only for creator when room is open */}
            {canCancel && (
              <div className="flex justify-center pt-2 border-t border-border/30">
                <Button 
                  onClick={() => setShowCancelConfirm(true)}
                  variant="destructive"
                  size="sm"
                  disabled={cancelPending || txPending}
                  className="gap-2"
                >
                  {cancelPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cancelling...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Cancel Room
                    </>
                  )}
                </Button>
              </div>
            )}

            {/* Cancel Abandoned Room Button - Anyone can cancel if creator timed out */}
            {canCancelAbandoned && (
              <div className="flex justify-center pt-2 border-t border-border/30">
                <Button 
                  onClick={onCancelAbandonedRoom}
                  variant="destructive"
                  size="lg"
                  disabled={cancelPending || txPending}
                  className="gap-2"
                >
                  {cancelPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Cancelling & Refunding...
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4" />
                      Cancel Abandoned Room & Refund All
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Presence Info Message */}
          {status === STATUS_OPEN && (
            <div className="bg-muted/20 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p className="flex items-center gap-1">
                <Radio className="h-3 w-3" />
                <span className="font-medium">Presence-Based Rooms</span>
              </p>
              <p>Rooms stay open only while the creator is present. If the creator leaves for 60 seconds, the room becomes abandoned and all players are refunded automatically.</p>
            </div>
          )}
        </CardContent>
      </Card>

      <WalletGateModal 
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect a Solana Wallet to Play"
        description="Connect your wallet to join this room and compete for SOL prizes."
      />

      {/* Cancel Room Confirmation Modal */}
      <AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Room?</AlertDialogTitle>
            <AlertDialogDescription>
              Cancel room and refund all players? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Room</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleCancelRoomClick}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Cancel Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Transaction Debug Panel - shown on tx failure */}
      <TxDebugPanel debugInfo={txDebugInfo} onClose={clearTxDebug} />
    </div>
  );
}
