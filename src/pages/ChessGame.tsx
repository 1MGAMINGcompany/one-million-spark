import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Chess, Square, PieceSymbol, Color } from "chess.js";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useCaptureAnimations } from "@/components/CaptureAnimationLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star, Flag, Users, Wifi, WifiOff } from "lucide-react";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";
import { toast } from "@/hooks/use-toast";

// Animation Toggle Component
const AnimationToggle = ({ 
  enabled, 
  onToggle 
}: { 
  enabled: boolean; 
  onToggle: () => void;
}) => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-3 group"
    >
      <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
        {t('gameAI.boardAnimations')}
      </span>
      <div 
        className={`relative w-14 h-7 rounded-full transition-all duration-300 ${
          enabled 
            ? "bg-gradient-to-r from-primary/80 to-primary shadow-[0_0_12px_-2px_hsl(45_93%_54%_/_0.6)]" 
            : "bg-muted/30 border border-muted-foreground/20"
        }`}
      >
        <span className={`absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold transition-opacity ${
          enabled ? "opacity-0" : "opacity-50"
        }`}>
          OFF
        </span>
        <div 
          className={`absolute top-0.5 w-6 h-6 rounded-full transition-all duration-300 flex items-center justify-center ${
            enabled 
              ? "left-[calc(100%-26px)] bg-gradient-to-br from-gold-light to-primary shadow-[0_0_8px_hsl(45_93%_54%_/_0.5)]" 
              : "left-0.5 bg-muted-foreground/30"
          }`}
        >
          <div 
            className={`w-3 h-3 transition-opacity ${enabled ? "opacity-100" : "opacity-30"}`}
            style={{
              background: enabled 
                ? "linear-gradient(to top, hsl(35 80% 30%) 0%, hsl(45 93% 70%) 100%)" 
                : "linear-gradient(to top, hsl(0 0% 30%) 0%, hsl(0 0% 50%) 100%)",
              clipPath: "polygon(50% 0%, 0% 100%, 100% 100%)"
            }}
          />
        </div>
      </div>
    </button>
  );
};

