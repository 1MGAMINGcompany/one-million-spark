import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Flag, Timer } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom, usePlayersOf } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { GameChat, useChatMessages } from "@/components/GameChat";
import { FinishGameButton } from "@/components/FinishGameButton";
import { useGameSync, useTurnTimer } from "@/hooks/useGameSync";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTimeoutForfeit } from "@/hooks/useTimeoutForfeit";
import { useWallet } from "@/hooks/useWallet";
import { useState, useCallback, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Player, PlayerColor, initializePlayers } from "@/components/ludo/ludoTypes";

interface LudoMove {
  playerIndex: number;
  tokenIndex: number;
  diceValue: number;
  newPosition: number;
}

const LudoGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  const { play } = useSound();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const { data: contractPlayers } = usePlayersOf(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const isCreator = room && address && room.creator.toLowerCase() === address.toLowerCase();
  const isRoomFull = room && (contractPlayers?.length || 0) >= room.maxPlayers;
  
  const [ludoPlayers, setLudoPlayers] = useState<Player[]>(() => initializePlayers());
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
  const [diceValue, setDiceValue] = useState<number | null>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [gameEnded, setGameEnded] = useState(false);
  const [movableTokens, setMovableTokens] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<NodeJS.Timeout | null>(null);

  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const currentPlayer = ludoPlayers[currentPlayerIndex];

  const handleOpponentMove = useCallback((move: LudoMove) => {
    play('ludo_move');
    setLudoPlayers(prevPlayers => {
      const newPlayers = prevPlayers.map((player, pIdx) => ({
        ...player,
        tokens: player.tokens.map((token, tIdx) => {
          if (pIdx === move.playerIndex && tIdx === move.tokenIndex) {
            return { ...token, position: move.newPosition };
          }
          return { ...token };
        }),
      }));
      return newPlayers;
    });
    
    // Move to next player unless it was a 6
    setTimeout(() => {
      setCurrentPlayerIndex(prev => move.diceValue === 6 ? prev : (prev + 1) % ludoPlayers.length);
      setDiceValue(null);
    }, 500);
  }, [play, ludoPlayers.length]);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    toast({ title: t('game.opponentResigned'), description: t('game.youWin') });
    play('ludo_win');
  }, [toast, t, play]);

  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    switch (message.type) {
      case "move":
        if (message.payload) handleOpponentMove(message.payload as LudoMove);
        break;
      case "resign":
        handleOpponentResign();
        break;
      case "chat":
        if (message.payload && message.sender) {
          receiveMessage(message.payload, message.sender);
        }
        break;
    }
  }, [handleOpponentMove, handleOpponentResign, receiveMessage]);

  const {
    isConnected: webrtcConnected,
    isPushEnabled,
    sendMove: webrtcSendMove,
    sendResign: webrtcSendResign,
    sendChat: webrtcSendChat,
    reconnect: webrtcReconnect,
    peerAddress,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: (contractPlayers as string[]) || [],
    onMessage: handleWebRTCMessage,
    enabled: !!contractPlayers && contractPlayers.length >= 2,
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
    gameType: "ludo",
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

  const getMovableTokens = useCallback((player: Player, dice: number): number[] => {
    const movable: number[] = [];
    player.tokens.forEach((token, index) => {
      if (token.position === -1 && dice === 6) {
        movable.push(index);
      } else if (token.position >= 0 && token.position < 57) {
        const newPos = token.position + dice;
        if (newPos <= 57) {
          movable.push(index);
        }
      }
    });
    return movable;
  }, []);

  const rollDice = useCallback(() => {
    if (isRolling || diceValue !== null || isAnimating || !isMyTurn) return;
    
    setIsRolling(true);
    play('ludo_dice');
    
    let rolls = 0;
    const maxRolls = 10;
    const interval = setInterval(() => {
      setDiceValue(Math.floor(Math.random() * 6) + 1);
      rolls++;
      
      if (rolls >= maxRolls) {
        clearInterval(interval);
        const finalValue = Math.floor(Math.random() * 6) + 1;
        setDiceValue(finalValue);
        setIsRolling(false);
        
        const movable = getMovableTokens(currentPlayer, finalValue);
        setMovableTokens(movable);
        
        if (movable.length === 0) {
          toast({
            title: t('gameAI.noValidMoves'),
            description: t('gameAI.cannotMove'),
            duration: 1500,
          });
          setTimeout(() => {
            setDiceValue(null);
            setCurrentPlayerIndex(prev => (prev + 1) % ludoPlayers.length);
          }, 1000);
        }
      }
    }, 100);
  }, [isRolling, diceValue, isAnimating, isMyTurn, currentPlayer, getMovableTokens, play, t, ludoPlayers.length]);

  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (isAnimating || !isMyTurn || playerIndex !== currentPlayerIndex || diceValue === null || isRolling) return;
    
    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: t('gameAI.illegalMove'),
        description: t('gameAI.illegalMoveDesc'),
        variant: "destructive",
      });
      return;
    }
    
    const token = currentPlayer.tokens[tokenIndex];
    const currentDice = diceValue;
    let newPosition: number;
    
    if (token.position === -1 && currentDice === 6) {
      newPosition = 0;
    } else {
      newPosition = Math.min(token.position + currentDice, 57);
    }
    
    play('ludo_move');
    
    // Update local state
    setLudoPlayers(prevPlayers => {
      const newPlayers = prevPlayers.map((player, pIdx) => ({
        ...player,
        tokens: player.tokens.map((t, tIdx) => {
          if (pIdx === playerIndex && tIdx === tokenIndex) {
            return { ...t, position: newPosition };
          }
          return { ...t };
        }),
      }));
      return newPlayers;
    });
    
    // Send move to opponent
    const move: LudoMove = {
      playerIndex,
      tokenIndex,
      diceValue: currentDice,
      newPosition,
    };
    
    if (webrtcConnected) {
      webrtcSendMove(move);
    } else {
      bcSendMove(move as any);
    }
    
    setDiceValue(null);
    setMovableTokens([]);
    
    // Check for winner
    setTimeout(() => {
      setLudoPlayers(current => {
        const player = current[playerIndex];
        if (player.tokens.every(t => t.position === 57)) {
          setGameEnded(true);
          play('ludo_win');
          toast({ title: t('game.victory'), description: t('game.victoryDescription') });
        } else {
          setCurrentPlayerIndex(prev => currentDice === 6 ? prev : (prev + 1) % ludoPlayers.length);
        }
        return current;
      });
    }, 500);
  }, [isAnimating, isMyTurn, currentPlayerIndex, diceValue, isRolling, movableTokens, currentPlayer, webrtcConnected, webrtcSendMove, bcSendMove, play, t, ludoPlayers.length]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('gameAI.ludo')} – {t('game.room')} #{roomId}
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
          <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
            {/* Dice - Left side on desktop */}
            <div className="hidden md:flex flex-col items-center gap-4 w-32">
              <TurnIndicator
                currentPlayer={currentPlayer.color}
                isAI={!isMyTurn}
                isGameOver={gameEnded}
                winner={null}
              />
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={rollDice}
                disabled={isRolling || diceValue !== null || gameEnded || isAnimating || !isMyTurn}
                showRollButton={isMyTurn && !gameEnded && diceValue === null && !isAnimating}
              />
              {isMyTurn && movableTokens.length > 0 && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('gameAI.tapGlowingToken')}
                </p>
              )}
            </div>

            <LudoBoard
              players={ludoPlayers}
              currentPlayerIndex={currentPlayerIndex}
              movableTokens={isAnimating ? [] : (isMyTurn ? movableTokens : [])}
              onTokenClick={handleTokenClick}
            />

            {/* Dice - Below board on mobile */}
            <div className="md:hidden flex flex-col items-center gap-3">
              <TurnIndicator
                currentPlayer={currentPlayer.color}
                isAI={!isMyTurn}
                isGameOver={gameEnded}
                winner={null}
              />
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={rollDice}
                disabled={isRolling || diceValue !== null || gameEnded || isAnimating || !isMyTurn}
                showRollButton={isMyTurn && !gameEnded && diceValue === null && !isAnimating}
              />
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
                {ludoPlayers.map((player, idx) => (
                  <div key={player.color} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{player.color}:</span>
                    <span className="text-foreground font-medium">
                      {player.tokens.filter(t => t.position === 57).length}/4 {t('game.home')}
                    </span>
                  </div>
                ))}
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

            <Button 
              variant="outline" 
              className="w-full gap-2 text-destructive hover:text-destructive"
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
              {t('game.ludoWinCondition')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.ludoMoveRules')}
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

export default LudoGame;
