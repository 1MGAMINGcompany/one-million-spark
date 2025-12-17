import { useState, useEffect } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useSolanaWallet } from "@/components/SolanaWalletButton";
import { useSolPrice } from "@/hooks/useSolPrice";
import { MIN_ENTRY_FEE_SOL, PLATFORM_FEE_BPS, solToLamports, lamportsToSol } from "@/lib/solanaConfig";
import { Loader2, AlertCircle, AlertTriangle, Info, Wallet } from "lucide-react";
import { ShareInviteDialog } from "@/components/ShareInviteDialog";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { SolanaWalletButton } from "@/components/SolanaWalletButton";

// Game ID mapping: Chess=1, Dominos=2, Backgammon=3, Checkers=4, Ludo=5
const GAME_IDS: Record<string, number> = {
  chess: 1,
  dominos: 2,
  backgammon: 3,
  checkers: 4,
  ludo: 5,
};

// Helper function to get game name from ID
function getGameName(gameId: number): string {
  const names: Record<number, string> = {
    1: "Chess",
    2: "Dominos",
    3: "Backgammon",
    4: "Checkers",
    5: "Ludo",
  };
  return names[gameId] || "Unknown";
}

const CreateRoom = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isConnected, address, publicKey } = useSolanaWallet();
  const { toast } = useToast();
  const { play } = useSound();
  const { price: solPrice, solToUsd } = useSolPrice();
  useBackgroundMusic(true);
  
  const [gameType, setGameType] = useState("chess");
  const [entryFee, setEntryFee] = useState("");
  const [players, setPlayers] = useState("2");
  const [roomType, setRoomType] = useState("public");
  const [turnTimeSec, setTurnTimeSec] = useState("10");
  const [feeError, setFeeError] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
  const [createdGameName, setCreatedGameName] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeLamports = solToLamports(entryFeeNum);
  const usdValue = solToUsd(entryFeeNum);

  // Validate entry fee
  useEffect(() => {
    if (!entryFee) {
      setFeeError(null);
      return;
    }
    if (isNaN(entryFeeNum) || entryFeeNum < MIN_ENTRY_FEE_SOL) {
      setFeeError(t("createRoom.feeErrorSol", { amount: MIN_ENTRY_FEE_SOL }));
    } else {
      setFeeError(null);
    }
  }, [entryFee, entryFeeNum, t]);

  // Create room handler - will call Solana program instruction
  const handleCreateRoom = async () => {
    if (!isConnected || !publicKey) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your Solana wallet first.",
        variant: "destructive",
      });
      return;
    }

    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_SOL) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.feeErrorSol", { amount: MIN_ENTRY_FEE_SOL }),
        variant: "destructive",
      });
      return;
    }

    play('ui_click');
    setIsCreating(true);

    try {
      // TODO: Call Solana program instruction to create room
      // This will be implemented when the Solana program is deployed
      // For now, show a placeholder message
      
      const maxPlayers = parseInt(players);
      const isPrivate = roomType === "private";
      const gameId = GAME_IDS[gameType] || 1;
      const turnTime = parseInt(turnTimeSec);
      
      console.log("Creating room with params:", {
        entryFeeLamports: entryFeeLamports.toString(),
        maxPlayers,
        isPrivate,
        platformFeeBps: PLATFORM_FEE_BPS,
        gameId,
        turnTimeSec: turnTime,
        creator: publicKey.toBase58(),
      });

      // Placeholder: Show success after simulated delay
      // In production, this will wait for Solana tx confirmation
      toast({
        title: "Room Creation Pending",
        description: "Solana program integration coming soon. Your room parameters have been logged.",
      });
      
      // Reset form
      setEntryFee("");
      setPlayers("2");
      setTurnTimeSec("10");
      
    } catch (err) {
      console.error("Create room error:", err);
      toast({
        title: t("createRoom.transactionFailed"),
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-card border border-border rounded-lg p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground mb-6 text-center">
          {t("createRoom.title")}
        </h1>

        <form className="space-y-5">
          {/* Game Type */}
          <div className="space-y-2">
            <Label htmlFor="gameType">{t("createRoom.gameType")}</Label>
            <Select value={gameType} onValueChange={setGameType} disabled={isCreating}>
              <SelectTrigger id="gameType" className="w-full">
                <SelectValue placeholder={t("createRoom.selectGame")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="chess">{t("games.chess")}</SelectItem>
                <SelectItem value="dominos">{t("games.dominos")}</SelectItem>
                <SelectItem value="backgammon">{t("games.backgammon")}</SelectItem>
                <SelectItem value="checkers">{t("games.checkers")}</SelectItem>
                <SelectItem value="ludo">{t("games.ludo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Entry Fee (SOL) */}
          <div className="space-y-2">
            <Label htmlFor="entryFee">{t("createRoom.entryFeeSol")}</Label>
            <div className="flex-1 space-y-1">
              <Input
                id="entryFee"
                type="number"
                placeholder="0.01"
                min={MIN_ENTRY_FEE_SOL}
                step="0.01"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                disabled={isCreating}
                className={feeError ? "border-destructive" : ""}
              />
              {feeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {feeError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {t("createRoom.minimumFeeSol", { amount: MIN_ENTRY_FEE_SOL })}
              </p>
              {entryFeeNum > 0 && usdValue !== null && (
                <p className="text-sm text-muted-foreground">
                  ≈ ${usdValue.toFixed(2)} USD
                </p>
              )}
            </div>
          </div>

          {/* Number of Players */}
          <div className="space-y-2">
            <Label htmlFor="players">{t("createRoom.numPlayers")}</Label>
            <Select value={players} onValueChange={setPlayers} disabled={isCreating}>
              <SelectTrigger id="players" className="w-full">
                <SelectValue placeholder={t("createRoom.selectPlayers")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2">2 {t("createRoom.players")}</SelectItem>
                <SelectItem value="3">3 {t("createRoom.players")}</SelectItem>
                <SelectItem value="4">4 {t("createRoom.players")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Time per Turn */}
          <div className="space-y-2">
            <Label htmlFor="turnTime">{t("createRoom.timePerTurn")}</Label>
            <Select value={turnTimeSec} onValueChange={setTurnTimeSec} disabled={isCreating}>
              <SelectTrigger id="turnTime" className="w-full">
                <SelectValue placeholder={t("createRoom.selectTime")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5 {t("common.sec")}</SelectItem>
                <SelectItem value="10">10 {t("common.sec")}</SelectItem>
                <SelectItem value="15">15 {t("common.sec")}</SelectItem>
                <SelectItem value="0">{t("createRoom.unlimited")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Room Type */}
          <div className="space-y-3">
            <Label>{t("createRoom.roomType")}</Label>
            <RadioGroup 
              value={roomType} 
              onValueChange={setRoomType} 
              className="flex gap-6"
              disabled={isCreating}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="public" id="public" />
                <Label htmlFor="public" className="font-normal cursor-pointer">
                  {t("createRoom.public")}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="private" id="private" />
                <Label htmlFor="private" className="font-normal cursor-pointer">
                  {t("createRoom.private")}
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Wallet Connection */}
          {!isConnected && (
            <div className="space-y-4">
              <div className="flex flex-col items-center gap-2">
                <SolanaWalletButton />
                <p className="text-xs text-muted-foreground text-center">
                  {t("createRoom.connectHelperTextSol")}
                </p>
              </div>
              
              {/* Solana info */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertCircle className="text-primary" size={18} />
                  <span className="font-medium text-primary">{t('walletRequired.solanaInfo')}</span>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {t('walletRequired.solanaDescription')}
                </p>
              </div>
            </div>
          )}

          {/* Connected State - Create Room */}
          {isConnected && (
            <div className="space-y-3">
              {/* Wallet Info Banner */}
              <div className="bg-muted/50 border border-border rounded-md p-3 space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Wallet:</span>
                  <span className="font-mono text-xs text-foreground">
                    {address?.slice(0, 4)}...{address?.slice(-4)}
                  </span>
                </div>
                {entryFeeNum > 0 && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Entry Fee:</span>
                      <span className="font-mono text-foreground">
                        {entryFeeNum.toFixed(4)} SOL
                      </span>
                    </div>
                    {usdValue !== null && (
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">USD Value:</span>
                        <span className="font-mono text-foreground">
                          ≈ ${usdValue.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Network Info */}
              <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 flex items-center gap-2">
                <Info className="h-4 w-4 text-green-500 shrink-0" />
                <div className="text-xs text-green-600 dark:text-green-400">
                  <strong>Solana Mainnet</strong> — User pays small SOL network fee (~$0.001)
                </div>
              </div>

              {/* Create Room Button */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                onClick={handleCreateRoom}
                disabled={isCreating || !entryFee || !!feeError}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("createRoom.creatingRoom")}
                  </>
                ) : (
                  t("createRoom.createRoomSol")
                )}
              </Button>
              
              {/* Instructions */}
              <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3 space-y-1">
                <p><strong>How it works:</strong> SOL is deposited directly to the game escrow. Winner receives the prize pool minus 5% platform fee.</p>
                <p className="text-[10px] opacity-70">No token approvals needed — just connect and play!</p>
              </div>
            </div>
          )}
        </form>
      </div>
      
      <ShareInviteDialog
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
        roomId={createdRoomId || ""}
        gameName={createdGameName}
      />
    </div>
  );
};

export default CreateRoom;
