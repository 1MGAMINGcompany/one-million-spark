import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useWallet } from "@/hooks/useWallet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction, ArrowLeft } from "lucide-react";
import { WalletGateModal } from "@/components/WalletGateModal";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { isConnected } = useWallet();
  const [showWalletGate, setShowWalletGate] = useState(false);

  const handleJoinAttempt = () => {
    if (!isConnected) {
      setShowWalletGate(true);
      return;
    }
    // Normal join flow would go here
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
