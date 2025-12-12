import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useCreateRoom, usePlayerActiveRoom, useCancelRoom } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { Loader2, AlertCircle, AlertTriangle, Wallet } from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { GAME_CATALOG } from "@/contracts/roomManager";

const CreateRoom = () => {
  const { open: openWalletModal } = useWeb3Modal();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { price, error: priceError, minPol, minUsd, getUsdValue } = usePolPrice();

  // IMPORTANT: gameId numbers must match your contract mapping
  const [gameId, setGameId] = useState("1"); // 1=Chess, 2=Dominos, 3=Backgammon
  const [entryFee, setEntryFee] = useState("");
  const [players, setPlayers] = useState("2");
  const [turnTime, setTurnTime] = useState("0"); // seconds, "0" = no timer
  const [roomType, setRoomType] = useState("public");
  const [feeError, setFeeError] = useState<string | null>(null);

  const { createRoom, isPending, isConfirming, isSuccess, error, reset } = useCreateRoom();

  // Active room guard
  const { data: activeRoomId, refetch: refetchActiveRoom } = usePlayerActiveRoom(address as `0x${string}` | undefined);
  const hasActiveRoom = isConnected && activeRoomId !== undefined && activeRoomId > 0n;

  const {
    cancelRoom,
    isPending: isCancelPending,
    isConfirming: isCancelConfirming,
    isSuccess: isCancelSuccess,
    reset: resetCancel,
  } = useCancelRoom();

  // UX: if wallet modal fails to pop, guide user
  const [connectNudge, setConnectNudge] = useState(false);

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

  useEffect(() => {
    if (isSuccess) {
      play("room_create");
      toast({
        title: "Room Created!",
        description: "Room created on-chain. Redirecting to room list...",
      });
      setEntryFee("");
      setPlayers("2");
      setTurnTime("0");
      setRoomType("public");
      reset();
      refetchActiveRoom();
      setTimeout(() => navigate("/room-list?refresh=1"), 800);
    }
  }, [isSuccess, play, toast, reset, refetchActiveRoom, navigate]);

  useEffect(() => {
    if (error) {
      toast({
        title: "Transaction Failed",
        description: (error as any)?.shortMessage || (error as any)?.message || "Failed to create room",
        variant: "destructive",
      });
      reset();
    }
  }, [error, toast, reset]);

  useEffect(() => {
    if (isCancelSuccess) {
      toast({
        title: "Room Cancelled",
        description: "Your active room has been cancelled. You can create a new one.",
      });
      resetCancel();
      refetchActiveRoom();
    }
  }, [isCancelSuccess, toast, resetCancel, refetchActiveRoom]);

  const handleCancelActiveRoom = () => {
    if (!activeRoomId) return;
    play("ui_click");
    cancelRoom(activeRoomId);
  };

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

    const maxPlayers = parseInt(players);
    const isPrivate = roomType === "private";
    const turnTimeSeconds = turnTime === "none" ? 0 : parseInt(turnTime);

    play("ui_click");
    createRoom(entryFee, maxPlayers, isPrivate, parseInt(gameId), turnTimeSeconds);
  };

  const isLoading = isPending || isConfirming;
  const isCancelLoading = isCancelPending || isCancelConfirming;
  const entryUsdValue = getUsdValue(entryFee);

  const handleButtonClick = () => {
    if (!isConnected) {
      play("ui_click");
      openWalletModal();

      // If wallet doesn’t appear, user clicks again — we guide them.
      setConnectNudge(true);
      setTimeout(() => setConnectNudge(false), 2500);

      toast({
        title: "Connect your wallet",
        description: "If the wallet popup didn’t open, click the button again.",
      });
      return;
    }
    handleCreateRoom();
  };

  const buttonLabel = !isConnected
    ? connectNudge
      ? "Click again to open wallet"
      : "Double-click to connect"
    : isLoading
      ? "Processing..."
      : "Create Room";

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-6 text-center">Create Game Room</h1>

        {hasActiveRoom && (
          <div className="mb-5 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-3 flex-1">
                <div>
                  <p className="font-medium text-amber-500">Active Room Exists</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You already have an active room (#{activeRoomId?.toString()}). Cancel it or finish it before
                    creating another.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => navigate("/room-list")}>
                    View Rooms
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    onClick={handleCancelActiveRoom}
                    disabled={isCancelLoading}
                  >
                    {isCancelLoading ? (
                      <>
                        <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      "Cancel Room"
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        <form className="space-y-5">
          {/* Game */}
          <div className="space-y-2">
            <Label htmlFor="gameId">Game</Label>
            <Select value={gameId} onValueChange={setGameId} disabled={isLoading || hasActiveRoom}>
              <SelectTrigger id="gameId" className="w-full">
                <SelectValue placeholder="Select game" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{GAME_CATALOG[1].label}</SelectItem>
                <SelectItem value="2">{GAME_CATALOG[2].label}</SelectItem>
                <SelectItem value="3">{GAME_CATALOG[3].label}</SelectItem>
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
                  disabled={isLoading || hasActiveRoom}
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
                    <span className="text-amber-500">
                      Price unavailable – using fallback minimum {minPol.toFixed(3)} POL
                    </span>
                  ) : (
                    <>
                      Minimum ≈ {minPol.toFixed(3)} POL (~${minUsd.toFixed(2)} USDT)
                    </>
                  )}
                </p>
              </div>

              <div className="md:w-44 bg-muted/50 border border-border rounded-md p-3 text-xs space-y-1">
                <p className="font-medium text-foreground">Estimate</p>
                {price ? (
                  <>
                    <p className="text-muted-foreground">1 POL ≈ ${price.toFixed(3)}</p>
                    <p className="text-muted-foreground">
                      Your entry ≈ ${entryUsdValue ? entryUsdValue.toFixed(2) : "0.00"}
                    </p>
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

          {/* Players */}
          <div className="space-y-2">
            <Label htmlFor="players">Players</Label>
            <Select value={players} onValueChange={setPlayers} disabled={isLoading || hasActiveRoom}>
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

          {/* Turn Time */}
          <div className="space-y-2">
            <Label htmlFor="turnTime">Time per Turn</Label>
            <Select value={turnTime} onValueChange={setTurnTime} disabled={isLoading || hasActiveRoom}>
              <SelectTrigger id="turnTime" className="w-full">
                <SelectValue placeholder="Select time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">No timer (play over days)</SelectItem>
                <SelectItem value="30">30 seconds</SelectItem>
                <SelectItem value="60">1 minute</SelectItem>
                <SelectItem value="300">5 minutes</SelectItem>
                <SelectItem value="900">15 minutes</SelectItem>
                <SelectItem value="3600">1 hour</SelectItem>
                <SelectItem value="86400">1 day per turn</SelectItem>
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
              disabled={isLoading || hasActiveRoom}
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

          {/* Button */}
          <Button
            type="button"
            className="w-full"
            size="lg"
            onClick={handleButtonClick}
            disabled={isLoading || (isConnected && (!!feeError || hasActiveRoom))}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isPending ? "Waiting for wallet..." : "Waiting for network..."}
              </>
            ) : !isConnected ? (
              <>
                <Wallet className="mr-2 h-4 w-4" />
                {buttonLabel}
              </>
            ) : (
              buttonLabel
            )}
          </Button>
        </form>
      </div>
    </div>
  );
};

export default CreateRoom;
