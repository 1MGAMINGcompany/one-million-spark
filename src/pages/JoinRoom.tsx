import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { formatEther } from "viem";
import { Loader2, Users, Coins, Gamepad2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/hooks/useWallet";
import { useRoom, useJoinRoom, getGameName, formatEntryFee } from "@/hooks/useRoomManager";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { usePolPrice } from "@/hooks/usePolPrice";

export default function JoinRoom() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { play } = useSound();
  const { address, isConnected } = useWallet();
  const { price: polPrice } = usePolPrice();

  const roomIdParam = searchParams.get("roomId");
  const roomId = roomIdParam ? BigInt(roomIdParam) : undefined;

  const { data: roomData, isLoading: roomLoading } = useRoom(roomId);
  const { joinRoom, isPending, isConfirming, isSuccess, error } = useJoinRoom();

  const [hasJoined, setHasJoined] = useState(false);

  // Parse room data
  const room = roomData ? {
    id: roomData[0],
    creator: roomData[1],
    entryFee: roomData[2],
    maxPlayers: roomData[3],
    isPrivate: roomData[4],
    status: roomData[5],
    gameId: roomData[6],
    turnTimeSeconds: roomData[7],
    winner: roomData[8],
  } : null;

  const isCreator = room && address?.toLowerCase() === room.creator.toLowerCase();
  const canJoin = room && room.status === 1 && !isCreator;

  useEffect(() => {
    if (isSuccess && !hasJoined) {
      setHasJoined(true);
      play("rooms/player-join");
      toast({
        title: "Joined room!",
        description: `You've successfully joined Room #${roomIdParam}`,
      });
      navigate(`/room/${roomIdParam}`);
    }
  }, [isSuccess, hasJoined, roomIdParam, navigate, toast, play]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Failed to join",
        description: error.message || "Transaction failed",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  const handleJoin = () => {
    if (!room || !roomId) return;
    play("ui/click");
    joinRoom(roomId, room.entryFee);
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
                <p className="text-muted-foreground mb-2">Connect your wallet to join this room</p>
                <p className="text-sm text-muted-foreground">Click "Connect Wallet" in the top-right</p>
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
            ) : room.status !== 1 ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">
                  This room is no longer accepting players
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => navigate("/room-list")}
                  className="mt-4"
                >
                  Browse Rooms
                </Button>
              </div>
            ) : isCreator ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground">
                  You created this room. Waiting for players to join.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => navigate(`/room/${roomIdParam}`)}
                  className="mt-4"
                >
                  View Room
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
                        {formatEntryFee(room.entryFee)} POL
                      </span>
                      {polPrice && (
                        <p className="text-xs text-muted-foreground">
                          ≈ ${(Number(formatEther(room.entryFee)) * polPrice).toFixed(2)} USD
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
                  disabled={!canJoin || isPending || isConfirming}
                  className="w-full bg-primary hover:bg-primary/90"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Confirm in Wallet...
                    </>
                  ) : isConfirming ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Joining Room...
                    </>
                  ) : (
                    `Join Room (${formatEntryFee(room.entryFee)} POL)`
                  )}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  Entry fee will be held in escrow until the game ends
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
