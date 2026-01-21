import { useEffect, useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
// PublicKey import removed - we use room.pda directly as the unique identifier
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
  
  Trophy,
  Gamepad,
  Settings2
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { SOLANA_ENABLED, getSolanaCluster, formatSol, getSolanaEndpoint } from "@/lib/solana-config";
import { GameType, RoomStatus, PROGRAM_ID, isOpenStatus, RoomDisplay, isActiveStatus } from "@/lib/solana-program";
// STEP 7: getRoomMode removed - use stake-based detection for room list
import { isBlockingRoom } from "@/lib/solana-utils";
// ActiveGameBanner removed - using GlobalActiveRoomBanner from App.tsx instead
import { useToast } from "@/hooks/use-toast";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
// getRoomPda import removed - we use activeRoom.pda directly
import { ResolveRoomModal } from "@/components/ResolveRoomModal";
import { UnresolvedRoomModal } from "@/components/UnresolvedRoomModal";

import { BUILD_VERSION } from "@/lib/buildVersion";

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

  // Auto-refresh cadence:
  // - Burst: every 2s for 30s (helps rooms appear quickly after creates)
  // - Steady: every 10s after that (reduces load)
  useEffect(() => {
    if (!SOLANA_ENABLED) {
      console.log("[RoomList] SOLANA_ENABLED is false, skipping fetch");
      return;
    }

    let burstCount = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      console.log(`[RoomList] Auto-refresh (burst=${burstCount < 15})`);
      setLastFetch(new Date().toISOString());
      fetchRooms();

      burstCount += 1;

      // 2s * 15 = 30 seconds burst, then 10s steady
      const nextDelayMs = burstCount < 15 ? 2000 : 10000;
      timer = setTimeout(tick, nextDelayMs);
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
              // Smart blocking: use pre-computed blockingRoom from hook
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
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("createRoom.createRoom")}
          </Button>
        </div>
      </div>

      {/* Active Game Banner handled by GlobalActiveRoomBanner in App.tsx */}

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
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold truncate">
                        {getGameName(room.gameType)}
                      </h3>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary">
                        #{room.roomId}
                      </span>
                      {/* Mode Badge - STEP 7: Stake-only detection (no getRoomMode) */}
                      {(() => {
                        // Stake > 0 is the only reliable indicator in room list
                        const isRanked = room.entryFeeSol > 0;
                        return (
                          <span className={`text-xs px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                            isRanked 
                              ? 'bg-red-500/20 text-red-400 border-red-500/30' 
                              : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                          }`}>
                            {isRanked ? '🔴' : '🟢'} {isRanked ? t("createRoom.gameModeRanked") : t("createRoom.gameModeCasual")}
                            <span className="opacity-70">{isRanked ? '🏆' : '🎮'}</span>
                          </span>
                        );
                      })()}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      {/* Stake display - STEP 7: Stake-only detection */}
                      {(() => {
                        const isRanked = room.entryFeeSol > 0;
                        return (
                          <span className={`flex items-center gap-1 ${isRanked ? 'text-foreground font-medium' : ''}`}>
                            <Coins className="h-3.5 w-3.5" />
                            {isRanked ? (
                              `${room.entryFeeSol} SOL`
                            ) : (
                              <span className="text-muted-foreground italic">—</span>
                            )}
                          </span>
                        );
                      })()}
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {room.playerCount}/{room.maxPlayers}
                      </span>
                      <span className="hidden sm:flex items-center gap-1 truncate">
                        <Clock className="h-3.5 w-3.5" />
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
