import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";

const CreateRoom = () => {
  const { isConnected } = useWallet();
  const [gameType, setGameType] = useState("chess");
  const [entryFee, setEntryFee] = useState("");
  const [players, setPlayers] = useState("2");
  const [turnTime, setTurnTime] = useState("");
  const [roomType, setRoomType] = useState("public");

  if (!isConnected) {
    return <WalletRequired />;
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-6 text-center">
          Create Game Room
        </h1>

        <form className="space-y-5">
          {/* Game Type */}
          <div className="space-y-2">
            <Label htmlFor="gameType">Game Type</Label>
            <Select value={gameType} onValueChange={setGameType}>
              <SelectTrigger id="gameType" className="w-full">
                <SelectValue placeholder="Select game" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chess">Chess</SelectItem>
                <SelectItem value="dominos">Dominos</SelectItem>
                <SelectItem value="backgammon">Backgammon</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Fee */}
          <div className="space-y-2">
            <Label htmlFor="entryFee">Entry Fee (USDT)</Label>
            <Input
              id="entryFee"
              type="number"
              placeholder="0.00"
              min="0.5"
              step="0.01"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
            />
            <p className="text-sm text-muted-foreground">Minimum 0.5 USDT</p>
          </div>

          {/* Number of Players */}
          <div className="space-y-2">
            <Label htmlFor="players">Number of Players</Label>
            <Select value={players} onValueChange={setPlayers}>
              <SelectTrigger id="players" className="w-full">
                <SelectValue placeholder="Select players" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 Players</SelectItem>
                <SelectItem value="3">3 Players</SelectItem>
                <SelectItem value="4">4 Players</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time per Turn */}
          <div className="space-y-2">
            <Label htmlFor="turnTime">Time per Turn</Label>
            <Select value={turnTime} onValueChange={setTurnTime}>
              <SelectTrigger id="turnTime" className="w-full">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <Label>Room Type</Label>
            <RadioGroup value={roomType} onValueChange={setRoomType} className="flex gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="public" />
                <Label htmlFor="public" className="font-normal cursor-pointer">
                  Public
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="font-normal cursor-pointer">
                  Private
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Submit Button */}
          <Button type="button" className="w-full" size="lg">
            Create Room
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom;
