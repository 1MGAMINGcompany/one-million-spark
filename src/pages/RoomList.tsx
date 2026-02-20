import { useEffect, useState, useRef, useCallback } from "react";
import { LiveActivityIndicator } from "@/components/LiveActivityIndicator";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Construction, 
  Plus, 
  Users, 
  Gamepad2, 
  RefreshCw,
  AlertTriangle,
  Coins,
  Clock,
  Zap,
  Trophy,
  Gamepad,
  Settings2,
  Loader2,
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { SOLANA_ENABLED, getSolanaCluster, getSolanaEndpoint } from "@/lib/solana-config";
import { GameType, RoomStatus, isOpenStatus, RoomDisplay, isActiveStatus } from "@/lib/solana-program";
import { isBlockingRoom } from "@/lib/solana-utils";
import { useToast } from "@/hooks/use-toast";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
import { ResolveRoomModal } from "@/components/ResolveRoomModal";
import { UnresolvedRoomModal } from "@/components/UnresolvedRoomModal";
import { supabase } from "@/integrations/supabase/client";
import { BUILD_VERSION } from "@/lib/buildVersion";
import { useRoomRealtimeAlert } from "@/hooks/useRoomRealtimeAlert";

interface FreeRoom {
  room_pda: string;
  game_type: string;
  status: string;
  player1_wallet: string;
  player2_wallet: string | null;
  created_at: string;
  max_players: number;
  mode: string;
}

const FREE_GAME_ICONS: Record<string, string> = {
  chess: "♟️",
  dominos: "🁡",
  backgammon: "🎲",
  checkers: "⚫",
  ludo: "🎯",
};

const FREE_GAME_NAMES: Record<string, string> = {
  chess: "Chess",
  dominos: "Dominos",
  backgammon: "Backgammon",
  checkers: "Checkers",
  ludo: "Ludo",
};

function timeAgo(dateStr: string): string {
  const secs = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}



export default function RoomList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { toast } = useToast();
  const { isConnected, address } = useWallet();
  const { rooms, loading, error, fetchRooms, activeRoom, blockingRoom: hookBlockingRoom, findMyActiveGameSessions } = useSolanaRooms();
  
  const [lastFetch, setLastFetch] = useState<string | null>(null);
  const [myActiveSessions, setMyActiveSessions] = useState<Array<{
    roomPda: string;
    gameType: string;
    status: string;
    isPlayer1: boolean;
  }>>([]);
  
  // On-chain active rooms (filtered from all rooms)
  const [myOnChainRooms, setMyOnChainRooms] = useState<RoomDisplay[]>([]);
  
  // Free rooms from DB
  const [freeRooms, setFreeRooms] = useState<FreeRoom[]>([]);
  const [joiningFreeRoom, setJoiningFreeRoom] = useState<string | null>(null);
  const [cancellingFreeRoom, setCancellingFreeRoom] = useState<string | null>(null);

  // Resolve modal state
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [selectedRoomForResolve, setSelectedRoomForResolve] = useState<RoomDisplay | null>(null);
  
  // Unresolved room modal state (for smart blocking)
  const [showUnresolvedModal, setShowUnresolvedModal] = useState(false);
  const [modalBlockingRoom, setModalBlockingRoom] = useState<RoomDisplay | null>(null);
  
  // Track previous status to detect when opponent joins
  const prevStatusRef = useRef<number | null>(null);
  // Track if we already navigated to avoid double navigation
  const hasNavigatedRef = useRef(false);

  const targetCluster = getSolanaCluster();
  const rpcEndpoint = getSolanaEndpoint();

  // Poll room list every 5 seconds
  useEffect(() => {
    if (!SOLANA_ENABLED) {
      console.log("[RoomList] SOLANA_ENABLED is false, skipping fetch");
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      console.log("[RoomList] Auto-refresh room list (5s interval)");
      setLastFetch(new Date().toISOString());
      fetchRooms();
      timer = setTimeout(tick, 5000);
    };

    tick();

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch user's active game sessions from Supabase
  useEffect(() => {
    if (!isConnected || !address) {
      setMyActiveSessions([]);
      return;
    }
    
    const fetchMySessions = async () => {
      const sessions = await findMyActiveGameSessions();
      setMyActiveSessions(sessions);
    };
    
    fetchMySessions();
    
    // Refresh every 10 seconds
    const interval = setInterval(fetchMySessions, 10000);
    return () => clearInterval(interval);
  }, [isConnected, address, findMyActiveGameSessions]);

  // Poll free rooms from DB every 10 seconds (visible to everyone, no wallet required)
  useEffect(() => {
    const fetchFreeRooms = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("game-sessions-list", {
          body: { type: "free_rooms_public" },
        });
        if (!error && data?.rows) {
          setFreeRooms(data.rows);
        }
      } catch (e) {
        console.warn("[RoomList] free rooms fetch error:", e);
      }
    };
    fetchFreeRooms();
    const interval = setInterval(fetchFreeRooms, 10000);
    return () => clearInterval(interval);
  }, []);

  // Join a specific free room
  const handleJoinFreeRoom = useCallback(async (roomPda: string) => {
    if (!isConnected || !address) {
      toast({ title: "Connect wallet to join", variant: "destructive" });
      return;
    }
    setJoiningFreeRoom(roomPda);
    try {
      const { data, error } = await supabase.functions.invoke("free-match", {
        body: { action: "join_specific", roomPda, wallet: address },
      });
      if (error) throw error;
      if (data.status === "joined" || data.status === "rejoined") {
        navigate(`/play/${roomPda}`);
      }
    } catch (e: any) {
      toast({ title: e.message || "Failed to join room", variant: "destructive" });
    } finally {
      setJoiningFreeRoom(null);
    }
  }, [isConnected, address, navigate, toast]);

  // Cancel own waiting free room
  const handleCancelFreeRoom = useCallback(async (roomPda: string) => {
    if (!address) return;
    setCancellingFreeRoom(roomPda);
    try {
      await supabase.functions.invoke("free-match", {
        body: { action: "cancel", roomPda, wallet: address },
      });
      setFreeRooms((prev) => prev.filter((r) => r.room_pda !== roomPda));
      toast({ title: "Room cancelled" });
    } catch (e: any) {
      toast({ title: e.message || "Failed to cancel room", variant: "destructive" });
    } finally {
      setCancellingFreeRoom(null);
    }
  }, [address, toast]);

  // Filter on-chain rooms where this wallet is a player and room is active
  useEffect(() => {
    if (!address || rooms.length === 0) {
      setMyOnChainRooms([]);
      return;
    }
    
    const myRooms = rooms.filter(room => 
      room.players.includes(address) && isActiveStatus(room.status)
    );
    
    // Also check activeRoom if it exists and isn't in the filtered list
    if (activeRoom && !myRooms.find(r => r.pda === activeRoom.pda) && isActiveStatus(activeRoom.status)) {
      myRooms.push(activeRoom);
    }
    
    setMyOnChainRooms(myRooms);
  }, [address, rooms, activeRoom]);

  // Note: Active room polling is now centralized in useSolanaRooms
  // Pages only CONSUME activeRoom - they don't trigger fetches


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
      console.log("[RoomList] Opponent joined! Triggering notifications and redirect");
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
        title: "🎮 Opponent joined — your game is ready!",
        description: `Your ${activeRoom.gameTypeName} match is starting. Enter now!`,
      });
      
      // Navigate directly to PLAY route (game is ready to start)
      console.log("[RoomList] Navigating to play via PDA:", activeRoom.pda);
      navigate(`/play/${activeRoom.pda}`);
    }
    
    prevStatusRef.current = currentStatus;
  }, [activeRoom, address, toast, navigate]);

  // Realtime alert: instant "opponent joined" via DB subscription (supplements polling)
  useRoomRealtimeAlert({
    roomPda: activeRoom?.pda ?? null,
    enabled: !!activeRoom && isOpenStatus(activeRoom.status),
    onOpponentJoined: () => {
      if (hasNavigatedRef.current) return;
      hasNavigatedRef.current = true;
      AudioManager.playPlayerJoined();
      showBrowserNotification("🎮 Opponent Joined!", `Your ${activeRoom?.gameTypeName} match is ready!`, { requireInteraction: true });
      toast({ title: "🎮 Opponent joined — your game is ready!", description: `Your ${activeRoom?.gameTypeName} match is starting. Enter now!` });
      navigate(`/play/${activeRoom?.pda}`);
    },
  });

  // Feature flag disabled - show coming soon
  if (!SOLANA_ENABLED) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-cinzel">{t("roomList.title")}</h1>
        </div>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="py-12">
            <div className="text-center">
              <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
              <p className="text-muted-foreground">
                We're migrating to Solana! Browse and join rooms with SOL entry fees soon.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getGameIcon = (gameType: number) => {
    const icons: Record<number, string> = {
      [GameType.Chess]: "♟️",
      [GameType.Dominos]: "🁡",
      [GameType.Backgammon]: "🎲",
      [GameType.Checkers]: "⚫",
      [GameType.Ludo]: "🎯",
    };
    return icons[gameType] || "🎮";
  };

  const getGameName = (gameType: number) => {
    const names: Record<number, string> = {
      [GameType.Chess]: "Chess",
      [GameType.Dominos]: "Dominos",
      [GameType.Backgammon]: "Backgammon",
      [GameType.Checkers]: "Checkers",
      [GameType.Ludo]: "Ludo",
    };
    return names[gameType] || "Unknown";
  };

  return (
    <div className="container max-w-4xl py-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-cinzel">{t("roomList.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {targetCluster === "mainnet-beta" ? "🟢 Mainnet" : "🟡 Devnet"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="gold"
            size="sm"
            onClick={() => navigate("/quick-match")}
            className="gap-1"
          >
            <Zap className="h-4 w-4" />
            {t("quickMatch.title")}
          </Button>
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => {
              setLastFetch(new Date().toISOString());
              fetchRooms();
            }}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button 
            onClick={() => {
              console.log("[RoomList] Create clicked, blockingRoom:", hookBlockingRoom?.pda?.slice(0, 8));
              if (hookBlockingRoom) {
                console.log("[RoomList] BLOCKED - showing modal");
                setModalBlockingRoom(hookBlockingRoom);
                setShowUnresolvedModal(true);
                return;
              }
              navigate("/create-room");
            }}
            disabled={!isConnected}
            title={
              !isConnected 
                ? "Connect wallet to create room" 
                : hookBlockingRoom
                  ? t("roomList.resolveFirst")
                  : undefined
            }
            className="flex flex-col items-center h-auto py-2 px-4"
          >
            <span className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              {t("createRoom.createRoom")}
            </span>
            <span className="text-[10px] font-normal opacity-70 tracking-wide">{t("home.createRoomSub")}</span>
          </Button>
        </div>
      </div>

      {/* Live Activity Indicator */}
      <div className="mb-6">
        <LiveActivityIndicator />
      </div>

      {/* Active Game Banner handled by GlobalActiveRoomBanner in App.tsx */}

      {/* ── FREE ROOMS SECTION ── */}
      {freeRooms.length > 0 && (
        <Card className="mb-6 border-emerald-500/30 bg-emerald-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <span>🆓</span>
              Free Rooms
              <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full ml-1 font-normal">
                {freeRooms.length} waiting
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {freeRooms.map((room) => {
              const isMyRoom = address && room.player1_wallet === address;
              const isJoining = joiningFreeRoom === room.room_pda;
              const isCancelling = cancellingFreeRoom === room.room_pda;
              const gameName = FREE_GAME_NAMES[room.game_type] || room.game_type;
              const gameIcon = FREE_GAME_ICONS[room.game_type] || "🎮";
              return (
                <div
                  key={room.room_pda}
                  className="flex items-center justify-between p-3 bg-background/60 rounded-lg border border-emerald-500/20"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{gameIcon}</span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium">{gameName}</p>
                        <span className="text-xs bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full">
                          FREE
                        </span>
                        {isMyRoom && (
                          <span className="text-xs bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.5 rounded-full">
                            🟢 Your Room
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Users className="h-3 w-3 inline mr-1" />
                        1/{room.max_players} · {timeAgo(room.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    {isMyRoom ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                          onClick={() => navigate(`/play/${room.room_pda}`)}
                        >
                          Rejoin
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:bg-destructive/10 text-xs"
                          disabled={isCancelling}
                          onClick={() => handleCancelFreeRoom(room.room_pda)}
                        >
                          {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10 text-xs"
                        disabled={isJoining || !isConnected}
                        onClick={() => handleJoinFreeRoom(room.room_pda)}
                        title={!isConnected ? "Connect wallet to join" : undefined}
                      >
                        {isJoining ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                        {isJoining ? "Joining…" : "Join Free"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* My Active Games Section - Show ALL rooms for this wallet */}
      {isConnected && myOnChainRooms.length > 0 && (
        <Card className="mb-6 border-primary/50 bg-primary/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Gamepad className="h-5 w-5 text-primary" />
              {t("roomList.myActiveGames")}
              <span className="text-xs bg-primary/20 px-2 py-0.5 rounded-full ml-2">
                {myOnChainRooms.length}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {myOnChainRooms.map((room) => (
              <div 
                key={room.pda}
                className="flex items-center justify-between p-3 bg-background/50 rounded-lg border border-border/50"
              >
                <div className="flex items-center gap-3">
                  <span className="text-xl">{getGameIcon(room.gameType)}</span>
                  <div>
                    <p className="font-medium">{room.gameTypeName}</p>
                    <p className="text-xs text-muted-foreground">
                      {room.creator === address ? t("roomList.youAreCreator") : t("roomList.youJoined")}
                      {" • "}
                      {room.playerCount}/{room.maxPlayers} players
                      {room.entryFeeSol > 0 && ` • ${room.entryFeeSol} SOL`}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setSelectedRoomForResolve(room);
                      setResolveModalOpen(true);
                    }}
                  >
                    <Settings2 className="h-4 w-4 mr-1" />
                    {t("roomList.resolve", "Resolve")}
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => navigate(`/play/${room.pda}`)}
                  >
                    {t("roomList.rejoin")}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Loading State */}
      {loading && (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-10 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <Card className="border-destructive/50 bg-card/80 backdrop-blur">
          <CardContent className="py-8">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Failed to Load Rooms</h3>
              <p className="text-muted-foreground mb-4 text-sm">{error}</p>
              <Button onClick={() => fetchRooms()} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && !error && rooms.length === 0 && (
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="py-12">
            <div className="text-center">
              <Gamepad2 className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Public Rooms Yet</h3>
              <p className="text-muted-foreground mb-6">
                Be the first to create a room and start playing!
              </p>
              <Button 
                onClick={() => {
                  console.log("[RoomList] Empty state Create clicked, blockingRoom:", hookBlockingRoom?.pda?.slice(0, 8));
                  if (hookBlockingRoom) {
                    console.log("[RoomList] BLOCKED - showing modal");
                    setModalBlockingRoom(hookBlockingRoom);
                    setShowUnresolvedModal(true);
                    return;
                  }
                  navigate("/create-room");
                }} 
                size="lg"
                disabled={!isConnected}
                title={
                  !isConnected 
                    ? "Connect wallet to create room" 
                    : hookBlockingRoom
                      ? t("roomList.resolveFirst")
                      : undefined
                }
              >
                <Plus className="h-5 w-5 mr-2" />
                {isConnected ? "Create the First Room" : "Connect Wallet to Create Room"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Room List */}
      {!loading && !error && rooms.length > 0 && (
        <div className="grid gap-4">
          {rooms.map((room) => (
            <Card 
              key={room.pda} 
              className="border-border/50 bg-card/80 backdrop-blur hover:bg-card/90 transition-colors cursor-pointer"
              onClick={() => navigate(`/room/${room.pda}`)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  {/* Game Icon */}
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-2xl">
                    {getGameIcon(room.gameType)}
                  </div>

                  {/* Room Info */}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    {/* First row: Game name + badges - wrap on mobile */}
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">
                        {getGameName(room.gameType)}
                      </h3>
                      <span className="text-xs px-1.5 sm:px-2 py-0.5 rounded-full bg-primary/20 text-primary shrink-0">
                        #{room.roomId}
                      </span>
                      {/* Mode Badge - smaller on mobile */}
                      {(() => {
                        const isRanked = room.mode === 'ranked' || (!room.mode && room.entryFeeSol > 0);
                        return (
                          <span className={`text-xs px-1.5 sm:px-2 py-0.5 rounded-full border flex items-center gap-0.5 sm:gap-1 shrink-0 ${
                            isRanked 
                              ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {isRanked ? '🔴' : '🟢'}
                            <span className="hidden sm:inline">{isRanked ? t("createRoom.gameModeRanked") : t("createRoom.gameModeCasual")}</span>
                            <span className="sm:hidden">{isRanked ? 'Ranked' : 'Casual'}</span>
                          </span>
                        );
                      })()}
                    </div>
                    {/* Second row: Stats - wrap on mobile */}
                    <div className="flex items-center gap-2 sm:gap-4 text-sm text-muted-foreground mt-1 flex-wrap">
                      {/* Entry Fee */}
                      {(() => {
                        const isRanked = room.entryFeeSol > 0;
                        return (
                          <span className={`flex items-center gap-1 shrink-0 ${isRanked ? 'text-foreground font-medium' : ''}`}>
                            <Coins className="h-3.5 w-3.5" />
                            {isRanked ? `${room.entryFeeSol} SOL` : <span className="text-muted-foreground italic">—</span>}
                          </span>
                        );
                      })()}
                      {/* Winning (Prize Pool) */}
                      <span className="flex items-center gap-1 shrink-0 text-amber-400">
                        <Trophy className="h-3.5 w-3.5" />
                        {room.entryFeeSol > 0 
                          ? `~${(room.entryFeeSol * room.maxPlayers * 0.95).toFixed(4)} SOL`
                          : <span className="text-muted-foreground italic">—</span>}
                      </span>
                      {/* Players */}
                      <span className="flex items-center gap-1 shrink-0">
                        <Users className="h-3.5 w-3.5" />
                        {room.playerCount}/{room.maxPlayers}
                      </span>
                      {/* Turn Time - always show */}
                      <span className="flex items-center gap-1 shrink-0">
                        <Clock className="h-3.5 w-3.5 text-amber-400" />
                        {room.turnTimeSec > 0 ? `${room.turnTimeSec}s` : <span className="text-muted-foreground italic">—</span>}
                      </span>
                      {/* Creator wallet only on larger screens */}
                      <span className="hidden md:flex items-center gap-1 truncate">
                        {room.creator.slice(0, 4)}...{room.creator.slice(-4)}
                      </span>
                    </div>
                  </div>

                  {/* Join Button */}
                  <Button 
                    variant="default" 
                    size="sm"
                    title={hookBlockingRoom ? t("roomList.resolveFirst") : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      // Smart blocking: use pre-computed blockingRoom from hook
                      console.log("[Join] clicked, blockingRoom:", hookBlockingRoom?.pda?.slice(0, 8));
                      if (hookBlockingRoom) {
                        console.log("[Join] BLOCKED - showing modal");
                        setModalBlockingRoom(hookBlockingRoom);
                        setShowUnresolvedModal(true);
                        return;
                      }
                      navigate(`/room/${room.pda}`);
                    }}
                  >
                    Join
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Connected wallet info */}
      <p className="text-xs text-muted-foreground text-center mt-6">
        {isConnected 
          ? `Connected: ${address?.slice(0, 8)}...${address?.slice(-4)}`
          : "Connect wallet to create or join rooms"
        }
      </p>

      {/* Resolve Room Modal */}
      {selectedRoomForResolve && address && (
        <ResolveRoomModal
          open={resolveModalOpen}
          onClose={() => {
            setResolveModalOpen(false);
            setSelectedRoomForResolve(null);
          }}
          roomPda={selectedRoomForResolve.pda}
          roomData={{
            playerCount: selectedRoomForResolve.playerCount,
            creator: selectedRoomForResolve.creator,
            status: selectedRoomForResolve.status,
            stakeLamports: selectedRoomForResolve.entryFeeSol * 1e9,
            gameType: selectedRoomForResolve.gameTypeName.toLowerCase(),
            roomId: selectedRoomForResolve.roomId,
          }}
          walletAddress={address}
          onResolved={() => {
            fetchRooms();
            setMyOnChainRooms([]);
          }}
        />
      )}

      {/* Unresolved Room Modal - shows when trying to join/create with a blocking room */}
      <UnresolvedRoomModal
        open={showUnresolvedModal}
        onClose={() => setShowUnresolvedModal(false)}
        room={modalBlockingRoom}
        onResolve={(roomPda) => {
          setShowUnresolvedModal(false);
          navigate(`/room/${roomPda}`);
        }}
      />
    </div>
  );
}