interface ChessMove {
  from: Square;
  to: Square;
  promotion?: string;
  fen: string;
  san: string;
}

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [game, setGame] = useState(new Chess());
  const [gameStatus, setGameStatus] = useState<string>("Waiting for opponent...");
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState<string | null>(null);

  // Room players - in production, this comes from on-chain room data
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<"w" | "b">("w");

  // Setup room players when wallet connects
  useEffect(() => {
    if (address && roomId) {
      // Simulate 2-player room - player 1 is white, player 2 is black
      const simulatedPlayers = [
        address, // White player (first to join)
        `opponent-${roomId}`, // Black player
      ];
      setRoomPlayers(simulatedPlayers);
      
      // Determine my color (first player is white)
      const myIndex = simulatedPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
      setMyColor(myIndex === 0 ? "w" : "b");
    }
  }, [address, roomId]);

  // Capture animations hook
  const { animations, triggerAnimation, handleAnimationComplete } = useCaptureAnimations(animationsEnabled);

  // Check if it's my turn
  const isMyTurn = game.turn() === myColor;

  // Convert to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      const color = index === 0 ? "white" : "black";
      return {
        address: playerAddress,
        name: isMe ? "You" : "Opponent",
        color,
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address]);

  // Active turn address based on chess turn
  const activeTurnAddress = useMemo(() => {
    const turnIndex = game.turn() === "w" ? 0 : 1;
    return turnPlayers[turnIndex]?.address || null;
  }, [game, turnPlayers]);

  // Turn notification system
  const {
    isMyTurn: isMyTurnNotification,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName: "Chess",
    roomId: roomId || "unknown",
    players: turnPlayers,
    activeTurnAddress,
    myAddress: address,
    enabled: true,
  });

  // Handle incoming WebRTC messages
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    console.log("[ChessGame] Received message:", message.type);
    
    if (message.type === "move" && message.payload) {
      const move = message.payload as ChessMove;
      const gameCopy = new Chess(game.fen());
      
      // Get piece info before move for animations
      const attackingPiece = gameCopy.get(move.from);
      const targetPiece = gameCopy.get(move.to);
      
      try {
        const result = gameCopy.move({
          from: move.from,
          to: move.to,
          promotion: (move.promotion || 'q') as 'q' | 'r' | 'b' | 'n',
        });
        
        if (result) {
          // Play appropriate sound
          if (targetPiece) {
            play('chess_capture');
            if (animationsEnabled && attackingPiece) {
              triggerAnimation(attackingPiece.type, targetPiece.type, move.to);
            }
          } else {
            play('chess_move');
          }
          
          if (result.promotion) {
            play('chess_promotion');
          }
          
          setGame(new Chess(gameCopy.fen()));
          setMoveHistory(gameCopy.history());
          recordPlayerMove(roomPlayers[game.turn() === "w" ? 1 : 0] || "", result.san);
          
          // Check game over
          checkGameOver(gameCopy);
        }
      } catch (error) {
        console.error("[ChessGame] Error applying opponent move:", error);
      }
    } else if (message.type === "resign") {
      setGameStatus("Opponent resigned - You win!");
      setGameOver(true);
      play('chess_win');
      toast({
        title: "Victory!",
        description: "Your opponent has resigned.",
      });
    } else if (message.type === "draw_offer") {
      setDrawOffered(true);
      setDrawOfferFrom(message.sender || "opponent");
      toast({
        title: "Draw Offered",
        description: "Your opponent is offering a draw.",
      });
    } else if (message.type === "draw_accept") {
      setGameStatus("Draw by agreement");
      setGameOver(true);
      toast({
        title: "Draw",
        description: "Game ended in a draw by agreement.",
      });
    } else if (message.type === "draw_reject") {
      setDrawOffered(false);
      setDrawOfferFrom(null);
      toast({
        title: "Draw Declined",
        description: "Your draw offer was declined.",
      });
    }
  }, [game, play, animationsEnabled, triggerAnimation, recordPlayerMove, roomPlayers]);

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawReject,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length === 2,
  });

  // Update game status based on connection
  useEffect(() => {
    if (roomPlayers.length < 2) {
      setGameStatus("Waiting for opponent...");
    } else if (connectionState === "connecting") {
      setGameStatus("Connecting to opponent...");
    } else if (connectionState === "connected") {
      setGameStatus(isMyTurn ? "Your turn" : "Opponent's turn");
    } else if (connectionState === "disconnected") {
      setGameStatus("Connection lost - Reconnecting...");
    }
  }, [roomPlayers.length, connectionState, isMyTurn]);

  const checkGameOver = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      const isPlayerWin = currentGame.turn() !== myColor;
      const winner = isPlayerWin ? "Checkmate - You win!" : "Checkmate - You lose!";
      setGameStatus(winner);
      setGameOver(true);
      play(isPlayerWin ? 'chess_win' : 'chess_lose');
      return true;
    }
    if (currentGame.isStalemate()) {
      setGameStatus("Draw - Stalemate");
      setGameOver(true);
      return true;
    }
    if (currentGame.isDraw()) {
      setGameStatus("Draw");
      setGameOver(true);
      return true;
    }
    if (currentGame.isCheck()) {
      play('chess_check');
    }
    return false;
  }, [myColor, play]);

  const handleMove = useCallback((from: Square, to: Square): boolean => {
    if (gameOver || !isMyTurn) return false;

    const gameCopy = new Chess(game.fen());
    
    const attackingPiece = gameCopy.get(from);
    const targetPiece = gameCopy.get(to);
    
    try {
      const move = gameCopy.move({
        from,
        to,
        promotion: "q",
      });

      if (move === null) return false;

      // Play sound
      if (targetPiece) {
        play('chess_capture');
      } else {
        play('chess_move');
      }
      
      if (move.promotion) {
        play('chess_promotion');
      }

      // Trigger capture animation
      if (targetPiece && attackingPiece && animationsEnabled) {
        triggerAnimation(attackingPiece.type, targetPiece.type, to);
      }

      // Update local state
      setGame(new Chess(gameCopy.fen()));
      setMoveHistory(gameCopy.history());

      // Send move to opponent via WebRTC
      const moveData: ChessMove = {
        from,
        to,
        promotion: move.promotion || undefined,
        fen: gameCopy.fen(),
        san: move.san,
      };
      sendMove(moveData);

      // Record move for turn history
      recordPlayerMove(address || "", move.san);

      // Check game over
      if (!checkGameOver(gameCopy)) {
        setGameStatus("Opponent's turn");
      }

      return true;
    } catch {
      return false;
    }
  }, [game, gameOver, isMyTurn, checkGameOver, animationsEnabled, triggerAnimation, play, sendMove, recordPlayerMove, address]);

  const handleResign = useCallback(() => {
    sendResign();
    setGameStatus("You resigned - Opponent wins!");
    setGameOver(true);
    play('chess_lose');
  }, [sendResign, play]);

  const handleDrawOffer = useCallback(() => {
    sendDrawOffer();
    setDrawOffered(true);
  }, [sendDrawOffer]);

  const handleAcceptDraw = useCallback(() => {
    sendDrawAccept();
    setGameStatus("Draw by agreement");
    setGameOver(true);
    setDrawOffered(false);
    setDrawOfferFrom(null);
  }, [sendDrawAccept]);

  const handleRejectDraw = useCallback(() => {
    sendDrawReject();
    setDrawOffered(false);
    setDrawOfferFrom(null);
  }, [sendDrawReject]);

  const formattedMoves = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    formattedMoves.push({
      number: Math.floor(i / 2) + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1] || "",
    });
  }

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
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
      <div 
        className="absolute inset-0 opacity-5"
        style={{
          backgroundImage: `repeating-linear-gradient(60deg, transparent, transparent 100px, hsl(45 93% 54% / 0.1) 100px, hsl(45 93% 54% / 0.1) 102px),
          repeating-linear-gradient(-60deg, transparent, transparent 100px, hsl(45 93% 54% / 0.1) 100px, hsl(45 93% 54% / 0.1) 102px)`
        }}
      />

      {/* Turn Banner */}
      <TurnBanner
        gameName="Chess"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isMyTurnNotification && !gameOver}
      />

      <div className="relative z-10">
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
                    Chess - Room #{roomId}
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {peerConnected ? (
                    <><Wifi className="w-3 h-3 text-green-500" /> Connected</>
                  ) : (
                    <><WifiOff className="w-3 h-3 text-yellow-500" /> {connectionState}</>
                  )}
                  <span className="mx-1">•</span>
                  Playing as {myColor === "w" ? "White" : "Black"}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <TurnHistoryDrawer events={turnHistory} />
              <NotificationToggle
                enabled={notificationsEnabled}
                hasPermission={hasPermission}
                onToggle={toggleNotifications}
              />
            </div>
          </div>
        </div>

        {/* Turn Status Header */}
        <div className="px-4 py-2">
          <div className="max-w-6xl mx-auto">
            <TurnStatusHeader
              isMyTurn={isMyTurnNotification}
              activePlayer={turnPlayers[game.turn() === "w" ? 0 : 1]}
              players={turnPlayers}
              myAddress={address}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chess Board Column */}
            <div className="lg:col-span-2 space-y-4">
              {/* Board Container */}
              <div className="relative">
                <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
                <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
                  <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg overflow-hidden p-4">
                    <ChessBoardPremium
                      game={game}
                      onMove={handleMove}
                      disabled={gameOver || !isMyTurn}
                      captureAnimations={animations}
                      onAnimationComplete={handleAnimationComplete}
                      animationsEnabled={animationsEnabled}
                      flipped={myColor === "b"}
                      playerColor={myColor}
                    />
                  </div>
                </div>
              </div>

              {/* Animation Toggle */}
              <div className="flex justify-center">
                <AnimationToggle 
                  enabled={animationsEnabled} 
                  onToggle={() => setAnimationsEnabled(prev => !prev)} 
                />
              </div>

              {/* Status Bar */}
              <div 
                className={`relative overflow-hidden rounded-lg border transition-all duration-300 ${
                  gameOver 
                    ? gameStatus.includes("win") 
                      ? "bg-green-500/10 border-green-500/30" 
                      : gameStatus.includes("lose")
                      ? "bg-red-500/10 border-red-500/30"
                      : "bg-primary/10 border-primary/30"
                    : "bg-gradient-to-r from-primary/10 via-primary/20 to-primary/10 border-primary/40"
                }`}
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{gameStatus}</span>
                  {!gameOver && (
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={handleDrawOffer}
                        disabled={drawOffered}
                        className="text-xs"
                      >
                        Offer Draw
                      </Button>
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={handleResign}
                        className="text-xs"
                      >
                        <Flag className="w-3 h-3 mr-1" />
                        Resign
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Draw Offer Dialog */}
              {drawOffered && drawOfferFrom && drawOfferFrom !== address && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <p className="text-sm mb-3">Your opponent has offered a draw.</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAcceptDraw}>Accept</Button>
                    <Button size="sm" variant="outline" onClick={handleRejectDraw}>Decline</Button>
                  </div>
                </div>
              )}
            </div>

            {/* Side Panel */}
            <div className="space-y-4">
              {/* Move History */}
              <div className="bg-card/50 border border-border/50 rounded-lg p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Star className="w-4 h-4 text-primary" />
                  Move History
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-1 text-sm">
                  {formattedMoves.length === 0 ? (
                    <p className="text-muted-foreground text-xs">No moves yet</p>
                  ) : (
                    formattedMoves.map((move) => (
                      <div key={move.number} className="flex gap-2 font-mono text-xs">
                        <span className="text-muted-foreground w-6">{move.number}.</span>
                        <span className="w-12">{move.white}</span>
                        <span className="w-12 text-muted-foreground">{move.black}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Game Over Actions */}
              {gameOver && (
                <div className="bg-card/50 border border-border/50 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold">Game Over</h3>
                  <div className="flex flex-col gap-2">
                    <Button asChild variant="default" className="w-full">
                      <Link to="/room-list">Find New Game</Link>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/play-ai/chess">Practice vs AI</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChessGame;