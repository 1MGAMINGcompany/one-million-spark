import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useSolPrice } from "@/hooks/useSolPrice";
import { Wallet, Construction, RefreshCw } from "lucide-react";
import { useWalletModal } from "@/components/SolanaProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { MIN_ENTRY_FEE_SOL, getSolanaCluster } from "@/lib/solana-config";

// Game ID mapping: Chess=1, Dominos=2, Backgammon=3, Checkers=4, Ludo=5
const GAME_IDS: Record<string, number> = {
  chess: 1,
  dominos: 2,
  backgammon: 3,
  checkers: 4,
  ludo: 5,
};

export default function CreateRoom() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { setVisible } = useWalletModal();
  const { price, formatUsd, loading: priceLoading, refetch: refetchPrice } = useSolPrice();
  
  // Enable background music
  useBackgroundMusic();

  const [gameType, setGameType] = useState<string>("chess");
  const [entryFee, setEntryFee] = useState<string>("0.1");
  const [maxPlayers, setMaxPlayers] = useState<string>("2");
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [turnTime, setTurnTime] = useState<string>("10");

  const cluster = getSolanaCluster();
  const isDevnet = cluster === "devnet";
  const entryFeeUsd = formatUsd(entryFee);

  if (!isConnected) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-4">
        <Card className="max-w-md w-full border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="pt-6 text-center space-y-4">
            <Wallet className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-xl font-cinzel">{t("createRoom.connectWallet")}</h2>
            <p className="text-muted-foreground text-sm">
              Connect your Solana wallet to create a game room.
            </p>
            <Button onClick={() => setVisible(true)} className="w-full">
              <Wallet className="mr-2 h-4 w-4" />
              Connect Wallet
            </Button>
            <p className="text-xs text-muted-foreground">
              Connect your wallet to see available games. No funds are moved.
            </p>
            {/* SOL Info */}
            <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20 text-left">
              <p className="text-sm font-medium text-primary mb-1">Game Fees</p>
              <p className="text-xs text-muted-foreground">
                Entry fees are paid in SOL on the Solana network.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-8 px-4">
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-cinzel flex items-center gap-3">
              <Construction className="h-6 w-6 text-primary" />
              {t("createRoom.title")}
            </CardTitle>
            {isDevnet && (
              <span className="text-xs bg-amber-500/20 text-amber-500 px-2 py-1 rounded">
                Devnet
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* SOL Price Display */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <span className="text-sm text-muted-foreground">SOL Price:</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-primary">
                {priceLoading ? "..." : price ? `$${price.toFixed(2)}` : "N/A"}
              </span>
              <button 
                onClick={refetchPrice} 
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw size={14} className={priceLoading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          <div className="text-center py-8">
            <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              Room creation with SOL entry fees will be available soon.
            </p>
            <p className="text-sm text-muted-foreground">
              Connected: {address?.slice(0, 8)}...{address?.slice(-4)}
            </p>
          </div>

          {/* Preview of form (disabled) */}
          <div className="space-y-4 opacity-50 pointer-events-none">
            <div>
              <Label>{t("createRoom.gameType")}</Label>
              <Select value={gameType} disabled>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chess">Chess</SelectItem>
                  <SelectItem value="dominos">Dominos</SelectItem>
                  <SelectItem value="backgammon">Backgammon</SelectItem>
                  <SelectItem value="checkers">Checkers</SelectItem>
                  <SelectItem value="ludo">Ludo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Entry Fee (SOL)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  value={entryFee}
                  onChange={(e) => setEntryFee(e.target.value)}
                  disabled
                  placeholder="0.1"
                  min={MIN_ENTRY_FEE_SOL}
                  step="0.01"
                />
                {entryFeeUsd && (
                  <span className="text-sm text-muted-foreground whitespace-nowrap">
                    {entryFeeUsd}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Minimum: {MIN_ENTRY_FEE_SOL} SOL
              </p>
            </div>

            <Button disabled className="w-full">
              Create Room (Coming Soon)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
