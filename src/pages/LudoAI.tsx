/**
 * Ludo AI Page - Single Player vs Computer
 * 
 * Uses the new pure LudoEngine for deterministic game logic.
 * Features step-by-step token animation.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { PostGamePrompt } from "@/components/PostGamePrompt";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePresenceHeartbeat } from "@/hooks/usePresenceHeartbeat";
import { ArrowLeft, RotateCcw, Music, Music2, Volume2, VolumeX } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";

import { useLudoGame } from "@/hooks/useLudoGame";
import { useLudoStepAnimation } from "@/hooks/useLudoStepAnimation";
import { Difficulty } from "@/lib/ludo/ai";
import { PlayerColor } from "@/lib/ludo/types";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";

const LudoAI = () => {
  const { t } = useTranslation();
  usePresenceHeartbeat();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play, soundEnabled, toggleSound } = useSound();

  const [musicEnabled, setMusicEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Capture animation state (for LudoBoard)
  const [captureEvent, setCaptureEvent] = useState<{
    capturedColor: PlayerColor;
    capturingColor: PlayerColor;
    position: [number, number];
    tokenId?: number;
    fromPosition?: number;
  } | null>(null);

  // Step animation hook
  const { 
    animation: stepAnimation, 
    startAnimation, 
    getAnimatedPosition,
    clearAnimation,
    isAnimating: isStepAnimating,
  } = useLudoStepAnimation({
    stepDuration: 120, // 120ms per step for smooth movement
    onComplete: () => {
      // Animation finished, advance turn
      onMoveAnimationComplete();
    },
  });

  // Game hook with new engine
  const {
    gameState,
    currentPlayer,
    diceValue,
    winner,
    phase,
    isGameOver,
    isRolling,
    animatingMove,
    isHumanTurn,
    canRoll,
    canMove,
    movableTokenIndices,
    rollDice,
    selectToken,
    onMoveAnimationComplete,
    resetGame,
  } = useLudoGame({
    playerCount: 4,
    humanPlayerIndex: 0,
    difficulty,
    onDiceRolled: (value) => {
      play("ludo_dice");
    },
    onTokenMoved: (move) => {
      // Start step animation when a token moves
      startAnimation(gameState.currentPlayerIndex, move.tokenIndex, move);
      play("ludo_move");
    },
    onCapture: (captured) => {
      const capturedPlayer = gameState.players[captured.playerIndex];
      
      // Set capture event for animation
      if (animatingMove?.move.toPosition !== null && animatingMove?.move.toState === 'TRACK') {
        setCaptureEvent({
          capturedColor: capturedPlayer.color,
          capturingColor: currentPlayer.color,
          position: [7, 7], // Center position placeholder
        });
        
        play("ludo_capture");
        
        setTimeout(() => setCaptureEvent(null), 1500);
      }
    },
    onGameOver: (winnerColor) => {
      if (winnerColor === 'gold') {
        play("ludo_win");
        toast({
          title: t("ludo.youWin", "You Win! 🎉"),
          description: t("ludo.congratulations", "Congratulations!"),
        });
      } else {
        play("ludo_lose");
        toast({
          title: t("ludo.gameOver", "Game Over"),
          description: t("ludo.aiWins", "AI Wins! Better luck next time."),
          variant: "destructive",
        });
      }
    },
  });

  // Don't auto-advance turn anymore - step animation handles it
  // Legacy: Keep animatingMove in case step animation doesn't trigger
  useEffect(() => {
    if (animatingMove && !isStepAnimating) {
      // Fallback: if step animation didn't start, advance turn after delay
      const timeout = setTimeout(() => {
        onMoveAnimationComplete();
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [animatingMove, isStepAnimating, onMoveAnimationComplete]);

  // ============ BACKGROUND MUSIC ============
  useEffect(() => {
    if (!musicRef.current) {
      musicRef.current = new Audio('/sounds/ludo/background.mp3');
      musicRef.current.loop = true;
      musicRef.current.volume = 0.3;
    }

    if (musicEnabled) {
      musicRef.current.play().catch(() => {});
    } else {
      musicRef.current.pause();
    }

    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
      }
    };
  }, [musicEnabled]);

  useEffect(() => {
    return () => {
      if (musicRef.current) {
        musicRef.current.pause();
        musicRef.current = null;
      }
    };
  }, []);

  const toggleMusic = useCallback(() => {
    setMusicEnabled(prev => !prev);
  }, []);

  // ============ HUMAN PLAYER ACTIONS ============
  const handleRollDice = useCallback(() => {
    if (!canRoll) return;
    rollDice();
  }, [canRoll, rollDice]);

  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (playerIndex !== gameState.currentPlayerIndex) return;
    if (currentPlayer.isAI) return;
    if (!canMove) return;

    if (!movableTokenIndices.includes(tokenIndex)) {
      toast({
        title: t('gameAI.illegalMove', 'Illegal Move'),
        description: t('gameAI.illegalMoveDesc', 'This token cannot move'),
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    selectToken(tokenIndex);
  }, [gameState.currentPlayerIndex, currentPlayer.isAI, canMove, movableTokenIndices, selectToken, t]);

  // Convert game state to LudoBoard format with animated positions
  const boardPlayers = gameState.players.map((player, playerIndex) => ({
    color: player.color,
    tokens: player.tokens.map((token, tokenIndex) => {
      // Calculate base position
      let basePosition = token.state === 'BASE' ? -1 :
                token.state === 'FINISHED' ? 62 :
                token.state === 'HOME_PATH' ? 56 + (token.position ?? 0) :
                token.position ?? 0;
      
      // Apply step animation if this token is animating
      const animatedPosition = getAnimatedPosition(playerIndex, tokenIndex, basePosition);
      
      return {
        position: animatedPosition,
        color: player.color,
        id: token.id,
      };
    }),
    isAI: player.isAI,
    startPosition: 0,
    homeColumn: 55,
  }));

  // ============ RENDER ============
  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-950 via-amber-900 to-amber-950 pb-20">
      {/* Winner confetti */}
      {winner === 'gold' && <GoldConfettiExplosion active={true} />}

      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-b from-amber-950 to-transparent pb-4">
        <div className="flex items-center justify-between px-4 pt-4">
          <Link to="/play-ai">
            <Button variant="ghost" size="icon" className="text-amber-200 hover:bg-amber-800/50">
              <ArrowLeft className="h-6 w-6" />
            </Button>
          </Link>

          <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 to-amber-400">
            {t('ludo.title', 'Ludo')}
          </h1>

          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMusic}
              className="text-amber-200 hover:bg-amber-800/50"
            >
              {musicEnabled ? <Music className="h-5 w-5" /> : <Music2 className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSound}
              className="text-amber-200 hover:bg-amber-800/50"
            >
              {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={resetGame}
              className="text-amber-200 hover:bg-amber-800/50"
            >
              <RotateCcw className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Turn indicator */}
      <div className="px-4 mb-4">
        <TurnIndicator
          currentPlayer={currentPlayer.color}
          isAI={currentPlayer.isAI}
          isGameOver={isGameOver}
          winner={winner}
        />
      </div>

      {/* Game board */}
      <div className="px-4 flex justify-center">
        <LudoBoard
          players={boardPlayers}
          currentPlayerIndex={gameState.currentPlayerIndex}
          movableTokens={canMove && !currentPlayer.isAI ? movableTokenIndices : []}
          onTokenClick={handleTokenClick}
          captureEvent={captureEvent}
          onCaptureAnimationComplete={() => setCaptureEvent(null)}
        />
      </div>

      {/* Dice and controls */}
      <div className="mt-6 flex flex-col items-center gap-4">
        <EgyptianDice
          value={diceValue}
          isRolling={isRolling}
          onRoll={handleRollDice}
          disabled={!canRoll}
          showRollButton={!currentPlayer.isAI && phase === 'WAITING_ROLL'}
        />

        {/* Status messages */}
        {isGameOver && (
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-200">
              {winner === 'gold' ? '🎉 You Win! 🎉' : `${winner?.charAt(0).toUpperCase()}${winner?.slice(1)} Wins!`}
            </p>
            <Button
              onClick={resetGame}
              className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Play Again
            </Button>
            <PostGamePrompt gameType="ludo" />
          </div>
        )}

        {!isGameOver && currentPlayer.isAI && (
          <p className="text-amber-300/70 text-sm animate-pulse">
            {currentPlayer.color.charAt(0).toUpperCase() + currentPlayer.color.slice(1)} is thinking...
          </p>
        )}

        {!isGameOver && !currentPlayer.isAI && phase === 'WAITING_ROLL' && (
          <p className="text-amber-200 text-sm">
            Tap the dice to roll!
          </p>
        )}

        {!isGameOver && !currentPlayer.isAI && phase === 'ROLLED' && gameState.legalMoves.length > 0 && (
          <p className="text-amber-200 text-sm">
            Select a token to move
          </p>
        )}

        {!isGameOver && !currentPlayer.isAI && phase === 'ROLLED' && gameState.legalMoves.length === 0 && (
          <p className="text-amber-300/70 text-sm">
            No moves available. Passing turn...
          </p>
        )}
      </div>

      {/* Player progress */}
      <div className="mt-8 px-4">
        <div className="grid grid-cols-4 gap-2">
          {gameState.players.map((player, index) => {
            const finished = player.tokens.filter(t => t.state === 'FINISHED').length;
            const onBoard = player.tokens.filter(t => t.state === 'TRACK' || t.state === 'HOME_PATH').length;
            const inHome = player.tokens.filter(t => t.state === 'BASE').length;

            return (
              <div
                key={player.color}
                className={`rounded-lg p-2 text-center text-xs ${
                  index === gameState.currentPlayerIndex && !isGameOver
                    ? 'bg-amber-600/50 ring-2 ring-amber-400'
                    : 'bg-amber-900/30'
                }`}
              >
                <div className={`font-bold ${
                  player.color === 'gold' ? 'text-amber-300' :
                  player.color === 'ruby' ? 'text-red-400' :
                  player.color === 'sapphire' ? 'text-blue-400' :
                  'text-emerald-400'
                }`}>
                  {player.isAI ? 'AI' : 'You'}
                </div>
                <div className="text-amber-200/60 mt-1">
                  ✓{finished} ⬤{onBoard} ○{inHome}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LudoAI;
