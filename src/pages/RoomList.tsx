import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, RefreshCw, Loader2 } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { useSound } from "@/contexts/SoundContext";
import { useToast } from "@/hooks/use-toast";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";
import { useJoinRoom, formatEntryFee, getRoomStatusLabel } from "@/hooks/useRoomManager";

interface DisplayRoom {
  id: bigint;
  game: string;
  entryFee: bigint;
  players: number;
  maxPlayers: number;
  status: RoomStatus;
  creator: string;
}

const RoomList = () => {
  const { isConnected, address } = useWallet();
  const { play } = useSound();
  const { toast } = useToast();
  const [gameFilter, setGameFilter] = useState("all");
  const [feeFilter, setFeeFilter] = useState("all");
  const [rooms, setRooms] = useState<DisplayRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [joiningRoomId, setJoiningRoomId] = useState<bigint | null>(null);

  // Get next room ID to know how many rooms exist
  const { data: nextRoomId, refetch: refetchNextId } = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
  });

  const { joinRoom, isPending: isJoinPending, isConfirming: isJoinConfirming, isSuccess: isJoinSuccess, error: joinError, reset: resetJoin } = useJoinRoom();

  // Fetch all rooms from blockchain
  const fetchRooms = useCallback(async () => {
    if (!nextRoomId || nextRoomId === 0n) {
      setRooms([]);
      return;
    }

    setIsLoadingRooms(true);

    try {
      const fetchedRooms: DisplayRoom[] = [];
      
      // Fetch each room (starting from 1, as 0 is typically unused)
      for (let i = 1n; i < nextRoomId; i++) {
        try {
          // We'll use a direct contract call here
          const response = await fetch(`https://polygon-rpc.com`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Number(i),
              method: 'eth_call',
              params: [{
                to: ROOM_MANAGER_ADDRESS,
                data: `0xd5b8bc48${i.toString(16).padStart(64, '0')}` // getRoom selector
              }, 'latest']
            })
          });
          
          const result = await response.json();
          if (result.result && result.result !== '0x') {
            // Parse the room data - simplified parsing
            const data = result.result.slice(2);
            const id = BigInt('0x' + data.slice(0, 64));
            const creator = '0x' + data.slice(88, 128);
            const entryFee = BigInt('0x' + data.slice(128, 192));
            const maxPlayers = parseInt(data.slice(248, 256), 16);
            const isPrivate = parseInt(data.slice(312, 320), 16) === 1;
            const status = parseInt(data.slice(376, 384), 16) as RoomStatus;
            
            // Only show Created (waiting) rooms that are public
            if (status === RoomStatus.Created && !isPrivate) {
              fetchedRooms.push({
                id,
                game: "Chess", // Contract doesn't store game type - would need metadata
                entryFee,
                players: 1, // Would need to parse players array
                maxPlayers,
                status,
                creator,
              });
            }
          }
        } catch (e) {
          console.error(`Error fetching room ${i}:`, e);
        }
      }

      setRooms(fetchedRooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
      toast({
        title: "Error",
        description: "Failed to fetch rooms from blockchain",
        variant: "destructive",
      });
    } finally {
      setIsLoadingRooms(false);
    }
  }, [nextRoomId, toast]);

  // Initial fetch when connected
  useEffect(() => {
    if (isConnected && nextRoomId !== undefined) {
      fetchRooms();
    }
  }, [isConnected, nextRoomId, fetchRooms]);

  // Handle join success
  useEffect(() => {
    if (isJoinSuccess) {
      play('room_enter');
      toast({
        title: "Joined Room!",
        description: "You have successfully joined the game room.",
      });
      setJoiningRoomId(null);
      resetJoin();
      fetchRooms(); // Refresh the room list
    }
  }, [isJoinSuccess, play, toast, resetJoin, fetchRooms]);

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
    refetchNextId();
    fetchRooms();
  };

  const handleJoinRoom = (room: DisplayRoom) => {
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
    // joinRoom sends value: entryFee (payable)
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

  // Filter rooms based on selected filters
  const filteredRooms = rooms.filter(room => {
    if (gameFilter !== "all" && room.game.toLowerCase() !== gameFilter) return false;
    
    const feeInPol = parseFloat(formatEntryFee(room.entryFee));
    if (feeFilter === "0.5-1" && (feeInPol < 0.5 || feeInPol > 1)) return false;
    if (feeFilter === "1-5" && (feeInPol < 1 || feeInPol > 5)) return false;
    if (feeFilter === "5+" && feeInPol < 5) return false;
    
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
                <SelectItem value="0.5-1">0.5 – 1 POL</SelectItem>
                <SelectItem value="1-5">1 – 5 POL</SelectItem>
                <SelectItem value="5+">5+ POL</SelectItem>
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
                    {room.game}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Entry Fee: {formatEntryFee(room.entryFee)} POL
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    Room #{room.id.toString()}
                  </p>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Users size={16} />
                    <span className="text-sm">
                      {room.players} / {room.maxPlayers}
                    </span>
                  </div>
                  <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary">
                    {getRoomStatusLabel(room.status)}
                  </span>
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
