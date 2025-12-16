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
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useGaslessCreateRoom } from "@/hooks/useGaslessCreateRoom";
import { useUsdtAllowanceV7 } from "@/hooks/useUsdtAllowanceV7";
import { useApproveUsdtV7, usdtToUnitsV7 } from "@/hooks/useApproveUsdtV7";
import { usePlayerActiveRoom } from "@/hooks/usePlayerActiveRoom";
import { Loader2, AlertCircle, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { ShareInviteDialog } from "@/components/ShareInviteDialog";
import { useNotificationPermission } from "@/hooks/useRoomEvents";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";

// Game ID mapping: Chess=1, Dominos=2, Backgammon=3, Checkers=4, Ludo=5
const GAME_IDS: Record<string, number> = {
  chess: 1,
  dominos: 2,
  backgammon: 3,
  checkers: 4,
  ludo: 5,
};

// Platform fee in basis points (500 = 5%)
const PLATFORM_FEE_BPS = 500;

// Minimum entry fee in USDT
const MIN_ENTRY_FEE_USDT = 0.5;

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
  const { open: openWalletModal } = useWeb3Modal();
  const navigate = useNavigate();
  const { isConnected, address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
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
  const [approvalStep, setApprovalStep] = useState<'idle' | 'approved'>('idle');
  
  const { requestPermission } = useNotificationPermission();

  // Check if player already has an active room
  const { activeRoom, hasActiveRoom, isLoading: isCheckingActiveRoom } = usePlayerActiveRoom(address as `0x${string}` | undefined);

  const { createRoomGasless, isBusy } = useGaslessCreateRoom();

  const { 
    approve: approveUsdt, 
    isPending: isApprovePending, 
    isConfirming: isApproveConfirming, 
    isSuccess: isApproveSuccess,
    error: approveError,
    reset: resetApprove 
  } = useApproveUsdtV7();

  const { data: currentAllowance, refetch: refetchAllowance } = useUsdtAllowanceV7(address as `0x${string}` | undefined);

  const [isCreateSuccess, setIsCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  const [latestRoomId, setLatestRoomId] = useState<bigint | null>(null);

  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUnits = usdtToUnitsV7(entryFeeNum);

  const hasSufficientAllowance = currentAllowance !== undefined && currentAllowance >= entryFeeUnits && entryFeeNum > 0;

  useEffect(() => {
    if (!entryFee) {
      setFeeError(null);
      return;
    }
    if (isNaN(entryFeeNum) || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      setFeeError(t("createRoom.feeError", { amount: MIN_ENTRY_FEE_USDT }));
    } else {
      setFeeError(null);
    }
  }, [entryFee, entryFeeNum, t]);

  useEffect(() => {
    if (isApproveSuccess) {
      play('ui_click');
      toast({
        title: t("createRoom.usdtApproved"),
        description: t("createRoom.roomCreatedDesc"),
      });
      setApprovalStep('approved');
      resetApprove();
      refetchAllowance();
    }
  }, [isApproveSuccess, play, toast, resetApprove, refetchAllowance, t]);

  useEffect(() => {
    if (approveError) {
      toast({
        title: t("createRoom.approvalFailed"),
        description: approveError.message || t("createRoom.approvalFailed"),
        variant: "destructive",
      });
      resetApprove();
    }
  }, [approveError, toast, resetApprove, t]);

  useEffect(() => {
    if (isCreateSuccess && latestRoomId && latestRoomId > 0n) {
      play('room_create');
      const isPrivate = roomType === "private";
      const gameName = getGameName(GAME_IDS[gameType] || 1);
      
      requestPermission();
      
      const roomId = latestRoomId.toString();
      
      if (isPrivate) {
        setCreatedRoomId(roomId);
        setCreatedGameName(gameName);
        setShowShareDialog(true);
        toast({
          title: t("createRoom.privateRoomCreated"),
          description: t("createRoom.privateRoomCreatedDesc"),
        });
      } else {
        toast({
          title: t("createRoom.roomCreated"),
          description: t("createRoom.roomCreatedDesc"),
        });
        setTimeout(() => {
          navigate("/room-list?refresh=1");
        }, 1500);
      }
      
      setEntryFee("");
      setPlayers("2");
      setTurnTimeSec("10");
      setApprovalStep('idle');
      setIsCreateSuccess(false);
      setLatestRoomId(null);
    }
  }, [isCreateSuccess, latestRoomId, play, toast, navigate, roomType, gameType, requestPermission, t]);

  useEffect(() => {
    if (createError) {
      toast({
        title: t("createRoom.transactionFailed"),
        description: createError.message || t("createRoom.transactionFailed"),
        variant: "destructive",
      });
      setCreateError(null);
    }
  }, [createError, toast, t]);

  // Network guard: check if on Polygon mainnet (0x89)
  const checkPolygonNetwork = async (): Promise<boolean> => {
    const eth = (window as any).ethereum;
    if (!eth) return false;
    try {
      const chainId = await eth.request({ method: 'eth_chainId' });
      if (chainId !== '0x89') {
        toast({
          title: "Wrong network",
          description: "Switch to Polygon Mainnet",
          variant: "destructive",
        });
        return false;
      }
      return true;
    } catch {
      return false;
    }
  };

  const handleApproveUsdt = async () => {
    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.feeError", { amount: MIN_ENTRY_FEE_USDT }),
        variant: "destructive",
      });
      return;
    }
    
    const isPolygon = await checkPolygonNetwork();
    if (!isPolygon) return;
    
    play('ui_click');
    approveUsdt(entryFeeNum);
  };

  const handleCreateRoom = async () => {
    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.feeError", { amount: MIN_ENTRY_FEE_USDT }),
        variant: "destructive",
      });
      return;
    }

    const isPolygon = await checkPolygonNetwork();
    if (!isPolygon) return;

    play('ui_click');
    
    const maxPlayers = parseInt(players);
    const isPrivate = roomType === "private";
    const gameId = GAME_IDS[gameType] || 1;
    const turnTime = parseInt(turnTimeSec);
    
    try {
      // Gasless transaction: user signs, relayer pays gas (ERC-2771)
      const { roomId } = await createRoomGasless(
        entryFeeUnits,
        maxPlayers,
        isPrivate,
        PLATFORM_FEE_BPS,
        gameId,
        turnTime
      );
      setLatestRoomId(roomId);
      setIsCreateSuccess(true);
    } catch (err) {
      setCreateError(err instanceof Error ? err : new Error(String(err)));
    }
  };

  const isApproveLoading = isApprovePending || isApproveConfirming;
  const isCreateLoading = isBusy;

  const getApproveButtonText = () => {
    if (isApprovePending) return t("createRoom.confirmInWallet");
    if (isApproveConfirming) return t("createRoom.approving");
    return t("createRoom.approveUsdt");
  };

  const getCreateButtonText = () => {
    if (isBusy) return t("createRoom.creatingRoom");
    return t("createRoom.step2Create");
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
            <Select value={gameType} onValueChange={setGameType} disabled={isApproveLoading || isCreateLoading}>
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

          {/* Entry Fee (USDT) */}
          <div className="space-y-2">
            <Label htmlFor="entryFee">{t("createRoom.entryFee")}</Label>
            <div className="flex-1 space-y-1">
              <Input
                id="entryFee"
                type="number"
                placeholder="0.50"
                min={MIN_ENTRY_FEE_USDT}
                step="0.1"
                value={entryFee}
                onChange={(e) => {
                  setEntryFee(e.target.value);
                  if (approvalStep === 'approved') {
                    setApprovalStep('idle');
                  }
                }}
                disabled={isApproveLoading || isCreateLoading}
                className={feeError ? "border-destructive" : ""}
              />
              {feeError && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {feeError}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {t("createRoom.minimumFee")}
              </p>
            </div>
          </div>

          {/* Number of Players */}
          <div className="space-y-2">
            <Label htmlFor="players">{t("createRoom.numPlayers")}</Label>
            <Select value={players} onValueChange={setPlayers} disabled={isApproveLoading || isCreateLoading}>
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
            <Select value={turnTimeSec} onValueChange={setTurnTimeSec} disabled={isApproveLoading || isCreateLoading}>
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
              disabled={isApproveLoading || isCreateLoading}
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
            <Button 
              type="button" 
              className="w-full" 
              size="lg" 
              onClick={() => openWalletModal()}
            >
              <Wallet className="mr-2 h-4 w-4" />
              {t("createRoom.connectWallet")}
            </Button>
          )}

          {/* Active Room Warning */}
          {isConnected && hasActiveRoom && activeRoom && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 space-y-3">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">
                    {t("createRoom.activeRoomWarning", { roomId: activeRoom.id.toString() })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("createRoom.activeRoomWarningDesc")}
                  </p>
                </div>
              </div>
              <Button 
                type="button"
                variant="outline" 
                className="w-full"
                onClick={() => navigate(`/room/${activeRoom.id.toString()}`)}
              >
                {t("createRoom.goToRoom")}
              </Button>
            </div>
          )}

          {/* Two-Step Process: Approve USDT → Create Room */}
          {isConnected && !hasActiveRoom && (
            <div className="space-y-3">
              {/* Step 1: Approve USDT */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                variant={hasSufficientAllowance ? "outline" : "default"}
                onClick={handleApproveUsdt}
                disabled={isApproveLoading || isCreateLoading || !entryFee || !!feeError || hasSufficientAllowance || isCheckingActiveRoom}
              >
                {isApproveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {getApproveButtonText()}
                  </>
                ) : hasSufficientAllowance ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                    {t("createRoom.usdtApproved")}
                  </>
                ) : (
                  t("createRoom.step1Approve")
                )}
              </Button>

              {/* Step 2: Create Room */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                onClick={handleCreateRoom}
                disabled={isCreateLoading || isApproveLoading || !entryFee || !!feeError || !hasSufficientAllowance || isCheckingActiveRoom}
              >
                {isCreateLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {getCreateButtonText()}
                  </>
                ) : (
                  t("createRoom.step2Create")
                )}
              </Button>

              {/* Instructions */}
              <div className="text-xs text-muted-foreground bg-muted/50 border border-border rounded-md p-3 space-y-1">
                <p><strong>{t("createRoom.step1Approve").split(':')[0]}:</strong> {t("createRoom.instructions1")}</p>
                <p><strong>{t("createRoom.step2Create").split(':')[0]}:</strong> {t("createRoom.instructions2")}</p>
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
