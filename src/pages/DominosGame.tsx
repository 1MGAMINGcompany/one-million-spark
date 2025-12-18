import { useState, useCallback, useMemo, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Gem, Flag, Users, Wifi, WifiOff, Download } from "lucide-react";
import DominoTile3D, { DominoTileBack } from "@/components/DominoTile3D";
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

interface Domino {
  id: number;
  left: number;
  right: number;
}

interface PlacedDomino extends Domino {
  flipped: boolean;
}

interface DominoMove {
  domino: Domino;
  side: "left" | "right";
  chain: PlacedDomino[];
  playerHand: Domino[];
  opponentHandCount: number;
  boneyard: Domino[];
  isPlayerTurn: boolean;
  action: "play" | "draw" | "pass";
}

const generateDominoSet = (): Domino[] => {
  const dominos: Domino[] = [];
  let id = 0;
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      dominos.push({ id: id++, left: i, right: j });
    }
  }
  return dominos;
};

const shuffle = <T,>(array: T[]): T[] => {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const DominosGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [chain, setChain] = useState<PlacedDomino[]>([]);
  const [myHand, setMyHand] = useState<Domino[]>([]);
  const [opponentHandCount, setOpponentHandCount] = useState(7);
  const [boneyard, setBoneyard] = useState<Domino[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(true);
  const [gameStatus, setGameStatus] = useState("Your turn");
  const [gameOver, setGameOver] = useState(false);
  const [selectedDomino, setSelectedDomino] = useState<number | null>(null);
  const [winner, setWinner] = useState<"me" | "opponent" | "draw" | null>(null);

  // Multiplayer state
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [amIPlayer1, setAmIPlayer1] = useState(true);

  // Setup room players
  useEffect(() => {
    if (address && roomId) {
      const simulatedPlayers = [
        address,
        `opponent-${roomId}`,
      ];
      setRoomPlayers(simulatedPlayers);
      
      const myIndex = simulatedPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
      setAmIPlayer1(myIndex === 0);
    }
  }, [address, roomId]);

  // Initialize game
  useEffect(() => {
    const allDominos = shuffle(generateDominoSet());
    setMyHand(allDominos.slice(0, 7));
    setOpponentHandCount(7);
    setBoneyard(allDominos.slice(14));
    setChain([]);
    setIsMyTurn(amIPlayer1);
    setGameStatus(amIPlayer1 ? "Your turn" : "Opponent's turn");
    setGameOver(false);
    setSelectedDomino(null);
    setWinner(null);
  }, [amIPlayer1, roomId]);

  // Turn notification players
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      return {
        address: playerAddress,
        name: isMe ? "You" : "Opponent",
        color: index === 0 ? "gold" : "obsidian",
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address]);

  const activeTurnAddress = useMemo(() => {
    const turnIndex = isMyTurn ? (amIPlayer1 ? 0 : 1) : (amIPlayer1 ? 1 : 0);
    return turnPlayers[turnIndex]?.address || null;
  }, [isMyTurn, amIPlayer1, turnPlayers]);

  const {
    isMyTurn: isMyTurnNotification,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName: "Dominos",
    roomId: roomId || "unknown",
    players: turnPlayers,
    activeTurnAddress,
    myAddress: address,
    enabled: true,
  });

  // Game logic functions
  const getChainEnds = useCallback((): { left: number; right: number } | null => {
    if (chain.length === 0) return null;
    const first = chain[0];
    const last = chain[chain.length - 1];
    return {
      left: first.flipped ? first.right : first.left,
      right: last.flipped ? last.left : last.right,
    };
  }, [chain]);

  const canPlay = useCallback((domino: Domino): { canPlayLeft: boolean; canPlayRight: boolean } => {
    const ends = getChainEnds();
    if (!ends) return { canPlayLeft: true, canPlayRight: true };
    
    const canPlayLeft = domino.left === ends.left || domino.right === ends.left;
    const canPlayRight = domino.left === ends.right || domino.right === ends.right;
    
    return { canPlayLeft, canPlayRight };
  }, [getChainEnds]);

  const getLegalMoves = useCallback((hand: Domino[]): Domino[] => {
    return hand.filter(d => {
      const { canPlayLeft, canPlayRight } = canPlay(d);
      return canPlayLeft || canPlayRight;
    });
  }, [canPlay]);

  // WebRTC message handler
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    console.log("[DominosGame] Received message:", message.type);
    
    if (message.type === "move" && message.payload) {
      const moveData = message.payload as DominoMove;
      
      if (moveData.action === "play") {
        play('domino_place');
        setChain(moveData.chain);
        setOpponentHandCount(moveData.playerHand.length);
        setBoneyard(moveData.boneyard);
        
        recordPlayerMove(roomPlayers[amIPlayer1 ? 1 : 0] || "", "played");
        
        // Check win
        if (moveData.playerHand.length === 0) {
          setGameOver(true);
          setWinner("opponent");
          setGameStatus("Opponent wins!");
          play('domino_lose');
        } else {
          setIsMyTurn(true);
          setGameStatus("Your turn");
        }
      } else if (moveData.action === "draw") {
        play('domino_draw');
        setBoneyard(moveData.boneyard);
        setOpponentHandCount(prev => prev + 1);
        setGameStatus("Opponent drew a tile");
      } else if (moveData.action === "pass") {
        setGameStatus("Opponent passed");
        setIsMyTurn(true);
        
        // Check blocked game
        const myLegalMoves = getLegalMoves(myHand);
        if (myLegalMoves.length === 0 && moveData.boneyard.length === 0) {
          checkBlockedGame();
        }
      }
    } else if (message.type === "resign") {
      setGameOver(true);
      setWinner("me");
      setGameStatus("Opponent resigned - You win!");
      play('domino_win');
      toast({
        title: "Victory!",
        description: "Your opponent has resigned.",
      });
    }
  }, [play, amIPlayer1, roomPlayers, recordPlayerMove, getLegalMoves, myHand]);

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length === 2,
  });

  const checkBlockedGame = useCallback(() => {
    const myPips = myHand.reduce((sum, d) => sum + d.left + d.right, 0);
    // We don't know opponent's exact pips, but we can estimate they won
    // In real implementation, both sides would reveal hands
    setGameOver(true);
    setWinner("draw");
    setGameStatus("Game blocked - Draw!");
  }, [myHand]);

  // Play a domino
  const playDomino = useCallback((domino: Domino, side: "left" | "right") => {
    const ends = getChainEnds();
    let flipped = false;
    
    if (ends) {
      const targetEnd = side === "left" ? ends.left : ends.right;
      if (side === "left") {
        flipped = domino.right !== targetEnd;
      } else {
        flipped = domino.left !== targetEnd;
      }
    }
    
    const placedDomino: PlacedDomino = { ...domino, flipped };
    const newChain = side === "left" ? [placedDomino, ...chain] : [...chain, placedDomino];
    const newHand = myHand.filter(d => d.id !== domino.id);
    
    play('domino_place');
    setChain(newChain);
    setMyHand(newHand);
    
    // Send move to opponent
    const moveData: DominoMove = {
      domino,
      side,
      chain: newChain,
      playerHand: newHand,
      opponentHandCount,
      boneyard,
      isPlayerTurn: false,
      action: "play",
    };
    sendMove(moveData);
    recordPlayerMove(address || "", "played");
    
    // Check win
    if (newHand.length === 0) {
      setGameOver(true);
      setWinner("me");
      setGameStatus("You win!");
      play('domino_win');
    } else {
      setIsMyTurn(false);
      setGameStatus("Opponent's turn");
    }
  }, [chain, myHand, boneyard, opponentHandCount, getChainEnds, play, sendMove, recordPlayerMove, address]);

  // Handle player play
  const handlePlayerPlay = useCallback((domino: Domino) => {
    if (!isMyTurn || gameOver) return;
    
    const { canPlayLeft, canPlayRight } = canPlay(domino);
    
    if (!canPlayLeft && !canPlayRight) {
      toast({
        title: "Invalid Move",
        description: "That tile doesn't match any end of the chain.",
        variant: "destructive",
      });
      return;
    }
    
    // If first tile or only one option, play automatically
    if (chain.length === 0 || (canPlayLeft && !canPlayRight)) {
      playDomino(domino, "left");
    } else if (canPlayRight && !canPlayLeft) {
      playDomino(domino, "right");
    } else {
      // Both ends match - toggle selection
      if (selectedDomino === domino.id) {
        playDomino(domino, "right");
        setSelectedDomino(null);
      } else {
        setSelectedDomino(domino.id);
        toast({
          title: "Choose Side",
          description: "Click again to play on right side",
        });
      }
    }
  }, [isMyTurn, gameOver, canPlay, chain.length, playDomino, selectedDomino]);

  // Handle draw
  const handleDraw = useCallback(() => {
    if (!isMyTurn || gameOver || boneyard.length === 0) return;
    
    const drawn = boneyard[0];
    const newBoneyard = boneyard.slice(1);
    const newHand = [...myHand, drawn];
    
    setMyHand(newHand);
    setBoneyard(newBoneyard);
    play('domino_draw');
    
    // Send draw action to opponent
    const moveData: DominoMove = {
      domino: drawn,
      side: "left",
      chain,
      playerHand: newHand,
      opponentHandCount,
      boneyard: newBoneyard,
      isPlayerTurn: true,
      action: "draw",
    };
    sendMove(moveData);
    
    toast({
      title: "Drew a Tile",
      description: "Check if you can play now.",
    });
  }, [isMyTurn, gameOver, boneyard, myHand, chain, opponentHandCount, play, sendMove]);

  // Handle pass
  const handlePass = useCallback(() => {
    if (!isMyTurn || gameOver) return;
    
    const legalMoves = getLegalMoves(myHand);
    if (legalMoves.length > 0) {
      toast({
        title: "Can't Pass",
        description: "You have legal moves available.",
        variant: "destructive",
      });
      return;
    }
    
    if (boneyard.length > 0) {
      toast({
        title: "Can't Pass",
        description: "You must draw from the boneyard first.",
        variant: "destructive",
      });
      return;
    }
    
    // Send pass action
    const moveData: DominoMove = {
      domino: { id: -1, left: 0, right: 0 },
      side: "left",
      chain,
      playerHand: myHand,
      opponentHandCount,
      boneyard,
      isPlayerTurn: false,
      action: "pass",
    };
    sendMove(moveData);
    
    setIsMyTurn(false);
    setGameStatus("Opponent's turn");
  }, [isMyTurn, gameOver, myHand, boneyard, chain, opponentHandCount, getLegalMoves, sendMove]);

  const handleResign = useCallback(() => {
    sendResign();
    setGameOver(true);
    setWinner("opponent");
    setGameStatus("You resigned");
    play('domino_lose');
  }, [sendResign, play]);

  const playerLegalMoves = useMemo(() => getLegalMoves(myHand), [getLegalMoves, myHand]);

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
      
      {/* Turn Banner */}
      <TurnBanner
        gameName="Dominos"
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
                    Dominos - Room #{roomId}
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {peerConnected ? (
                    <><Wifi className="w-3 h-3 text-green-500" /> Connected</>
                  ) : (
                    <><WifiOff className="w-3 h-3 text-yellow-500" /> {connectionState}</>
                  )}
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

        {/* Turn Status */}
        <div className="px-4 py-2">
          <div className="max-w-6xl mx-auto">
            <TurnStatusHeader
              isMyTurn={isMyTurnNotification}
              activePlayer={turnPlayers[isMyTurn ? (amIPlayer1 ? 0 : 1) : (amIPlayer1 ? 1 : 0)]}
              players={turnPlayers}
              myAddress={address}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="space-y-6">
            {/* Opponent Hand */}
            <div className="flex justify-center gap-1">
              {Array.from({ length: opponentHandCount }).map((_, i) => (
                <DominoTileBack key={i} />
              ))}
            </div>

            {/* Chain */}
            <div className="min-h-24 p-4 rounded-xl bg-gradient-to-br from-emerald-900/30 to-emerald-950/50 border border-emerald-500/20">
              {/* Chain End Indicators */}
              {chain.length > 0 && getChainEnds() && (
                <div className="flex justify-between items-center mb-3 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
                      <span className="text-xl font-bold text-primary">{getChainEnds()!.left}</span>
                    </div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Left End</span>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-primary/30 via-primary/10 to-primary/30 mx-4" />
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Right End</span>
                    <div className="w-10 h-10 rounded-lg bg-primary/20 border-2 border-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
                      <span className="text-xl font-bold text-primary">{getChainEnds()!.right}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap justify-center gap-1 items-center">
                {chain.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Play a tile to start</p>
                ) : (
                  chain.map((placed, index) => (
                    <DominoTile3D
                      key={`chain-${placed.id}-${index}`}
                      left={placed.flipped ? placed.right : placed.left}
                      right={placed.flipped ? placed.left : placed.right}
                      isChainTile
                    />
                  ))
                )}
              </div>
            </div>

            {/* My Hand */}
            <div className="flex flex-wrap justify-center gap-2">
              {myHand.map((domino) => {
                const isLegal = playerLegalMoves.some(d => d.id === domino.id);
                return (
                  <DominoTile3D
                    key={domino.id}
                    left={domino.left}
                    right={domino.right}
                    isClickable={isMyTurn && !gameOver}
                    isSelected={selectedDomino === domino.id}
                    isPlayable={isLegal}
                    isAITurn={!isMyTurn}
                    onClick={() => handlePlayerPlay(domino)}
                  />
                );
              })}
            </div>

            {/* Game Status & Controls */}
            <div className="flex flex-col items-center gap-4">
              <div className={`text-lg font-medium ${
                winner === "me" ? "text-green-400" : 
                winner === "opponent" ? "text-red-400" : 
                winner === "draw" ? "text-yellow-400" : "text-muted-foreground"
              }`}>
                {gameStatus}
              </div>

              {!gameOver && (
                <div className="flex gap-3">
                  {boneyard.length > 0 && playerLegalMoves.length === 0 && isMyTurn && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleDraw}
                      className="border-primary/30"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Draw ({boneyard.length} left)
                    </Button>
                  )}
                  
                  {boneyard.length === 0 && playerLegalMoves.length === 0 && isMyTurn && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePass}
                    >
                      Pass
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResign}
                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <Flag className="w-4 h-4 mr-2" />
                    Resign
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DominosGame;
