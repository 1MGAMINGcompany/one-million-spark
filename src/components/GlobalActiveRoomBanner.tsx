import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Users, X } from "lucide-react";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { RoomStatus, isOpenStatus } from "@/lib/solana-program";
import { toast } from "@/hooks/use-toast";
import { AudioManager } from "@/lib/AudioManager";
import { showBrowserNotification } from "@/lib/pushNotifications";
import { archiveRoom } from "@/lib/roomArchive";

// REMOVED: GAME_ROUTES - game type comes from on-chain data via /play/:pda, not URL

export function GlobalActiveRoomBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { connected } = useWallet();
  const { activeRoom } = useSolanaRooms();
  
  // Note: Active room polling is now centralized in useSolanaRooms
  // This component only CONSUMES activeRoom - it doesn't trigger fetches
  
  const previousStatusRef = useRef<number | null>(null);
  const hasNavigatedRef = useRef(false);

  // Handle status change to STARTED - notify and redirect
  useEffect(() => {
    if (!activeRoom) {
      previousStatusRef.current = null;
      hasNavigatedRef.current = false;
      return;
    }

    const currentStatus = activeRoom.status;
    const prevStatus = previousStatusRef.current;

    // Detect transition from Open (0 or 1) to Started (2)
    if (
      prevStatus !== null &&
      isOpenStatus(prevStatus) &&
      currentStatus === RoomStatus.Started &&
      !hasNavigatedRef.current
    ) {
      hasNavigatedRef.current = true;

      // Play sound
      AudioManager.playPlayerJoined();

      // Show browser notification
      showBrowserNotification(
        "🎮 Opponent Joined!",
        `Your ${activeRoom.gameTypeName} game is ready to start!`
      );

      // Show toast
      toast({
        title: "🎮 Opponent joined — your game is ready!",
        description: `Navigate to your ${activeRoom.gameTypeName} room`,
      });

      // Navigate directly to PLAY route (game is Started)
      navigate(`/play/${activeRoom.pda}`);
    }

    previousStatusRef.current = currentStatus;
  }, [activeRoom, navigate]);

  // Don't show banner if no active room or not connected
  if (!connected || !activeRoom) {
    return null;
  }

  // Don't show if already on the room page or play page for this room
  const isOnRoomPage = location.pathname === `/room/${activeRoom.pda}`;
  const isOnPlayPage = location.pathname === `/play/${activeRoom.pda}`;
  
  if (isOnRoomPage || isOnPlayPage) {
    return null;
  }

  const isStarted = activeRoom.status === RoomStatus.Started;
  const isWaiting = isOpenStatus(activeRoom.status);

  const handleEnterGame = () => {
    // Use canonical /play/:pda route - game type comes from on-chain data
    navigate(`/play/${activeRoom.pda}`);
  };

  const handleViewRoom = () => {
    navigate(`/room/${activeRoom.pda}`);
  };

  const handleDismiss = () => {
    archiveRoom(activeRoom.pda);
    toast({
      title: "Banner dismissed",
      description: "This room has been hidden from the banner.",
    });
  };

  if (isStarted) {
    return (
      <div className="fixed top-16 left-0 right-0 z-40 px-4 py-2">
        <Card className="border-primary/50 bg-primary/10 backdrop-blur max-w-4xl mx-auto animate-fade-in">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <Play className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-primary text-sm sm:text-base truncate">
                    Game Ready — Opponent Joined!
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    {activeRoom.gameTypeName} • {activeRoom.entryFeeSol} SOL
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={handleEnterGame} size="sm" className="shrink-0">
                  <Play className="h-4 w-4 mr-1 sm:mr-2" />
                  <span className="hidden sm:inline">Enter Game</span>
                  <span className="sm:hidden">Play</span>
                </Button>
                <Button onClick={handleDismiss} size="sm" variant="ghost" className="shrink-0 h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isWaiting) {
    return (
      <div className="fixed top-16 left-0 right-0 z-40 px-4 py-2">
        <Card className="border-amber-500/50 bg-amber-500/10 backdrop-blur max-w-4xl mx-auto">
          <CardContent className="p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5 text-amber-500" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-amber-500 text-sm sm:text-base truncate">
                    Waiting for Opponent
                  </p>
                  <p className="text-xs sm:text-sm text-muted-foreground truncate">
                    {activeRoom.gameTypeName} • Room #{activeRoom.roomId}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleViewRoom} size="sm" className="shrink-0">
                  <span className="hidden sm:inline">View Room</span>
                  <span className="sm:hidden">View</span>
                </Button>
                <Button onClick={handleDismiss} size="sm" variant="ghost" className="shrink-0 h-8 w-8 p-0">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
