import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useSolPrice } from "@/hooks/useSolPrice";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { Wallet, Loader2, AlertCircle } from "lucide-react";
import { useWalletModal } from "@/components/SolanaProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { MIN_ENTRY_FEE_SOL, getSolanaCluster } from "@/lib/solana-config";
import { GameType } from "@/lib/solana-program";

export default function CreateRoom() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { setVisible } = useWalletModal();
  const { price, formatUsd, loading: priceLoading, refetch: refetchPrice } = useSolPrice();
  const { createRoom, txPending, programReady, getBalance } = useSolanaRooms();
  
  useBackgroundMusic();

  const [gameType, setGameType] = useState<string>("1"); // Chess
  const [entryFee, setEntryFee] = useState<string>("0.1");
  const [maxPlayers, setMaxPlayers] = useState<string>("2");
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [turnTime, setTurnTime] = useState<string>("10");
  const [balance, setBalance] = useState<number>(0);

  const cluster = getSolanaCluster();
  const isDevnet = cluster === "devnet";
  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUsd = formatUsd(entryFee);

  // Fetch balance on mount
  useEffect(() => {
    if (isConnected) {
      getBalance().then(setBalance);
    }
  }, [isConnected, getBalance]);

  const handleCreateRoom = async () => {
    if (entryFeeNum < MIN_ENTRY_FEE_SOL) {
      toast({
        title: "Invalid entry fee",
        description: `Minimum entry fee is ${MIN_ENTRY_FEE_SOL} SOL`,
        variant: "destructive",
      });
      return;
    }

    if (entryFeeNum > balance) {
      toast({
        title: "Insufficient balance",
        description: `You need ${entryFeeNum} SOL but only have ${balance.toFixed(4)} SOL`,
        variant: "destructive",
      });
      return;
    }

    play("rooms_created");
    
    const roomId = await createRoom(
      parseInt(gameType) as GameType,
      entryFeeNum,
      parseInt(maxPlayers),
      parseInt(turnTime),
      isPrivate
    );

    if (roomId) {
      navigate(`/room/${roomId}`);
    }
  };

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-3 py-4">
        <Card className="max-w-sm w-full border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="pt-5 text-center space-y-3">
            <Wallet className="h-10 w-10 text-primary mx-auto" />
            <h2 className="text-lg font-cinzel">{t("createRoom.connectWallet")}</h2>
            <p className="text-muted-foreground text-sm">
              Connect your Solana wallet to create a game room.
            </p>
            <Button onClick={() => setVisible(true)} className="w-full" size="sm">
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
            <p className="text-xs text-muted-foreground">
              No funds are moved when connecting.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-5rem)] flex items-center justify-center px-3 py-4">
      <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur">
        <CardHeader className="pb-3 pt-4 px-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-cinzel">
              {t("createRoom.title")}
            </CardTitle>
            <div className="flex items-center gap-2">
              {isDevnet && (
                <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded">
                  Devnet
                </span>
              )}
              {!programReady && (
                <span className="text-xs bg-orange-500/20 text-orange-500 px-2 py-0.5 rounded">
                  Preview
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5">
          {/* Balance & Price */}
          <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
            <div>
              <span className="text-muted-foreground">Balance:</span>{" "}
              <span className="font-semibold">{balance.toFixed(4)} SOL</span>
            </div>
            <div className="text-muted-foreground">
              1 SOL ≈ ${price?.toFixed(2) || "..."}
            </div>
          </div>

          {/* Program not ready notice */}
          {!programReady && (
            <div className="flex items-start gap-2 p-2.5 bg-orange-500/10 border border-orange-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 shrink-0" />
              <p className="text-xs text-orange-200">
                Solana program not yet deployed. Form is in preview mode.
              </p>
            </div>
          )}

          {/* Game Type */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("createRoom.gameType")}</Label>
            <Select value={gameType} onValueChange={setGameType}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Chess</SelectItem>
                <SelectItem value="2">Dominos</SelectItem>
                <SelectItem value="3">Backgammon</SelectItem>
                <SelectItem value="4">Checkers</SelectItem>
                <SelectItem value="5">Ludo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Fee */}
          <div className="space-y-1.5">
            <Label className="text-sm">Entry Fee (SOL)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder="0.1"
                min={MIN_ENTRY_FEE_SOL}
                step="0.01"
                className="h-9"
              />
              {entryFeeUsd && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {entryFeeUsd}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Min: {MIN_ENTRY_FEE_SOL} SOL
            </p>
          </div>

          {/* Turn Time */}
          <div className="space-y-1.5">
            <Label className="text-sm">Turn Time</Label>
            <Select value={turnTime} onValueChange={setTurnTime}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 seconds</SelectItem>
                <SelectItem value="10">10 seconds</SelectItem>
                <SelectItem value="15">15 seconds</SelectItem>
                <SelectItem value="0">Unlimited</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Private Room Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">Private Room</Label>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          {/* Prize Info */}
          <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">Prize Pool:</span>
              <span className="font-semibold text-primary">
                {(entryFeeNum * parseInt(maxPlayers)).toFixed(3)} SOL
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Platform Fee:</span>
              <span>5%</span>
            </div>
          </div>

          {/* Create Button */}
          <Button 
            onClick={handleCreateRoom}
            disabled={txPending || !programReady}
            className="w-full"
            size="sm"
          >
            {txPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : !programReady ? (
              "Program Not Deployed"
            ) : (
              "Create Room"
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Connected: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
