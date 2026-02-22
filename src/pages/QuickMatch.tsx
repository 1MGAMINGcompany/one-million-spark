import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicKey, Transaction } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Zap, Bot, Search, Loader2, Users, Copy, Check, Wallet, AlertTriangle, Share2, MapPin, Pencil } from "lucide-react";
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
import { getAnonId, getDisplayName, setDisplayName, setActiveRoom, getActiveRoom, clearActiveRoom } from "@/lib/anonIdentity";

type Phase = "selecting" | "searching" | "timeout";
type MatchMode = "free" | "sol";

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
  const [matchMode, setMatchMode] = useState<MatchMode>("free");
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.Ludo);
  const [selectedStake, setSelectedStake] = useState<number>(0.01);
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

  // Guest name editing
  const [guestName, setGuestName] = useState(getDisplayName());
  const [editingName, setEditingName] = useState(false);

  const hasNavigatedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const roomsRef = useRef(rooms);
  roomsRef.current = rooms;

  const [showAIGame, setShowAIGame] = useState(false);

  // Derived values
  const isFreeMode = matchMode === "free";
  const effectiveStake = isFreeMode ? 0 : selectedStake;
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

  // ── Active free room state (for blocking duplicate creation) ──
  const [existingFreeRoom, setExistingFreeRoom] = useState<{
    roomPda: string;
    status: string;
    gameType?: string;
    participants?: string[];
    maxPlayers?: number;
  } | null>(null);

  // ── Auto-rejoin check on mount ──
  useEffect(() => {
    const activeRoomPda = getActiveRoom();
    if (!activeRoomPda || !activeRoomPda.startsWith("free-")) return;

    const checkRejoin = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("free-match", {
          body: { action: "check", roomPda: activeRoomPda },
        });
        if (error || !data?.session) {
          clearActiveRoom();
          return;
        }

        const playerId = address || getAnonId();
        const session = data.session;
        const isParticipant = session.participants?.includes(playerId) ||
          session.player1_wallet === playerId || session.player2_wallet === playerId;

        if (!isParticipant) {
          clearActiveRoom();
          return;
        }

        if (session.status === "active") {
          // Game is live — go straight to it
          toast({ title: t("quickPlay.rejoining") });
          navigate(`/play/${activeRoomPda}`);
          return;
        }

        if (session.status === "waiting") {
          // Room still waiting for opponents — store it and resume searching phase
          setExistingFreeRoom({
            roomPda: activeRoomPda,
            status: session.status,
            gameType: session.game_type,
            participants: session.participants,
            maxPlayers: session.max_players,
          });
          setCreatedRoomPda(activeRoomPda);
          setPhase("searching");
          hasNavigatedRef.current = false;
          return;
        }

        // Room cancelled/expired/finished — clear
        clearActiveRoom();
        setExistingFreeRoom(null);
      } catch {
        clearActiveRoom();
      }
    };
    checkRejoin();
  }, [navigate, toast, t, address]);

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

  // ── Realtime alert for opponent joining (paid rooms only) ──
  useRoomRealtimeAlert({
    roomPda: createdRoomPda,
    enabled: phase === "searching" && !!createdRoomPda && !createdRoomPda.startsWith("free-"),
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

  // ── Polling fallback: detect opponent join via activeRoom (paid) ──
  useEffect(() => {
    if (phase !== "searching" || !createdRoomPda || hasNavigatedRef.current) return;
    if (createdRoomPda.startsWith("free-")) return;
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

        if (data.session.status === "active" && data.session.participants?.length >= (data.session.max_players || 2)) {
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
    if (isWorking || txPending) return;

    // FREE MATCH: DB-only matchmaking — no login required
    if (isFreeMode) {
      // Block if user already has an open free room
      if (existingFreeRoom && (existingFreeRoom.status === "waiting" || existingFreeRoom.status === "active")) {
        toast({
          title: t("quickPlay.activeRoomExists"),
          description: t("quickPlay.cancelOrRejoin"),
          variant: "destructive",
        });
        return;
      }

      setIsWorking(true);
      hasNavigatedRef.current = false;
      const playerId = address || getAnonId(); // Use wallet if connected, else anon ID
      const displayName = address ? undefined : getDisplayName();
      try {
        const { data, error } = await supabase.functions.invoke("free-match", {
          body: {
            action: "find_or_create",
            gameType: selectedGameKey,
            playerId,
            wallet: address || undefined, // backward compat
            displayName,
            maxPlayers: effectiveMaxPlayers,
          },
        });
        if (error) throw error;

        if (data.status === "joined") {
          setActiveRoom(data.roomPda);
          toast({ title: t("quickMatch.freeMatchJoined") });
          navigate(`/play/${data.roomPda}`);
        } else if (data.status === "already_has_room") {
          // Player already has an active free room — show banner with options
          setActiveRoom(data.roomPda);
          setCreatedRoomPda(data.roomPda);
          setExistingFreeRoom({
            roomPda: data.roomPda,
            status: data.existingStatus,
            gameType: data.existingGameType,
          });
          if (data.existingStatus === "active") {
            toast({ title: t("quickPlay.rejoining") });
            navigate(`/play/${data.roomPda}`);
          } else {
            // Stay on selecting phase but show the active room banner prominently
            toast({ title: t("quickPlay.activeRoomExists"), description: t("quickPlay.cancelOrRejoin"), variant: "destructive" });
          }
        } else if (data.status === "waiting_for_more") {
          // Multi-player room (Ludo 3/4): joined but not full yet
          setActiveRoom(data.roomPda);
          setCreatedRoomPda(data.roomPda);
          requestNotificationPermission();
          setPhase("searching");
          toast({ title: t("quickMatch.freeMatchCreated") });
        } else if (data.status === "created") {
          setActiveRoom(data.roomPda);
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

    // PAID MATCH: requires wallet
    if (!isConnected || !address) return;

    if (hookBlockingRoom) {
      toast({
        title: t("createRoom.activeRoomExists"),
        description: t("createRoom.cancelExistingRoom"),
        variant: "destructive",
      });
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
        if (isLudo && r.maxPlayers !== ludoPlayerCount) return false;
        return Math.abs(r.entryFeeSol - selectedStake) < 0.001;
      });

      if (match) {
        toast({ title: t("quickMatch.matchFound") });
        navigate(`/room/${match.pda}`);
        return;
      }

      // 3. No match — create a new public room
      const mode = "ranked";

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
      const turnTimeSeconds = 30;
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
    isConnected, address, isWorking, txPending, hookBlockingRoom, isFreeMode,
    rooms, selectedGame, selectedStake, selectedGameKey,
    isLudo, ludoPlayerCount, effectiveMaxPlayers,
    fetchRooms, createRoom, navigate, toast, t,
  ]);

  // ── Keep Searching (fixes audit issue: re-checks rooms) ──
  const handleKeepSearching = useCallback(async () => {
    hasNavigatedRef.current = false;

    if (!isFreeMode) {
      try {
        await fetchRooms();
        await new Promise((r) => setTimeout(r, 150));
        const currentRooms = roomsRef.current;

        const match = currentRooms.find((r) => {
          if (r.creator === address) return false;
          if (r.gameType !== selectedGame) return false;
          if (isLudo && r.maxPlayers !== ludoPlayerCount) return false;
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
    }

    setPhase("searching");
  }, [address, selectedGame, selectedStake, isLudo, ludoPlayerCount, isFreeMode, fetchRooms, navigate, toast, t]);

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

  // ── Cancel ──
  const handleCancel = useCallback(async () => {
    // Free games: cancel via DB, navigate away
    if (isFreeMode) {
      if (createdRoomPda?.startsWith("free-")) {
        const playerId = address || getAnonId();
        try {
          await supabase.functions.invoke("free-match", {
            body: { action: "cancel", roomPda: createdRoomPda, playerId, wallet: address || undefined },
          });
          toast({ title: t("quickMatch.freeCancelled") });
        } catch (e) {
          console.warn("[QuickMatch] Free cancel error:", e);
        }
      }
      clearActiveRoom();
      setExistingFreeRoom(null);
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
  }, [isFreeMode, createdRoomPda, publicKey, address, navigate, toast, t]);

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

  // ── Save edited name ──
  const handleSaveName = () => {
    setDisplayName(guestName);
    setEditingName(false);
  };

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
          {/* Active Free Room Banner */}
          {existingFreeRoom && (existingFreeRoom.status === "waiting" || existingFreeRoom.status === "active") && (
            <Card className="border-amber-500/50 bg-amber-500/10">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                      {t("quickPlay.activeRoomExists")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {existingFreeRoom.gameType ? t(`games.${existingFreeRoom.gameType}`) : ""} • {existingFreeRoom.status === "active" ? t("gameBanner.gameReady") : t("gameBanner.waitingForOpponent")}
                    </p>
                    <div className="flex gap-2 mt-3">
                      {existingFreeRoom.status === "active" ? (
                        <Button size="sm" onClick={() => navigate(`/play/${existingFreeRoom.roomPda}`)}>
                          {t("gameBanner.play")}
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => {
                          setCreatedRoomPda(existingFreeRoom.roomPda);
                          setPhase("searching");
                        }}>
                          {t("quickMatch.keepSearching")}
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={async () => {
                        const playerId = address || getAnonId();
                        try {
                          await supabase.functions.invoke("free-match", {
                            body: { action: "cancel", roomPda: existingFreeRoom.roomPda, playerId, wallet: address || undefined },
                          });
                          toast({ title: t("quickMatch.freeCancelled") });
                        } catch (e) {
                          console.warn("[QuickMatch] cancel error:", e);
                        }
                        clearActiveRoom();
                        setExistingFreeRoom(null);
                        setCreatedRoomPda(null);
                      }}>
                        {t("quickMatch.cancel")}
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

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

          {/* Mode Selection: Free vs Play for SOL */}
          <div>
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
              {t("quickPlay.mode") || "Mode"}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setMatchMode("free")}
                className={`py-4 px-3 rounded-xl border text-center font-semibold transition-all duration-200 ${
                  isFreeMode
                    ? "border-primary bg-primary/10 text-primary shadow-gold"
                    : "border-border bg-card text-foreground hover:border-primary/30"
                }`}
              >
                <Zap className="h-5 w-5 mx-auto mb-1" />
                <span className="text-sm">{t("quickMatch.free")}</span>
                <p className="text-[10px] text-muted-foreground mt-1">{t("quickPlay.noLoginNeeded")}</p>
              </button>
              <button
                onClick={() => setMatchMode("sol")}
                className={`py-4 px-3 rounded-xl border text-center font-semibold transition-all duration-200 ${
                  !isFreeMode
                    ? "border-primary bg-primary/10 text-primary shadow-gold"
                    : "border-border bg-card text-foreground hover:border-primary/30"
                }`}
              >
                <Wallet className="h-5 w-5 mx-auto mb-1" />
                <span className="text-sm">{t("quickPlay.playForSol")}</span>
                <p className="text-[10px] text-muted-foreground mt-1">{t("quickPlay.requiresWallet")}</p>
              </button>
            </div>
          </div>

          {/* SOL Stake Selection (only when sol mode) */}
          {!isFreeMode && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                {t("quickMatch.selectStake")}
              </h2>
              <div className="grid grid-cols-3 gap-3">
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
                    {`${s.label} SOL`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Guest Name (free mode, not logged in) */}
          {isFreeMode && !isConnected && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {t("quickPlay.yourName")}
              </h2>
              <div className="flex items-center gap-2">
                {editingName ? (
                  <>
                    <Input
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      maxLength={20}
                      className="flex-1"
                      autoFocus
                      onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
                    />
                    <Button size="sm" onClick={handleSaveName}>
                      <Check className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <span className="text-foreground font-medium">{guestName}</span>
                    <button
                      onClick={() => setEditingName(true)}
                      className="text-muted-foreground hover:text-primary transition-colors"
                      title={t("quickPlay.editName")}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* CTA */}
          {isFreeMode ? (
            // Free mode: no login required
            <Button
              variant="gold"
              size="lg"
              className="w-full h-14 text-lg gap-2"
              onClick={handleFindMatch}
              disabled={isWorking}
            >
              {isWorking ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {t("quickMatch.creatingRoom")}
                </>
              ) : (
                <>
                  <Search className="h-5 w-5" />
                  {t("quickPlay.findOpponent")}
                </>
              )}
            </Button>
          ) : !isConnected ? (
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
                {isFreeMode ? t("quickMatch.free") : `${selectedStake} SOL`}
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

          {/* Share room link */}
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
            ) : !isFreeMode ? t("quickMatch.recoverFunds") : t("quickMatch.cancel")}
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
              ) : !isFreeMode ? t("quickMatch.recoverFunds") : t("quickMatch.cancel")}
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
