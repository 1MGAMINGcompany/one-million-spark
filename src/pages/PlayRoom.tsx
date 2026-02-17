/**
 * PlayRoom: Canonical /play/:roomPda route for game rendering
 * 
 * CRITICAL: Game type is determined ONLY from on-chain room.gameType
 * URL parameters are NEVER used to determine game type.
 * This permanently fixes "Dominos card opens Backgammon" bug.
 */

import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";
import { useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { parseRoomAccount, GameType, RoomStatus, isOpenStatus, GAME_TYPE_NAMES } from "@/lib/solana-program";
import { validatePublicKey } from "@/lib/solana-utils";
import { Loader2, AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// Lazy load game components for better performance
const ChessGame = lazy(() => import("./ChessGame"));
const DominosGame = lazy(() => import("./DominosGame"));
const BackgammonGame = lazy(() => import("./BackgammonGame"));
const CheckersGame = lazy(() => import("./CheckersGame"));
const LudoGame = lazy(() => import("./LudoGame"));

// Loading fallback component
function GameLoading({ gameName }: { gameName?: string }) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">
          {gameName ? `Loading ${gameName}...` : "Loading game..."}
        </p>
      </div>
    </div>
  );
}

interface RoomData {
  gameType: GameType;
  status: number;
  playerCount: number;
  maxPlayers: number;
  roomId: number;
}

export default function PlayRoom() {
  const { roomPda: roomPdaParam } = useParams<{ roomPda: string }>();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { t } = useTranslation();
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    setRetryCount(prev => prev + 1);
  }, []);

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
        console.log("[PlayRoom] roomPdaParam=", roomPdaParam, "accountInfo=", !!accountInfo);

        if (!accountInfo) {
          setError("Room not found");
          setLoading(false);
          return;
        }

        // Parse room data to get gameType
        const data = Buffer.from(accountInfo.data);
        const parsed = parseRoomAccount(data);

        if (!parsed) {
          setError("Failed to parse room data");
          setLoading(false);
          return;
        }

        console.log("[PlayRoom] Room data loaded from on-chain:", {
          pda: roomPdaParam.slice(0, 8),
          gameType: parsed.gameType,
          gameTypeName: GAME_TYPE_NAMES[parsed.gameType],
          status: parsed.status,
          playerCount: parsed.playerCount,
        });

        // Check if room is in progress
        if (parsed.status !== RoomStatus.Started) {
          console.log("[PlayRoom] Room not in progress, redirecting to lobby");
          navigate(`/room/${roomPdaParam}`, { replace: true });
          return;
        }

        setRoomData({
          gameType: parsed.gameType,
          status: parsed.status,
          playerCount: parsed.playerCount,
          maxPlayers: parsed.maxPlayers,
          roomId: parsed.roomId,
        });
      } catch (e: any) {
        console.error("[PlayRoom] Failed to fetch room:", e);
        setError(e?.message ?? "Failed to load room");
      } finally {
        setLoading(false);
      }
    }

    fetchRoomData();
  }, [roomPdaParam, connection, navigate, retryCount]);

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
              {t("playRoom.roomLinkInvalid")}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("playRoom.retry")}
              </Button>
              <Button variant="outline" onClick={() => navigate(-1)}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t("playRoom.goBack")}
              </Button>
              <Button onClick={() => navigate("/room-list")}>
                {t("playRoom.browseRooms")}
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
            <h3 className="text-xl font-semibold mb-2">{t("playRoom.roomNotFound")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("playRoom.roomLoadFailed")}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={handleRetry}>
                <RefreshCw className="h-4 w-4 mr-2" />
                {t("playRoom.retry")}
              </Button>
              <Button onClick={() => navigate("/room-list")}>
                {t("playRoom.browseRooms")}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get the game component based on on-chain gameType
  const gameName = GAME_TYPE_NAMES[roomData.gameType] || "Unknown";
  const GameComponent = getGameComponent(roomData.gameType);

  if (!GameComponent) {
    return (
      <div className="container max-w-2xl py-8 px-4">
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="text-center py-12">
            <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">{t("playRoom.unknownGameType")}</h3>
            <p className="text-muted-foreground mb-6">
              {t("playRoom.gameTypeNotSupported", { type: roomData.gameType })}
            </p>
            <Button onClick={() => navigate("/room-list")}>
              {t("playRoom.backToRoomList")}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Render the correct game component based on on-chain gameType
  return (
    <Suspense fallback={<GameLoading gameName={gameName} />}>
      <GameComponent />
    </Suspense>
  );
}

/**
 * Get the correct game component based on gameType from on-chain data.
 * This is the ONLY place where gameType determines the game view.
 * 
 * CRITICAL: Never use URL to determine game type!
 */
function getGameComponent(gameType: GameType): React.ComponentType | null {
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
      console.error("[PlayRoom] Unknown gameType:", gameType);
      return null;
  }
}
