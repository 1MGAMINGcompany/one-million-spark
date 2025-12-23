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

import { useEffect, useState, lazy, Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { parseRoomAccount, GameType, RoomStatus, isOpenStatus } from "@/lib/solana-program";
import { validatePublicKey } from "@/lib/solana-utils";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Lazy load game components for better performance
const Room = lazy(() => import("./Room"));
const ChessGame = lazy(() => import("./ChessGame"));
const DominosGame = lazy(() => import("./DominosGame"));
const BackgammonGame = lazy(() => import("./BackgammonGame"));
const CheckersGame = lazy(() => import("./CheckersGame"));
const LudoGame = lazy(() => import("./LudoGame"));

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

export default function RoomRouter() {
  const { roomPda: roomPdaParam } = useParams<{ roomPda: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<{
    gameType: GameType;
    status: number;
    playerCount: number;
  } | null>(null);

  useEffect(() => {
    async function fetchRoomData() {
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
  }, [roomPdaParam, connection]);

  // Loading state
  if (loading) {
    return <GameLoading />;
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
            <Button onClick={() => navigate("/room-list")}>
              Back to Room List
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // No room data - shouldn't happen but handle gracefully
  if (!roomData) {
    return <GameLoading />;
  }

  // Determine which component to render based on status and gameType
  const isWaiting = isOpenStatus(roomData.status);
  const isStarted = roomData.status === RoomStatus.Started;
  const isFinished = roomData.status === RoomStatus.Finished;

  // If room is waiting (Open) or finished, show the Room lobby/details page
  if (isWaiting || isFinished) {
    return (
      <Suspense fallback={<GameLoading />}>
        <Room />
      </Suspense>
    );
  }

  // If room is started (In Progress), render the appropriate game component
  if (isStarted) {
    const GameComponent = getGameComponent(roomData.gameType);
    return (
      <Suspense fallback={<GameLoading />}>
        <GameComponent />
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

/**
 * Get the correct game component based on gameType from on-chain data.
 * This is the ONLY place where gameType determines the game view.
 */
function getGameComponent(gameType: GameType) {
  switch (gameType) {
    case GameType.Chess:
      return ChessGame;
    case GameType.Dominos:
      return DominosGame;
    case GameType.Backgammon:
      return BackgammonGame;
    case GameType.Checkers:
      return CheckersGame;
    case GameType.Ludo:
      return LudoGame;
    default:
      console.warn("[RoomRouter] Unknown gameType:", gameType, "- defaulting to Room");
      return Room;
  }
}
