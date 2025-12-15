import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Users, RefreshCw, Loader2, Clock, AlertTriangle, Radio } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { useSound } from "@/contexts/SoundContext";
import { useToast } from "@/hooks/use-toast";
import { useJoinRoomV5 } from "@/hooks/useRoomManagerV5";
import { usePublicRooms, type PublicRoom } from "@/hooks/usePublicRooms";
import { usePlayerActiveRoom } from "@/hooks/usePlayerActiveRoom";
import { useRoomContractEvents } from "@/hooks/useRoomContractEvents";

// Local helpers for V7
function getGameName(gameId: number): string {
  const names: Record<number, string> = { 1: "Chess", 2: "Dominos", 3: "Backgammon", 4: "Checkers", 5: "Ludo" };
  return names[gameId] || `Game ${gameId}`;
}

function unitsToUsdt(units: bigint): number {
  return Number(units) / 1_000_000;
}

function formatTurnTime(turnTimeSec: number): string {
  if (turnTimeSec === 0) return "Unlimited";
  return `${turnTimeSec} sec`;
}

const RoomList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConnected, address } = useWallet();
  const { play } = useSound();
  const { toast } = useToast();
  const [gameFilter, setGameFilter] = useState("all");
  const [feeFilter, setFeeFilter] = useState("all");
  const [joiningRoomId, setJoiningRoomId] = useState<bigint | null>(null);

  // Check if player has an active room they created
  const { activeRoom, hasActiveRoom, isLoading: isCheckingActiveRoom } = usePlayerActiveRoom(address as `0x${string}` | undefined);

  const { rooms, isLoading: isLoadingRooms, refetch } = usePublicRooms();
  const [isLive, setIsLive] = useState(true);

  // Real-time contract event listeners
  const handleRoomCreated = useCallback((roomId: bigint, creator: string, isPrivate: boolean) => {
    if (!isPrivate) {
      // Only refetch for public rooms
      console.log("[RoomList] New public room created, refreshing...");
      play('ui_notify');
      refetch();
      toast({
        title: t("roomList.newRoomCreated"),
        description: t("roomList.newRoomCreatedDesc"),
      });
    }
  }, [refetch, toast, t, play]);

  const handleRoomJoined = useCallback((roomId: bigint) => {
    console.log("[RoomList] Room joined, refreshing...");
    refetch();
  }, [refetch]);

  const handleRoomCancelled = useCallback((roomId: bigint) => {
    console.log("[RoomList] Room cancelled, refreshing...");
    refetch();
  }, [refetch]);

  const handleGameStarted = useCallback((roomId: bigint) => {
    console.log("[RoomList] Game started, refreshing...");
    refetch();
  }, [refetch]);

  // Subscribe to contract events when live mode is enabled
  useRoomContractEvents(isLive ? {
    onRoomCreated: handleRoomCreated,
    onRoomJoined: handleRoomJoined,
    onRoomCancelled: handleRoomCancelled,
    onGameStarted: handleGameStarted,
  } : {});

  useEffect(() => {
    if (searchParams.get("refresh") === "1") {
      refetch();
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, refetch, setSearchParams]);

  const { 
    joinRoom, 
    isPending: isJoinPending, 
    isConfirming: isJoinConfirming, 
    isSuccess: isJoinSuccess, 
    error: joinError, 
    reset: resetJoin 
  } = useJoinRoomV5();

  useEffect(() => {
    if (isJoinSuccess && joiningRoomId) {
      play('room_enter');
      toast({
        title: t("roomList.joinedRoom"),
        description: t("roomList.joinedRoomDesc"),
      });
      navigate(`/room/${joiningRoomId.toString()}`);
      setJoiningRoomId(null);
      resetJoin();
      refetch();
    }
  }, [isJoinSuccess, joiningRoomId, play, toast, resetJoin, refetch, navigate, t]);

  useEffect(() => {
    if (joinError) {
      toast({
        title: t("roomList.failedToJoin"),
        description: joinError.message || t("errors.transactionFailed"),
        variant: "destructive",
      });
      setJoiningRoomId(null);
      resetJoin();
    }
  }, [joinError, toast, resetJoin, t]);

  const handleRefresh = () => {
    play('ui_click');
    refetch();
  };

  const handleJoinRoom = (room: PublicRoom) => {
    if (room.creator.toLowerCase() === address?.toLowerCase()) {
      toast({
        title: t("roomList.cannotJoin"),
        description: t("roomList.cannotJoinOwn"),
        variant: "destructive",
      });
      return;
    }

    // Block joining if player has an active room
    if (hasActiveRoom && activeRoom) {
      toast({
        title: t("roomList.cannotJoin"),
        description: t("roomList.cannotJoinActiveRoom", { roomId: activeRoom.id.toString() }),
        variant: "destructive",
      });
      return;
    }

    play('ui_click');
    setJoiningRoomId(room.id);
    joinRoom(room.id);
  };

  if (!isConnected) {
    return <WalletRequired />;
  }

  const isJoining = isJoinPending || isJoinConfirming;

  const getJoinButtonText = (roomId: bigint) => {
    if (joiningRoomId !== roomId) return t("roomList.joinRoom");
    if (isJoinPending) return t("roomList.confirmInWallet");
    if (isJoinConfirming) return t("roomList.processing");
    return t("roomList.joinRoom");
  };

  const GAME_ID_MAP: Record<string, number> = {
    chess: 1,
    dominos: 2,
    backgammon: 3,
    checkers: 4,
    ludo: 5,
  };

  const filteredRooms = rooms.filter(room => {
    if (gameFilter !== "all") {
      const targetGameId = GAME_ID_MAP[gameFilter];
      if (room.gameId !== targetGameId) return false;
    }
    
    const feeInUsdt = unitsToUsdt(room.entryFee);
    
    switch (feeFilter) {
      case "lt1":
        if (feeInUsdt >= 1) return false;
        break;
      case "lt5":
        if (feeInUsdt >= 5) return false;
        break;
      case "lt10":
        if (feeInUsdt >= 10) return false;
        break;
      case "lt50":
        if (feeInUsdt >= 50) return false;
        break;
      case "gt50":
        if (feeInUsdt <= 50) return false;
        break;
      case "gt100":
        if (feeInUsdt <= 100) return false;
        break;
    }
    
    return true;
  });

  return (
    <div className="min-h-screen bg-background px-4 py-12">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-3xl font-bold text-foreground mb-8 text-center">
          {t("roomList.title")}
        </h1>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8 items-center">
          <div className="flex-1 w-full">
            <Select value={gameFilter} onValueChange={setGameFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("roomList.gameType")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("roomList.allGames")}</SelectItem>
                <SelectItem value="chess">{t("games.chess")}</SelectItem>
                <SelectItem value="dominos">{t("games.dominos")}</SelectItem>
                <SelectItem value="backgammon">{t("games.backgammon")}</SelectItem>
                <SelectItem value="checkers">{t("games.checkers")}</SelectItem>
                <SelectItem value="ludo">{t("games.ludo")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex-1 w-full">
            <Select value={feeFilter} onValueChange={setFeeFilter}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("roomList.entryFeeRange")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("roomList.allFees")}</SelectItem>
                <SelectItem value="lt1">{t("roomList.lessThan")} $1</SelectItem>
                <SelectItem value="lt5">{t("roomList.lessThan")} $5</SelectItem>
                <SelectItem value="lt10">{t("roomList.lessThan")} $10</SelectItem>
                <SelectItem value="lt50">{t("roomList.lessThan")} $50</SelectItem>
                <SelectItem value="gt50">{t("roomList.above")} $50</SelectItem>
                <SelectItem value="gt100">{t("roomList.above")} $100</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button 
            variant="outline" 
            size="icon" 
            className="shrink-0" 
            onClick={handleRefresh}
            disabled={isLoadingRooms}
          >
            <RefreshCw size={18} className={isLoadingRooms ? "animate-spin" : ""} />
          </Button>
          {/* Live indicator */}
          <Button
            variant={isLive ? "default" : "outline"}
            size="sm"
            className={`shrink-0 gap-2 ${isLive ? "bg-green-600 hover:bg-green-700" : ""}`}
            onClick={() => setIsLive(!isLive)}
          >
            <Radio size={14} className={isLive ? "animate-pulse" : ""} />
            {isLive ? t("roomList.live") : t("roomList.paused")}
          </Button>
        </div>

        {/* Active Room Warning Banner */}
        {hasActiveRoom && activeRoom && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div className="flex-1">
              <p className="font-medium text-destructive">
                {t("roomList.activeRoomWarning", { roomId: activeRoom.id.toString() })}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("roomList.activeRoomWarningDesc")}
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/room/${activeRoom.id.toString()}`)}
            >
              {t("roomList.goToRoom")}
            </Button>
          </div>
        )}

        {/* Room List */}
        <div className="space-y-4">
          {isLoadingRooms && rooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <p>{t("roomList.loadingRooms")}</p>
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>{t("roomList.noRooms")}</p>
            </div>
          ) : (
            filteredRooms.map((room) => (
              <div
                key={room.id.toString()}
                className="bg-card border border-border rounded-lg p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-foreground">
                    {getGameName(room.gameId)}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {t("roomList.entryFee")}: ${unitsToUsdt(room.entryFee).toFixed(2)} USDT
                  </p>
                </div>
                <div className="flex items-center gap-4 text-muted-foreground">
                  <div className="flex items-center gap-1.5" title="Players">
                    <Users size={16} />
                    <span className="text-sm">
                      {room.playerCount} / {room.maxPlayers}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5" title="Time per turn">
                    <Clock size={16} />
                    <span className="text-sm">
                      {formatTurnTime(room.turnTimeSec)}
                    </span>
                  </div>
                </div>
                <Button 
                  size="sm" 
                  onClick={() => handleJoinRoom(room)}
                  disabled={isJoining && joiningRoomId === room.id}
                >
                  {isJoining && joiningRoomId === room.id ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {getJoinButtonText(room.id)}
                    </>
                  ) : (
                    t("roomList.joinRoom")
                  )}
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomList;
