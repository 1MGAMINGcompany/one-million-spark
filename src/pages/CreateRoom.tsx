import { useState, useEffect, useCallback } from "react";
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
import { useSolanaNetwork } from "@/hooks/useSolanaNetwork";
import { Wallet, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GameType } from "@/lib/solana-program";
import { ConnectWalletGate } from "@/components/ConnectWalletGate";
import { NetworkProofBadge } from "@/components/NetworkProofBadge";

// Target minimum fee in USD
const MIN_FEE_USD = 0.50;
// Fallback minimum if price unavailable
const FALLBACK_MIN_SOL = 0.004;

export default function CreateRoom() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { price, formatUsd, loading: priceLoading, refetch: refetchPrice } = useSolPrice();
  const { createRoom, txPending, activeRoom, fetchCreatorActiveRoom } = useSolanaRooms();
  const { 
    balanceInfo, 
    fetchBalance, 
    networkInfo, 
    checkNetworkMismatch 
  } = useSolanaNetwork();

  const [gameType, setGameType] = useState<string>("1"); // Chess
  const [entryFee, setEntryFee] = useState<string>("0.1");
  const [maxPlayers, setMaxPlayers] = useState<string>("2");
  const [isPrivate, setIsPrivate] = useState<boolean>(false);
  const [turnTime, setTurnTime] = useState<string>("10");
  const [checkingActiveRoom, setCheckingActiveRoom] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  
  // Use balance from network hook (null means not fetched, not 0)
  const balance = balanceInfo.sol ?? 0;
  
  // Dynamic minimum fee based on current SOL price (~$0.50 USD)
  const dynamicMinFee = price ? Math.ceil((MIN_FEE_USD / price) * 10000) / 10000 : FALLBACK_MIN_SOL;
  
  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUsd = formatUsd(entryFee);

  // Check for active room on mount
  useEffect(() => {
    if (isConnected) {
      fetchCreatorActiveRoom().finally(() => setCheckingActiveRoom(false));
    } else {
      setCheckingActiveRoom(false);
    }
  }, [isConnected, fetchCreatorActiveRoom]);
  
  // Manual balance refresh
  const handleRefreshBalance = useCallback(async () => {
    setRefreshingBalance(true);
    await fetchBalance();
    setRefreshingBalance(false);
  }, [fetchBalance]);

  const handleCreateRoom = async () => {
    // Check network first
    const networkError = checkNetworkMismatch();
    if (networkError) {
      toast({
        title: "Wrong Network",
        description: networkError,
        variant: "destructive",
      });
      return;
    }
    
    if (activeRoom) {
      toast({
        title: t("createRoom.activeRoomExists"),
        description: t("createRoom.cancelExistingRoom"),
        variant: "destructive",
      });
      return;
    }

    if (entryFeeNum < dynamicMinFee) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.minFeeError", { amount: dynamicMinFee.toFixed(4), usd: MIN_FEE_USD.toFixed(2) }),
        variant: "destructive",
      });
      return;
    }

    // Re-fetch balance before checking (fresh balance)
    const freshBalance = await fetchBalance();
    const currentBalance = freshBalance?.sol ?? balance;
    
    if (entryFeeNum > currentBalance) {
      toast({
        title: t("createRoom.insufficientBalance"),
        description: t("createRoom.insufficientBalanceDesc", { need: entryFeeNum, have: currentBalance.toFixed(4) }),
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
          <CardContent className="pt-6 text-center space-y-4">
            <Wallet className="h-12 w-12 text-primary mx-auto" />
            <h2 className="text-xl font-cinzel">{t("createRoom.connectWallet")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("createRoom.connectWalletDesc")}
            </p>
            <ConnectWalletGate />
            <p className="text-xs text-muted-foreground pt-2">
              {t("createRoom.noFundsMoved")}
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
          </div>
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5">
          {/* Active Room Warning */}
          {activeRoom && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm">
                <p className="text-amber-200 font-medium">{t("createRoom.activeRoomExists")}</p>
                <p className="text-amber-200/70">{t("createRoom.cancelExistingRoom")}</p>
                <Button 
                  variant="link" 
                  size="sm" 
                  className="text-amber-400 p-0 h-auto mt-1"
                  onClick={() => navigate(`/room/${activeRoom.roomId}`)}
                >
                  {t("createRoom.goToRoom")} →
                </Button>
              </div>
            </div>
          )}

          {/* Balance & Price with Refresh */}
          <div className="flex items-center justify-between p-2.5 bg-muted/50 rounded-lg text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t("createRoom.balance")}:</span>
              {balanceInfo.loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : balanceInfo.error ? (
                <span className="text-red-400 text-xs" title={balanceInfo.error}>Error</span>
              ) : (
                <span className="font-semibold">{balance.toFixed(4)} SOL</span>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={handleRefreshBalance}
                disabled={refreshingBalance || balanceInfo.loading}
              >
                <RefreshCw className={`w-3 h-3 ${refreshingBalance ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="text-muted-foreground">
              1 SOL ≈ ${price?.toFixed(2) || "..."}
            </div>
          </div>
          
          {/* Balance Error Display */}
          {balanceInfo.error && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
              <div className="text-sm text-red-400">
                <p className="font-medium">Balance Error</p>
                <p className="text-xs opacity-80">{balanceInfo.error}</p>
              </div>
            </div>
          )}
          
          {/* Network Warning */}
          {!networkInfo.loading && !networkInfo.isMainnet && networkInfo.cluster !== "unknown" && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-400">
                <p className="font-medium">Wrong Network</p>
                <p className="text-xs opacity-80">
                  App is connected to {networkInfo.cluster} but wallet funds are on Mainnet.
                </p>
              </div>
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
                <SelectItem value="1">{t("games.chess")}</SelectItem>
                <SelectItem value="2">{t("games.dominos")}</SelectItem>
                <SelectItem value="3">{t("games.backgammon")}</SelectItem>
                <SelectItem value="4">{t("games.checkers")}</SelectItem>
                <SelectItem value="5">{t("games.ludo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Fee */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("createRoom.entryFeeSol")}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder={dynamicMinFee.toFixed(4)}
                min={dynamicMinFee}
                step="0.001"
                className="h-9"
              />
              {entryFeeUsd && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {entryFeeUsd}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("createRoom.min")}: {dynamicMinFee.toFixed(4)} SOL (~${MIN_FEE_USD.toFixed(2)})
            </p>
          </div>

          {/* Turn Time */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("createRoom.timePerTurn")}</Label>
            <Select value={turnTime} onValueChange={setTurnTime}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">{t("createRoom.seconds", { count: 5 })}</SelectItem>
                <SelectItem value="10">{t("createRoom.seconds", { count: 10 })}</SelectItem>
                <SelectItem value="15">{t("createRoom.seconds", { count: 15 })}</SelectItem>
                <SelectItem value="0">{t("createRoom.unlimited")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Private Room Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">{t("createRoom.privateRoom")}</Label>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          {/* Prize Info */}
          <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground">{t("createRoom.prizePool")}:</span>
              <span className="font-semibold text-primary">
                {(entryFeeNum * parseInt(maxPlayers)).toFixed(3)} SOL
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("createRoom.platformFee")}:</span>
              <span>5%</span>
            </div>
          </div>

          {/* Create Button */}
          <Button 
            onClick={handleCreateRoom}
            disabled={txPending || !!activeRoom || checkingActiveRoom}
            className="w-full"
            size="sm"
          >
            {txPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("createRoom.creatingRoom")}
              </>
            ) : checkingActiveRoom ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t("createRoom.checking")}
              </>
            ) : activeRoom ? (
              t("createRoom.cancelActiveFirst")
            ) : (
              t("createRoom.createRoom")
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            {t("createRoom.connected")}: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
          
          {/* RPC Status - Always Visible */}
          <div className="p-2.5 bg-muted/30 rounded-lg text-xs space-y-1.5 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">RPC Status</span>
              <span className={networkInfo.isMainnet ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                {networkInfo.loading ? "..." : networkInfo.isMainnet ? "MAINNET" : "NOT MAINNET"}
              </span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground truncate" title={networkInfo.rpcEndpoint}>
              {networkInfo.rpcEndpoint}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground truncate" title={networkInfo.genesisHash || ""}>
              Genesis: {networkInfo.loading ? "..." : networkInfo.genesisHash?.slice(0, 16) || "Unknown"}...
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
