import { useState, useEffect } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useCreateRoom } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { Loader2, AlertCircle } from "lucide-react";

const CreateRoom = () => {
  const { isConnected } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { price, error: priceError, minPol, minUsd, getUsdValue } = usePolPrice();
  const [gameType, setGameType] = useState("chess");
  const [entryFee, setEntryFee] = useState("");
  const [players, setPlayers] = useState("2");
  const [turnTime, setTurnTime] = useState("none");
  const [roomType, setRoomType] = useState("public");
  const [feeError, setFeeError] = useState<string | null>(null);

  const { createRoom, isPending, isConfirming, isSuccess, error, reset } = useCreateRoom();

  // Validate entry fee on change
  useEffect(() => {
    if (!entryFee) {
      setFeeError(null);
      return;
    }
    const feeNum = parseFloat(entryFee);
    if (isNaN(feeNum) || feeNum < minPol) {
      setFeeError(`Entry fee must be at least ${minPol.toFixed(3)} POL (≈ $${minUsd.toFixed(2)} USDT)`);
    } else {
      setFeeError(null);
    }
  }, [entryFee, minPol, minUsd]);

  // Handle transaction success
  useEffect(() => {
    if (isSuccess) {
      play('room_create');
      toast({
        title: "Room Created!",
        description: "Your game room has been created on the blockchain.",
      });
      // Reset form
      setEntryFee("");
      setPlayers("2");
      setTurnTime("none");
      setRoomType("public");
      reset();
    }
  }, [isSuccess, play, toast, reset]);

  // Handle transaction error
  useEffect(() => {
    if (error) {
      toast({
        title: "Transaction Failed",
        description: error.message || "Failed to create room",
        variant: "destructive",
      });
      reset();
    }
  }, [error, toast, reset]);

  const handleCreateRoom = () => {
    const feeNum = parseFloat(entryFee);
    if (!entryFee || isNaN(feeNum) || feeNum < minPol) {
      toast({
        title: "Invalid Entry Fee",
        description: `Minimum entry fee is ${minPol.toFixed(3)} POL (≈ $${minUsd.toFixed(2)} USDT)`,
        variant: "destructive",
      });
      return;
    }

    play('ui_click');
    
    const maxPlayers = parseInt(players);
    const isPrivate = roomType === "private";
    
    createRoom(entryFee, maxPlayers, isPrivate);
  };

  if (!isConnected) {
    return <WalletRequired />;
  }

  const isLoading = isPending || isConfirming;
  const entryUsdValue = getUsdValue(entryFee);

  const getButtonText = () => {
    if (isPending) return "Waiting for wallet confirmation...";
    if (isConfirming) return "Waiting for network confirmation...";
    return "Create Room";
  };

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
            <Select value={gameType} onValueChange={setGameType} disabled={isLoading}>
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
            <Label htmlFor="entryFee">Entry Fee (POL)</Label>
            <div className="flex flex-col md:flex-row gap-3">
              <div className="flex-1 space-y-1">
                <Input
                  id="entryFee"
                  type="number"
                  placeholder="0.00"
                  min={minPol}
                  step="0.001"
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  disabled={isLoading}
                  className={feeError ? "border-destructive" : ""}
                />
                {feeError && (
                  <p className="text-sm text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {feeError}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  {priceError ? (
                    <span className="text-amber-500">Price unavailable – using fallback minimum 0.5 POL</span>
                  ) : (
                    <>Minimum ≈ {minPol.toFixed(3)} POL (~${minUsd.toFixed(2)} USDT)</>
                  )}
                </p>
              </div>
              
              {/* Estimate Panel */}
              <div className="md:w-44 bg-muted/50 border border-border rounded-md p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">Estimate</p>
                {price ? (
                  <>
                    <p className="text-muted-foreground">1 POL ≈ ${price.toFixed(3)}</p>
                    <p className="text-muted-foreground">
                      Your entry ≈ ${entryUsdValue ? entryUsdValue.toFixed(2) : '0.00'}
                    </p>
                    <p className="text-muted-foreground">Minimum ≈ ${minUsd.toFixed(2)}</p>
                  </>
                ) : (
                  <p className="text-amber-500">Loading price...</p>
                )}
                <p className="text-muted-foreground/70 text-[10px] pt-1 border-t border-border/50">
                  Approximate. Final value depends on market price.
                </p>
              </div>
            </div>
          </div>

          {/* Number of Players */}
          <div className="space-y-2">
            <Label htmlFor="players">Number of Players</Label>
            <Select value={players} onValueChange={setPlayers} disabled={isLoading}>
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
            <Select value={turnTime} onValueChange={setTurnTime} disabled={isLoading}>
              <SelectTrigger id="turnTime" className="w-full">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No timer</SelectItem>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <Label>Room Type</Label>
            <RadioGroup 
              value={roomType} 
              onValueChange={setRoomType} 
              className="flex gap-6"
              disabled={isLoading}
            >
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
          <Button 
            type="button" 
            className="w-full" 
            size="lg" 
            onClick={handleCreateRoom}
            disabled={isLoading || !!feeError}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {getButtonText()}
              </>
            ) : (
              "Create Room"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom;
