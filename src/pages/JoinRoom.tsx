import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Loader2, Users, Coins, Gamepad2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useSolanaWallet, SolanaWalletButton } from "@/components/SolanaWalletButton";
import { useSolPrice } from "@/hooks/useSolPrice";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { lamportsToSol } from "@/lib/solanaConfig";

// Helper function to get game name from ID
function getGameName(gameId: number): string {
  const names: Record<number, string> = {
    1: "Chess",
    2: "Dominos",
    3: "Backgammon",
    4: "Checkers",
    5: "Ludo",
  };
  return names[gameId] || "Unknown";
}

export default function JoinRoom() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { play } = useSound();
  const { isConnected, address, publicKey } = useSolanaWallet();
  const { price: solPrice, solToUsd } = useSolPrice();

  const roomIdParam = searchParams.get("roomId");
  const [isJoining, setIsJoining] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);
  const [roomLoading, setRoomLoading] = useState(true);

  // TODO: Fetch room data from Solana program
  // For now, show placeholder UI
  useEffect(() => {
    if (roomIdParam) {
      // Simulate loading
      setTimeout(() => {
        setRoomLoading(false);
        // Placeholder room data
        setRoomData({
          id: roomIdParam,
          creator: "SoLana...",
          entryFee: 10000000, // 0.01 SOL in lamports
          maxPlayers: 2,
          isPrivate: false,
          status: 1,
          gameId: 1,
          turnTimeSeconds: 10,
        });
      }, 1000);
    }
  }, [roomIdParam]);

  const room = roomData;
  const entryFeeSol = room ? lamportsToSol(room.entryFee) : 0;
  const usdValue = solToUsd(entryFeeSol);

  const handleJoin = async () => {
    if (!room || !publicKey) return;
    
    play("ui/click");
    setIsJoining(true);

    try {
      // TODO: Call Solana program instruction to join room
      console.log("Joining room:", {
        roomId: roomIdParam,
        entryFee: room.entryFee,
        player: publicKey.toBase58(),
      });

      toast({
        title: "Join Room Pending",
        description: "Solana program integration coming soon.",
      });
    } catch (err) {
      toast({
        title: "Failed to join",
        description: err instanceof Error ? err.message : "Transaction failed",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  if (!roomIdParam) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <Card className="max-w-md mx-auto border-destructive/50">
            <CardContent className="pt-6 text-center">
              <p className="text-destructive">Invalid invite link. No room ID provided.</p>
              <Button 
                variant="outline" 
                onClick={() => navigate("/")}
                className="mt-4"
              >
                Go Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto border-primary/30 bg-card/50 backdrop-blur">
          <CardHeader className="text-center">
            <CardTitle className="font-cinzel text-2xl text-primary">
              Join Room #{roomIdParam}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {!isConnected ? (
              <div className="text-center py-4">
                <div className="mx-auto w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-4">
                  <Wallet className="text-muted-foreground" size={24} />
                </div>
                <p className="text-muted-foreground mb-4">Connect your Solana wallet to join this room</p>
                <SolanaWalletButton />
              </div>
            ) : roomLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : !room ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">Room not found</p>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/")}
                  className="mt-4"
                >
                  Go Home
                </Button>
              </div>
            ) : (
              <>
                {/* Room Details */}
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-2 border-b border-primary/10">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Gamepad2 className="h-4 w-4" />
                      Game
                    </span>
                    <span className="font-medium">{getGameName(room.gameId)}</span>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-primary/10">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Coins className="h-4 w-4" />
                      Entry Fee
                    </span>
                    <div className="text-right">
                      <span className="font-medium text-primary">
                        {entryFeeSol.toFixed(4)} SOL
                      </span>
                      {usdValue !== null && (
                        <p className="text-xs text-muted-foreground">
                          ≈ ${usdValue.toFixed(2)} USD
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-primary/10">
                    <span className="text-muted-foreground flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Players
                    </span>
                    <span className="font-medium">{room.maxPlayers} max</span>
                  </div>

                  {room.isPrivate && (
                    <div className="flex items-center justify-center py-2">
                      <span className="text-xs bg-primary/20 text-primary px-2 py-1 rounded">
                        Private Room
                      </span>
                    </div>
                  )}
                </div>

                {/* Join Button */}
                <Button
                  onClick={handleJoin}
                  disabled={isJoining}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {isJoining ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining Room...
                    </>
                  ) : (
                    `Join Room (${entryFeeSol.toFixed(4)} SOL)`
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  SOL will be held in escrow until the game ends
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
