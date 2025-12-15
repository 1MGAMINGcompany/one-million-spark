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
import { MobileAppPrompt } from "@/components/MobileAppPrompt";

const LudoAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play } = useSound();
  
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Wrapper for play function that respects sfxEnabled
  const playSfx = useCallback((sound: string) => {
    if (sfxEnabled) {
      play(sound);
    }
  }, [sfxEnabled, play]);

  const showToast = useCallback((title: string, description: string, variant?: "default" | "destructive") => {
    toast({ title, description, variant, duration: 2000 });
  }, []);

  const {
    players,
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
    advanceTurn,
    resetGame,
    setDiceValue,
    setMovableTokens,
    setCurrentPlayerIndex,
  } = useLudoEngine({
    onSoundPlay: playSfx,
    onToast: showToast,
  });

  // Background music control
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

  // Cleanup music on unmount
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

  const toggleSfx = useCallback(() => {
    setSfxEnabled(prev => !prev);
  }, []);

  // Handle dice roll completion - for human player only
  const handleRollComplete = useCallback((dice: number, movable: number[]) => {
    const player = players[currentPlayerIndex];
    console.log(`[LUDO AI] ${player.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
    
    if (movable.length === 0) {
      toast({
        title: "No valid moves",
        description: `${player.isAI ? 'AI' : 'You'} cannot move any token.`,
        duration: 1500,
      });
      setTimeout(() => {
        // Even with no moves, rolling 6 gives bonus turn
        advanceTurn(dice);
      }, 1000);
    }
  }, [players, currentPlayerIndex, advanceTurn]);

  // Human player rolls dice
  const handleRollDice = useCallback(() => {
    rollDice(handleRollComplete);
  }, [rollDice, handleRollComplete]);

  // Track if we've already consumed the current dice roll
  const moveStartedRef = useRef(false);

  // Handle token click (for human player) - with double-click prevention
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    // Early guards
    if (isAnimating) return;
    if (playerIndex !== currentPlayerIndex) return;
    if (currentPlayer.isAI) return;
    if (diceValue === null) return;
    if (isRolling) return;
    
    // CRITICAL: Prevent consuming same dice twice
    if (moveStartedRef.current) {
      console.log('[LUDO AI] Move already started, ignoring click');
      return;
    }
    
    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: "Illegal move",
        description: "This token cannot move with the current dice roll.",
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    // Capture dice value ONCE and immediately mark as consumed
    const currentDice = diceValue;
    moveStartedRef.current = true;
    
    // Keep dice visible but clear movable tokens
    setMovableTokens([]);
    
    const success = executeMove(currentPlayerIndex, tokenIndex, currentDice, () => {
      // After animation completes, clear dice and advance turn
      setDiceValue(null);
      moveStartedRef.current = false;
      setTimeout(() => advanceTurn(currentDice), 200);
    });
    
    if (!success) {
      // If move failed, restore state
      moveStartedRef.current = false;
    }
  }, [isAnimating, currentPlayerIndex, currentPlayer, diceValue, isRolling, movableTokens, executeMove, advanceTurn, setDiceValue, setMovableTokens]);

  // AI turn - trigger dice roll
  const aiMoveInProgressRef = useRef(false);
  
  useEffect(() => {
    // Include turnSignal in dependency to ensure effect re-runs on bonus turns
    if (currentPlayer.isAI && !gameOver && diceValue === null && !isRolling && !isAnimating && !aiMoveInProgressRef.current) {
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      const timeout = setTimeout(() => {
        // Lock AI turn
        aiMoveInProgressRef.current = true;
        
        rollDice((dice, movable) => {
          console.log(`[LUDO AI] AI ${currentPlayer.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
          
          if (movable.length === 0) {
            toast({
              title: "AI cannot move any token.",
              description: "No valid moves",
              duration: 1500,
            });
            setTimeout(() => {
              // Even with no moves, rolling 6 gives bonus turn
              advanceTurn(dice);
              aiMoveInProgressRef.current = false;
            }, 1000);
          } else {
            // AI chooses a token to move - keep dice visible during animation
            const capturedDice = dice;
            setMovableTokens([]);
            
            const aiDelay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
            setTimeout(() => {
              let chosenToken: number;
              
              if (difficulty === "easy") {
                chosenToken = movable[Math.floor(Math.random() * movable.length)];
              } else {
                // Prioritize tokens already on board over those in home
                const tokens = movable.map(i => ({ index: i, token: players[currentPlayerIndex].tokens[i] }));
                tokens.sort((a, b) => {
                  if (a.token.position === -1 && b.token.position !== -1) return 1;
                  if (b.token.position === -1 && a.token.position !== -1) return -1;
                  return b.token.position - a.token.position;
                });
                chosenToken = tokens[0].index;
              }
              
              executeMove(currentPlayerIndex, chosenToken, capturedDice, () => {
                // Clear dice AFTER animation completes
                setDiceValue(null);
                setTimeout(() => {
                  advanceTurn(capturedDice);
                  aiMoveInProgressRef.current = false;
                }, 200);
              });
            }, aiDelay);
          }
        });
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayer.isAI, currentPlayer.color, gameOver, diceValue, isRolling, isAnimating, difficulty, players, currentPlayerIndex, rollDice, executeMove, advanceTurn, setDiceValue, setMovableTokens, turnSignal]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="relative py-3 px-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Link to="/play-ai" className="flex items-center gap-2">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">{t('gameAI.back')}</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-display font-bold text-primary">
                {t('gameAI.ludoTitle')}
              </h1>
              <p className="text-xs text-muted-foreground capitalize">
                {difficulty} {t('gameAI.difficulty')}
              </p>
            </div>
          </div>
          
          <Button onClick={resetGame} variant="outline" size="sm" className="border-primary/30">
            <RotateCcw size={16} />
            <span className="hidden sm:inline ml-1">{t('gameAI.reset')}</span>
          </Button>
        </div>
      </div>

      {/* Game Area - Responsive layout */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-4">
        <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
          
          {/* Dice - Left side on desktop */}
          <div className="hidden md:flex flex-col items-center gap-4 w-32">
            <TurnIndicator
              currentPlayer={currentPlayer.color}
              isAI={currentPlayer.isAI}
              isGameOver={!!gameOver}
              winner={gameOver}
            />
            <EgyptianDice
              value={diceValue}
              isRolling={isRolling}
              onRoll={handleRollDice}
              disabled={isRolling || diceValue !== null || !!gameOver || isAnimating || currentPlayer.isAI}
              showRollButton={!currentPlayer.isAI && !gameOver && diceValue === null && !isAnimating}
            />
            {!currentPlayer.isAI && movableTokens.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('gameAI.tapGlowingToken')}
              </p>
            )}
            
            {/* Audio Controls */}
            <div className="flex gap-2 mt-4">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMusic}
                className="w-8 h-8 border-primary/30"
                title={musicEnabled ? "Disable Music" : "Enable Music"}
              >
                {musicEnabled ? <Music size={14} /> : <Music2 size={14} />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSfx}
                className="w-8 h-8 border-primary/30"
                title={sfxEnabled ? "Disable SFX" : "Enable SFX"}
              >
                {sfxEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </Button>
            </div>
          </div>

          {/* Game Board */}
          <LudoBoard
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            movableTokens={isAnimating ? [] : (currentPlayer.isAI ? [] : movableTokens)}
            onTokenClick={handleTokenClick}
          />

          {/* Dice - Below board on mobile */}
          <div className="md:hidden flex flex-col items-center gap-3">
            <TurnIndicator
              currentPlayer={currentPlayer.color}
              isAI={currentPlayer.isAI}
              isGameOver={!!gameOver}
              winner={gameOver}
            />
            <EgyptianDice
              value={diceValue}
              isRolling={isRolling}
              onRoll={handleRollDice}
              disabled={isRolling || diceValue !== null || !!gameOver || isAnimating || currentPlayer.isAI}
              showRollButton={!currentPlayer.isAI && !gameOver && diceValue === null && !isAnimating}
            />
            {!currentPlayer.isAI && movableTokens.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                {t('gameAI.tapGlowingToken')}
              </p>
            )}
            
            {/* Audio Controls - Mobile */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMusic}
                className="w-8 h-8 border-primary/30"
              >
                {musicEnabled ? <Music size={14} /> : <Music2 size={14} />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSfx}
                className="w-8 h-8 border-primary/30"
              >
                {sfxEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Game Status */}
      {gameOver && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-primary/30 rounded-lg p-8 text-center space-y-4 max-w-sm mx-4">
            <h2 className="text-2xl font-display font-bold text-primary">
              {gameOver === 'gold' ? t('gameAI.victory') : t('gameAI.defeat')}
            </h2>
            <p className="text-muted-foreground capitalize">
              {gameOver} {t('gameAI.wins')}!
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={resetGame} variant="default">
                {t('gameAI.playAgain')}
              </Button>
              <Button asChild variant="outline">
                <Link to="/play-ai">{t('gameAI.back')}</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Game Info Summary */}
      <div className="flex-shrink-0 py-2 px-4">
        <div className="max-w-4xl mx-auto flex justify-center gap-6 text-xs text-muted-foreground">
          {players.map(player => (
            <div key={player.color} className="flex items-center gap-1">
              <span className="capitalize font-medium" style={{ 
                color: player.color === 'gold' ? '#FFD700' : 
                       player.color === 'ruby' ? '#E74C3C' : 
                       player.color === 'emerald' ? '#2ECC71' : '#3498DB' 
              }}>
                {player.color}:
              </span>
              <span>{player.tokens.filter(t => t.position === 57).length}/4</span>
            </div>
          ))}
        </div>
      </div>
      <MobileAppPrompt />
    </div>
  );
};

export default LudoAI;
