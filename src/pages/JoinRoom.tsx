import { useSearchParams, useNavigate } from "react-router-dom";
import { Construction, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/hooks/useWallet";
import { ConnectWalletGate } from "@/components/ConnectWalletGate";

export default function JoinRoom() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();

  const roomIdParam = searchParams.get("roomId");

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
        <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="pt-6 text-center space-y-4">
            <Wallet className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-xl font-cinzel">Connect to Join</h2>
            <p className="text-muted-foreground text-sm">
              Connect your Solana wallet to join room {roomIdParam && `#${roomIdParam}`} and compete for SOL prizes.
            </p>
            <ConnectWalletGate />
            <p className="text-xs text-muted-foreground pt-2">
              You can browse rooms without a wallet. You only need a wallet to play.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-cinzel flex items-center gap-3">
            <Construction className="h-6 w-6 text-primary" />
            Join Room {roomIdParam && `#${roomIdParam}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center py-12">
            <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              We're migrating to Solana! Join rooms with SOL entry fees soon.
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              Connected: {address?.slice(0, 8)}...{address?.slice(-4)}
            </p>
            <Button variant="outline" onClick={() => navigate("/room-list")}>
              Browse Rooms
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
