import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake, Timer } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom, usePlayersOf } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { GameVerificationPanel } from "@/components/GameVerificationPanel";
import { GameChat, useChatMessages } from "@/components/GameChat";
import { useGameSync, useTurnTimer, ChessMove } from "@/hooks/useGameSync";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTimeoutForfeit } from "@/hooks/useTimeoutForfeit";
import { useGameNotifications } from "@/hooks/useGameNotifications";
import { useWallet } from "@/hooks/useWallet";
import { useState, useCallback, useEffect } from "react";
import { Chess, Square } from "chess.js";
import { useToast } from "@/hooks/use-toast";

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const { data: players } = usePlayersOf(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const [game, setGame] = useState(() => new Chess());
  const [, setFen] = useState(game.fen());
  const [moveHistory, setMoveHistory] = useState<Array<{ move: number; white: string; black: string }>>([]);
  const [gameEnded, setGameEnded] = useState(false);

  // Chat messages
  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  // Apply opponent's move
  const handleOpponentMove = useCallback((move: ChessMove) => {
    try {
      game.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || undefined,
      });
      setFen(game.fen());
      updateMoveHistory();
    } catch (e) {
      console.error("Failed to apply opponent move:", e);
    }
  }, [game]);

  const handleGameEnd = useCallback((winner: string) => {
    setGameEnded(true);
    const isWinner = winner?.toLowerCase() === address?.toLowerCase();
    toast({
      title: isWinner ? t('game.victory') : t('game.defeat'),
      description: isWinner 
        ? t('game.victoryDescription') 
        : t('game.defeatDescription'),
    });
  }, [address, toast, t]);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    toast({
      title: t('game.opponentResigned'),
      description: t('game.opponentResignedDescription'),
    });
  }, [toast, t]);

  // Handle WebRTC messages
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    switch (message.type) {
      case "move":
        if (message.payload) {
          handleOpponentMove(message.payload as ChessMove);
        }
        break;
      case "resign":
        handleOpponentResign();
        break;
      case "draw_offer":
        toast({
          title: t('game.drawOffered'),
          description: t('game.drawOfferedDescription'),
        });
        break;
      case "chat":
        if (message.payload && message.sender) {
          receiveMessage(message.payload, message.sender);
        }
        break;
    }
  }, [handleOpponentMove, handleOpponentResign, receiveMessage, toast]);

  // WebRTC P2P sync (primary)
  const {
    isConnected: webrtcConnected,
    isPushEnabled,
    connectionState: webrtcState,
    sendMove: webrtcSendMove,
    sendResign: webrtcSendResign,
    sendDrawOffer: webrtcSendDrawOffer,
    sendChat: webrtcSendChat,
    reconnect: webrtcReconnect,
    peerAddress,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: (players as string[]) || [],
    onMessage: handleWebRTCMessage,
    enabled: !!players && players.length >= 2,
  });

  // Fallback BroadcastChannel sync
  const {
    gameState,
    isConnected: bcConnected,
    opponentConnected: bcOpponentConnected,
    isMyTurn,
    sendMove: bcSendMove,
    sendResign: bcSendResign,
    sendDrawOffer: bcSendDrawOffer,
  } = useGameSync({
    roomId: roomId || "",
    gameType: "chess",
    onOpponentMove: handleOpponentMove as any,
    onGameEnd: handleGameEnd,
    onOpponentResign: handleOpponentResign,
  });

  // Combined connection status - prefer WebRTC
  const isConnected = webrtcConnected || bcConnected;
  const opponentConnected = webrtcConnected || bcOpponentConnected;

  // Get opponent address
  const opponentAddress = peerAddress || gameState?.players.find(
    (p) => p.toLowerCase() !== address?.toLowerCase()
  );

  // Turn timer
  const remainingTime = useTurnTimer(
    isMyTurn,
    gameState?.turnTimeSeconds || 300,
    gameState?.turnStartedAt || Date.now(),
    () => {
      toast({
        title: t('game.timesUp'),
        description: t('game.ranOutOfTime'),
        variant: "destructive",
      });
    }
  );

  // Timeout forfeit logic - claim victory when opponent times out
  const {
    canClaimTimeout,
    isClaiming,
    claimTimeoutVictory,
  } = useTimeoutForfeit({
    roomId: roomIdBigInt || BigInt(0),
    opponentAddress,
    isMyTurn,
    turnTimeSeconds: gameState?.turnTimeSeconds || 300,
    turnStartedAt: gameState?.turnStartedAt || Date.now(),
    gameEnded,
    onTimeoutClaimed: () => setGameEnded(true),
  });

  const handleClaimTimeout = useCallback(() => {
    if (address) {
      claimTimeoutVictory(address);
    }
  }, [address, claimTimeoutVictory]);

  // Push Protocol notifications
  const { notifyYourTurn, notifyOpponentMoved, notifyGameEnded } = useGameNotifications({
    address,
    roomId: roomId || "",
    gameType: "chess",
    opponentAddress,
    enabled: !!players && players.length >= 2,
  });

  // Determine game winner
  const getWinner = useCallback((): `0x${string}` | null => {
    if (!gameEnded || !gameState?.players) return null;
    // Logic to determine winner based on game state
    // For now, return null - actual winner is set when game ends
    return null;
  }, [gameEnded, gameState?.players]);
  // Update move history helper
  const updateMoveHistory = useCallback(() => {
    const history = game.history();
    const moves: Array<{ move: number; white: string; black: string }> = [];
    for (let i = 0; i < history.length; i += 2) {
      moves.push({
        move: Math.floor(i / 2) + 1,
        white: history[i] || "",
        black: history[i + 1] || "...",
      });
    }
    setMoveHistory(moves);
  }, [game]);

  const handleMove = useCallback((from: Square, to: Square): boolean => {
    // Only allow moves on your turn
    if (!isMyTurn && gameState?.status === "playing") {
      toast({
        title: t('game.notYourTurn'),
        description: t('game.waitForOpponent'),
        variant: "destructive",
      });
      return false;
    }

    try {
      const move = game.move({
        from,
        to,
        promotion: 'q',
      });
      
      if (move) {
        setFen(game.fen());
        updateMoveHistory();

        // Send move to opponent via WebRTC (primary) and BroadcastChannel (fallback)
        const chessMove: Omit<ChessMove, "timestamp"> = {
          type: "chess",
          from,
          to,
          promotion: move.promotion || undefined,
          fen: game.fen(),
        };
        
        // Try WebRTC first, fallback to BroadcastChannel
        if (webrtcConnected) {
          webrtcSendMove(chessMove);
        } else {
          bcSendMove(chessMove);
        }

        // Notify opponent it's their turn
        notifyYourTurn();

        return true;
      }
    } catch (e) {
      // Invalid move
    }
    return false;
  }, [game, isMyTurn, gameState?.status, webrtcConnected, webrtcSendMove, bcSendMove, toast, updateMoveHistory]);

  const handleResign = useCallback(() => {
    if (confirm(t('game.confirmResign'))) {
      if (webrtcConnected) {
        webrtcSendResign();
      } else {
        bcSendResign();
      }
      setGameEnded(true);
      toast({
        title: t('game.youResigned'),
        description: t('game.gameOver'),
      });
    }
  }, [webrtcConnected, webrtcSendResign, bcSendResign, toast, t]);

  const handleOfferDraw = useCallback(() => {
    if (webrtcConnected) {
      webrtcSendDrawOffer();
    } else {
      bcSendDrawOffer();
    }
  }, [webrtcConnected, webrtcSendDrawOffer, bcSendDrawOffer]);

  // Handle sending chat message
  const handleSendChat = useCallback((text: string) => {
    addChatMessage(text);
    if (webrtcConnected) {
      webrtcSendChat(text);
    }
  }, [addChatMessage, webrtcConnected, webrtcSendChat]);

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('gameAI.chess')} – {t('game.room')} #{roomId}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('game.prizePool')}: {prizePool} POL {room && `(~${formatUsd(parseFloat(prizePool))})`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-1 rounded ${isMyTurn ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {isMyTurn ? t('game.yourTurn') : t('game.opponentsTurn')}
            </span>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN - Chess Board */}
          <div className="flex-1 flex flex-col items-center gap-4">
            <div className="w-full max-w-[min(100%,calc(100vh-280px))]">
              <ChessBoardPremium
                game={game}
                onMove={handleMove}
                disabled={gameEnded || !isMyTurn}
              />
            </div>
            {/* Chat Button - below board */}
            <GameChat
              roomId={roomId || ""}
              playerAddress={address}
              onSendMessage={handleSendChat}
              messages={chatMessages}
            />
          </div>

          {/* RIGHT COLUMN - Info Panels */}
          <div className="w-full lg:w-80 space-y-4">
            {/* Connection Status */}
            <GameSyncStatus
              isConnected={isConnected}
              opponentConnected={opponentConnected}
              isMyTurn={isMyTurn}
              remainingTime={remainingTime}
              playerAddress={address}
              opponentAddress={opponentAddress}
              connectionType={webrtcConnected ? "webrtc" : bcConnected ? "broadcast" : "none"}
              isPushEnabled={isPushEnabled}
              onReconnect={webrtcReconnect}
            />

            {/* Game Status */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.gameStatus')}</h3>
              <p className="text-foreground font-medium">
                {gameEnded ? t('game.gameOver') :
                 game.isCheckmate() ? t('game.checkmate') : 
                 game.isStalemate() ? t('game.stalemate') :
                 game.isDraw() ? t('game.draw') :
                 game.isCheck() ? t('game.check') :
                 `${game.turn() === 'w' ? t('game.white') : t('game.black')} ${t('game.toMove')}`}
              </p>
            </div>

            {/* Move List */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.moveList')}</h3>
              <div className="h-40 overflow-y-auto space-y-1 text-sm">
                {moveHistory.length === 0 ? (
                  <p className="text-muted-foreground">{t('game.noMovesYet')}</p>
                ) : (
                  moveHistory.map((m) => (
                    <div key={m.move} className="flex gap-2 text-foreground">
                      <span className="text-muted-foreground w-6">{m.move}.</span>
                      <span className="flex-1">{m.white}</span>
                      <span className="flex-1">{m.black}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Claim Timeout Button */}
            {canClaimTimeout && !gameEnded && (
              <Button
                onClick={handleClaimTimeout}
                disabled={isClaiming}
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Timer size={16} />
                {isClaiming ? t('game.claimingVictory') : t('game.claimTimeoutVictory')}
              </Button>
            )}

            {/* Action Buttons */}
            {!gameEnded && (
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2"
                  onClick={handleOfferDraw}
                  disabled={!opponentConnected}
                >
                  <Handshake size={16} />
                  {t('game.offerDraw')}
                </Button>
                <Button 
                  variant="outline" 
                  className="flex-1 gap-2 text-destructive hover:text-destructive"
                  onClick={handleResign}
                >
                  <Flag size={16} />
                  {t('game.resign')}
                </Button>
              </div>
            )}

            {/* Game Verification Panel - show when game ends */}
            {gameEnded && (
              <GameVerificationPanel
                roomId={roomIdBigInt || BigInt(0)}
                gameType="chess"
                finalState={game.fen()}
                winner={getWinner()}
                playerAddress={address}
                onResultSubmitted={() => navigate("/")}
              />
            )}
          </div>
        </div>

        {/* Back to Lobby */}
        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} className="mr-2" />
              {t('game.returnToLobby')}
            </Link>
          </Button>
        </div>

        {/* Game Info Box */}
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t('game.howItWorks')}</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.chessWinCondition')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.chessDrawCondition')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.entryFeesHeld')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.winnerReceives')}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;
