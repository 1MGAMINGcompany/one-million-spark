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
  
  // Component mount tracking - prevents state updates after unmount
  const isMountedRef = useRef(false);
  useEffect(() => {
    isMountedRef.current = true;
    console.log('[LUDO AI] Component mounted');
    return () => {
      isMountedRef.current = false;
      console.log('[LUDO AI] Component unmounted');
    };
  }, []);

  // Wrapper for play function that plays sounds when global sound is enabled
  const playSfx = useCallback((sound: string) => {
    if (!isMountedRef.current) return;
    console.log(`[LUDO SFX] Playing sound: ${sound}, soundEnabled: ${soundEnabled}`);
    play(sound);
  }, [play, soundEnabled]);

  const showToast = useCallback((title: string, description: string, variant?: "default" | "destructive") => {
    if (!isMountedRef.current) return;
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
    gameSessionId,
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

  // AI turn - using unique turn ID to track active AI turn and prevent stale callbacks
  const aiTurnIdRef = useRef(0);
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const safetyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedTurnRef = useRef<number>(0);
  const gameSessionRef = useRef(gameSessionId);
  
  // Refs to avoid stale closures - CRITICAL for bonus turns after rolling 6
  const gameOverRef = useRef(gameOver);
  const diceValueRef = useRef(diceValue);
  const isRollingRef = useRef(isRolling);
  const isAnimatingRef = useRef(isAnimating);
  const currentPlayerIndexRef = useRef(currentPlayerIndex);
  const playersRef = useRef(players);
  
  // Monotonically increasing counter - guarantees unique turn keys
  const globalTurnCounterRef = useRef(0);
  
  // Keep refs in sync with state
  useEffect(() => { gameOverRef.current = gameOver; }, [gameOver]);
  useEffect(() => { diceValueRef.current = diceValue; }, [diceValue]);
  useEffect(() => { isRollingRef.current = isRolling; }, [isRolling]);
  useEffect(() => { isAnimatingRef.current = isAnimating; }, [isAnimating]);
  useEffect(() => { currentPlayerIndexRef.current = currentPlayerIndex; }, [currentPlayerIndex]);
  useEffect(() => { playersRef.current = players; }, [players]);
  
  // Track game session changes to reset refs
  useEffect(() => {
    if (gameSessionId !== gameSessionRef.current) {
      // Game was reset - clear all AI refs
      console.log(`[LUDO AI] Game session changed: ${gameSessionRef.current} -> ${gameSessionId}, clearing refs`);
      gameSessionRef.current = gameSessionId;
      lastProcessedTurnRef.current = 0;
      aiTurnIdRef.current = 0;
      globalTurnCounterRef.current = 0;
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
    }
  }, [gameSessionId]);
  
  // Debounce delay to let state settle before AI acts
  const AI_DEBOUNCE_MS = 150;
  
  // Clear any pending AI timeout
  const clearAiTimeout = useCallback(() => {
    if (aiTimeoutRef.current) {
      clearTimeout(aiTimeoutRef.current);
      aiTimeoutRef.current = null;
    }
    if (safetyTimeoutRef.current) {
      clearTimeout(safetyTimeoutRef.current);
      safetyTimeoutRef.current = null;
    }
  }, []);
  
  useEffect(() => {
    // Only process AI turns - use REFS to avoid stale closure values
    const initialPlayer = playersRef.current[currentPlayerIndexRef.current];
    if (!initialPlayer?.isAI || gameOverRef.current) {
      return;
    }
    
    // Wait for clean state (no dice, not rolling, not animating)
    if (diceValue !== null || isRolling || isAnimating) {
      return;
    }
    
    // Clear any existing timeouts before starting new turn
    clearAiTimeout();
    
    // Capture current session for closure
    const capturedSession = gameSessionId;
    
    // Increment global counter IMMEDIATELY when effect runs - guarantees unique turn key
    globalTurnCounterRef.current += 1;
    const thisTurnCounter = globalTurnCounterRef.current;
    
    // Debounce to let state settle
    const debounceTimeout = setTimeout(() => {
      // Check if component unmounted
      if (!isMountedRef.current) return;
      
      // Check if game was reset during debounce
      if (capturedSession !== gameSessionRef.current) {
        console.log(`[LUDO AI] Session changed during debounce, aborting`);
        return;
      }
      
      // Re-check conditions using REFS (fresh values, not stale closure)
      if (gameOverRef.current || diceValueRef.current !== null || isRollingRef.current || isAnimatingRef.current) {
        return;
      }
      
      // Check player is still AI using REFS (game might have advanced to human turn)
      const currentPlayerNow = playersRef.current[currentPlayerIndexRef.current];
      if (!currentPlayerNow?.isAI) {
        console.log(`[LUDO AI] Player ${currentPlayerIndexRef.current} (${currentPlayerNow?.color}) is not AI, skipping`);
        return;
      }
      
      // Check if a NEWER effect already started processing (numeric comparison)
      if (lastProcessedTurnRef.current >= thisTurnCounter) {
        console.log(`[LUDO AI] Turn ${thisTurnCounter} superseded by ${lastProcessedTurnRef.current}, skipping`);
        return;
      }
      lastProcessedTurnRef.current = thisTurnCounter;
      
      // Increment turn ID to invalidate any previous AI callbacks
      aiTurnIdRef.current += 1;
      const currentTurnId = aiTurnIdRef.current;
      
      const isCurrentTurn = () => 
        currentTurnId === aiTurnIdRef.current && 
        capturedSession === gameSessionRef.current;
      
      console.log(`[LUDO AI] Starting AI turn: session=${capturedSession}, counter=${thisTurnCounter}, turnId=${currentTurnId}`);
      
      // Safety timeout - force advance turn if AI gets stuck for 10 seconds
      safetyTimeoutRef.current = setTimeout(() => {
        if (!isCurrentTurn()) return;
        console.warn(`[LUDO AI] Safety timeout triggered for turn ${currentTurnId}`);
        toast({
          title: "AI Timeout",
          description: "AI took too long, advancing turn",
          duration: 2000,
        });
        setDiceValue(null);
        setMovableTokens([]);
        advanceTurn(1); // Pass 1 to ensure turn advances (not a 6)
      }, 10000);
      
      const delay = difficulty === "easy" ? 800 : difficulty === "medium" ? 500 : 300;
      
      aiTimeoutRef.current = setTimeout(() => {
        try {
          // Check if this turn is still valid AND component is mounted
          if (!isCurrentTurn() || !isMountedRef.current) {
            console.log(`[LUDO AI] Turn ${currentTurnId} invalidated before roll, skipping`);
            return;
          }
          
          rollDice((dice, movable) => {
            try {
              // CRITICAL: Re-check turn validity and mount status after async dice roll
              if (!isCurrentTurn() || !isMountedRef.current) {
                console.log(`[LUDO AI] Turn ${currentTurnId} invalidated after dice roll, skipping`);
                return;
              }
              
              console.log(`[LUDO AI] AI ${currentPlayerNow.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
              
              if (movable.length === 0) {
                // No valid moves - advance turn after showing message
                if (isMountedRef.current) {
                  toast({
                    title: t('gameAI.noValidMoves'),
                    description: t('gameAI.cannotMove'),
                    duration: 1500,
                  });
                }
                aiTimeoutRef.current = setTimeout(() => {
                  if (!isCurrentTurn() || !isMountedRef.current) return;
                  // Clear safety timeout since we're advancing normally
                  if (safetyTimeoutRef.current) {
                    clearTimeout(safetyTimeoutRef.current);
                    safetyTimeoutRef.current = null;
                  }
                  setDiceValue(null);
                  advanceTurn(dice);
                }, 1000);
              } else {
                // AI has valid moves - choose and execute
                const capturedDice = dice;
                setMovableTokens([]);
                
                const aiDelay = difficulty === "easy" ? 600 : difficulty === "medium" ? 400 : 200;
                aiTimeoutRef.current = setTimeout(() => {
                  try {
                    if (!isCurrentTurn() || !isMountedRef.current) return;
                    
                    let chosenToken: number;
                    
                    // Get fresh player data from REFS to avoid stale closure
                    const currentPlayerData = playersRef.current[currentPlayerIndexRef.current];
                    if (!currentPlayerData?.tokens) {
                      console.warn(`[LUDO AI] No player/tokens found for index ${currentPlayerIndexRef.current}`);
                      advanceTurn(1);
                      return;
                    }
                    
                    if (difficulty === "easy") {
                      chosenToken = movable[Math.floor(Math.random() * movable.length)];
                    } else {
                      // Prioritize tokens already on board
                      const tokens = movable.map(i => ({ index: i, token: currentPlayerData.tokens[i] }));
                      tokens.sort((a, b) => {
                        if (a.token.position === -1 && b.token.position !== -1) return 1;
                        if (b.token.position === -1 && a.token.position !== -1) return -1;
                        return b.token.position - a.token.position;
                      });
                      chosenToken = tokens[0].index;
                    }
                    
                    const moveSuccess = executeMove(currentPlayerIndex, chosenToken, capturedDice, () => {
                      if (!isCurrentTurn() || !isMountedRef.current) return;
                      // Clear safety timeout since we're advancing normally
                      if (safetyTimeoutRef.current) {
                        clearTimeout(safetyTimeoutRef.current);
                        safetyTimeoutRef.current = null;
                      }
                      setDiceValue(null);
                      aiTimeoutRef.current = setTimeout(() => {
                        if (!isCurrentTurn() || !isMountedRef.current) return;
                        advanceTurn(capturedDice);
                      }, 200);
                    });
                    
                    // If move failed, force advance turn after delay
                    if (!moveSuccess) {
                      console.warn(`[LUDO AI] Move failed for player ${currentPlayerIndex}, token ${chosenToken}`);
                      aiTimeoutRef.current = setTimeout(() => {
                        if (!isCurrentTurn() || !isMountedRef.current) return;
                        if (safetyTimeoutRef.current) {
                          clearTimeout(safetyTimeoutRef.current);
                          safetyTimeoutRef.current = null;
                        }
                        setDiceValue(null);
                        advanceTurn(capturedDice);
                      }, 500);
                    }
                  } catch (err) {
                    console.error('[LUDO AI] Error during AI move selection:', err);
                    advanceTurn(1);
                  }
                }, aiDelay);
              }
            } catch (err) {
              console.error('[LUDO AI] Error in rollDice callback:', err);
            }
          });
        } catch (err) {
          console.error('[LUDO AI] Error starting AI turn:', err);
        }
      }, delay);
    }, AI_DEBOUNCE_MS);
    
    return () => {
      clearTimeout(debounceTimeout);
    };
  // Include gameSessionId and turnSignal to detect bonus turns and game resets
  }, [currentPlayer.isAI, currentPlayerIndex, gameOver, diceValue, isRolling, isAnimating, difficulty, players, rollDice, executeMove, advanceTurn, setDiceValue, setMovableTokens, t, clearAiTimeout, turnSignal, gameSessionId]);

  // Cleanup AI timeouts on unmount
  useEffect(() => {
    return () => {
      clearAiTimeout();
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
                  {t('gameAI.rollDice')}
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
