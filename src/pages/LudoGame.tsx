import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Music, Music2, Volume2, VolumeX, Users, Wifi, WifiOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Player, PlayerColor, initializePlayers } from "@/components/ludo/ludoTypes";
import { useLudoEngine, LudoMove } from "@/hooks/useLudoEngine";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";


// Player color to wallet mapping (would come from room data in production)
const PLAYER_COLORS: PlayerColor[] = ["gold", "ruby", "emerald", "sapphire"];

const LudoGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [musicEnabled, setMusicEnabled] = useState(false);
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  
  // Room players (in production, this comes from on-chain room data)
  // For testing, we simulate 4 players with the current wallet as gold
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  
  useEffect(() => {
    if (address) {
      // Simulate room with 4 players - real implementation would fetch from contract
      const simulatedPlayers = [
        address, // Gold - human player
        `ai-ruby-${roomId}`,
        `ai-emerald-${roomId}`,
        `ai-sapphire-${roomId}`,
      ];
      setRoomPlayers(simulatedPlayers);
    }
  }, [address, roomId]);

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
    applyExternalMove,
    advanceTurn,
    resetGame,
    setDiceValue,
    setMovableTokens,
    setCurrentPlayerIndex,
  } = useLudoEngine({
    onSoundPlay: playSfx,
    onToast: showToast,
  });

  // Find which player index the current wallet is
  const myPlayerIndex = useMemo(() => {
    if (!address || roomPlayers.length === 0) return -1;
    return roomPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
  }, [address, roomPlayers]);

  const isMyTurnLocal = myPlayerIndex >= 0 && myPlayerIndex === currentPlayerIndex;

  // Convert Ludo players to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return players.map((player, index) => {
      const walletAddress = roomPlayers[index] || `player-${index}`;
      const isHuman = walletAddress.toLowerCase() === address?.toLowerCase();
      
      return {
        address: walletAddress,
        name: isHuman ? "You" : `${player.color.charAt(0).toUpperCase() + player.color.slice(1)} Player`,
        color: player.color,
        status: player.tokens.every(t => t.position === 57) ? "finished" : "active" as const,
        seatIndex: index,
      };
    });
  }, [players, roomPlayers, address]);

  // Current active player address
  const activeTurnAddress = turnPlayers[currentPlayerIndex]?.address || null;

  // Turn notification system
  const {
    isMyTurn,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName: "Ludo",
    roomId: roomId || "unknown",
    players: turnPlayers,
    activeTurnAddress,
    myAddress: address,
    enabled: true,
  });

  // WebRTC sync for multiplayer (only for 2-player mode, Ludo typically doesn't use WebRTC with AI)
  // In production, all 4 players would be real wallets syncing via WebRTC
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    if (message.type === "move" && message.payload) {
      const move = message.payload as LudoMove;
      applyExternalMove(move);
      recordPlayerMove(roomPlayers[move.playerIndex] || "", `Moved to position ${move.endPosition}`);
    }
  }, [applyExternalMove, recordPlayerMove, roomPlayers]);

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
    console.log(`[LUDO MULTI] ${player.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
    
    if (movable.length === 0) {
      toast({
        title: "No valid moves",
        description: "You cannot move any token.",
        duration: 1500,
      });
      setTimeout(() => {
        advanceTurn(dice);
      }, 1000);
    }
  }, [players, currentPlayerIndex, advanceTurn]);

  // Human player rolls dice
  const handleRollDice = useCallback(() => {
    if (!isMyTurnLocal) return;
    rollDice(handleRollComplete);
  }, [rollDice, handleRollComplete, isMyTurnLocal]);

  // Track if we've already consumed the current dice roll
  const moveStartedRef = useRef(false);

  // Handle token click (for human player)
  const handleTokenClick = useCallback((playerIndex: number, tokenIndex: number) => {
    if (isAnimating) return;
    if (playerIndex !== currentPlayerIndex) return;
    if (playerIndex !== myPlayerIndex) return; // Only allow moving own tokens
    if (diceValue === null) return;
    if (isRolling) return;
    
    if (moveStartedRef.current) {
      console.log('[LUDO MULTI] Move already started, ignoring click');
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
    
    const currentDice = diceValue;
    moveStartedRef.current = true;
    
    setMovableTokens([]);
    
    const token = players[playerIndex].tokens[tokenIndex];
    const startPos = token.position;
    const endPos = startPos === -1 ? 0 : startPos + currentDice;
    
    const success = executeMove(currentPlayerIndex, tokenIndex, currentDice, () => {
      // Record the move for turn history
      recordPlayerMove(address || "", `Moved token to position ${endPos}`);
      
      setDiceValue(null);
      moveStartedRef.current = false;
      setTimeout(() => advanceTurn(currentDice), 200);
    });
    
    if (!success) {
      moveStartedRef.current = false;
    }
  }, [isAnimating, currentPlayerIndex, myPlayerIndex, diceValue, isRolling, movableTokens, players, executeMove, advanceTurn, setDiceValue, setMovableTokens, recordPlayerMove, address]);

  // AI turn handling (for simulated opponents)
  const aiMoveInProgressRef = useRef(false);
  
  useEffect(() => {
    // Only trigger AI if it's not human's turn
    if (currentPlayerIndex !== myPlayerIndex && !gameOver && diceValue === null && !isRolling && !isAnimating && !aiMoveInProgressRef.current && myPlayerIndex >= 0) {
      const delay = 800;
      const timeout = setTimeout(() => {
        aiMoveInProgressRef.current = true;
        
        rollDice((dice, movable) => {
          console.log(`[LUDO MULTI] AI ${currentPlayer.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
          
          if (movable.length === 0) {
            setTimeout(() => {
              advanceTurn(dice);
              aiMoveInProgressRef.current = false;
            }, 1000);
          } else {
            const capturedDice = dice;
            setMovableTokens([]);
            
            setTimeout(() => {
              // Simple AI: random token selection
              const chosenToken = movable[Math.floor(Math.random() * movable.length)];
              
              executeMove(currentPlayerIndex, chosenToken, capturedDice, () => {
                const token = players[currentPlayerIndex].tokens[chosenToken];
                const endPos = token.position === -1 ? 0 : token.position + capturedDice;
                recordPlayerMove(roomPlayers[currentPlayerIndex] || "", `Moved to position ${endPos}`);
                
                setDiceValue(null);
                setTimeout(() => {
                  advanceTurn(capturedDice);
                  aiMoveInProgressRef.current = false;
                }, 200);
              });
            }, 600);
          }
        });
      }, delay);
      return () => clearTimeout(timeout);
    }
  }, [currentPlayerIndex, myPlayerIndex, currentPlayer?.color, gameOver, diceValue, isRolling, isAnimating, players, rollDice, executeMove, advanceTurn, setDiceValue, setMovableTokens, turnSignal, recordPlayerMove, roomPlayers]);

  // Require wallet connection
  if (!walletConnected || !address) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Connect Wallet to Play</h3>
          <p className="text-muted-foreground">Please connect your wallet to join this game.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Turn Banner (fallback for no permission) */}
      <TurnBanner
        gameName="Ludo"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isMyTurn && !gameOver}
      />

      {/* Header */}
      <div className="relative py-3 px-4 flex-shrink-0">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Link to="/room-list" className="flex items-center gap-2">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Rooms</span>
              </Link>
            </Button>
            <div>
              <h1 className="text-lg sm:text-xl font-display font-bold text-primary">
                Ludo - Room #{roomId}
              </h1>
              <p className="text-xs text-muted-foreground">
                4-Player Multiplayer
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Turn History Drawer */}
            <TurnHistoryDrawer events={turnHistory} />
            
            {/* Notification Toggle */}
            <NotificationToggle
              enabled={notificationsEnabled}
              hasPermission={hasPermission}
              onToggle={toggleNotifications}
            />
            
            <Button onClick={resetGame} variant="outline" size="sm" className="border-primary/30">
              <RotateCcw size={16} />
              <span className="hidden sm:inline ml-1">Reset</span>
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
            myAddress={address}
          />
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-4">
        <div className="w-full max-w-4xl flex flex-col md:flex-row items-center justify-center gap-4 md:gap-8">
          
          {/* Dice - Left side on desktop */}
          <div className="hidden md:flex flex-col items-center gap-4 w-32">
            <TurnIndicator
              currentPlayer={currentPlayer.color}
              isAI={currentPlayerIndex !== myPlayerIndex}
              isGameOver={!!gameOver}
              winner={gameOver}
            />
            <EgyptianDice
              value={diceValue}
              isRolling={isRolling}
              onRoll={handleRollDice}
              disabled={isRolling || diceValue !== null || !!gameOver || isAnimating || currentPlayerIndex !== myPlayerIndex}
              showRollButton={currentPlayerIndex === myPlayerIndex && !gameOver && diceValue === null && !isAnimating}
            />
            {currentPlayerIndex === myPlayerIndex && movableTokens.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Tap a glowing token to move
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
            movableTokens={isAnimating ? [] : (currentPlayerIndex !== myPlayerIndex ? [] : movableTokens)}
            onTokenClick={handleTokenClick}
          />

          {/* Dice - Below board on mobile */}
          <div className="md:hidden flex flex-col items-center gap-3">
            <TurnIndicator
              currentPlayer={currentPlayer.color}
              isAI={currentPlayerIndex !== myPlayerIndex}
              isGameOver={!!gameOver}
              winner={gameOver}
            />
            <EgyptianDice
              value={diceValue}
              isRolling={isRolling}
              onRoll={handleRollDice}
              disabled={isRolling || diceValue !== null || !!gameOver || isAnimating || currentPlayerIndex !== myPlayerIndex}
              showRollButton={currentPlayerIndex === myPlayerIndex && !gameOver && diceValue === null && !isAnimating}
            />
            {currentPlayerIndex === myPlayerIndex && movableTokens.length > 0 && (
              <p className="text-xs text-muted-foreground text-center">
                Tap a glowing token to move
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

      {/* Game Over Modal */}
      {gameOver && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-primary/30 rounded-lg p-8 text-center space-y-4 max-w-sm mx-4">
            <h2 className="text-2xl font-display font-bold text-primary">
              {gameOver === PLAYER_COLORS[myPlayerIndex] ? "Victory!" : "Game Over"}
            </h2>
            <p className="text-muted-foreground capitalize">
              {gameOver} player wins!
            </p>
            <div className="flex gap-4 justify-center">
              <Button onClick={resetGame} variant="default">
                Play Again
              </Button>
              <Button asChild variant="outline">
                <Link to="/room-list">Back to Rooms</Link>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Player Status Footer */}
      <div className="flex-shrink-0 py-2 px-4">
        <div className="max-w-4xl mx-auto flex justify-center gap-6 text-xs text-muted-foreground">
          {players.map((player, idx) => (
            <div key={player.color} className="flex items-center gap-1">
              <span className="capitalize font-medium" style={{ 
                color: player.color === 'gold' ? '#FFD700' : 
                       player.color === 'ruby' ? '#E74C3C' : 
                       player.color === 'emerald' ? '#2ECC71' : '#3498DB' 
              }}>
                {idx === myPlayerIndex ? "You" : player.color}:
              </span>
              <span>{player.tokens.filter(t => t.position === 57).length}/4</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LudoGame;