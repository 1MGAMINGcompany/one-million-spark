import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Zap, Bot, Search, Loader2, Users, Copy, Check, Wallet, AlertTriangle, Share2, MapPin } from "lucide-react";
import QuickMatchAIGame from "@/components/QuickMatchAIGame";
import { ChessIcon, DominoIcon, BackgammonIcon, CheckersIcon, LudoIcon } from "@/components/GameIcons";
import { PrivyLoginButton } from "@/components/PrivyLoginButton";
import { ConnectWalletGate } from "@/components/ConnectWalletGate";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useRoomRealtimeAlert } from "@/hooks/useRoomRealtimeAlert";
import { useToast } from "@/hooks/use-toast";
import { GameType } from "@/lib/solana-program";
import { getRoomPda } from "@/lib/solana-utils";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
import { requestNotificationPermission } from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";
import { solToLamports } from "@/lib/rematchPayload";
import { LiveActivityIndicator } from "@/components/LiveActivityIndicator";
import { buildInviteLink } from "@/lib/invite";

type Phase = "selecting" | "searching" | "timeout";

const GAME_OPTIONS = [
  { type: GameType.Ludo, key: "ludo" },
  { type: GameType.Dominos, key: "dominos" },
  { type: GameType.Chess, key: "chess" },
  { type: GameType.Backgammon, key: "backgammon" },
  { type: GameType.Checkers, key: "checkers" },
];

const GAME_ICONS: Record<number, React.ReactNode> = {
  [GameType.Chess]: <ChessIcon className="w-10 h-10" />,
  [GameType.Dominos]: <DominoIcon className="w-10 h-10" />,
  [GameType.Backgammon]: <BackgammonIcon className="w-10 h-10" />,
  [GameType.Checkers]: <CheckersIcon className="w-10 h-10" />,
  [GameType.Ludo]: <LudoIcon className="w-10 h-10" />,
};

const STAKE_PRESETS = [
  { label: "free", value: 0 },
  { label: "0.01", value: 0.01 },
  { label: "0.05", value: 0.05 },
  { label: "0.1", value: 0.1 },
];

