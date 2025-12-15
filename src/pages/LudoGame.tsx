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
import { useState, useCallback, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { useLudoEngine, LudoMove } from "@/hooks/useLudoEngine";
import { MobileAppPrompt } from "@/components/MobileAppPrompt";

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
  
  const [gameEnded, setGameEnded] = useState(false);

  const showToast = useCallback((title: string, description: string, variant?: "default" | "destructive") => {
    toast({ title, description, variant: variant as any, duration: 2000 });
  }, [toast]);

  const {
    players: ludoPlayers,
    currentPlayerIndex,
    currentPlayer,
    diceValue,
    isRolling,
    gameOver,
    movableTokens,
    isAnimating,
    turnSignal,
    rollDice,
    executeMove,
    applyExternalMove,
    advanceTurn,
    setDiceValue,
    setMovableTokens,
    setCurrentPlayerIndex,
    setGameOver,
  } = useLudoEngine({
    onSoundPlay: play,
    onToast: showToast,
  });

  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const handleOpponentMove = useCallback((move: LudoMove) => {
    applyExternalMove(move);
  }, [applyExternalMove]);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    setGameOver('gold'); // Assume local player wins
    toast({ title: t('game.opponentResigned'), description: t('game.youWin') });
    play('ludo_win');
  }, [toast, t, play, setGameOver]);

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
    gameEnded: gameEnded || !!gameOver,
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

  // Handle dice roll
  const handleRollDice = useCallback(() => {
    if (!isMyTurn) return;
    
    rollDice((dice, movable) => {
      console.log(`[LUDO MP] Rolled ${dice}, movable: [${movable.join(', ')}]`);
      
      if (movable.length === 0) {
        toast({
          title: t('gameAI.noValidMoves'),
          description: t('gameAI.cannotMove'),
          duration: 1500,
        });
        setTimeout(() => {
          // Use advanceTurn to properly handle bonus turn on 6
          advanceTurn(dice);
        }, 1000);
      }
    });
  }, [isMyTurn, rollDice, t, advanceTurn]);

  // Prevent double-execution refs
  const moveStartedRef = useRef(false);

  // Handle token click with double-click prevention
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    // Early guards
    if (isAnimating || !isMyTurn || diceValue === null || isRolling) return;
    
    // CRITICAL: Prevent consuming same dice twice
    if (moveStartedRef.current) {
      console.log('[LUDO MP] Move already started, ignoring click');
      return;
    }
    
    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: t('gameAI.illegalMove'),
        description: t('gameAI.illegalMoveDesc'),
        variant: "destructive",
      });
      return;
    }
    
    // Capture values and lock immediately
    const token = ludoPlayers[playerIndex].tokens[tokenIndex];
    const currentDice = diceValue;
    const startPosition = token.position;
    const endPosition = startPosition === -1 ? 0 : Math.min(startPosition + currentDice, 57);
    
    moveStartedRef.current = true;
    
    // Clear dice state immediately to prevent re-use
    setDiceValue(null);
    setMovableTokens([]);
    
    const success = executeMove(playerIndex, tokenIndex, currentDice, () => {
      // Release lock after animation
      moveStartedRef.current = false;
      
      // Check for winner
      const player = ludoPlayers[playerIndex];
      if (player.tokens.every(t => t.position === 57 || (t.id === token.id && endPosition === 57))) {
        setGameEnded(true);
        setGameOver(player.color);
        play('ludo_win');
        toast({ title: t('game.victory'), description: t('game.victoryDescription') });
      } else {
        setTimeout(() => advanceTurn(currentDice), 200);
      }
    });
    
    if (success) {
      // Send move to opponent
      const move: LudoMove = {
        playerIndex,
        tokenIndex,
        diceValue: currentDice,
        startPosition,
        endPosition,
      };
      
      if (webrtcConnected) {
        webrtcSendMove(move);
      } else {
        bcSendMove(move as any);
      }
    } else {
      // If move failed, restore state and release lock
      moveStartedRef.current = false;
      setDiceValue(currentDice);
    }
  }, [isAnimating, isMyTurn, diceValue, isRolling, movableTokens, ludoPlayers, executeMove, advanceTurn, webrtcConnected, webrtcSendMove, bcSendMove, play, t, setDiceValue, setMovableTokens, setGameOver]);

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
                isGameOver={gameEnded || !!gameOver}
                winner={gameOver}
              />
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={handleRollDice}
                disabled={isRolling || diceValue !== null || gameEnded || !!gameOver || isAnimating || !isMyTurn}
                showRollButton={isMyTurn && !gameEnded && !gameOver && diceValue === null && !isAnimating}
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
                isGameOver={gameEnded || !!gameOver}
                winner={gameOver}
              />
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={handleRollDice}
                disabled={isRolling || diceValue !== null || gameEnded || !!gameOver || isAnimating || !isMyTurn}
                showRollButton={isMyTurn && !gameEnded && !gameOver && diceValue === null && !isAnimating}
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
                {ludoPlayers.map((player) => (
                  <div key={player.color} className="flex justify-between">
                    <span className="text-muted-foreground capitalize">{player.color}:</span>
                    <span className="text-foreground font-medium">
                      {player.tokens.filter(t => t.position === 57).length}/4 {t('game.home')}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {canClaimTimeout && !gameEnded && !gameOver && (
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
            {(gameEnded || gameOver) && (
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
      <MobileAppPrompt />
    </div>
  );
};

export default LudoGame;
