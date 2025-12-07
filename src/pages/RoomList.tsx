import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";

const fakeRooms = [
  { id: 1, game: "Chess", entryFee: 1, players: 1, maxPlayers: 2 },
  { id: 2, game: "Dominos", entryFee: 2.5, players: 2, maxPlayers: 4 },
  { id: 3, game: "Backgammon", entryFee: 5, players: 1, maxPlayers: 2 },
];

const RoomList = () => {
  const { isConnected } = useWallet();
  const [gameFilter, setGameFilter] = useState("all");
  const [feeFilter, setFeeFilter] = useState("all");

  if (!isConnected) {
    return <WalletRequired />;
  }

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-8 text-center">
          Public Game Rooms
        </h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="flex-1">
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
          <div className="flex-1">
            <Select value={feeFilter} onValueChange={setFeeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Entry Fee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Fees</SelectItem>
                <SelectItem value="0.5-1">0.5 – 1 USDT</SelectItem>
                <SelectItem value="1-5">1 – 5 USDT</SelectItem>
                <SelectItem value="5+">5+ USDT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Room List */}
        <div className="space-y-4">
          {fakeRooms.map((room) => (
            <div
              key={room.id}
              className="bg-card border border-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">
                  {room.game}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Entry Fee: {room.entryFee} USDT
                </p>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users size={18} />
                <span className="text-sm">
                  {room.players} / {room.maxPlayers} players
                </span>
              </div>
              <Button size="sm">Join</Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoomList;
