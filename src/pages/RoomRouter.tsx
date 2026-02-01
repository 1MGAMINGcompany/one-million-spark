/**
 * RoomRouter: Canonical /room/:pda route handler
 * 
 * PDA is the ONLY source of truth:
 * 1. Fetch room account by PDA
 * 2. Read room.gameType from on-chain data
 * 3. Render the correct game component based on gameType
 * 
 * This permanently fixes "Dominos card opens Backgammon" - URL slug is never used.
 */

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { parseRoomAccount, RoomStatus, isOpenStatus } from "@/lib/solana-program";
import { validatePublicKey, isMobileDevice } from "@/lib/solana-utils";
import { isWalletInAppBrowser } from "@/lib/walletBrowserDetection";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { OpenInWalletPanel } from "@/components/OpenInWalletPanel";
import { usePendingRoute } from "@/hooks/usePendingRoute";

// Lazy load Room component - game pages are handled by /play/:roomPda
const Room = lazy(() => import("./Room"));

// Loading fallback component
function GameLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">Loading game...</p>
      </div>
    </div>
  );
}


const isValidPubkey = (s: string) => {
  try {
    // Lazy import already present in file: PublicKey from @solana/web3.js
    // If PublicKey isn't in scope, TypeScript build will tell us.
    new PublicKey(s);
    return true;
  } catch {
    return false;
  }
};

export default function RoomRouter() {
  const { roomPda: roomPdaParam } = useParams<{ roomPda: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { connected } = useWallet();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<{
    gameType: number;
    status: number;
    playerCount: number;
  } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [dismissedWalletPanel, setDismissedWalletPanel] = useState(false);
  
  // Pending route persistence
  const { setPendingRoom } = usePendingRoute();
  
  // Detect if we should show Open-in-Wallet panel
  const inWalletBrowser = isWalletInAppBrowser();
  const isRegularMobileBrowser = isMobileDevice() && !inWalletBrowser && !connected;
  const shouldShowWalletPanel = isRegularMobileBrowser && !dismissedWalletPanel;
  
  // Save pending room for post-connect navigation
  useEffect(() => {
    if (!connected && roomPdaParam) {
      setPendingRoom(roomPdaParam);
    }
  }, [connected, roomPdaParam, setPendingRoom]);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  }, []);

  useEffect(() => {
    async function fetchRoomData() {

      // ✅ CASUAL (off-chain) rooms use UUIDs, not Solana PDAs.
      // If the URL param is not a valid pubkey, skip Solana fetch and let Room handle DB-only session.
      if (roomPdaParam && !isValidPubkey(roomPdaParam)) {
        console.log("[RoomRouter] Off-chain room detected (UUID). Skipping Solana fetch:", roomPdaParam);
        setRoomData({ gameType: 1, status: 1, playerCount: 2 }); // minimal defaults; Room will fetch real session via edge
        setLoading(false);
        return;
      }
      if (!roomPdaParam) {
        setError("No room specified");
        setLoading(false);
        return;
      }

      // Validate PDA
      const validPda = validatePublicKey(roomPdaParam);
      if (!validPda) {
        setError("Invalid room link");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const roomPda = new PublicKey(roomPdaParam);
        const accountInfo = await connection.getAccountInfo(roomPda);
        console.log("[RoomRouter] roomPdaParam=", roomPdaParam, "accountInfo=", !!accountInfo);

        if (!accountInfo) {
          setError("Room not found");
          setLoading(false);
          return;
        }

        // Parse room data to get gameType and status
        const data = Buffer.from(accountInfo.data);
        const parsed = parseRoomAccount(data);

        if (!parsed) {
          setError("Failed to parse room data");
          setLoading(false);
          return;
        }

        console.log("[RoomRouter] Room data loaded:", {
          pda: roomPdaParam.slice(0, 8),
          gameType: parsed.gameType,
          status: parsed.status,
          playerCount: parsed.playerCount,
        });

        // If room is started (In Progress), redirect to canonical /play/:pda route
        // This ensures game type is determined from on-chain data, not URL
        if (parsed.status === RoomStatus.Started) {
          console.log("[RoomRouter] Room started, redirecting to /play/:pda");
          navigate(`/play/${roomPdaParam}`, { replace: true });
          return;
        }

        setRoomData({
          gameType: parsed.gameType,
          status: parsed.status,
          playerCount: parsed.playerCount,
        });
      } catch (e: any) {
        console.error("[RoomRouter] Failed to fetch room:", e);
        setError(e?.message ?? "Failed to load room");
      } finally {
        setLoading(false);
      }
    }

    fetchRoomData();
  }, [roomPdaParam, connection, navigate, retryCount]);

  // Loading state - show wallet panel if in regular mobile browser
  if (loading) {
    return (
      <>
        {shouldShowWalletPanel && (
          <OpenInWalletPanel
            currentUrl={window.location.href}
            onDismiss={() => setDismissedWalletPanel(true)}
          />
        )}
        <GameLoading />
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{error}</h3>
            <p className="text-muted-foreground mb-6">
              The room link appears to be invalid or the room no longer exists.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => navigate("/room-list")}>
                Back to Room List
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No room data after fetch completed - show error with retry, not spinner
  if (!roomData) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Room not found</h3>
            <p className="text-muted-foreground mb-6">
              Room data could not be loaded. This may be a timing issue.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
              <Button onClick={() => navigate("/room-list")}>
                Browse Rooms
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Determine which component to render based on status and gameType
  const isWaiting = isOpenStatus(roomData.status);
  const isFinished = roomData.status === RoomStatus.Finished;

  // If room is waiting (Open) or finished, show the Room lobby/details page
  if (isWaiting || isFinished) {
    return (
      <Suspense fallback={<GameLoading />}>
        <Room />
      </Suspense>
    );
  }

  // Fallback to Room for any other status
  return (
    <Suspense fallback={<GameLoading />}>
      <Room />
    </Suspense>
  );
}
