import { useEffect } from "react";
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
  Clock
} from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { SOLANA_ENABLED, getSolanaCluster, formatSol } from "@/lib/solana-config";

export default function RoomList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { rooms, loading, error, programReady, fetchRooms } = useSolanaRooms();

  const targetCluster = getSolanaCluster();

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    if (isConnected && SOLANA_ENABLED && programReady) {
      fetchRooms();
      
      const interval = setInterval(() => {
        fetchRooms();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [isConnected, programReady]);

  if (!isConnected) {
    return <WalletRequired message="Connect your Solana wallet to browse game rooms." />;
  }

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

  // Program not ready (placeholder program ID)
  if (!programReady) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-cinzel">{t("roomList.title")}</h1>
        </div>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="py-12">
            <div className="text-center">
              <AlertTriangle className="h-16 w-16 text-yellow-500 mx-auto mb-4" />
              <h3 className="text-xl font-semibold mb-2">Solana Program Not Deployed</h3>
              <p className="text-muted-foreground mb-4">
                The on-chain program is being configured. Check back soon!
              </p>
              <p className="text-xs text-muted-foreground">
                Network: {targetCluster === "mainnet-beta" ? "Mainnet" : "Devnet"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getGameIcon = (gameType: number) => {
    const icons: Record<number, string> = {
      0: "♟️", // Chess
      1: "🎲", // Backgammon
      2: "⚫", // Checkers
      3: "🁡", // Dominos
      4: "🎯", // Ludo
    };
    return icons[gameType] || "🎮";
  };

  const getGameName = (gameType: number) => {
    const names: Record<number, string> = {
      0: "Chess",
      1: "Backgammon", 
      2: "Checkers",
      3: "Dominos",
      4: "Ludo",
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
            onClick={() => fetchRooms()}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button onClick={() => navigate("/create-room")}>
            <Plus className="h-4 w-4 mr-2" />
            {t("roomList.createRoom")}
          </Button>
        </div>
      </div>

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
              <Button onClick={() => navigate("/create-room")} size="lg">
                <Plus className="h-5 w-5 mr-2" />
                Create the First Room
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
              key={room.roomId} 
              className="border-border/50 bg-card/80 backdrop-blur hover:bg-card/90 transition-colors cursor-pointer"
              onClick={() => navigate(`/room/${room.roomId}`)}
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
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Coins className="h-3.5 w-3.5" />
                        {room.entryFeeSol} SOL
                      </span>
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
                    onClick={(e) => {
                      e.stopPropagation();
                      navigate(`/room/${room.roomId}`);
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
        Connected: {address?.slice(0, 8)}...{address?.slice(-4)}
      </p>
    </div>
  );
}
