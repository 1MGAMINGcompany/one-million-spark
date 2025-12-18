import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { useConnection, useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { playAgain } from "@/lib/play-again";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const { connection } = useConnection();
  const wallet = useSolanaWallet();
  const [showWalletGate, setShowWalletGate] = useState(false);

  const handleJoinAttempt = () => {
    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }
    // Normal join flow would go here
  };

  const onPlayAgain = async () => {
    // TODO: replace these 3 values with the room's actual settings once you're reading on-chain room state
    const gameType = 2; // Ludo (example)
    const maxPlayers = 4;
    const stakeLamports = 200_000_000n; // 0.2 SOL

    const res = await playAgain({
      connection,
      wallet,
      gameType,
      maxPlayers,
      stakeLamports,
    });

    console.log("Play again created room:", res);
    navigate(`/room/${res.roomId.toString()}`);
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
            Room #{roomId}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-12">
            <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
            <p className="text-muted-foreground mb-6">
              We're migrating to Solana! Room details and gameplay will be available soon.
            </p>
            
            {/* Join button that triggers wallet gate if not connected */}
            <Button onClick={handleJoinAttempt} size="lg">
              Join Room
            </Button>
            
            <Button onClick={onPlayAgain} size="lg" variant="outline" className="ml-2">
              Play Again
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Gate Modal */}
      <WalletGateModal 
        isOpen={showWalletGate}
        onClose={() => setShowWalletGate(false)}
        title="Connect a Solana Wallet to Play"
        description="Connect your wallet to join this room and compete for SOL prizes."
      />
    </div>
  );
}