const LUDO_PLAYER_OPTIONS = [2, 3, 4];
const SEARCH_TIMEOUT_SEC = 300;

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function QuickMatch() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isConnected, address, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const {
    rooms,
    fetchRooms,
    createRoom,
    txPending,
    activeRoom,
    blockingRoom: hookBlockingRoom,
  } = useSolanaRooms();

  const [phase, setPhase] = useState<Phase>("selecting");
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.Ludo);
  const [selectedStake, setSelectedStake] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_TIMEOUT_SEC);
  const [createdRoomPda, setCreatedRoomPda] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [ludoPlayerCount, setLudoPlayerCount] = useState<number>(2);
  const [linkCopied, setLinkCopied] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [showRecoverDialog, setShowRecoverDialog] = useState(false);
  const [recoverPendingTx, setRecoverPendingTx] = useState<string | null>(null);
  const [recoverStakeAmount, setRecoverStakeAmount] = useState<string | null>(null);
  const [isRecovering, setIsRecovering] = useState(false);

  const hasNavigatedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  const [showAIGame, setShowAIGame] = useState(false);

  // Derived values
  const isLudo = selectedGame === GameType.Ludo;
  const effectiveMaxPlayers = isLudo ? ludoPlayerCount : 2;
  const isMultiPlayerLudo = isLudo && ludoPlayerCount > 2;
  const selectedGameKey =
    GAME_OPTIONS.find((g) => g.type === selectedGame)?.key ?? "chess";
  const translatedGameName = t(`games.${selectedGameKey}`);

  // Reset ludoPlayerCount when switching away from Ludo
  useEffect(() => {
    if (!isLudo) setLudoPlayerCount(2);
  }, [isLudo]);

  // ── Countdown timer ──
  useEffect(() => {
    if (phase !== "searching") {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    setSecondsLeft(SEARCH_TIMEOUT_SEC);
    timerRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          setPhase("timeout");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [phase]);

  // ── Realtime alert for opponent joining ──
  useRoomRealtimeAlert({
    roomPda: createdRoomPda,
    enabled: phase === "searching" && !!createdRoomPda,
    onOpponentJoined: () => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      AudioManager.playPlayerJoined();
      showBrowserNotification(`🎮 ${t("quickMatch.opponentJoined")}`, t("quickMatch.matchReady", { game: translatedGameName }), {
        requireInteraction: true,
      });
      toast({ title: t("quickMatch.matchFound"), description: t("quickMatch.letsGo", { game: translatedGameName }) });
      navigate(`/play/${createdRoomPda}`);
    },
  });

  // ── Polling fallback: detect opponent join via activeRoom ──
  useEffect(() => {
    if (phase !== "searching" || !createdRoomPda || hasNavigatedRef.current) return;
    if (!activeRoom) return;

    if (activeRoom.pda === createdRoomPda && activeRoom.status === 2) {
      hasNavigatedRef.current = true;
      AudioManager.playPlayerJoined();
      toast({ title: t("quickMatch.matchFound") });
      navigate(`/play/${createdRoomPda}`);
    }
  }, [activeRoom, createdRoomPda, phase, navigate, toast, t]);

  // ── Free room polling: detect opponent join via DB ──
  useEffect(() => {
    if (phase !== "searching" || !createdRoomPda || hasNavigatedRef.current) return;
    if (!createdRoomPda.startsWith("free-")) return;

    const pollInterval = setInterval(async () => {
      try {
        const { data, error } = await supabase.functions.invoke("free-match", {
          body: { action: "check", roomPda: createdRoomPda },
        });
        if (error || !data?.session) return;

        if (data.session.status === "active" && data.session.player2_wallet) {
          if (hasNavigatedRef.current) return;
          hasNavigatedRef.current = true;
          clearInterval(pollInterval);
          AudioManager.playPlayerJoined();
          toast({ title: t("quickMatch.freeMatchJoined") });
          navigate(`/play/${createdRoomPda}`);
        }
      } catch (e) {
        console.warn("[QuickMatch] Free poll error:", e);
      }
    }, 3000);

    return () => clearInterval(pollInterval);
  }, [phase, createdRoomPda, navigate, toast, t]);

  // ── Find Match handler ──
  const handleFindMatch = useCallback(async () => {
    if (!isConnected || !address) return;
    if (isWorking || txPending) return;

    if (hookBlockingRoom) {
      toast({
        title: t("createRoom.activeRoomExists"),
        description: t("createRoom.cancelExistingRoom"),
        variant: "destructive",
      });
      return;
    }

    // FREE MATCH: DB-only matchmaking against real opponents
    if (selectedStake === 0) {
      setIsWorking(true);
      hasNavigatedRef.current = false;
      try {
        const { data, error } = await supabase.functions.invoke("free-match", {
          body: {
            action: "find_or_create",
            gameType: selectedGameKey,
            wallet: address,
            maxPlayers: effectiveMaxPlayers,
          },
        });
        if (error) throw error;

        if (data.status === "joined") {
          toast({ title: t("quickMatch.freeMatchJoined") });
          navigate(`/play/${data.roomPda}`);
        } else if (data.status === "created") {
          setCreatedRoomPda(data.roomPda);
          requestNotificationPermission();
          setPhase("searching");
          toast({ title: t("quickMatch.freeMatchCreated") });
        }
      } catch (err: any) {
        console.error("[QuickMatch] Free match error:", err);
        toast({ title: t("quickMatch.error"), description: err?.message, variant: "destructive" });
      } finally {
        setIsWorking(false);
      }
      return;
    }

    setIsWorking(true);
    hasNavigatedRef.current = false;

    try {
      // 1. Fetch latest rooms & wait for state to settle
      await fetchRooms();
      await new Promise((r) => setTimeout(r, 150));
      const currentRooms = roomsRef.current;

      // 2. Search for matching open room (not ours)
      const match = currentRooms.find((r) => {
        if (r.creator === address) return false;
        if (r.gameType !== selectedGame) return false;
        // For Ludo, also match on maxPlayers
        if (isLudo && r.maxPlayers !== ludoPlayerCount) return false;
        // Stake matching
        if (selectedStake === 0) return r.entryFeeSol === 0;
        return Math.abs(r.entryFeeSol - selectedStake) < 0.001;
      });

      if (match) {
        toast({ title: t("quickMatch.matchFound") });
        navigate(`/room/${match.pda}`);
        return;
      }

      // 3. No match — create a new public room
      const mode = selectedStake > 0 ? "ranked" : "casual";

      const roomId = await createRoom(
        selectedGame,
        selectedStake,
        effectiveMaxPlayers,
        mode as "casual" | "ranked"
      );

      if (!roomId || !address) {
        setIsWorking(false);
        return;
      }

      const creatorPubkey = new PublicKey(address);
      const roomPda = getRoomPda(creatorPubkey, roomId);
      const roomPdaStr = roomPda.toBase58();
      setCreatedRoomPda(roomPdaStr);

      // Persist settings via edge function
      const turnTimeSeconds = mode === "ranked" ? 30 : 0;
      try {
        await supabase.functions.invoke("game-session-set-settings", {
          body: {
            roomPda: roomPdaStr,
            turnTimeSeconds,
            mode,
            creatorWallet: address,
            gameType: selectedGameKey,
            maxPlayers: effectiveMaxPlayers,
          },
        });
      } catch (e) {
        console.warn("[QuickMatch] settings persist error (non-fatal):", e);
      }

      try {
        await supabase.rpc("record_acceptance", {
          p_room_pda: roomPdaStr,
          p_wallet: address,
          p_tx_signature: `quickmatch_${roomId}_${Date.now()}`,
          p_rules_hash: "creator_implicit",
          p_stake_lamports: solToLamports(selectedStake),
          p_is_creator: true,
        });
      } catch (e) {
        console.warn("[QuickMatch] record_acceptance error (non-fatal):", e);
      }

      requestNotificationPermission();
      setPhase("searching");
    } catch (err: any) {
      console.error("[QuickMatch] Error:", err);
      toast({
        title: t("quickMatch.error"),
        description: err?.message || t("quickMatch.somethingWrong"),
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  }, [
    isConnected, address, isWorking, txPending, hookBlockingRoom,
    rooms, selectedGame, selectedStake, selectedGameKey,
    isLudo, ludoPlayerCount, effectiveMaxPlayers,
    fetchRooms, createRoom, navigate, toast, t,
  ]);

  // ── Keep Searching (fixes audit issue: re-checks rooms) ──
  const handleKeepSearching = useCallback(async () => {
    hasNavigatedRef.current = false;

    // Re-check for matching rooms before restarting timer
    try {
      await fetchRooms();
      await new Promise((r) => setTimeout(r, 150));
      const currentRooms = roomsRef.current;

      const match = currentRooms.find((r) => {
        if (r.creator === address) return false;
        if (r.gameType !== selectedGame) return false;
        if (isLudo && r.maxPlayers !== ludoPlayerCount) return false;
        if (selectedStake === 0) return r.entryFeeSol === 0;
        return Math.abs(r.entryFeeSol - selectedStake) < 0.001;
      });

      if (match) {
        toast({ title: t("quickMatch.matchFound") });
        navigate(`/room/${match.pda}`);
        return;
      }
    } catch (e) {
      console.warn("[QuickMatch] re-search error (non-fatal):", e);
    }

    setPhase("searching");
  }, [address, selectedGame, selectedStake, isLudo, ludoPlayerCount, fetchRooms, navigate, toast, t]);

  // ── Switch to 2 Players ──
  const handleSwitchTo2Players = () => {
    setLudoPlayerCount(2);
    setCreatedRoomPda(null);
    setPhase("selecting");
  };

  // ── Copy invite link ──
  const handleCopyInvite = async () => {
    if (!createdRoomPda) return;
    const link = buildInviteLink({ roomId: createdRoomPda });
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast({ title: t("quickMatch.linkCopied") });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // ── Cancel with fund recovery ──
  const handleCancel = useCallback(async () => {
    // Free games: cancel via DB, navigate away
    if (selectedStake === 0) {
      if (createdRoomPda?.startsWith("free-") && address) {
        try {
          await supabase.functions.invoke("free-match", {
            body: { action: "cancel", roomPda: createdRoomPda, wallet: address },
          });
          toast({ title: t("quickMatch.freeCancelled") });
        } catch (e) {
          console.warn("[QuickMatch] Free cancel error:", e);
        }
      }
      setCreatedRoomPda(null);
      setPhase("selecting");
      navigate('/room-list');
      return;
    }

    if (!createdRoomPda || !publicKey) {
      navigate('/room-list');
      return;
    }

    setIsRecovering(true);
    try {
      const sessionToken = localStorage.getItem(`session_token_${createdRoomPda}`);
      const { data, error } = await supabase.functions.invoke("recover-funds", {
        headers: sessionToken ? { "x-session-token": sessionToken } : undefined,
        body: {
          roomPda: createdRoomPda,
          callerWallet: publicKey.toBase58(),
        },
      });

      if (error) throw error;

      switch (data.status) {
        case "can_cancel":
          setRecoverPendingTx(data.unsignedTx);
          setRecoverStakeAmount(data.stakeAmount);
          setShowRecoverDialog(true);
          break;
        case "already_resolved":
          toast({ title: data.message });
          navigate('/room-list');
          break;
        case "force_settled":
          toast({ title: t("quickMatch.fundsRecovered") });
          navigate('/room-list');
          break;
        default:
          toast({ title: data.message || t("quickMatch.error"), variant: "destructive" });
          navigate('/room-list');
      }
    } catch (e: any) {
      console.error("[QuickMatch] Recovery check failed:", e);
      toast({ title: e.message || t("quickMatch.error"), variant: "destructive" });
      navigate('/room-list');
    } finally {
      setIsRecovering(false);
    }
  }, [selectedStake, createdRoomPda, publicKey, navigate, toast, t]);

  const executeRecoverAndLeave = useCallback(async () => {
    if (!recoverPendingTx || !signTransaction || !publicKey) return;

    setShowRecoverDialog(false);
    setIsRecovering(true);
    try {
      const txBuffer = bs58.decode(recoverPendingTx);
      const transaction = Transaction.from(txBuffer);
      const signedTx = await signTransaction(transaction);

      const signature = await connection.sendRawTransaction(signedTx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");

      toast({ title: t("quickMatch.fundsRecovered") });
      setRecoverPendingTx(null);
      navigate('/room-list');
    } catch (e: any) {
      console.error("[QuickMatch] Cancel tx failed:", e);
      toast({ title: e.message || t("quickMatch.error"), variant: "destructive" });
    } finally {
      setIsRecovering(false);
    }
  }, [recoverPendingTx, signTransaction, publicKey, connection, navigate, toast, t]);

  const formatSol = (lamports: string) => (parseInt(lamports) / 1_000_000_000).toFixed(4);

  // ── Render ──
  return (
    <div className="container max-w-lg py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/room-list')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-display font-bold">{t("quickMatch.title")}</h1>
        </div>
      </div>

      {/* ── SELECTING PHASE ── */}
      {phase === "selecting" && (
        <div className="space-y-8">
          {/* Game Selection */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {t("quickMatch.selectGame")}
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
              {GAME_OPTIONS.map((g) => (
                <button
                  key={g.type}
                  onClick={() => setSelectedGame(g.type)}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all duration-200 ${
                    selectedGame === g.type
                      ? "border-primary bg-primary/10 shadow-gold"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="w-12 h-12">{GAME_ICONS[g.type]}</div>
                  <span className="text-xs font-medium text-foreground">{t(`games.${g.key}`)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Ludo Player Count Selector */}
          {isLudo && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {t("quickMatch.selectPlayers")}
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {LUDO_PLAYER_OPTIONS.map((count) => (
                  <button
                    key={count}
                    onClick={() => setLudoPlayerCount(count)}
                    className={`py-3 px-2 rounded-xl border text-center font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                      ludoPlayerCount === count
                        ? "border-primary bg-primary/10 text-primary shadow-gold"
                        : "border-border bg-card text-foreground hover:border-primary/30"
                    }`}
                  >
                    <Users className="h-4 w-4" />
                    {t("quickMatch.players", { count })}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Stake Selection */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {t("quickMatch.selectStake")}
            </h2>
            <div className="grid grid-cols-4 gap-3">
              {STAKE_PRESETS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSelectedStake(s.value)}
                  className={`py-3 px-2 rounded-xl border text-center font-semibold transition-all duration-200 ${
                    selectedStake === s.value
                      ? "border-primary bg-primary/10 text-primary shadow-gold"
                      : "border-border bg-card text-foreground hover:border-primary/30"
                  }`}
                >
                  {s.value === 0 ? t("quickMatch.free") : `${s.label} SOL`}
                </button>
              ))}
            </div>
          </div>

          {/* CTA */}
          {!isConnected ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">{t("quickMatch.connectFirst")}</p>
              <PrivyLoginButton />
              <Collapsible open={walletOpen} onOpenChange={setWalletOpen}>
                <CollapsibleTrigger asChild>
                  <button className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-lg border border-primary/40 px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary hover:border-primary transition-all duration-200">
                    <Wallet size={14} />
                    {t("wallet.alreadyHaveWallet")}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3">
                  <ConnectWalletGate />
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : (
            <Button
              variant="gold"
              size="lg"
              className="w-full h-14 text-lg gap-2"
              onClick={handleFindMatch}
              disabled={isWorking || txPending}
            >
              {isWorking || txPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("quickMatch.creatingRoom")}
                </>
              ) : (
                <>
                  <Zap className="h-5 w-5" />
                  {t("quickMatch.findMatch")}
                </>
              )}
            </Button>
          )}

          {/* Live Activity */}
          <div className="mt-4">
            <LiveActivityIndicator />
          </div>
        </div>
      )}

      {/* ── SEARCHING PHASE ── */}
      {phase === "searching" && (
        <div className="flex flex-col items-center justify-center gap-6 py-8">
          {/* Animated game icon */}
          <div className="w-20 h-20 animate-pulse">{GAME_ICONS[selectedGame]}</div>

          {/* Searching text */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Search className="h-5 w-5 text-primary animate-pulse" />
              <p className="text-lg font-semibold text-foreground">
                {isMultiPlayerLudo
                  ? t("quickMatch.waitingForPlayers", { current: 1, total: ludoPlayerCount })
                  : t("quickMatch.searching")}
              </p>
            </div>
            <p className="text-3xl font-display font-bold text-primary">
              {formatTime(secondsLeft)}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <Progress
              value={((SEARCH_TIMEOUT_SEC - secondsLeft) / SEARCH_TIMEOUT_SEC) * 100}
              className="h-2"
            />
            <p className="text-xs text-emerald-500 mt-1.5 flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              {t("quickMatch.waitingNote")}
            </p>
          </div>

          {/* Stake info */}
          <Card className="w-full max-w-xs">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {translatedGameName}
                {isLudo && ` • ${t("quickMatch.players", { count: ludoPlayerCount })}`}
                {" • "}
                {selectedStake === 0 ? t("quickMatch.free") : `${selectedStake} SOL`}
              </p>
            </CardContent>
          </Card>

          {/* Play vs AI while you wait card */}
          <Card className="w-full max-w-xs border-primary/20 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 flex-shrink-0">{GAME_ICONS[selectedGame]}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-snug">
                    {t("quickMatch.playAIWhileWaiting", { game: translatedGameName })}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 w-full gap-2 text-xs"
                    onClick={() => setShowAIGame(true)}
                  >
                    <Bot className="h-3 w-3" />
                    {t("quickMatch.playAIWhileWaitingBtn")}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Share room link — visible for ALL game types */}
          <div className="w-full max-w-xs flex flex-col gap-2">
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleCopyInvite}
            >
              {linkCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Share2 className="h-4 w-4" />}
              {linkCopied ? t("quickMatch.linkCopied") : t("quickMatch.shareLink")}
            </Button>
            {/* Multi-player Ludo extra: switch to 2 players */}
            {isMultiPlayerLudo && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full gap-2"
                onClick={handleSwitchTo2Players}
              >
                <Users className="h-4 w-4" />
                {t("quickMatch.switchTo2Players")}
              </Button>
            )}
          </div>

          {/* Cancel button */}
          <Button variant="ghost" onClick={handleCancel} disabled={isRecovering}>
            {isRecovering ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("quickMatch.recoveringFunds")}</>
            ) : selectedStake > 0 ? t("quickMatch.recoverFunds") : t("quickMatch.cancel")}
          </Button>
        </div>
      )}

      {/* ── TIMEOUT PHASE ── */}
      {phase === "timeout" && (
        <div className="flex flex-col items-center justify-center gap-6 py-12">
          <div className="w-16 h-16 text-muted-foreground">{GAME_ICONS[selectedGame]}</div>

          <p className="text-lg font-semibold text-foreground">{t("quickMatch.noOpponent")}</p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <Button variant="gold" size="lg" className="w-full gap-2" onClick={handleKeepSearching}>
              <Search className="h-4 w-4" />
              {t("quickMatch.keepSearching")}
            </Button>

            {/* Room still open info box */}
            <Card className="border-emerald-500/30 bg-emerald-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <span className="text-lg">✅</span>
                  <div>
                    <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                      {t("quickMatch.roomStillOpen")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t("quickMatch.roomStillOpenDesc", { game: translatedGameName })}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full gap-2 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                      onClick={() => navigate("/room-list")}
                    >
                      <MapPin className="h-3 w-3" />
                      {t("quickMatch.viewRoomList")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              onClick={() => setShowAIGame(true)}
            >
              <Bot className="h-4 w-4" />
              {t("quickMatch.playAI")}
            </Button>
            <Button variant="ghost" size="lg" className="w-full" onClick={handleCancel} disabled={isRecovering}>
              {isRecovering ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" />{t("quickMatch.recoveringFunds")}</>
              ) : selectedStake > 0 ? t("quickMatch.recoverFunds") : t("quickMatch.cancel")}
            </Button>
          </div>
        </div>
      )}

      {/* Recovery confirmation dialog */}
      <AlertDialog open={showRecoverDialog} onOpenChange={setShowRecoverDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              {t("quickMatch.recoverConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {t("quickMatch.recoverConfirmDesc", {
                    amount: recoverStakeAmount ? formatSol(recoverStakeAmount) : selectedStake.toString(),
                  })}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRecoverPendingTx(null)}>
              {t("quickMatch.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={executeRecoverAndLeave}>
              {t("quickMatch.confirmSign")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── AI Game Full-Screen Overlay ── */}
      {showAIGame && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          {/* Sticky header with back button and timer */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-primary/20 px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => setShowAIGame(false)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("quickMatch.backToMatchmaking", "Back to Matchmaking")}
            </Button>
            <span className="text-sm text-muted-foreground">
              {translatedGameName} • AI Practice
            </span>
            {phase === "searching" && (
              <span className="ml-auto text-sm font-mono text-primary">
                {formatTime(secondsLeft)}
              </span>
            )}
          </div>
          <QuickMatchAIGame gameKey={selectedGameKey as "chess" | "dominos" | "backgammon" | "checkers" | "ludo"} />
        </div>
      )}
    </div>
  );
}
