import { useParams, useNavigate } from "react-router-dom";
import { useAccount } from "wagmi";
import { useRoom, useJoinRoom, useCancelRoom, usePlayersOf, formatEntryFee, getRoomStatusLabel, getGameName } from "@/hooks/useRoomManager";
import { RoomStatus } from "@/contracts/roomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, Coins, Crown, Copy, ArrowLeft, Gamepad2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ShareInviteDialog } from "@/components/ShareInviteDialog";
import { useRoomEvents, useNotificationPermission } from "@/hooks/useRoomEvents";
import { DiceRollStart } from "@/components/DiceRollStart";

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { toast } = useToast();
  const { play } = useSound();
  const { formatUsd } = usePolPrice();
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [diceRollComplete, setDiceRollComplete] = useState(false);
  const [playerGoesFirst, setPlayerGoesFirst] = useState<boolean | null>(null);
  const { requestPermission } = useNotificationPermission();

  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;

  const { data: roomData, isLoading: isRoomLoading, refetch } = useRoom(roomIdBigInt);
  const { data: playersData, refetch: refetchPlayers } = usePlayersOf(roomIdBigInt);

  const { joinRoom, isPending: isJoinPending, isConfirming: isJoinConfirming, isSuccess: isJoinSuccess, reset: resetJoin } = useJoinRoom();
  const { cancelRoom, isPending: isCancelPending, isConfirming: isCancelConfirming, isSuccess: isCancelSuccess, reset: resetCancel } = useCancelRoom();

  // Parse room data from getRoomView: [id, creator, entryFee, maxPlayers, isPrivate, status, gameId, turnTimeSeconds, winner]
  const room = roomData ? {
    id: roomData[0],
    creator: roomData[1],
    entryFee: roomData[2],
    maxPlayers: roomData[3],
    isPrivate: roomData[4],
    status: roomData[5] as RoomStatus,
    gameId: roomData[6],
    turnTimeSeconds: roomData[7],
    winner: roomData[8],
  } : null;

  const players = playersData || [];

  const isCreator = room && address && room.creator.toLowerCase() === address.toLowerCase();
  const isPlayer = players.some(p => p.toLowerCase() === address?.toLowerCase());
  const canJoin = room && room.status === RoomStatus.Created && !isPlayer && players.length < room.maxPlayers;
  const canCancel = room && room.status === RoomStatus.Created && isCreator;
  const canShare = room && room.isPrivate && isCreator && room.status === RoomStatus.Created;
  const roomIsFull = room && players.length >= room.maxPlayers;
  const canStartGame = roomIsFull && room.status === RoomStatus.Created && isPlayer && !diceRollComplete;

  // Get opponent info for dice roll
  const opponent = players.find(p => p.toLowerCase() !== address?.toLowerCase());
  const opponentShortName = opponent ? `${opponent.slice(0, 6)}...${opponent.slice(-4)}` : "Opponent";

  // Watch for room events (player joins, room ready)
  useRoomEvents({
    roomId: roomIdBigInt,
    maxPlayers: room?.maxPlayers,
    onPlayerJoined: () => {
      refetchPlayers();
    },
    onRoomReady: () => {
      refetch();
    },
  });

  // Request notification permission when creator views room
  useEffect(() => {
    if (isCreator) {
      requestPermission();
    }
  }, [isCreator, requestPermission]);
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
          {/* Game Type */}
          <div className="flex items-center gap-3">
            <Gamepad2 className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Game</p>
              <p className="font-semibold">{getGameName(room.gameId)}</p>
            </div>
          </div>

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

              {canCancel && (
                <Button onClick={handleCancel} disabled={isCancelPending || isCancelConfirming} variant="destructive">
                  {isCancelPending || isCancelConfirming ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Cancelling...</>
                  ) : (
                    "Cancel Room"
                  )}
                </Button>
              )}

              {canShare && (
                <Button onClick={() => setShowShareDialog(true)} variant="outline" className="gap-2">
                  <Share2 className="h-4 w-4" /> Invite Players
                </Button>
              )}

              {isPlayer && !isCreator && !roomIsFull && (
                <p className="w-full text-center text-sm text-muted-foreground">Waiting for more players to join...</p>
              )}
              
              {/* Room is full - show start game button */}
              {roomIsFull && !diceRollComplete && (
                <div className="w-full text-center space-y-3">
                  <p className="text-sm text-green-500 font-medium">All players have joined!</p>
                  <Button 
                    onClick={() => setShowDiceRoll(true)} 
                    className="w-full bg-gradient-to-r from-primary to-amber-600 hover:from-primary/90 hover:to-amber-600/90"
                  >
                    Roll to Determine First Player
                  </Button>
                </div>
              )}
              
              {/* Dice roll complete - show who goes first */}
              {diceRollComplete && playerGoesFirst !== null && (
                <div className="w-full text-center space-y-3">
                  <p className={`text-sm font-medium ${playerGoesFirst ? "text-green-500" : "text-amber-500"}`}>
                    {playerGoesFirst ? "You go first!" : `${opponentShortName} goes first`}
                  </p>
                  <Button 
                    onClick={() => {
                      // Navigate to game based on gameId
                      const gamePaths: Record<number, string> = {
                        1: `/game/chess/${roomId}`,
                        2: `/game/dominos/${roomId}`,
                        3: `/game/backgammon/${roomId}`,
                      };
                      const path = gamePaths[room?.gameId || 1] || `/game/chess/${roomId}`;
                      navigate(path);
                    }}
                    className="w-full"
                  >
                    Start Game
                  </Button>
                </div>
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
      
      {/* Share Dialog for Private Rooms */}
      <ShareInviteDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        roomId={roomId || ""}
        gameName={room ? getGameName(room.gameId) : undefined}
      />
      
      {/* Dice Roll to Determine First Player */}
      {showDiceRoll && (
        <DiceRollStart
          playerName="You"
          opponentName={opponentShortName}
          onComplete={(playerStarts) => {
            setShowDiceRoll(false);
            setDiceRollComplete(true);
            setPlayerGoesFirst(playerStarts);
            play(playerStarts ? "chess_win" : "backgammon_move");
            toast({
              title: playerStarts ? "You go first!" : `${opponentShortName} goes first`,
              description: "Get ready to play!",
            });
          }}
        />
      )}
    </div>
  );
}
