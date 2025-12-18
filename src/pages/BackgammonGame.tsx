import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, RotateCw, Gem, Flag, Users, Wifi, WifiOff } from "lucide-react";
import { BackgammonRulesDialog } from "@/components/BackgammonRulesDialog";
import { Dice3D, CheckerStack } from "@/components/BackgammonPieces";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import { useGameChat, ChatPlayer, ChatMessage } from "@/hooks/useGameChat";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";
import GameChatPanel from "@/components/GameChatPanel";
import { toast } from "@/hooks/use-toast";
import {
  type Player,
  type GameState,
  type Move,
  type GameResultType,
  getInitialBoard,
  canBearOff,
  getAllLegalMoves,
  getLegalMovesFromBar,
  getLegalMovesFromPoint,
  applyMove as applyMoveEngine,
  consumeDie,
  checkWinner,
  getGameResult,
} from "@/lib/backgammonEngine";

// Multiplayer move message
interface BackgammonMoveMessage {
  type: "dice_roll" | "move" | "turn_end";
  dice?: number[];
  move?: Move;
  gameState: GameState;
  remainingMoves: number[];
}

// Format result type for display
const formatResultType = (resultType: GameResultType | null): { label: string; multiplier: string; color: string } => {
  switch (resultType) {
    case "backgammon":
      return { label: "BACKGAMMON!", multiplier: "3×", color: "text-red-500" };
    case "gammon":
      return { label: "GAMMON!", multiplier: "2×", color: "text-orange-500" };
    case "single":
    default:
      return { label: "Single Game", multiplier: "1×", color: "text-primary" };
  }
};

const BackgammonGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  // Game state
  const [gameState, setGameState] = useState<GameState>({
    points: getInitialBoard(),
    bar: { player: 0, ai: 0 },
    bearOff: { player: 0, ai: 0 },
  });
  const [dice, setDice] = useState<number[]>([]);
  const [remainingMoves, setRemainingMoves] = useState<number[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState<"player" | "ai">("player");
  const [selectedPoint, setSelectedPoint] = useState<number | null>(null);
  const [gameStatus, setGameStatus] = useState("Waiting for opponent...");
  const [gameOver, setGameOver] = useState(false);
  const [validMoves, setValidMoves] = useState<number[]>([]);
  const [gameResultInfo, setGameResultInfo] = useState<{ winner: Player | null; resultType: GameResultType | null; multiplier: number } | null>(null);

  // Multiplayer state
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myRole, setMyRole] = useState<"player" | "ai">("player"); // "player" = Gold, "ai" = Black

  // Setup room players when wallet connects
  useEffect(() => {
    if (address && roomId) {
      const simulatedPlayers = [
        address, // Gold player
        `opponent-${roomId}`, // Black player
      ];
      setRoomPlayers(simulatedPlayers);
      const myIndex = simulatedPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
      setMyRole(myIndex === 0 ? "player" : "ai");
    }
  }, [address, roomId]);

  const isMyTurn = currentPlayer === myRole;
  const isFlipped = myRole === "ai"; // Black player sees flipped board

  // Convert to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      const color = index === 0 ? "gold" : "black";
      return {
        address: playerAddress,
        name: isMe ? "You" : "Opponent",
        color,
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address]);

  const activeTurnAddress = useMemo(() => {
    const turnIndex = currentPlayer === "player" ? 0 : 1;
    return turnPlayers[turnIndex]?.address || null;
  }, [currentPlayer, turnPlayers]);

  // Turn notification system
  const {
    isMyTurn: isMyTurnNotification,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName: "Backgammon",
    roomId: roomId || "unknown",
    players: turnPlayers,
    activeTurnAddress,
    myAddress: address,
    enabled: true,
  });

  // Chat players derived from turn players
  const chatPlayers: ChatPlayer[] = useMemo(() => {
    return turnPlayers.map((tp) => ({
      wallet: tp.address,
      displayName: tp.name,
      color: tp.color,
      seatIndex: tp.seatIndex,
    }));
  }, [turnPlayers]);

  // Game chat hook ref (sendChat defined after WebRTC hook)
  const chatRef = useRef<ReturnType<typeof useGameChat> | null>(null);

  // Handle WebRTC messages
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    // Handle chat messages
    if (message.type === "chat" && message.payload) {
      try {
        const chatMsg = typeof message.payload === "string" 
          ? JSON.parse(message.payload) 
          : message.payload;
        chatRef.current?.receiveMessage(chatMsg);
      } catch (e) {
        console.error("[BackgammonGame] Failed to parse chat message:", e);
      }
      return;
    }
    
    if (message.type === "move" && message.payload) {
      const moveMsg = message.payload as BackgammonMoveMessage;
      
      if (moveMsg.type === "dice_roll" && moveMsg.dice) {
        setDice(moveMsg.dice);
        const moves = moveMsg.dice[0] === moveMsg.dice[1] 
          ? [moveMsg.dice[0], moveMsg.dice[0], moveMsg.dice[0], moveMsg.dice[0]]
          : moveMsg.dice;
        setRemainingMoves(moves);
        play('backgammon_dice');
        setGameStatus("Opponent rolled dice");
      } else if (moveMsg.type === "move" && moveMsg.move) {
        const isBearOff = moveMsg.move.to === -2 || moveMsg.move.to === 25;
        if (isBearOff) {
          play('backgammon_bearoff');
        } else {
          play('backgammon_move');
        }
        setGameState(moveMsg.gameState);
        setRemainingMoves(moveMsg.remainingMoves);
        recordPlayerMove(roomPlayers[currentPlayer === "player" ? 0 : 1] || "", `Moved checker`);
        
        // Check for winner
        const winner = checkWinner(moveMsg.gameState);
        if (winner) {
          const result = getGameResult(moveMsg.gameState);
          setGameResultInfo(result);
          const resultDisplay = formatResultType(result.resultType);
          setGameStatus(winner === myRole ? `You win! ${resultDisplay.label}` : `You lose! ${resultDisplay.label}`);
          setGameOver(true);
          chatRef.current?.addSystemMessage(winner === myRole ? "You win!" : "Opponent wins!");
          play(winner === myRole ? 'chess_win' : 'chess_lose');
        }
      } else if (moveMsg.type === "turn_end") {
        setCurrentPlayer(prev => prev === "player" ? "ai" : "player");
        setDice([]);
        setRemainingMoves([]);
        setGameStatus(isMyTurn ? "Opponent's turn" : "Your turn - Roll the dice!");
      }
    } else if (message.type === "resign") {
      setGameStatus("Opponent resigned - You win!");
      setGameOver(true);
      chatRef.current?.addSystemMessage("Opponent resigned");
      play('chess_win');
      toast({ title: "Victory!", description: "Your opponent has resigned." });
    }
  }, [play, recordPlayerMove, roomPlayers, currentPlayer, myRole, isMyTurn]);

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
    sendChat,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length === 2,
  });

  // Handle chat message sending via WebRTC
  const handleChatSend = useCallback((msg: ChatMessage) => {
    sendChat(JSON.stringify(msg));
  }, [sendChat]);

  // Game chat hook
  const chat = useGameChat({
    roomId: roomId || "",
    myWallet: address,
    players: chatPlayers,
    onSendMessage: handleChatSend,
    enabled: roomPlayers.length === 2,
  });
  chatRef.current = chat;

  // Add system message when game starts
  useEffect(() => {
    if (roomPlayers.length === 2 && chat.messages.length === 0) {
      chat.addSystemMessage("Game started! Good luck!");
    }
  }, [roomPlayers.length]);

  // Update status based on connection
  useEffect(() => {
    if (roomPlayers.length < 2) {
      setGameStatus("Waiting for opponent...");
    } else if (connectionState === "connecting") {
      setGameStatus("Connecting to opponent...");
    } else if (connectionState === "connected" && !gameOver) {
      setGameStatus(isMyTurn ? "Your turn - Roll the dice!" : "Opponent's turn");
    }
  }, [roomPlayers.length, connectionState, isMyTurn, gameOver]);

  // Apply move with sound
  const applyMoveWithSound = useCallback((state: GameState, move: Move, player: Player): GameState => {
    const isBearOff = move.to === -2 || move.to === 25;
    const newState = applyMoveEngine(state, move, player);
    
    if (isBearOff) {
      play('backgammon_bearoff');
    } else {
      play('backgammon_move');
    }
    
    return newState;
  }, [play]);

  // Roll dice
  const rollDice = useCallback(() => {
    if (!isMyTurn || dice.length > 0 || gameOver) return;
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const newDice = [d1, d2];
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    
    play('backgammon_dice');
    setDice(newDice);
    setRemainingMoves(moves);
    
    // Send to opponent
    const moveMsg: BackgammonMoveMessage = {
      type: "dice_roll",
      dice: newDice,
      gameState,
      remainingMoves: moves,
    };
    sendMove(moveMsg);
    
    // Check if moves available
    const barCount = myRole === "player" ? gameState.bar.player : gameState.bar.ai;
    if (barCount > 0) {
      const barMoves = getLegalMovesFromBar(gameState, moves, myRole);
      if (barMoves.length === 0) {
        setGameStatus("All entry points blocked!");
        setTimeout(() => endTurn(), 1500);
        return;
      }
      setGameStatus("Re-enter from bar");
    } else {
      const allMoves = getAllLegalMoves(gameState, moves, myRole);
      if (allMoves.length === 0) {
        setGameStatus("No legal moves!");
        setTimeout(() => endTurn(), 1000);
        return;
      }
      setGameStatus("Select a checker to move");
    }
  }, [isMyTurn, dice, gameOver, gameState, myRole, play, sendMove]);

  // End turn
  const endTurn = useCallback(() => {
    const moveMsg: BackgammonMoveMessage = {
      type: "turn_end",
      gameState,
      remainingMoves: [],
    };
    sendMove(moveMsg);
    
    setCurrentPlayer(prev => prev === "player" ? "ai" : "player");
    setDice([]);
    setRemainingMoves([]);
    setSelectedPoint(null);
    setValidMoves([]);
    setGameStatus("Opponent's turn");
  }, [gameState, sendMove]);

  // Handle point click
  const handlePointClick = useCallback((pointIndex: number) => {
    if (!isMyTurn || remainingMoves.length === 0 || gameOver) return;
    
    const barCount = myRole === "player" ? gameState.bar.player : gameState.bar.ai;
    
    // Bar logic
    if (barCount > 0) {
      const barMoves = getLegalMovesFromBar(gameState, remainingMoves, myRole);
      
      if (pointIndex === -1) {
        if (barMoves.length > 0) {
          setSelectedPoint(-1);
          setValidMoves(barMoves.map(m => m.to));
          setGameStatus("Select entry point");
        }
        return;
      }
      
      const move = barMoves.find(m => m.to === pointIndex);
      if (move) {
        const newState = applyMoveWithSound(gameState, move, myRole);
        const newRemaining = consumeDie(remainingMoves, move.dieValue);
        
        setGameState(newState);
        setRemainingMoves(newRemaining);
        setSelectedPoint(null);
        setValidMoves([]);
        
        // Send move
        const moveMsg: BackgammonMoveMessage = {
          type: "move",
          move,
          gameState: newState,
          remainingMoves: newRemaining,
        };
        sendMove(moveMsg);
        recordPlayerMove(address || "", "Re-entered from bar");
        
        // Check winner or end turn
        const winner = checkWinner(newState);
        if (winner) {
          const result = getGameResult(newState);
          setGameResultInfo(result);
          const resultDisplay = formatResultType(result.resultType);
          setGameStatus(`You win! ${resultDisplay.label}`);
          setGameOver(true);
          play('chess_win');
        } else if (newRemaining.length === 0) {
          endTurn();
        } else {
          const allMoves = getAllLegalMoves(newState, newRemaining, myRole);
          if (allMoves.length === 0) {
            endTurn();
          } else {
            setGameStatus("Continue moving");
          }
        }
      }
      return;
    }
    
    // Normal move logic
    if (selectedPoint === null) {
      const checkerValue = gameState.points[pointIndex];
      const hasMyChecker = myRole === "player" ? checkerValue > 0 : checkerValue < 0;
      
      if (hasMyChecker) {
        const pointMoves = getLegalMovesFromPoint(gameState, pointIndex, remainingMoves, myRole);
        if (pointMoves.length > 0) {
          setSelectedPoint(pointIndex);
          setValidMoves(pointMoves.map(m => m.to));
          setGameStatus("Select destination");
        }
      }
    } else {
      if (pointIndex === selectedPoint) {
        setSelectedPoint(null);
        setValidMoves([]);
        setGameStatus("Select a checker");
        return;
      }
      
      if (validMoves.includes(pointIndex) || (pointIndex === -2 && validMoves.includes(-2))) {
        const moves = getLegalMovesFromPoint(gameState, selectedPoint, remainingMoves, myRole);
        const move = moves.find(m => m.to === pointIndex);
        
        if (move) {
          const newState = applyMoveWithSound(gameState, move, myRole);
          const newRemaining = consumeDie(remainingMoves, move.dieValue);
          
          setGameState(newState);
          setRemainingMoves(newRemaining);
          
          // Send move
          const moveMsg: BackgammonMoveMessage = {
            type: "move",
            move,
            gameState: newState,
            remainingMoves: newRemaining,
          };
          sendMove(moveMsg);
          recordPlayerMove(address || "", `Moved from ${selectedPoint + 1}`);
          
          // Check winner
          const winner = checkWinner(newState);
          if (winner) {
            const result = getGameResult(newState);
            setGameResultInfo(result);
            const resultDisplay = formatResultType(result.resultType);
            setGameStatus(`You win! ${resultDisplay.label}`);
            setGameOver(true);
            play('chess_win');
          } else if (newRemaining.length === 0) {
            endTurn();
          } else {
            const allMoves = getAllLegalMoves(newState, newRemaining, myRole);
            if (allMoves.length === 0) {
              endTurn();
            } else {
              setGameStatus("Continue moving");
            }
          }
        }
      }
      
      setSelectedPoint(null);
      setValidMoves([]);
    }
  }, [isMyTurn, remainingMoves, gameOver, myRole, gameState, selectedPoint, validMoves, applyMoveWithSound, sendMove, recordPlayerMove, address, endTurn, play]);

  const handleResign = useCallback(() => {
    sendResign();
    setGameStatus("You resigned - Opponent wins!");
    setGameOver(true);
    play('chess_lose');
  }, [sendResign, play]);

  // Require wallet
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

  // Render point for desktop
  const renderPoint = (index: number, isTop: boolean) => {
    const displayIndex = isFlipped ? 23 - index : index;
    const value = gameState.points[displayIndex];
    const checkerCount = Math.abs(value);
    const isPlayer = value > 0;
    const isSelected = selectedPoint === displayIndex;
    const isValidTarget = validMoves.includes(displayIndex);
    
    return (
      <div
        key={displayIndex}
        onClick={() => handlePointClick(displayIndex)}
        className={cn(
          "relative flex items-center cursor-pointer transition-all",
          isTop ? "flex-col" : "flex-col-reverse"
        )}
        style={{ width: 48 }}
      >
        <svg
          width={48}
          height={140}
          viewBox="0 0 48 140"
          className={cn(
            "transition-all duration-200",
            isTop ? "" : "rotate-180",
            isValidTarget && "drop-shadow-[0_0_25px_hsl(45_93%_70%)]"
          )}
        >
          <polygon
            points="24,0 0,140 48,140"
            fill={index % 2 === 0 ? "hsl(45 80% 45%)" : "hsl(35 50% 45%)"}
            stroke="hsl(35 60% 30%)"
            strokeWidth="1"
          />
        </svg>
        
        {/* Checkers */}
        <div className={cn(
          "absolute left-1/2 -translate-x-1/2 flex gap-0.5",
          isTop ? "top-2 flex-col" : "bottom-2 flex-col-reverse"
        )}>
          {Array.from({ length: Math.min(checkerCount, 5) }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-10 h-10 rounded-full border-2 shadow-lg transition-all",
                isPlayer 
                  ? "bg-gradient-to-br from-yellow-400 to-yellow-600 border-yellow-300"
                  : "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500",
                isSelected && "ring-2 ring-primary animate-pulse"
              )}
            >
              {i === Math.min(checkerCount, 5) - 1 && checkerCount > 5 && (
                <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-white">
                  {checkerCount}
                </span>
              )}
            </div>
          ))}
        </div>
        
        {/* Valid move indicator */}
        {isValidTarget && (
          <div className="absolute inset-0 bg-primary/20 rounded animate-pulse" />
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <TurnBanner
        gameName="Backgammon"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isMyTurnNotification && !gameOver}
      />

      {/* Header */}
      <div className="border-b border-primary/20 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <Link to="/room-list" className="flex items-center gap-2">
                <ArrowLeft size={18} />
                <span className="hidden sm:inline">Rooms</span>
              </Link>
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <Gem className="w-4 h-4 text-primary" />
                <h1 className="text-lg font-display font-bold text-primary">
                  Backgammon - Room #{roomId}
                </h1>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                {peerConnected ? (
                  <><Wifi className="w-3 h-3 text-green-500" /> Connected</>
                ) : (
                  <><WifiOff className="w-3 h-3 text-yellow-500" /> {connectionState}</>
                )}
                <span className="mx-1">•</span>
                Playing as {myRole === "player" ? "Gold" : "Black"}
                <span className="mx-1">•</span>
                {myRole === "player" ? <RotateCw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
                {myRole === "player" ? "Clockwise" : "Counter-CW"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <BackgammonRulesDialog variant="button" />
            <TurnHistoryDrawer events={turnHistory} />
            <NotificationToggle
              enabled={notificationsEnabled}
              hasPermission={hasPermission}
              onToggle={toggleNotifications}
            />
          </div>
        </div>
      </div>

      {/* Turn Status */}
      <div className="px-4 py-2">
        <div className="max-w-6xl mx-auto">
          <TurnStatusHeader
            isMyTurn={isMyTurnNotification}
            activePlayer={turnPlayers[currentPlayer === "player" ? 0 : 1]}
            players={turnPlayers}
            myAddress={address}
          />
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          {/* Board */}
          <div className="bg-gradient-to-br from-amber-900 to-amber-950 rounded-xl p-4 border-4 border-primary/30 shadow-2xl">
            {/* Top row (points 13-24 or 12-1 when flipped) */}
            <div className="flex justify-between mb-2">
              <div className="flex">
                {Array.from({ length: 6 }).map((_, i) => renderPoint(isFlipped ? 11 - i : 12 + i, true))}
              </div>
              {/* Bar */}
              <div 
                className="w-12 flex flex-col items-center justify-start pt-2 bg-amber-950/50 rounded cursor-pointer"
                onClick={() => handlePointClick(-1)}
              >
                {(myRole === "ai" ? gameState.bar.ai : gameState.bar.player) > 0 && (
                  <div className={cn(
                    "w-8 h-8 rounded-full border-2 shadow-md",
                    myRole === "player" 
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-600 border-yellow-300"
                      : "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500",
                    selectedPoint === -1 && "ring-2 ring-primary animate-pulse"
                  )}>
                    <span className="flex items-center justify-center h-full text-xs font-bold text-white">
                      {myRole === "ai" ? gameState.bar.ai : gameState.bar.player}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex">
                {Array.from({ length: 6 }).map((_, i) => renderPoint(isFlipped ? 5 - i : 18 + i, true))}
              </div>
            </div>

            {/* Bottom row (points 12-1 or 13-24 when flipped) */}
            <div className="flex justify-between mt-2">
              <div className="flex">
                {Array.from({ length: 6 }).map((_, i) => renderPoint(isFlipped ? 12 + i : 11 - i, false))}
              </div>
              {/* Bar (opponent) */}
              <div className="w-12 flex flex-col items-center justify-end pb-2 bg-amber-950/50 rounded">
                {(myRole === "player" ? gameState.bar.ai : gameState.bar.player) > 0 && (
                  <div className={cn(
                    "w-8 h-8 rounded-full border-2 shadow-md",
                    myRole === "ai" 
                      ? "bg-gradient-to-br from-yellow-400 to-yellow-600 border-yellow-300"
                      : "bg-gradient-to-br from-gray-700 to-gray-900 border-gray-500"
                  )}>
                    <span className="flex items-center justify-center h-full text-xs font-bold text-white">
                      {myRole === "player" ? gameState.bar.ai : gameState.bar.player}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex">
                {Array.from({ length: 6 }).map((_, i) => renderPoint(isFlipped ? 18 + i : 5 - i, false))}
              </div>
            </div>

            {/* Bear off areas */}
            <div className="flex justify-between mt-4">
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Your Bear Off</p>
                <div className="w-12 h-8 bg-primary/20 rounded flex items-center justify-center">
                  <span className="font-bold text-primary">
                    {myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}
                  </span>
                </div>
              </div>
              <div className="text-center">
                <p className="text-xs text-muted-foreground mb-1">Opponent Bear Off</p>
                <div className="w-12 h-8 bg-muted/20 rounded flex items-center justify-center">
                  <span className="font-bold text-muted-foreground">
                    {myRole === "player" ? gameState.bearOff.ai : gameState.bearOff.player}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex flex-col items-center gap-4">
            {/* Dice */}
            <div className="flex items-center gap-4">
              {dice.length > 0 ? (
                <div className="flex gap-2">
                  {dice.map((d, i) => (
                    <div key={i} className={cn(
                      "w-12 h-12 bg-white rounded-lg flex items-center justify-center text-2xl font-bold shadow-lg",
                      !remainingMoves.includes(d) && "opacity-30"
                    )}>
                      {d}
                    </div>
                  ))}
                </div>
              ) : isMyTurn && !gameOver ? (
                <Button onClick={rollDice} size="lg" className="px-8">
                  Roll Dice
                </Button>
              ) : null}
            </div>

            {/* Status */}
            <div className={cn(
              "px-4 py-2 rounded-lg border text-sm font-medium",
              gameOver 
                ? gameStatus.includes("win") 
                  ? "bg-green-500/10 border-green-500/30 text-green-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-primary/10 border-primary/30 text-primary"
            )}>
              {gameStatus}
            </div>

            {/* Actions */}
            {!gameOver && isMyTurn && (
              <Button variant="destructive" size="sm" onClick={handleResign}>
                <Flag className="w-4 h-4 mr-1" /> Resign
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Game Over Modal */}
      {gameOver && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-primary/30 rounded-lg p-8 text-center space-y-4 max-w-sm mx-4">
            <h2 className="text-2xl font-display font-bold text-primary">
              {gameStatus.includes("win") ? "Victory!" : "Game Over"}
            </h2>
            {gameResultInfo && (
              <p className={cn("text-lg font-semibold", formatResultType(gameResultInfo.resultType).color)}>
                {formatResultType(gameResultInfo.resultType).label} ({formatResultType(gameResultInfo.resultType).multiplier})
              </p>
            )}
            <div className="flex gap-4 justify-center">
              <Button asChild variant="default">
                <Link to="/room-list">Find New Game</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/play-ai/backgammon">Practice vs AI</Link>
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Chat Panel */}
      <GameChatPanel chat={chat} />
    </div>
  );
};

export default BackgammonGame;