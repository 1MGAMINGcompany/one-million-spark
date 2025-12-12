import { useParams, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useRoom, useRoomPlayers, useJoinRoom, useStartRoom, useCancelRoom, formatRoomView, formatEntryFee, getRoomStatusLabel } from "@/hooks/useRoomManager";
import { RoomStatus, type ContractRoomView } from "@/contracts/roomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Coins, Crown, Copy, ArrowLeft } from "lucide-react";
import { useEffect } from "react";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const { play } = useSound();
  const { formatUsd } = usePolPrice();

  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;

  const { data: roomData, isLoading: isRoomLoading, refetch } = useRoom(roomIdBigInt);
  const { data: playersData, refetch: refetchPlayers } = useRoomPlayers(roomIdBigInt);

  const { joinRoom, isPending: isJoinPending, isConfirming: isJoinConfirming, isSuccess: isJoinSuccess, reset: resetJoin } = useJoinRoom();
  const { startRoom, isPending: isStartPending, isConfirming: isStartConfirming, isSuccess: isStartSuccess, reset: resetStart } = useStartRoom();
  const { cancelRoom, isPending: isCancelPending, isConfirming: isCancelConfirming, isSuccess: isCancelSuccess, reset: resetCancel } = useCancelRoom();

  const room = roomData ? formatRoomView(roomData as ContractRoomView) : null;
  const players: readonly `0x${string}`[] = (playersData as readonly `0x${string}`[] | undefined) ?? [];

  const isCreator = room && address && room.creator.toLowerCase() === address.toLowerCase();
  const isPlayer = players.some(p => p.toLowerCase() === address?.toLowerCase());
  const canJoin = room && room.status === RoomStatus.Created && !isPlayer && players.length < room.maxPlayers;
  const canStart = room && room.status === RoomStatus.Created && isCreator && players.length >= 2;
  const canCancel = room && room.status === RoomStatus.Created && isCreator;

  // Handle successful actions
  useEffect(() => {
    if (isJoinSuccess) {
      play("rooms_enter");
      toast({ title: "Joined Room", description: "You have successfully joined the room." });
      resetJoin();
      refetch();
      refetchPlayers();
    }
  }, [isJoinSuccess, play, toast, resetJoin, refetch, refetchPlayers]);

  useEffect(() => {
    if (isStartSuccess) {
      play("rooms_match-start");
      toast({ title: "Room Started", description: "The game has begun!" });
      resetStart();
      refetch();
      refetchPlayers();
    }
  }, [isStartSuccess, play, toast, resetStart, refetch, refetchPlayers]);

  useEffect(() => {
    if (isCancelSuccess) {
      toast({ title: "Room Cancelled", description: "The room has been cancelled." });
      resetCancel();
      refetch();
    }
  }, [isCancelSuccess, toast, resetCancel, refetch]);

  const handleJoin = () => {
    if (!room || !roomIdBigInt) return;
    play("ui_click");
    joinRoom(roomIdBigInt, room.entryFee);
  };

  const handleStart = () => {
    if (!roomIdBigInt) return;
    play("ui_click");
    startRoom(roomIdBigInt);
  };

  const handleCancel = () => {
    if (!roomIdBigInt) return;
    play("ui_click");
    cancelRoom(roomIdBigInt);
  };

  const copyAddress = (addr: string) => {
    navigator.clipboard.writeText(addr);
    toast({ title: "Copied", description: "Address copied to clipboard." });
  };

  const shortenAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  const getStatusBadgeVariant = (status: RoomStatus) => {
    switch (status) {
      case RoomStatus.Created: return "secondary";
      case RoomStatus.Started: return "default";
      case RoomStatus.Finished: return "outline";
      case RoomStatus.Cancelled: return "destructive";
      default: return "secondary";
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <p className="text-muted-foreground">Please connect your wallet to view this room.</p>
      </div>
    );
  }

  if (isRoomLoading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Room not found.</p>
        <Button variant="outline" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Room List
        </Button>
      </div>
    );
  }

  const entryFeePol = formatEntryFee(room.entryFee);
  const entryFeeUsd = formatUsd(entryFeePol);

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
      </Button>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-2xl font-cinzel">Room #{room.id.toString()}</CardTitle>
          <Badge variant={getStatusBadgeVariant(room.status)}>{getRoomStatusLabel(room.status)}</Badge>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Entry Fee */}
          <div className="flex items-center gap-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Entry Fee</p>
              <p className="font-semibold">{entryFeePol} POL {entryFeeUsd && <span className="text-muted-foreground text-sm">{entryFeeUsd}</span>}</p>
            </div>
          </div>

          {/* Creator */}
          <div className="flex items-center gap-3">
            <Crown className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Creator</p>
              <div className="flex items-center gap-2">
                <p className="font-mono text-sm">{shortenAddress(room.creator)}</p>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyAddress(room.creator)}>
                  <Copy className="h-3 w-3" />
                </Button>
                {isCreator && <Badge variant="outline" className="text-xs">You</Badge>}
              </div>
            </div>
          </div>

          {/* Players */}
          <div className="flex items-start gap-3">
            <Users className="h-5 w-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-muted-foreground">Players ({players.length}/{room.maxPlayers})</p>
              <div className="mt-2 space-y-1">
                {players.map((player, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm">
                    <span className="font-mono">{shortenAddress(player)}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyAddress(player)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    {player.toLowerCase() === address?.toLowerCase() && <Badge variant="outline" className="text-xs">You</Badge>}
                    {player.toLowerCase() === room.creator.toLowerCase() && <Badge variant="secondary" className="text-xs">Creator</Badge>}
                  </div>
                ))}
                {players.length === 0 && <p className="text-muted-foreground text-sm">No players yet.</p>}
              </div>
            </div>
          </div>

          {/* Actions */}
          {room.status === RoomStatus.Created && (
            <div className="flex flex-wrap gap-3 pt-4 border-t border-border/50">
              {canJoin && (
                <Button onClick={handleJoin} disabled={isJoinPending || isJoinConfirming} className="flex-1">
                  {isJoinPending || isJoinConfirming ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Joining...</>
                  ) : (
                    <>Join Room ({entryFeePol} POL)</>
                  )}
                </Button>
              )}

              {canStart && (
                <Button onClick={handleStart} disabled={isStartPending || isStartConfirming} variant="secondary" className="flex-1">
                  {isStartPending || isStartConfirming ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Starting...</>
                  ) : (
                    "Start Game"
                  )}
                </Button>
              )}

              {canCancel && (
                <Button onClick={handleCancel} disabled={isCancelPending || isCancelConfirming} variant="destructive">
                  {isCancelPending || isCancelConfirming ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
                  ) : (
                    "Cancel Room"
                  )}
                </Button>
              )}

              {isPlayer && !isCreator && (
                <p className="w-full text-center text-sm text-muted-foreground">Waiting for the creator to start the game...</p>
              )}
            </div>
          )}

          {room.status === RoomStatus.Started && (
            <div className="pt-4 border-t border-border/50 text-center">
              <p className="text-muted-foreground">Game in progress...</p>
            </div>
          )}

          {room.status === RoomStatus.Finished && room.winner !== "0x0000000000000000000000000000000000000000" && (
            <div className="pt-4 border-t border-border/50">
              <p className="text-sm text-muted-foreground">Winner</p>
              <p className="font-mono">{shortenAddress(room.winner)}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
