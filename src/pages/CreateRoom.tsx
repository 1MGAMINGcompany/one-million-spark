import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicKey } from "@solana/web3.js";
import { useWallet as useWalletAdapter } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWallet } from "@/hooks/useWallet";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useSolPrice } from "@/hooks/useSolPrice";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useSolanaNetwork } from "@/hooks/useSolanaNetwork";
import { Wallet, Loader2, AlertCircle, RefreshCw, RefreshCcw, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GameType, RoomStatus, isOpenStatus, type RoomDisplay } from "@/lib/solana-program";
import { ConnectWalletGate } from "@/components/ConnectWalletGate";
import { TxDebugPanel } from "@/components/TxDebugPanel";
import { MobileWalletRedirect } from "@/components/MobileWalletRedirect";
import { PreviewDomainBanner, useSigningDisabled } from "@/components/PreviewDomainBanner";
import { getRoomPda, isMobileDevice, hasInjectedSolanaWallet, isBlockingRoom } from "@/lib/solana-utils";
import { ActiveGameBanner } from "@/components/ActiveGameBanner";
import { UnresolvedRoomModal } from "@/components/UnresolvedRoomModal";
import { requestNotificationPermission } from "@/lib/pushNotifications";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
import { parseRematchParams, lamportsToSol, RematchPayload, solToLamports } from "@/lib/rematchPayload";
import { supabase } from "@/integrations/supabase/client";

// Game type mapping from string to number
const GAME_TYPE_MAP: Record<string, string> = {
  chess: "1",
  dominos: "2",
  backgammon: "3",
  checkers: "4",
  ludo: "5",
};

// Target minimum fee in USD
const MIN_FEE_USD = 0.50;
// Fallback minimum if price unavailable
const FALLBACK_MIN_SOL = 0.004;

