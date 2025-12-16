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
import { useGaslessCreateRoom, GASLESS_ENABLED } from "@/hooks/useGaslessCreateRoom";
import { useUsdtPreflight } from "@/hooks/useUsdtPreflight";
import { useApproveUsdtV7, usdtToUnitsV7 } from "@/hooks/useApproveUsdtV7";
import { usePlayerActiveRoom } from "@/hooks/usePlayerActiveRoom";
import { Loader2, AlertCircle, Wallet, CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { ShareInviteDialog } from "@/components/ShareInviteDialog";
import { useNotificationPermission } from "@/hooks/useRoomEvents";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";
import { DepositConfirmModal } from "@/components/DepositConfirmModal";
import { logTxError, isUserRejectionError } from "@/lib/txErrorLogger";
import { useSmartAccount } from "@/components/ThirdwebSmartProvider";
import { useSmartCreateRoom } from "@/hooks/useSmartAccountTransactions";

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
  const navigate = useNavigate();
  const { isConnected, address, connectMetaMask, connectWalletConnect } = useSmartAccount();
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
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [approveMode, setApproveMode] = useState<'exact' | 'max'>('exact');
  
  const { requestPermission } = useNotificationPermission();

  // Check if player already has an active room
  const { activeRoom, hasActiveRoom, isLoading: isCheckingActiveRoom } = usePlayerActiveRoom(address as `0x${string}` | undefined);

  const { createRoomGasless, isBusy } = useSmartCreateRoom();

  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUnits = usdtToUnitsV7(entryFeeNum);

  // USDT Preflight - reads allowance and balance
  const {
    allowanceRaw,
    balanceRaw,
    allowanceUsdt,
    balanceUsdt,
    hasSufficientAllowance,
    hasSufficientBalance,
    isLoading: isPreflightLoading,
    runPreflight,
    refetchAllowance,
    spenderAddress,
  } = useUsdtPreflight(address as `0x${string}` | undefined, entryFeeUnits);

  const { 
    approve: approveUsdt, 
    approveMax: approveUsdtMax,
    isPending: isApprovePending, 
    isConfirming: isApproveConfirming, 
    isSuccess: isApproveSuccess,
    error: approveError,
    reset: resetApprove 
  } = useApproveUsdtV7();

  const [isCreateSuccess, setIsCreateSuccess] = useState(false);
  const [createError, setCreateError] = useState<Error | null>(null);
  const [latestRoomId, setLatestRoomId] = useState<bigint | null>(null);

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

  // Internal function to create room (no validation, called after approval or when allowance sufficient)
  const handleCreateRoomInternal = async () => {
    play('ui_click');
    
    const maxPlayers = parseInt(players);
    const isPrivate = roomType === "private";
    const gameId = GAME_IDS[gameType] || 1;
    const turnTime = parseInt(turnTimeSec);
    
    try {
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

  // Auto-create room after approval succeeds
  useEffect(() => {
    if (isApproveSuccess) {
      play('ui_click');
      toast({
        title: t("createRoom.usdtApproved"),
        description: "Creating room...",
      });
      resetApprove();
      refetchAllowance();
      // Immediately trigger room creation after approval
      handleCreateRoomInternal();
    }
  }, [isApproveSuccess]);

  useEffect(() => {
    if (approveError) {
      const { title, description } = logTxError('APPROVE_USDT', approveError);
      const isRejection = isUserRejectionError(approveError);
      
      toast({
        title: isRejection 
          ? t("createRoom.approvalCancelled", title)
          : t("createRoom.approvalFailed"),
        description: isRejection 
          ? t("createRoom.approvalCancelledDesc", description)
          : description,
        variant: isRejection ? "default" : "destructive",
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
      const { title, description } = logTxError('CREATE_ROOM', createError);
      const isRejection = isUserRejectionError(createError);
      const errorMsg = (createError as any)?.message || '';
      const isRevert = errorMsg.toLowerCase().includes('revert') || 
                       errorMsg.toLowerCase().includes('execution reverted');
      
      toast({
        title: isRejection 
          ? t("createRoom.approvalCancelled", title) 
          : isRevert 
            ? "Create Room failed (revert)" 
            : t("createRoom.transactionFailed"),
        description: isRevert 
          ? "Check network + room settings. See console for debug info."
          : description,
        variant: isRejection ? "default" : "destructive",
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

  // Called when user clicks "Continue to Wallet" in modal
  const handleDepositConfirm = async () => {
    const isPolygon = await checkPolygonNetwork();
    if (!isPolygon) return;

    // Run preflight check
    const preflight = await runPreflight();
    
    if (preflight.hasSufficientAllowance) {
      // Allowance sufficient - skip approve, create room immediately
      console.log("Allowance sufficient, skipping approve. Creating room directly.");
      toast({
        title: "Allowance OK",
        description: "Creating room...",
      });
      await handleCreateRoomInternal();
    } else {
      // Need approval first - this will auto-trigger createRoom on success
      play('ui_click');
      if (approveMode === 'max') {
        approveUsdtMax();
      } else {
        approveUsdt(entryFeeNum);
      }
    }
  };

  const handleApproveClick = () => {
    if (!entryFee || entryFeeNum < MIN_ENTRY_FEE_USDT) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.feeError", { amount: MIN_ENTRY_FEE_USDT }),
        variant: "destructive",
      });
      return;
    }
    
    // Show deposit confirmation modal BEFORE any wallet action
    setShowDepositModal(true);
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

    // Run preflight check before creating room
    const preflight = await runPreflight();
    
    if (!preflight.hasSufficientAllowance) {
      toast({
        title: "Approve USDT first",
        description: "Approve USDT first (exact amount).",
        variant: "destructive",
      });
      return;
    }

    if (!preflight.hasSufficientBalance) {
      toast({
        title: "Insufficient balance",
        description: "Insufficient USDT balance.",
        variant: "destructive",
      });
      return;
    }

    await handleCreateRoomInternal();
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
            <div className="space-y-4">
              <div className="space-y-2">
                <Button 
                  type="button" 
                  className="w-full" 
                  size="lg" 
                  onClick={() => connectMetaMask()}
                >
                  <Wallet className="mr-2 h-4 w-4" />
                  {t("createRoom.connectWallet")}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {t("createRoom.connectHelperText", "Connect your wallet to see available games. No funds are moved.")}
                </p>
              </div>
              
              {/* USDT on Polygon info */}
              <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <AlertCircle className="text-primary" size={18} />
                  <span className="font-medium text-primary">{t('walletRequired.feesTitle')}</span>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {t('walletRequired.feesDescription')}
                </p>
              </div>
            </div>
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
              {/* Gasless Status Banner */}
              {GASLESS_ENABLED ? (
                <div className="bg-green-500/10 border border-green-500/30 rounded-md p-3 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                  <div className="text-xs text-green-600 dark:text-green-400">
                    <strong>Gasless enabled ✅</strong> — No POL gas fees. Transactions are sponsored.
                  </div>
                </div>
              ) : (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-md p-3 flex items-start gap-2">
                  <Info className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
                  <div className="text-xs text-yellow-600 dark:text-yellow-400">
                    <strong>Note:</strong> Gasless transactions not enabled yet. MetaMask will show a small POL network fee (~$0.01).
                  </div>
                </div>
              )}

              {/* USDT Preflight Status Display */}
              {address && entryFeeNum > 0 && (
                <div className="bg-muted/50 border border-border rounded-md p-3 space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">USDT Balance:</span>
                    <span className={`font-mono ${hasSufficientBalance ? 'text-green-500' : 'text-destructive'}`}>
                      {balanceUsdt} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Allowance:</span>
                    <span className={`font-mono ${hasSufficientAllowance ? 'text-green-500' : 'text-yellow-500'}`}>
                      {allowanceUsdt} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Required:</span>
                    <span className="font-mono text-foreground">
                      {(entryFeeNum).toFixed(6)} USDT
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1 border-t border-border">
                    <span className="text-muted-foreground">Spender:</span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {spenderAddress.slice(0, 6)}...{spenderAddress.slice(-4)}
                    </span>
                  </div>
                </div>
              )}

              {/* Approval Options - only show when not approved */}
              {address && entryFeeNum > 0 && !hasSufficientAllowance && (
                <div className="bg-muted/30 border border-border rounded-md p-3 space-y-2">
                  <p className="text-xs text-muted-foreground">Choose approval type:</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setApproveMode('exact')}
                      className={`flex-1 text-xs py-2 px-3 rounded-md border transition-colors ${
                        approveMode === 'exact' 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      Exact ({entryFeeNum.toFixed(2)} USDT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setApproveMode('max')}
                      className={`flex-1 text-xs py-2 px-3 rounded-md border transition-colors ${
                        approveMode === 'max' 
                          ? 'bg-primary text-primary-foreground border-primary' 
                          : 'bg-muted/50 text-muted-foreground border-border hover:bg-muted'
                      }`}
                    >
                      Unlimited ⚡
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {approveMode === 'max' 
                      ? "Unlimited approval = no future approvals needed (recommended)" 
                      : "Exact approval = more secure, approve again for higher fees"}
                  </p>
                </div>
              )}

              {/* Approval Status Indicator */}
              {address && entryFeeNum > 0 && (
                <div className={`flex items-center gap-2 p-2 rounded-md ${
                  hasSufficientAllowance && entryFeeNum > 0
                    ? 'bg-green-500/10 border border-green-500/30' 
                    : 'bg-yellow-500/10 border border-yellow-500/30'
                }`}>
                  {hasSufficientAllowance && entryFeeNum > 0 ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span className="text-sm text-green-500">USDT Approved ✅</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-yellow-500" />
                      <span className="text-sm text-yellow-500">Not Approved</span>
                    </>
                  )}
                </div>
              )}

              {/* Step 1: Approve USDT */}
              <Button 
                type="button" 
                className="w-full" 
                size="lg"
                variant={hasSufficientAllowance && entryFeeNum > 0 ? "outline" : "default"}
                onClick={handleApproveClick}
                disabled={isApproveLoading || isCreateLoading || !entryFee || !!feeError || (hasSufficientAllowance && entryFeeNum > 0) || isCheckingActiveRoom}
              >
                {isApproveLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {getApproveButtonText()}
                  </>
                ) : hasSufficientAllowance && entryFeeNum > 0 ? (
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
                disabled={isCreateLoading || isApproveLoading || !entryFee || !!feeError || !(hasSufficientAllowance && entryFeeNum > 0) || isCheckingActiveRoom}
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

      <DepositConfirmModal
        open={showDepositModal}
        onOpenChange={setShowDepositModal}
        stakeAmount={entryFeeNum}
        onConfirm={handleDepositConfirm}
      />
    </div>
  );
};

export default CreateRoom;
