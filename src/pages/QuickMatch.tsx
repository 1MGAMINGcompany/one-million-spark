import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { PublicKey } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Zap, Bot, Search, Loader2 } from "lucide-react";
import { ChessIcon, DominoIcon, BackgammonIcon, CheckersIcon, LudoIcon } from "@/components/GameIcons";
import { PrivyLoginButton } from "@/components/PrivyLoginButton";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useRoomRealtimeAlert } from "@/hooks/useRoomRealtimeAlert";
import { useToast } from "@/hooks/use-toast";
import { GameType, isOpenStatus } from "@/lib/solana-program";
import { getRoomPda } from "@/lib/solana-utils";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
import { requestNotificationPermission } from "@/lib/pushNotifications";
import { supabase } from "@/integrations/supabase/client";
import { solToLamports } from "@/lib/rematchPayload";

type Phase = "selecting" | "searching" | "timeout";

const GAME_OPTIONS = [
  { type: GameType.Chess, key: "chess", label: "Chess" },
  { type: GameType.Dominos, key: "dominos", label: "Dominos" },
  { type: GameType.Backgammon, key: "backgammon", label: "Backgammon" },
  { type: GameType.Checkers, key: "checkers", label: "Checkers" },
  { type: GameType.Ludo, key: "ludo", label: "Ludo" },
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

const SEARCH_TIMEOUT_SEC = 60;

export default function QuickMatch() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isConnected, address } = useWallet();
  const {
    rooms,
    fetchRooms,
    createRoom,
    txPending,
    activeRoom,
    blockingRoom: hookBlockingRoom,
  } = useSolanaRooms();

  const [phase, setPhase] = useState<Phase>("selecting");
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.Chess);
  const [selectedStake, setSelectedStake] = useState<number>(0);
  const [secondsLeft, setSecondsLeft] = useState(SEARCH_TIMEOUT_SEC);
  const [createdRoomPda, setCreatedRoomPda] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);

  const hasNavigatedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Game name for the selected game type
  const selectedGameName =
    GAME_OPTIONS.find((g) => g.type === selectedGame)?.label ?? "Game";
  const selectedGameKey =
    GAME_OPTIONS.find((g) => g.type === selectedGame)?.key ?? "chess";

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
      showBrowserNotification("🎮 Opponent Joined!", `Your ${selectedGameName} match is ready!`, {
        requireInteraction: true,
      });
      toast({ title: t("quickMatch.matchFound"), description: `${selectedGameName} — Let's go!` });
      navigate(`/play/${createdRoomPda}`);
    },
  });

  // ── Polling fallback: detect opponent join via activeRoom ──
  useEffect(() => {
    if (phase !== "searching" || !createdRoomPda || hasNavigatedRef.current) return;
    if (!activeRoom) return;

    // If activeRoom PDA matches ours and it became Started (status 2), opponent joined
    if (activeRoom.pda === createdRoomPda && activeRoom.status === 2) {
      hasNavigatedRef.current = true;
      AudioManager.playPlayerJoined();
      toast({ title: t("quickMatch.matchFound") });
      navigate(`/play/${createdRoomPda}`);
    }
  }, [activeRoom, createdRoomPda, phase, navigate, toast, t, selectedGameName]);

  // ── Find Match handler ──
  const handleFindMatch = useCallback(async () => {
    if (!isConnected || !address) return;
    if (isWorking || txPending) return;

    // Block if user has unresolved room
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
      // 1. Fetch latest rooms
      await fetchRooms();

      // 2. Search for matching open room (not ours)
      const match = rooms.find((r) => {
        if (r.creator === address) return false; // skip own rooms
        if (r.gameType !== selectedGame) return false;
        // Stake matching
        if (selectedStake === 0) return r.entryFeeSol === 0;
        return Math.abs(r.entryFeeSol - selectedStake) < 0.001;
      });

      if (match) {
        // Found an existing room — navigate to join flow
        toast({ title: t("quickMatch.matchFound") });
        navigate(`/room/${match.pda}`);
        return;
      }

      // 3. No match — create a new public room
      const mode = selectedStake > 0 ? "ranked" : "casual";
      const maxPlayers = selectedGame === GameType.Ludo ? 4 : 2;

      const roomId = await createRoom(
        selectedGame,
        selectedStake,
        maxPlayers,
        mode as "casual" | "ranked"
      );

      if (!roomId || !address) {
        setIsWorking(false);
        return;
      }

      // Derive room PDA
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
            maxPlayers,
          },
        });
      } catch (e) {
        console.warn("[QuickMatch] settings persist error (non-fatal):", e);
      }

      // Record creator acceptance (redundant safety — createRoom already does it)
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
        title: "Error",
        description: err?.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsWorking(false);
    }
  }, [
    isConnected,
    address,
    isWorking,
    txPending,
    hookBlockingRoom,
    rooms,
    selectedGame,
    selectedStake,
    selectedGameKey,
    fetchRooms,
    createRoom,
    navigate,
    toast,
    t,
  ]);

  // ── Keep Searching ──
  const handleKeepSearching = () => {
    hasNavigatedRef.current = false;
    setPhase("searching");
  };

  // ── Render ──
  return (
    <div className="container max-w-lg py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
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
        </div>
      )}

      {/* ── SEARCHING PHASE ── */}
      {phase === "searching" && (
        <div className="flex flex-col items-center justify-center gap-8 py-12">
          {/* Animated game icon */}
          <div className="w-20 h-20 animate-pulse">{GAME_ICONS[selectedGame]}</div>

          {/* Searching text */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-2">
              <Search className="h-5 w-5 text-primary animate-pulse" />
              <p className="text-lg font-semibold text-foreground">{t("quickMatch.searching")}</p>
            </div>
            <p className="text-3xl font-display font-bold text-primary">
              {t("quickMatch.secondsLeft", { seconds: secondsLeft })}
            </p>
          </div>

          {/* Progress bar */}
          <div className="w-full max-w-xs">
            <Progress
              value={((SEARCH_TIMEOUT_SEC - secondsLeft) / SEARCH_TIMEOUT_SEC) * 100}
              className="h-2"
            />
          </div>

          {/* Stake info */}
          <Card className="w-full max-w-xs">
            <CardContent className="p-4 text-center">
              <p className="text-sm text-muted-foreground">
                {selectedGameName} •{" "}
                {selectedStake === 0 ? t("quickMatch.free") : `${selectedStake} SOL`}
              </p>
            </CardContent>
          </Card>

          {/* Cancel button */}
          <Button variant="ghost" onClick={() => navigate(-1)}>
            {t("quickMatch.cancel")}
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
            <Button
              variant="outline"
              size="lg"
              className="w-full gap-2"
              onClick={() => navigate("/play-ai")}
            >
              <Bot className="h-4 w-4" />
              {t("quickMatch.playAI")}
            </Button>
            <Button variant="ghost" size="lg" className="w-full" onClick={() => navigate(-1)}>
              {t("quickMatch.cancel")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
