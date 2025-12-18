import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PublicKey } from "@solana/web3.js";

import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { getAnchorProvider, getProgram } from "@/lib/anchor-program";
import { playAgain } from "@/lib/play-again";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";

const STATUS_OPEN = 1;
const STATUS_STARTED = 2;
const STATUS_FINISHED = 3;

function isDefaultPubkey(p: any) {
  try {
    return p?.toBase58?.() === PublicKey.default.toBase58();
  } catch {
    return false;
  }
}

export default function Room() {
  const { roomAddress } = useParams<{ roomAddress: string }>();
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const { connection } = useConnection();
  const wallet = useSolanaWallet();
  const [showWalletGate, setShowWalletGate] = useState(false);

  const [room, setRoom] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = room?.status ?? 0;
  const canJoin = status === STATUS_OPEN;
  const canPlayAgain = status === STATUS_FINISHED;

  useEffect(() => {
    if (!roomAddress) return;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const provider = getAnchorProvider(connection, wallet);
        const program = getProgram(provider);

        const roomPda = new PublicKey(roomAddress);
        // Use dynamic access for account namespace
        const roomAccount = await (program.account as any).room.fetch(roomPda);

        setRoom(roomAccount);
      } catch (e: any) {
        console.error(e);
        setError(e?.message ?? "Failed to load room");
      } finally {
        setLoading(false);
      }
    })();
  }, [roomAddress, connection, wallet]);

  const handleJoinAttempt = () => {
    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }
    // Normal join flow would go here
  };

  const onPlayAgain = async () => {
    // TODO: replace these 3 values with the room's actual settings once you're reading on-chain room state
    const gameType = room?.gameType ?? 2;
    const maxPlayers = room?.maxPlayers ?? 4;
    const stakeLamports = room?.stakeLamports ? BigInt(room.stakeLamports.toString()) : 200_000_000n;

    const res = await playAgain({
      connection,
      wallet,
      gameType,
      maxPlayers,
      stakeLamports,
    });

    console.log("Play again created room:", res);
    navigate(`/room/${res.roomPda}`);
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
          {loading && <p className="text-muted-foreground">Loading room…</p>}
          {error && <p className="text-destructive">{error}</p>}

          {room && (
            <div className="space-y-2">
              <p><strong>Status:</strong> {JSON.stringify(room.status)}</p>
              <p><strong>Game type:</strong> {room.gameType}</p>
              <p><strong>Players:</strong></p>
              <ul className="list-disc list-inside">
                {room.players.map((p: any, i: number) =>
                  p.toBase58 && p.toBase58() !== PublicKey.default.toBase58() ? (
                    <li key={i}>{p.toBase58()}</li>
                  ) : null
                )}
              </ul>
            </div>
          )}

          {!loading && !error && !room && (
            <div className="text-center py-12">
              <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
              <p className="text-muted-foreground mb-6">
                We're migrating to Solana! Room details and gameplay will be available soon.
              </p>
            </div>
          )}
          
          <div className="flex justify-center gap-2">
            {canJoin && (
              <Button onClick={handleJoinAttempt} size="lg">
                Join Room
              </Button>
            )}
            
            {canPlayAgain && (
              <Button onClick={onPlayAgain} size="lg" variant="outline">
                Play Again
              </Button>
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
