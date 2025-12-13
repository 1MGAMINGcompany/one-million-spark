import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, RefreshCw, Loader2, Clock } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { useSound } from "@/contexts/SoundContext";
import { useToast } from "@/hooks/use-toast";
import { useJoinRoom, formatEntryFee, getGameName } from "@/hooks/useRoomManager";
import { usePublicRooms, type PublicRoom } from "@/hooks/usePublicRooms";
import { formatEther } from "viem";

const RoomList = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConnected, address } = useWallet();
  const { play } = useSound();
  const { toast } = useToast();
  const [gameFilter, setGameFilter] = useState("all");
  const [feeFilter, setFeeFilter] = useState("all");
  const [joiningRoomId, setJoiningRoomId] = useState<bigint | null>(null);

  const { rooms, isLoading: isLoadingRooms, refetch } = usePublicRooms();

  // Handle refresh query param (set after room creation)
  useEffect(() => {
    if (searchParams.get("refresh") === "1") {
      refetch();
      // Remove the refresh param from URL
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, refetch, setSearchParams]);

  const { 
    joinRoom, 
    isPending: isJoinPending, 
    isConfirming: isJoinConfirming, 
    isSuccess: isJoinSuccess, 
    error: joinError, 
    reset: resetJoin 
  } = useJoinRoom();

  // Handle join success
  useEffect(() => {
    if (isJoinSuccess && joiningRoomId) {
      play('room_enter');
      toast({
        title: "Joined Room!",
        description: "You have successfully joined the game room.",
      });
      // Navigate to the room page
      navigate(`/room/${joiningRoomId.toString()}`);
      setJoiningRoomId(null);
      resetJoin();
      refetch();
    }
  }, [isJoinSuccess, joiningRoomId, play, toast, resetJoin, refetch, navigate]);

  // Handle join error
  useEffect(() => {
    if (joinError) {
      toast({
        title: "Failed to Join",
        description: joinError.message || "Transaction failed",
        variant: "destructive",
      });
      setJoiningRoomId(null);
      resetJoin();
    }
  }, [joinError, toast, resetJoin]);

  const handleRefresh = () => {
    play('ui_click');
    refetch();
  };

  const handleJoinRoom = (room: PublicRoom) => {
    if (room.creator.toLowerCase() === address?.toLowerCase()) {
      toast({
        title: "Cannot Join",
        description: "You cannot join your own room",
        variant: "destructive",
      });
      return;
    }

    play('ui_click');
    setJoiningRoomId(room.id);
    joinRoom(room.id, room.entryFee);
  };

  if (!isConnected) {
    return <WalletRequired />;
  }

  const isJoining = isJoinPending || isJoinConfirming;

  const getJoinButtonText = (roomId: bigint) => {
    if (joiningRoomId !== roomId) return "Join Room";
    if (isJoinPending) return "Confirm in wallet...";
    if (isJoinConfirming) return "Processing...";
    return "Join Room";
  };

  // Game ID mapping for filter
  const GAME_ID_MAP: Record<string, number> = {
    chess: 1,
    dominos: 2,
    backgammon: 3,
  };

  // Filter rooms based on selected filters
  const filteredRooms = rooms.filter(room => {
    // Game filter - now using gameId from contract
    if (gameFilter !== "all") {
      const targetGameId = GAME_ID_MAP[gameFilter];
      if (room.gameId !== targetGameId) return false;
    }
    
    const feeInPol = parseFloat(formatEther(room.entryFee));
    
      switch (feeFilter) {
        case "lt10":
          if (feeInPol >= 10) return false;
          break;
        case "lt50":
          if (feeInPol >= 50) return false;
          break;
        case "lt100":
          if (feeInPol >= 100) return false;
          break;
        case "lt1000":
          if (feeInPol >= 1000) return false;
          break;
        case "gt1000":
          if (feeInPol <= 1000) return false;
          break;
        case "gt10000":
          if (feeInPol <= 10000) return false;
          break;
        case "gt100000":
          if (feeInPol <= 100000) return false;
          break;
        case "gt1000000":
          if (feeInPol <= 1000000) return false;
          break;
      }
    
    return true;
  });

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-8 text-center">
          Public Game Rooms
        </h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center">
          <div className="flex-1 w-full">
            <Select value={gameFilter} onValueChange={setGameFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Game Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Games</SelectItem>
                <SelectItem value="chess">Chess</SelectItem>
                <SelectItem value="dominos">Dominos</SelectItem>
                <SelectItem value="backgammon">Backgammon</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 w-full">
            <Select value={feeFilter} onValueChange={setFeeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Entry Fee Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fees</SelectItem>
                <SelectItem value="lt10">Less than 10 POL</SelectItem>
                <SelectItem value="lt50">Less than 50 POL</SelectItem>
                <SelectItem value="lt100">Less than 100 POL</SelectItem>
                <SelectItem value="lt1000">Less than 1,000 POL</SelectItem>
                <SelectItem value="gt1000">Above 1,000 POL</SelectItem>
                <SelectItem value="gt10000">Above 10,000 POL</SelectItem>
                <SelectItem value="gt100000">Above 100,000 POL</SelectItem>
                <SelectItem value="gt1000000">Above 1,000,000 POL</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0" 
            onClick={handleRefresh}
            disabled={isLoadingRooms}
          >
            <RefreshCw size={18} className={isLoadingRooms ? "animate-spin" : ""} />
          </Button>
        </div>

        {/* Room List */}
        <div className="space-y-4">
          {isLoadingRooms && rooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>Loading rooms from blockchain...</p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No rooms available. Create one!</p>
            </div>
          ) : (
            filteredRooms.map((room) => (
              <div
                key={room.id.toString()}
                className="bg-card border border-border rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {getGameName(room.gameId)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Entry Fee: {formatEntryFee(room.entryFee)} POL
                  </p>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-1.5" title="Players">
                    <Users size={16} />
                    <span className="text-sm">
                      {room.playerCount} / {room.maxPlayers}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Time per turn">
                    <Clock size={16} />
                    <span className="text-sm">
                      {room.turnTimeSeconds}s
                    </span>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => handleJoinRoom(room)}
                  disabled={isJoining && joiningRoomId === room.id}
                >
                  {isJoining && joiningRoomId === room.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {getJoinButtonText(room.id)}
                    </>
                  ) : (
                    "Join Room"
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomList;
