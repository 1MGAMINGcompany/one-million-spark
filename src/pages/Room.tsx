import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { getAnchorProvider, getProgram } from "@/lib/anchor-program";
import { playAgain } from "@/lib/play-again";
import { joinRoomByPda } from "@/lib/join-room";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft, Loader2, Users, Clock, Coins } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";
import { toast } from "sonner";

const STATUS_OPEN = 1;
const STATUS_STARTED = 2;
const STATUS_FINISHED = 3;

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

function formatSol(lamports: bigint | number | string): string {
  const value = typeof lamports === 'bigint' ? lamports : BigInt(lamports.toString());
  return (Number(value) / LAMPORTS_PER_SOL).toFixed(2);
}

export default function Room() {
  const { roomAddress } = useParams<{ roomAddress: string }>();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { connection } = useConnection();
  const wallet = useSolanaWallet();
  const [showWalletGate, setShowWalletGate] = useState(false);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);

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
  
  // Role-based button visibility
  const canJoin = status === STATUS_OPEN && !isPlayer && isConnected;
  const canPlayAgain = status === STATUS_FINISHED && isPlayer;
  
  // Stake calculations
  const stakeLamports = room?.stakeLamports ? BigInt(room.stakeLamports.toString()) : 0n;
  const stakeSOL = formatSol(stakeLamports);
  const maxPlayers = room?.maxPlayers ?? 2;
  const totalPot = stakeLamports * BigInt(maxPlayers);
  const winnerPayout = (totalPot * 95n) / 100n; // 5% platform fee

  const fetchRoom = async () => {
    if (!roomAddress) return;
    try {
      setLoading(true);
      setError(null);

      const provider = getAnchorProvider(connection, wallet);
      const program = getProgram(provider);

      const roomPda = new PublicKey(roomAddress);
      const roomAccount = await (program.account as any).room.fetch(roomPda);

      setRoom(roomAccount);
    } catch (e: any) {
      console.error(e);
      setError(e?.message ?? "Failed to load room");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoom();
  }, [roomAddress, connection, wallet]);

  const onJoinRoom = async () => {
    if (!roomAddress) return;

    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }

    try {
      setTxPending(true);
      const roomPda = new PublicKey(roomAddress);

      const res = await joinRoomByPda({
        connection,
        wallet,
        roomPda,
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

  const onPlayAgain = async () => {
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
            Room {roomAddress ? `${roomAddress.slice(0, 8)}...` : ""}
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
              {/* Status Badge */}
              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                  status === STATUS_OPEN ? 'bg-green-500/20 text-green-400' :
                  status === STATUS_STARTED ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-muted text-muted-foreground'
                }`}>
                  {statusName}
                </span>
                {isPlayer && (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-primary/20 text-primary">
                    You're in this game
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
                    <p className="text-muted-foreground">Total Pot</p>
                    <p className="font-semibold">{formatSol(totalPot)} SOL</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Winner Gets</p>
                    <p className="font-semibold text-green-400">{formatSol(winnerPayout)} SOL</p>
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
          <div className="flex justify-center gap-3">
            {status === STATUS_OPEN && !isPlayer && (
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
            
            {canPlayAgain && (
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

            {status === STATUS_OPEN && isPlayer && (
              <p className="text-muted-foreground text-sm">
                Waiting for other players to join...
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <WalletGateModal 
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect a Solana Wallet to Play"
        description="Connect your wallet to join this room and compete for SOL prizes."
      />
    </div>
  );
}