export default function CreateRoom() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { signMessage } = useWalletAdapter(); // For signing settings message
  const { toast } = useToast();
  const { play } = useSound();
  const { price, formatUsd, loading: priceLoading, refetch: refetchPrice } = useSolPrice();
  const { createRoom, txPending, activeRoom, blockingRoom: hookBlockingRoom, cancelRoom, fetchRooms, txDebugInfo, clearTxDebug, fetchUserActiveRoom } = useSolanaRooms();
  const { 
    balanceInfo, 
    fetchBalance, 
    networkInfo, 
    checkNetworkMismatch 
  } = useSolanaNetwork();

  // Parse rematch params from URL
  const rematchData = parseRematchParams(searchParams);
  const isRematch = !!rematchData;

  const [gameType, setGameType] = useState<string>("1"); // Chess
  const [entryFee, setEntryFee] = useState<string>("0"); // Default to 0 for casual
  const [maxPlayers, setMaxPlayers] = useState<string>("2");
  const [turnTime, setTurnTime] = useState<string>("10");
  const [gameMode, setGameMode] = useState<'casual' | 'ranked'>('casual');
  const [checkingActiveRoom, setCheckingActiveRoom] = useState(true);
  const [refreshingBalance, setRefreshingBalance] = useState(false);
  const [showMobileWalletRedirect, setShowMobileWalletRedirect] = useState(false);
  const [showUnresolvedModal, setShowUnresolvedModal] = useState(false);
  const [modalBlockingRoom, setModalBlockingRoom] = useState<RoomDisplay | null>(null);
  
  // Track previous status and navigation state
  const prevStatusRef = useRef<number | null>(null);
  const hasNavigatedRef = useRef(false);
  const rematchAppliedRef = useRef(false);
  
  // Pre-fill form from rematch params (once)
  useEffect(() => {
    if (rematchData && !rematchAppliedRef.current) {
      rematchAppliedRef.current = true;
      
      // Set game type from rematch
      const mappedGameType = GAME_TYPE_MAP[rematchData.gameType.toLowerCase()] || "1";
      setGameType(mappedGameType);
      
      // Set stake from rematch (convert lamports to SOL)
      const stakeSol = lamportsToSol(rematchData.stakeLamports);
      setEntryFee(stakeSol.toString());
      
      // Set max players
      setMaxPlayers(rematchData.maxPlayers.toString());
    }
  }, [rematchData]);

  // Check if signing is disabled (preview domain)
  const signingDisabled = useSigningDisabled();
  
  // Check if we need to redirect to wallet app
  const needsMobileWalletRedirect = isMobileDevice() && !hasInjectedSolanaWallet();
  
  // Use balance from network hook (null means not fetched, not 0)
  const balance = balanceInfo.sol ?? 0;
  
  // Dynamic minimum fee based on current SOL price (~$0.50 USD)
  const dynamicMinFee = price ? Math.ceil((MIN_FEE_USD / price) * 10000) / 10000 : FALLBACK_MIN_SOL;
  
  const entryFeeNum = parseFloat(entryFee) || 0;
  const entryFeeUsd = formatUsd(entryFee);

  // CRITICAL: Force refresh active rooms on mount to clear stale state after settlement/forfeit
  // This ensures we don't block on rooms that have been closed on-chain
  useEffect(() => {
    if (!isConnected) {
      setCheckingActiveRoom(false);
      return;
    }
    
    // Force a fresh fetch from on-chain when CreateRoom mounts
    console.log("[CreateRoom] Mount: forcing active room refresh");
    fetchUserActiveRoom().then(() => {
      setCheckingActiveRoom(false);
      hasNavigatedRef.current = false;
    });
  }, [isConnected, fetchUserActiveRoom]);

  // Detect status change: Created -> Started and redirect
  useEffect(() => {
    if (!activeRoom || !address) {
      prevStatusRef.current = null;
      return;
    }
    
    const prevStatus = prevStatusRef.current;
    const currentStatus = activeRoom.status;
    
    // Detect transition: Open (0 or 1) -> Started (2) means opponent joined
    if (prevStatus !== null && isOpenStatus(prevStatus) && currentStatus === RoomStatus.Started && !hasNavigatedRef.current) {
      console.log("[CreateRoom] Opponent joined! Triggering notifications and redirect");
      hasNavigatedRef.current = true;
      
      // Play attention-grabbing sound
      AudioManager.playPlayerJoined();
      
      // Show browser notification (works even in background)
      showBrowserNotification(
        "🎮 Opponent Joined!",
        `Your ${activeRoom.gameTypeName} match is ready. Enter now!`,
        { requireInteraction: true }
      );
      
      toast({
        title: `🎮 ${t("gameBanner.opponentJoined")}`,
        description: `${activeRoom.gameTypeName} - ${t("gameBanner.enterGame")}!`,
      });
      
      // Navigate to room using PDA from activeRoom (the ONLY unique identifier)
      console.log("[CreateRoom] Navigating to room via PDA:", activeRoom.pda);
      navigate(`/room/${activeRoom.pda}`);
    }
    
    prevStatusRef.current = currentStatus;
  }, [activeRoom, address, toast, navigate]);
  
  // Manual balance refresh
  const handleRefreshBalance = useCallback(async () => {
    setRefreshingBalance(true);
    await fetchBalance();
    setRefreshingBalance(false);
  }, [fetchBalance]);

  // Handler for resolving blocking room
  const handleResolveBlockingRoom = useCallback((roomPda: string) => {
    setShowUnresolvedModal(false);
    navigate(`/room/${roomPda}`);
  }, [navigate]);

  const handleCreateRoom = async () => {
    // Check if we're on a preview domain
    if (signingDisabled) {
      toast({
        title: t("createRoom.signingDisabled"),
        description: t("createRoom.signingDisabledDesc"),
        variant: "destructive",
      });
      return;
    }
    
    // Check if we need mobile wallet redirect
    if (needsMobileWalletRedirect) {
      setShowMobileWalletRedirect(true);
      return;
    }
    
    // Check network first
    const networkError = checkNetworkMismatch();
    if (networkError) {
      toast({
        title: t("createRoom.wrongNetwork"),
        description: networkError,
        variant: "destructive",
      });
      return;
    }
    
    // CRITICAL: Force a fresh active room check before blocking
    // This handles stale state after settlement/forfeit
    console.log("[CreateRoom] Forcing fresh active room check before create...");
    const freshActiveRoom = await fetchUserActiveRoom();
    
    // Re-check blocking after fresh fetch - use isBlockingRoom to filter out closed/finished rooms
    const freshBlockingRoom = freshActiveRoom && isBlockingRoom(freshActiveRoom) ? freshActiveRoom : null;
    
    console.log("[CreateRoom] handleCreateRoom, freshBlockingRoom:", freshBlockingRoom?.pda?.slice(0, 8) || 'none');
    if (freshBlockingRoom) {
      console.log("[CreateRoom] BLOCKED - showing modal");
      setModalBlockingRoom(freshBlockingRoom);
      setShowUnresolvedModal(true);
      return;
    }
    
    // Non-blocking active room (e.g., Open/waiting) - still prevent but allow navigation
    // But only if the room is actually still active (not finished/cancelled)
    // Use numeric comparison to avoid TypeScript narrowing issues
    const statusNum = freshActiveRoom?.status as number;
    if (freshActiveRoom && (statusNum === 0 || statusNum === 1)) {
      toast({
        title: t("createRoom.activeRoomExists"),
        description: t("createRoom.cancelExistingRoom"),
        variant: "destructive",
      });
      return;
    }
    if (gameMode === 'ranked' && entryFeeNum < dynamicMinFee) {
      toast({
        title: t("createRoom.invalidFee"),
        description: t("createRoom.minFeeError", { amount: dynamicMinFee.toFixed(4), usd: MIN_FEE_USD.toFixed(2) }),
        variant: "destructive",
      });
      return;
    }
    // For casual mode, allow 0 or any amount

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
    
    // Pass mode to createRoom - this is the AUTHORITATIVE source of truth
    // Mode is written to DB immediately, not localStorage
    const roomId = await createRoom(
      parseInt(gameType) as GameType,
      entryFeeNum,
      parseInt(maxPlayers),
      gameMode // Pass mode directly to createRoom
    );

    if (roomId && address) {
      // Request notification permission so we can alert when opponent joins
      requestNotificationPermission();
      
      // Navigate using the Room PDA (base58) - NOT the numeric roomId
      try {
        const creatorPubkey = new PublicKey(address);
        const roomPda = getRoomPda(creatorPubkey, roomId);
        const roomPdaStr = roomPda.toBase58();
        
        // STEP 1 FIX: turnTime values are already in SECONDS (5, 10, 15, 0)
        // Do NOT multiply by 60 - UI shows seconds, not minutes
        const turnTimeSeconds = parseInt(turnTime, 10);
        console.log("[TurnTimer] Creating room", { 
          selectedValue: turnTime, 
          turnTimeSeconds, 
          gameMode,
          storedSeconds: gameMode === 'ranked' ? turnTimeSeconds : 0,
        });
        
        // localStorage is NO LONGER authoritative for mode - only a display hint
        localStorage.setItem(`room_settings_${roomPdaStr}`, JSON.stringify({
          turnTimeSeconds: gameMode === 'ranked' ? turnTimeSeconds : 0,
          stakeLamports: solToLamports(entryFeeNum),
        }));
        
        // Persist settings authoritatively in game_sessions via Edge Function
        // With signature verification for production security
        const authoritativeTurnTime = gameMode === 'ranked' ? turnTimeSeconds : 0;
        
        try {
          const timestamp = Date.now();

          // IMPORTANT: Must match edge function message format exactly (newline-separated)
          const message =
            `1MGAMING:SET_SETTINGS\n` +
            `roomPda=${roomPdaStr}\n` +
            `turnTimeSeconds=${authoritativeTurnTime}\n` +
            `mode=${gameMode}\n` +
            `ts=${timestamp}`;

          // Convert Uint8Array -> base64
          const toBase64 = (bytes: Uint8Array) =>
            btoa(String.fromCharCode(...Array.from(bytes)));

          let signature: string | undefined;

          if (!signMessage) {
            toast({
              title: "Settings Error",
              description: "Wallet does not support message signing. Turn timer may default to 60s.",
              variant: "destructive",
            });
          } else {
            const msgBytes = new TextEncoder().encode(message);
            const sigBytes = await signMessage(msgBytes);
            signature = toBase64(sigBytes);
          }

          const { data, error: settingsErr } = await supabase.functions.invoke(
            "game-session-set-settings",
            {
              body: {
                roomPda: roomPdaStr,
                turnTimeSeconds: authoritativeTurnTime,
                mode: gameMode,
                creatorWallet: address,
                timestamp,
                signature,
                message, // optional debugging field
              },
            }
          );

          if (settingsErr) {
            console.error("[TurnTimer] Failed to persist session settings:", settingsErr);
            toast({
              title: "Settings Error",
              description: "Failed to save game settings. Turn timer may default to 60s.",
              variant: "destructive",
            });
          } else if (data?.ok === false) {
            console.error("[TurnTimer] Edge function rejected:", data?.error);
            toast({
              title: "Settings Error",
              description: `Failed to save settings: ${data?.error ?? "Unknown error"}`,
              variant: "destructive",
            });
          } else {
            console.log("[TurnTimer] ✅ Persisted session settings:", {
              roomPda: roomPdaStr.slice(0, 8),
              authoritativeTurnTime,
              mode: gameMode,
            });
          }
        } catch (e) {
          console.error("[TurnTimer] Unexpected error persisting session settings:", e);
          toast({
            title: "Settings Error",
            description: "Unexpected error saving settings. Turn timer may default to 60s.",
            variant: "destructive",
          });
        }
        
        // Add rematch_created flag if this was a rematch
        const queryParam = isRematch ? '?rematch_created=1' : '';
        navigate(`/room/${roomPdaStr}${queryParam}`);
      } catch (e) {
        console.error("[CreateRoom] Failed to compute room PDA:", e);
        // Fallback to room list if PDA computation fails
        navigate("/room-list");
      }
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
              {isRematch ? t("createRoom.rematchGame") : t("createRoom.title")}
            </CardTitle>
            {isRematch && (
              <RefreshCcw className="h-5 w-5 text-primary" />
            )}
          </div>
          
          {/* Rematch Context Banner */}
          {isRematch && rematchData && (
            <div className="mt-3 p-3 bg-primary/10 border border-primary/30 rounded-lg">
              <div className="flex items-center gap-2 text-primary font-medium text-sm">
                <RefreshCcw className="h-4 w-4" />
                <span>{t("createRoom.rematchGame")}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {t("createRoom.rematchDesc")}
              </p>
              <div className="flex flex-wrap gap-2 mt-2 text-xs">
                <span className="px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
                  {t("createRoom.rematchMode")}: <span className="text-foreground font-medium capitalize">{rematchData.mode}</span>
                </span>
                <span className="px-2 py-0.5 bg-muted/50 rounded text-muted-foreground">
                  {t("createRoom.rematchFrom")}: <span className="text-foreground font-mono text-[10px]">{rematchData.originRoomId.slice(0, 8)}...</span>
                </span>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4 px-4 pb-5">
          {/* Active Game Banner - shows when room is started (opponent joined) */}
          {activeRoom && activeRoom.status === RoomStatus.Started && (
            <ActiveGameBanner room={activeRoom} />
          )}

          {/* Active Room Warning - only for waiting rooms */}
          {activeRoom && isOpenStatus(activeRoom.status) && (
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-sm flex-1">
                <p className="text-amber-200 font-medium">{t("createRoom.activeRoomExists")}</p>
                <p className="text-amber-200/70">{t("createRoom.cancelExistingRoom")}</p>
                <div className="flex gap-2 mt-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      // Navigate using the pda (the ONLY unique identifier)
                      navigate(`/room/${activeRoom.pda}`);
                    }}
                  >
                    {t("createRoom.goToRoom")} →
                  </Button>
                  {/* Cancel Room button disabled - not in current on-chain program */}
                </div>
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
                <p className="font-medium">{t("createRoom.balanceError")}</p>
                <p className="text-xs opacity-80">{balanceInfo.error}</p>
              </div>
            </div>
          )}
          
          {/* Network Warning */}
          {!networkInfo.loading && !networkInfo.isMainnet && networkInfo.cluster !== "unknown" && (
            <div className="flex items-start gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-500 mt-0.5 shrink-0" />
              <div className="text-sm text-yellow-400">
                <p className="font-medium">{t("createRoom.wrongNetwork")}</p>
                <p className="text-xs opacity-80">
                  {t("createRoom.wrongNetworkDesc", { cluster: networkInfo.cluster })}
                </p>
              </div>
            </div>
          )}


          {/* Game Type */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("createRoom.gameType")}</Label>
              {isRematch && (
                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t("createRoom.prefilledFromRematch")}</span>
              )}
            </div>
            <Select value={gameType} onValueChange={setGameType}>
              <SelectTrigger className={`h-9 ${isRematch ? 'border-primary/50' : ''}`}>
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

          {/* Entry Fee - Styled based on mode */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm">{t("createRoom.entryFeeSol")}</Label>
              {isRematch && (
                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">{t("createRoom.prefilledFromRematch")}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={entryFee}
                onChange={(e) => setEntryFee(e.target.value)}
                placeholder={gameMode === 'ranked' ? dynamicMinFee.toFixed(4) : "0"}
                min={gameMode === 'ranked' ? dynamicMinFee : 0}
                step="0.001"
                className={`h-9 ${isRematch ? 'border-primary/50' : ''} ${
                  gameMode === 'casual' 
                    ? 'border-muted/50 bg-muted/20 text-muted-foreground focus:border-muted' 
                    : 'border-primary/50 bg-primary/5 text-foreground focus:border-primary'
                }`}
              />
              {entryFeeUsd && parseFloat(entryFee) > 0 && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {entryFeeUsd}
                </span>
              )}
            </div>
            <p className={`text-xs ${gameMode === 'casual' ? 'text-muted-foreground' : 'text-primary/80'}`}>
              {gameMode === 'casual' 
                ? t("createRoom.stakeOptional")
                : `${t("createRoom.stakeMinRequired")} (${dynamicMinFee.toFixed(4)} SOL ≈ $${MIN_FEE_USD.toFixed(2)})`
              }
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

          {/* Game Mode Toggle (Casual vs Ranked) */}
          <div className="space-y-1.5">
            <Label className="text-sm">{t("createRoom.roomType") || "Game Mode"}</Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={gameMode === 'casual' ? 'default' : 'outline'}
                size="sm"
                className={`h-10 ${gameMode === 'casual' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}`}
                onClick={() => {
                  setGameMode('casual');
                  // Default stake to 0 for casual
                  if (!isRematch) setEntryFee("0");
                }}
              >
                <span className="mr-1.5">🟢</span> {t("createRoom.gameModeCasual")} 
                <span className="ml-1 opacity-70 text-xs">🎮</span>
              </Button>
              <Button
                type="button"
                variant={gameMode === 'ranked' ? 'default' : 'outline'}
                size="sm"
                className={`h-10 ${gameMode === 'ranked' ? 'bg-red-600 hover:bg-red-700' : ''}`}
                onClick={() => {
                  setGameMode('ranked');
                  // Set minimum stake for ranked if current is below minimum
                  const currentFee = parseFloat(entryFee) || 0;
                  if (!isRematch && currentFee < dynamicMinFee) {
                    setEntryFee(dynamicMinFee.toFixed(4));
                  }
                }}
              >
                <span className="mr-1.5">🔴</span> {t("createRoom.gameModeRanked")}
                <span className="ml-1 opacity-70 text-xs">🏆</span>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {gameMode === 'ranked' 
                ? t("createRoom.rankedDesc")
                : t("createRoom.casualDesc")}
            </p>
          </div>

          {/* Prize Info with Creator Deposit Tooltip */}
          <div className="p-2.5 bg-primary/10 border border-primary/20 rounded-lg text-sm">
            <div className="flex justify-between mb-1">
              <span className="text-muted-foreground flex items-center gap-1">
                {t("createRoom.prizePool")}:
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-semibold">{t("creatorDeposit.title", "Creator Deposit (Refundable)")}</p>
                      <p className="text-xs mt-1">
                        {t("creatorDeposit.desc", "Creating a room requires a small temporary Solana storage deposit. You get this back when the game ends — win, lose, forfeit, or cancel.")}
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </span>
              <span className="font-semibold text-primary">
                {(entryFeeNum * parseInt(maxPlayers)).toFixed(3)} SOL
              </span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("createRoom.platformFee")}:</span>
              <span>5%</span>
            </div>
          </div>

          {/* Rent Fee Information */}
          <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-sm">
            <div className="flex items-center gap-2 mb-1">
              <Info className="h-4 w-4 text-amber-400" />
              <span className="font-medium text-amber-300">{t("createRoom.rentDeposit", "Rent Deposit (Refundable)")}</span>
            </div>
            <p className="text-xs text-amber-200/80">
              {t("createRoom.rentDepositDesc", "Creating a room requires a ~0.002 SOL temporary storage deposit. This rent is always returned to you when the game ends — whether you win, lose, forfeit, or cancel.")}
            </p>
          </div>

          {/* Create Button - Different styles for rematch vs normal */}
          {isRematch ? (
            <Button 
              onClick={handleCreateRoom}
              disabled={txPending || !!activeRoom || checkingActiveRoom || signingDisabled}
              className="w-full gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-6"
              size="lg"
            >
              {txPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("createRoom.creatingRematchRoom")}
                </>
              ) : checkingActiveRoom ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("createRoom.checking")}
                </>
              ) : signingDisabled ? (
                t("createRoom.signingDisabled")
              ) : activeRoom ? (
                t("createRoom.cancelActiveFirst")
              ) : (
                <>
                  <RefreshCcw className="h-5 w-5" />
                  {t("createRoom.createRematchRoom")}
                </>
              )}
            </Button>
          ) : (
            <Button 
              onClick={handleCreateRoom}
              disabled={txPending || !!activeRoom || checkingActiveRoom || signingDisabled}
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
              ) : signingDisabled ? (
                t("createRoom.signingDisabled")
              ) : activeRoom ? (
                t("createRoom.cancelActiveFirst")
              ) : (
                t("createRoom.createRoom")
              )}
            </Button>
          )}

          <p className="text-xs text-center text-muted-foreground">
            {t("createRoom.connected")}: {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
          
          {/* RPC Status - Always Visible */}
          <div className="p-2.5 bg-muted/30 rounded-lg text-xs space-y-1.5 border border-border/30">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("createRoom.rpcStatus")}</span>
              <span className={networkInfo.isMainnet ? "text-green-400 font-medium" : "text-red-400 font-medium"}>
                {networkInfo.loading ? "..." : networkInfo.isMainnet ? "MAINNET" : "NOT MAINNET"}
              </span>
            </div>
            <div className="font-mono text-[10px] text-muted-foreground truncate" title={networkInfo.rpcEndpoint}>
              {networkInfo.rpcEndpoint}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground truncate" title={networkInfo.genesisHash || ""}>
              {t("createRoom.genesis")}: {networkInfo.loading ? "..." : networkInfo.genesisHash?.slice(0, 16) || "Unknown"}...
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Preview Domain Banner */}
      <PreviewDomainBanner />
      
      {/* Mobile Wallet Redirect Modal */}
      <MobileWalletRedirect 
        isOpen={showMobileWalletRedirect}
        onClose={() => setShowMobileWalletRedirect(false)}
      />
      
      {/* Transaction Debug Panel - shown on tx failure */}
      <TxDebugPanel debugInfo={txDebugInfo} onClose={clearTxDebug} />
      
      {/* Unresolved Room Modal - shows when trying to create with a blocking room */}
      <UnresolvedRoomModal
        open={showUnresolvedModal}
        onClose={() => setShowUnresolvedModal(false)}
        room={modalBlockingRoom}
        onResolve={handleResolveBlockingRoom}
      />
    </div>
  );
}
