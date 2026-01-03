import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Music, Music2, Volume2, VolumeX } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Difficulty } from "@/components/ludo/ludoTypes";
import { useLudoEngine } from "@/hooks/useLudoEngine";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";

const LudoAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play, soundEnabled, toggleSound } = useSound();

  const [musicEnabled, setMusicEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Sound wrapper
  const playSfx = useCallback((sound: string) => {
    play(sound);
  }, [play]);

  const showToast = useCallback((title: string, description: string, variant?: "default" | "destructive") => {
    toast({ title, description, variant, duration: 2000 });
  }, []);

  const {
    players,
    currentPlayerIndex,
    currentPlayer,
    phase,
    diceValue,
    movableTokens,
    winner,
    captureEvent,
    gameId,
    isRolling,
    isAnimating,
    rollDice,
    selectToken,
    resetGame,
    clearCaptureEvent,
  } = useLudoEngine({
    onSoundPlay: playSfx,
    onToast: showToast,
  });

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
    if (currentPlayer.isAI) return;
    rollDice();
  }, [currentPlayer.isAI, rollDice]);

  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (playerIndex !== currentPlayerIndex) return;
    if (currentPlayer.isAI) return;
    if (phase !== 'WAITING_FOR_MOVE') return;

    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: t('gameAI.illegalMove'),
        description: t('gameAI.illegalMoveDesc'),
        variant: "destructive",
        duration: 2000,
      });
      return;
    }

    selectToken(tokenIndex);
  }, [currentPlayerIndex, currentPlayer.isAI, phase, movableTokens, selectToken, t]);

  // ============ AI CONTROLLER ============
  // Simple and clean: react to phase changes for AI players
  useEffect(() => {
    // Only act for AI players
    if (!currentPlayer.isAI) return;
    
    // Don't act if game is over
    if (winner) return;

    // Capture current game ID to detect resets
    const currentGameId = gameId;

    // AI needs to roll
    if (phase === 'WAITING_FOR_ROLL') {
      const delay = difficulty === "easy" ? 1000 : difficulty === "medium" ? 700 : 400;
      
      const timeout = setTimeout(() => {
        // Check game wasn't reset
        if (gameId !== currentGameId) return;
        console.log(`[AI] ${currentPlayer.color} rolling dice...`);
        rollDice();
      }, delay);

      return () => clearTimeout(timeout);
    }

    // AI needs to select a token
    if (phase === 'WAITING_FOR_MOVE' && movableTokens.length > 0 && diceValue !== null) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;

      const timeout = setTimeout(() => {
        // Check game wasn't reset
        if (gameId !== currentGameId) return;

        let chosenToken: number;

        if (difficulty === "easy") {
          // Easy: random choice
          chosenToken = movableTokens[Math.floor(Math.random() * movableTokens.length)];
        } else {
          // Medium/Hard: prioritize tokens already on board, furthest first
          const tokenData = movableTokens.map(i => ({
            index: i,
            position: currentPlayer.tokens[i].position
          }));

          tokenData.sort((a, b) => {
            // Tokens in home (-1) go last
            if (a.position === -1 && b.position !== -1) return 1;
            if (b.position === -1 && a.position !== -1) return -1;
            // Prefer tokens closer to finish (higher position)
            return b.position - a.position;
          });

          chosenToken = tokenData[0].index;
        }

        console.log(`[AI] ${currentPlayer.color} selecting token ${chosenToken}`);
        selectToken(chosenToken);
      }, delay);

      return () => clearTimeout(timeout);
    }
  }, [phase, currentPlayer, movableTokens, diceValue, winner, difficulty, gameId, rollDice, selectToken]);

  // ============ RENDER ============
  const isHumanTurn = !currentPlayer.isAI && phase === 'WAITING_FOR_ROLL';
  const canRoll = isHumanTurn && !isRolling && !isAnimating;

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
            {t('ludo.title')}
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
          isGameOver={!!winner}
          winner={winner}
        />
      </div>

      {/* Game board */}
      <div className="px-4 flex justify-center">
        <LudoBoard
          players={players}
          currentPlayerIndex={currentPlayerIndex}
          movableTokens={phase === 'WAITING_FOR_MOVE' && !currentPlayer.isAI ? movableTokens : []}
          onTokenClick={handleTokenClick}
          captureEvent={captureEvent}
          onCaptureAnimationComplete={clearCaptureEvent}
        />
      </div>

      {/* Dice and controls */}
      <div className="mt-6 flex flex-col items-center gap-4">
        <EgyptianDice
          value={diceValue}
          isRolling={isRolling}
          onRoll={handleRollDice}
          disabled={!canRoll}
          showRollButton={!currentPlayer.isAI && phase === 'WAITING_FOR_ROLL'}
        />

        {/* Status messages */}
        {winner && (
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-200">
              {winner === 'gold' ? '🎉 You Win! 🎉' : `${winner.charAt(0).toUpperCase() + winner.slice(1)} Wins!`}
            </p>
            <Button
              onClick={resetGame}
              className="mt-4 bg-amber-600 hover:bg-amber-700 text-white"
            >
              Play Again
            </Button>
          </div>
        )}

        {!winner && currentPlayer.isAI && (
          <p className="text-amber-300/70 text-sm animate-pulse">
            {currentPlayer.color.charAt(0).toUpperCase() + currentPlayer.color.slice(1)} is thinking...
          </p>
        )}

        {!winner && !currentPlayer.isAI && phase === 'WAITING_FOR_ROLL' && (
          <p className="text-amber-200 text-sm">
            Tap the dice to roll!
          </p>
        )}

        {!winner && !currentPlayer.isAI && phase === 'WAITING_FOR_MOVE' && (
          <p className="text-amber-200 text-sm">
            Select a token to move
          </p>
        )}
      </div>

      {/* Player progress */}
      <div className="mt-8 px-4">
        <div className="grid grid-cols-4 gap-2">
          {players.map((player, index) => {
            const finished = player.tokens.filter(t => t.position === 62).length;
            const onBoard = player.tokens.filter(t => t.position >= 0 && t.position < 62).length;
            const inHome = player.tokens.filter(t => t.position === -1).length;

            return (
              <div
                key={player.color}
                className={`rounded-lg p-2 text-center text-xs ${
                  index === currentPlayerIndex && !winner
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
