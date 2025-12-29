import { useState, useCallback, useEffect, useRef, useMemo } from "react";
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
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import TurnBanner from "@/components/TurnBanner";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";

const LudoAI = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play, soundEnabled, toggleSound } = useSound();
  
  const [musicEnabled, setMusicEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);

  // Wrapper for play function that plays sounds when global sound is enabled
  const playSfx = useCallback((sound: string) => {
    console.log(`[LUDO SFX] Playing sound: ${sound}, soundEnabled: ${soundEnabled}`);
    play(sound);
  }, [play, soundEnabled]);

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
    captureEvent,
    rollDice,
    executeMove,
    advanceTurn,
    resetGame,
    setDiceValue,
    setMovableTokens,
    clearCaptureEvent,
  } = useLudoEngine({
    onSoundPlay: playSfx,
    onToast: showToast,
  });

  // Simulated wallet address for AI testing (gold player is human)
  const humanPlayerAddress = "gold-player-test-address";

  // Convert Ludo players to TurnPlayer format
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return players.map((player, index) => ({
      address: player.isAI ? `ai-${player.color}` : humanPlayerAddress,
      name: player.isAI ? `AI ${player.color.charAt(0).toUpperCase() + player.color.slice(1)}` : "You",
      color: player.color,
      status: player.tokens.every(t => t.position === 62) ? "finished" : "active" as const,
      seatIndex: index,
    }));
  }, [players, humanPlayerAddress]);

  // Current active player address
  const activeTurnAddress = turnPlayers[currentPlayerIndex]?.address || null;

  // Turn notification system
  const {
    isMyTurn,
    hasPermission,
    turnHistory,
  } = useTurnNotifications({
    gameName: "Ludo",
    roomId: "ludo-ai-test",
    players: turnPlayers,
    activeTurnAddress,
    myAddress: humanPlayerAddress,
    enabled: true,
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
    toggleSound();
  }, [toggleSound]);

  // Handle dice roll completion - for human player only
  const handleRollComplete = useCallback((dice: number, movable: number[]) => {
    const player = players[currentPlayerIndex];
    console.log(`[LUDO AI] ${player.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
    
    if (movable.length === 0) {
      toast({
        title: t('gameAI.noValidMoves'),
        description: t('gameAI.cannotMove'),
        duration: 1500,
      });
      // Clear dice and advance turn after delay
      setTimeout(() => {
        setDiceValue(null);
        advanceTurn(dice);
      }, 1000);
    }
  }, [players, currentPlayerIndex, advanceTurn, setDiceValue, t]);

  // Human player rolls dice
  const handleRollDice = useCallback(() => {
    rollDice(handleRollComplete);
  }, [rollDice, handleRollComplete]);

  // Track if we've already consumed the current dice roll
  const moveStartedRef = useRef(false);

  // Handle token click (for human player)
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (isAnimating) return;
    if (playerIndex !== currentPlayerIndex) return;
    if (currentPlayer.isAI) return;
    if (diceValue === null) return;
    if (isRolling) return;
    
    if (moveStartedRef.current) {
      console.log('[LUDO AI] Move already started, ignoring click');
      return;
    }
    
    if (!movableTokens.includes(tokenIndex)) {
      toast({
        title: t('gameAI.illegalMove'),
        description: t('gameAI.illegalMoveDesc'),
        variant: "destructive",
        duration: 2000,
      });
      return;
    }
    
    const currentDice = diceValue;
    moveStartedRef.current = true;
    setMovableTokens([]);
    
    const success = executeMove(currentPlayerIndex, tokenIndex, currentDice, () => {
      setDiceValue(null);
      moveStartedRef.current = false;
      setTimeout(() => advanceTurn(currentDice), 200);
    });
    
    if (!success) {
      moveStartedRef.current = false;
    }
  }, [isAnimating, currentPlayerIndex, currentPlayer, diceValue, isRolling, movableTokens, executeMove, advanceTurn, setDiceValue, setMovableTokens, t]);

  // AI turn - using timeout with proper cleanup
  const aiProcessingRef = useRef(false);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Clear any pending AI timeout
  const clearAiTimeout = useCallback(() => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    // Only process AI turns
    if (!currentPlayer.isAI || gameOver) {
      return;
    }
    
    // Wait for clean state (no dice, not rolling, not animating)
    if (diceValue !== null || isRolling || isAnimating) {
      return;
    }
    
    // Prevent double processing
    if (aiProcessingRef.current) {
      return;
    }
    
    aiProcessingRef.current = true;
    const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
    
    aiTimeoutRef.current = setTimeout(() => {
      // Double-check we're still on AI turn (prevents stale closure issues)
      if (!currentPlayer.isAI || gameOver) {
        aiProcessingRef.current = false;
        return;
      }
      
      rollDice((dice, movable) => {
        console.log(`[LUDO AI] AI ${currentPlayer.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
        
        if (movable.length === 0) {
          // No valid moves - advance turn after showing message
          toast({
            title: t('gameAI.noValidMoves'),
            description: t('gameAI.cannotMove'),
            duration: 1500,
          });
          aiTimeoutRef.current = setTimeout(() => {
            setDiceValue(null);
            advanceTurn(dice);
            aiProcessingRef.current = false;
          }, 1000);
        } else {
          // AI has valid moves - choose and execute
          const capturedDice = dice;
          setMovableTokens([]);
          
          const aiDelay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
          aiTimeoutRef.current = setTimeout(() => {
            let chosenToken: number;
            
            if (difficulty === "easy") {
              chosenToken = movable[Math.floor(Math.random() * movable.length)];
            } else {
              // Prioritize tokens already on board
              const tokens = movable.map(i => ({ index: i, token: players[currentPlayerIndex].tokens[i] }));
              tokens.sort((a, b) => {
                if (a.token.position === -1 && b.token.position !== -1) return 1;
                if (b.token.position === -1 && a.token.position !== -1) return -1;
                return b.token.position - a.token.position;
              });
              chosenToken = tokens[0].index;
            }
            
            executeMove(currentPlayerIndex, chosenToken, capturedDice, () => {
              setDiceValue(null);
              aiTimeoutRef.current = setTimeout(() => {
                advanceTurn(capturedDice);
                aiProcessingRef.current = false;
              }, 200);
            });
          }, aiDelay);
        }
      });
    }, delay);
    
    return () => {
      clearAiTimeout();
      // CRITICAL: Reset the processing flag on cleanup to prevent freeze
      aiProcessingRef.current = false;
    };
  }, [currentPlayer.isAI, currentPlayer.color, gameOver, diceValue, isRolling, isAnimating, difficulty, players, currentPlayerIndex, rollDice, executeMove, advanceTurn, setDiceValue, setMovableTokens, turnSignal, t, clearAiTimeout]);

  // Cleanup AI timeouts on unmount
  useEffect(() => {
    return () => {
      clearAiTimeout();
      aiProcessingRef.current = false;
    };
  }, [clearAiTimeout]);

  return (
    <div className="min-h-screen bg-background flex flex-col relative">
      {/* Gold Confetti Explosion on Win */}
      <GoldConfettiExplosion 
        active={gameOver === 'gold'} 
      />
      {/* Turn Banner (fallback for no permission) */}
      <TurnBanner
        gameName="Ludo"
        roomId="ludo-ai-test"
        isVisible={!hasPermission && isMyTurn && !gameOver}
      />

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
          
          <div className="flex items-center gap-2">
            {/* Turn History Drawer */}
            <TurnHistoryDrawer events={turnHistory} />
            
            <Button onClick={resetGame} variant="outline" size="sm" className="border-primary/30">
              <RotateCcw size={16} />
              <span className="hidden sm:inline ml-1">{t('gameAI.reset')}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Turn Status Header */}
      <div className="px-4 pb-2">
        <div className="max-w-4xl mx-auto">
          <TurnStatusHeader
            isMyTurn={isMyTurn}
            activePlayer={turnPlayers[currentPlayerIndex]}
            players={turnPlayers}
            myAddress={humanPlayerAddress}
          />
        </div>
      </div>

      {/* Game Area - Responsive layout */}
      <div className="flex-1 flex flex-col items-center justify-center p-2 md:p-4">
        {/* Game Board */}
        <div className="w-full max-w-md">
          <LudoBoard
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            movableTokens={isAnimating ? [] : (currentPlayer.isAI ? [] : movableTokens)}
            onTokenClick={handleTokenClick}
            captureEvent={captureEvent}
            onCaptureAnimationComplete={clearCaptureEvent}
          />
        </div>

        {/* Dice Controls - Below Board */}
        <div className="w-full max-w-md mt-3 bg-card/95 backdrop-blur-sm border border-primary/30 shadow-lg rounded-lg">
          <div className="p-3 flex items-center gap-4">
            {/* Left side: Roll Button + Dice */}
            <div className="flex items-center gap-3">
              {!currentPlayer.isAI && !gameOver && diceValue === null && !isAnimating && (
                <Button
                  onClick={handleRollDice}
                  disabled={isRolling}
                  className="h-12 px-5 font-bold text-sm bg-primary hover:bg-primary/90"
                >
                  Roll Dice
                </Button>
              )}
              <EgyptianDice
                value={diceValue}
                isRolling={isRolling}
                onRoll={handleRollDice}
                disabled={true}
                showRollButton={false}
              />
            </div>
            
            {/* Center: Turn indicator + hint */}
            <div className="flex-1 flex flex-col items-center justify-center">
              <TurnIndicator
                currentPlayer={currentPlayer.color}
                isAI={currentPlayer.isAI}
                isGameOver={!!gameOver}
                winner={gameOver}
              />
              {!currentPlayer.isAI && movableTokens.length > 0 && (
                <p className="text-xs text-muted-foreground text-center mt-1">
                  {t('gameAI.tapGlowingToken')}
                </p>
              )}
            </div>

            {/* Right side: Audio Controls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={toggleMusic}
                className="w-9 h-9 border-primary/30"
                title={musicEnabled ? "Disable Music" : "Enable Music"}
              >
                {musicEnabled ? <Music size={16} /> : <Music2 size={16} />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={toggleSfx}
                className="w-9 h-9 border-primary/30"
                title={soundEnabled ? "Disable SFX" : "Enable SFX"}
              >
                {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
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
              <span>{player.tokens.filter(t => t.position === 62).length}/4</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LudoAI;
