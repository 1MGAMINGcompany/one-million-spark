import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake, Timer } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom, usePlayersOf } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { GameChat, useChatMessages } from "@/components/GameChat";
import { FinishGameButton } from "@/components/FinishGameButton";
import { useGameSync, useTurnTimer } from "@/hooks/useGameSync";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTimeoutForfeit } from "@/hooks/useTimeoutForfeit";
import { useWallet } from "@/hooks/useWallet";
import { useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { MobileAppPrompt } from "@/components/MobileAppPrompt";

type Player = "gold" | "obsidian";
type PieceType = "normal" | "king";

interface Piece {
  player: Player;
  type: PieceType;
}

interface Position {
  row: number;
  col: number;
}

interface CheckersMove {
  from: Position;
  to: Position;
  captures?: Position[];
}

const BOARD_SIZE = 8;

const initializeBoard = (): (Piece | null)[][] => {
  const board: (Piece | null)[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "obsidian", type: "normal" };
      }
    }
  }
  
  for (let row = BOARD_SIZE - 3; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "gold", type: "normal" };
      }
    }
  }
  
  return board;
};

const CheckersGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const { data: players } = usePlayersOf(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const isCreator = room && address && room.creator.toLowerCase() === address.toLowerCase();
  const isRoomFull = room && (players?.length || 0) >= room.maxPlayers;
  
  const [board, setBoard] = useState<(Piece | null)[][]>(initializeBoard);
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [validMoves, setValidMoves] = useState<CheckersMove[]>([]);
  const [gameEnded, setGameEnded] = useState(false);
  const boardRef = useRef(board);
  boardRef.current = board;

  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const handleOpponentMove = useCallback((move: CheckersMove) => {
    setBoard(prevBoard => {
      const newBoard = prevBoard.map(row => [...row]);
      const piece = newBoard[move.from.row][move.from.col];
      if (!piece) return newBoard;
      
      newBoard[move.to.row][move.to.col] = { ...piece };
      newBoard[move.from.row][move.from.col] = null;
      
      if (move.captures) {
        for (const cap of move.captures) {
          newBoard[cap.row][cap.col] = null;
        }
      }
      
      if (piece.player === "gold" && move.to.row === 0) {
        newBoard[move.to.row][move.to.col]!.type = "king";
      } else if (piece.player === "obsidian" && move.to.row === BOARD_SIZE - 1) {
        newBoard[move.to.row][move.to.col]!.type = "king";
      }
      
      return newBoard;
    });
    
    if (move.captures && move.captures.length > 0) {
      play('checkers_capture');
    } else {
      play('checkers_slide');
    }
  }, [play]);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    toast({ title: t('game.opponentResigned'), description: t('game.youWin') });
    play('checkers_win');
  }, [toast, t, play]);

  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    switch (message.type) {
      case "move":
        if (message.payload) handleOpponentMove(message.payload as CheckersMove);
        break;
      case "resign":
        handleOpponentResign();
        break;
      case "draw_offer":
        toast({ title: t('game.drawOffered'), description: t('game.drawOfferedDescription') });
        break;
      case "chat":
        if (message.payload && message.sender) {
          receiveMessage(message.payload, message.sender);
        }
        break;
    }
  }, [handleOpponentMove, handleOpponentResign, receiveMessage, toast, t]);

  const {
    isConnected: webrtcConnected,
    isPushEnabled,
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

  const {
    gameState,
    isConnected: bcConnected,
    opponentConnected: bcOpponentConnected,
    isMyTurn,
    sendMove: bcSendMove,
    sendResign: bcSendResign,
  } = useGameSync({
    roomId: roomId || "",
    gameType: "checkers",
    onOpponentMove: handleOpponentMove as any,
    onGameEnd: () => setGameEnded(true),
    onOpponentResign: handleOpponentResign,
  });

  const isConnected = webrtcConnected || bcConnected;
  const opponentConnected = webrtcConnected || bcOpponentConnected;
  const opponentAddress = peerAddress || gameState?.players.find(p => p.toLowerCase() !== address?.toLowerCase());

  const remainingTime = useTurnTimer(
    isMyTurn,
    gameState?.turnTimeSeconds || 300,
    gameState?.turnStartedAt || Date.now(),
    () => toast({ title: t('game.timesUp'), variant: "destructive" })
  );

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
    if (address) claimTimeoutVictory(address);
  }, [address, claimTimeoutVictory]);

  const handleSendChat = useCallback((text: string) => {
    addChatMessage(text);
    if (webrtcConnected) {
      webrtcSendChat(text);
    }
  }, [addChatMessage, webrtcConnected, webrtcSendChat]);

  const countPieces = (board: (Piece | null)[][], player: Player) => {
    let count = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (board[row][col]?.player === player) count++;
      }
    }
    return count;
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('gameAI.checkers')} – {t('game.room')} #{roomId}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('game.prizePool')}: {prizePool} USDT {room && `(~${formatUsd(parseFloat(prizePool))})`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className={`px-2 py-1 rounded ${isMyTurn ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {isMyTurn ? t('game.yourTurn') : t('game.opponentsTurn')}
            </span>
            <span className="text-muted-foreground">{remainingTime}s {t('game.remaining')}</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 flex flex-col items-center gap-4">
            {/* Checkers Board */}
            <div className="w-full max-w-[min(100%,calc(100vh-280px))] aspect-square bg-gradient-to-br from-amber-900/80 to-amber-950 border-4 border-primary/40 rounded-lg overflow-hidden p-1">
              <div className="grid grid-cols-8 gap-0 w-full h-full">
                {board.map((row, rowIdx) =>
                  row.map((piece, colIdx) => {
                    const isPlayable = (rowIdx + colIdx) % 2 === 1;
                    const isSelected = selectedPiece?.row === rowIdx && selectedPiece?.col === colIdx;
                    const isValidTarget = validMoves.some(m => m.to.row === rowIdx && m.to.col === colIdx);
                    
                    return (
                      <div
                        key={`${rowIdx}-${colIdx}`}
                        className={`relative flex items-center justify-center transition-all ${
                          isPlayable ? 'bg-amber-800/60' : 'bg-amber-200/60'
                        } ${isSelected ? 'ring-2 ring-primary' : ''} ${isValidTarget ? 'ring-2 ring-green-500' : ''}`}
                      >
                        {piece && (
                          <div
                            className={`w-[80%] h-[80%] rounded-full shadow-lg transition-transform ${
                              piece.player === 'gold'
                                ? 'bg-gradient-to-br from-yellow-400 to-yellow-600 border-2 border-yellow-300'
                                : 'bg-gradient-to-br from-zinc-700 to-zinc-900 border-2 border-primary/50'
                            } ${piece.type === 'king' ? 'ring-2 ring-white' : ''}`}
                          />
                        )}
                        {isValidTarget && !piece && (
                          <div className="absolute w-4 h-4 rounded-full bg-green-500/50" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <GameChat
              roomId={roomId || ""}
              playerAddress={address}
              onSendMessage={handleSendChat}
              messages={chatMessages}
            />
          </div>

          <div className="w-full lg:w-72 space-y-4">
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

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.gameStatus')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('game.yourPieces')}:</span>
                  <span className="text-foreground font-medium">{countPieces(board, 'gold')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('game.opponentPieces')}:</span>
                  <span className="text-foreground font-medium">{countPieces(board, 'obsidian')}</span>
                </div>
              </div>
            </div>

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

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => webrtcSendDrawOffer()}>
                <Handshake size={16} />
                {t('game.offerDraw')}
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 gap-2 text-destructive hover:text-destructive"
                onClick={() => {
                  if (confirm(t('game.confirmResign'))) {
                    webrtcConnected ? webrtcSendResign() : bcSendResign();
                    setGameEnded(true);
                  }
                }}
              >
                <Flag size={16} />
                {t('game.resign')}
              </Button>
            </div>

            {/* Finish Game & Pay Winner - Only visible to creator when game ends */}
            {gameEnded && (
              <FinishGameButton
                roomId={roomIdBigInt || BigInt(0)}
                isCreator={!!isCreator}
                isRoomFull={!!isRoomFull}
                onGameFinished={() => navigate("/")}
              />
            )}
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} className="mr-2" />
              {t('game.returnToLobby')}
            </Link>
          </Button>
        </div>

        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t('game.howItWorks')}</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.checkersWinCondition')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.checkersMoveRules')}
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
      <MobileAppPrompt />
    </div>
  );
};

export default CheckersGame;
