import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Gem, Flag, Users, Wifi, WifiOff, Download, RefreshCw } from "lucide-react";
import DominoTile3D, { DominoTileBack, TileHalfClicked } from "@/components/DominoTile3D";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import { useGameChat, ChatPlayer, ChatMessage } from "@/hooks/useGameChat";
import { useRematch } from "@/hooks/useRematch";
import { useGameSessionPersistence, getRoomMode } from "@/hooks/useGameSessionPersistence";
import { useRankedReadyGate } from "@/hooks/useRankedReadyGate";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";
import GameChatPanel from "@/components/GameChatPanel";
import { GameEndScreen } from "@/components/GameEndScreen";
import { RematchModal } from "@/components/RematchModal";
import { RematchAcceptModal } from "@/components/RematchAcceptModal";
import { AcceptRulesModal } from "@/components/AcceptRulesModal";
import { WaitingForOpponentPanel } from "@/components/WaitingForOpponentPanel";
import { RulesInfoPanel } from "@/components/RulesInfoPanel";
import { toast } from "@/hooks/use-toast";
import { fetchRoomByPda, getConnection } from "@/lib/solana-program";
import { seededShuffle } from "@/lib/seedUtils";

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

// Full game state for sync and persistence
interface GameState {
  chain: PlacedDomino[];
  myHand: Domino[];
  opponentHandCount: number;
  boneyard: Domino[];
  isMyTurn: boolean;
}

// Persisted game state - stores shared state that can be verified by both players
interface PersistedGameState {
  chain: PlacedDomino[];
  boneyardIds: number[]; // IDs of tiles remaining in boneyard
  player1DrawnIds: number[]; // IDs player 1 drew from boneyard
  player2DrawnIds: number[]; // IDs player 2 drew from boneyard
  currentTurnPlayer: 1 | 2;
  gameOver: boolean;
  winner: "player1" | "player2" | "draw" | null;
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

const DominosGame = () => {
  const { roomPda } = useParams<{ roomPda: string }>();
  const roomId = roomPda; // Alias for backward compatibility with hooks/display
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [chain, setChain] = useState<PlacedDomino[]>([]);
  const [myHand, setMyHand] = useState<Domino[]>([]);
  const [opponentHandCount, setOpponentHandCount] = useState(7);
  const [boneyard, setBoneyard] = useState<Domino[]>([]);
  const [isMyTurn, setIsMyTurn] = useState(false);
  const [gameStatus, setGameStatus] = useState("Connecting...");
  const [gameOver, setGameOver] = useState(false);
  const [selectedDomino, setSelectedDomino] = useState<number | null>(null);
  const [winner, setWinner] = useState<"me" | "opponent" | "draw" | null>(null);
  const [gameInitialized, setGameInitialized] = useState(false);

  // Refs to hold current state for stable callbacks (prevents stale closures)
  const chainRef = useRef<PlacedDomino[]>([]);
  const myHandRef = useRef<Domino[]>([]);
  const boneyardRef = useRef<Domino[]>([]);
  const amIPlayer1Ref = useRef(false);
  const roomPlayersRef = useRef<string[]>([]);

  // Keep refs in sync with state
  useEffect(() => { chainRef.current = chain; }, [chain]);
  useEffect(() => { myHandRef.current = myHand; }, [myHand]);
  useEffect(() => { boneyardRef.current = boneyard; }, [boneyard]);

  // Multiplayer state - REAL players from on-chain
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [amIPlayer1, setAmIPlayer1] = useState(false);
  const [loadingRoom, setLoadingRoom] = useState(true);
  const [entryFeeSol, setEntryFeeSol] = useState(0); // Stake amount in SOL
  const [sessionRestored, setSessionRestored] = useState(false);

  // Keep multiplayer refs in sync
  useEffect(() => { amIPlayer1Ref.current = amIPlayer1; }, [amIPlayer1]);
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);

  // Helper to get domino by ID from the full set
  const getDominoById = useCallback((id: number): Domino => {
    const allDominos = generateDominoSet();
    return allDominos.find(d => d.id === id) || { id, left: 0, right: 0 };
  }, []);

  // State restoration handler - reconstructs hands from chain, boneyard, and drawn tiles
  const handleStateRestored = useCallback((state: Record<string, any>) => {
    if (!roomPda) return;
    
    const persisted = state as PersistedGameState;
    console.log('[DominosGame] Restoring state from database:', persisted);
    
    // Get the original deterministic shuffle
    const allDominos = seededShuffle(generateDominoSet(), roomPda);
    const originalPlayer1Hand = allDominos.slice(0, 7);
    const originalPlayer2Hand = allDominos.slice(7, 14);
    
    // Restore chain
    setChain(persisted.chain || []);
    
    // Figure out which tiles each player played
    const chainIds = new Set((persisted.chain || []).map(d => d.id));
    
    // Get the drawn tiles for each player and restore those states
    const restoredPlayer1DrawnIds = persisted.player1DrawnIds || [];
    const restoredPlayer2DrawnIds = persisted.player2DrawnIds || [];
    setPlayer1DrawnIds(restoredPlayer1DrawnIds);
    setPlayer2DrawnIds(restoredPlayer2DrawnIds);
    
    const player1DrawnIdsSet = new Set(restoredPlayer1DrawnIds);
    const player2DrawnIdsSet = new Set(restoredPlayer2DrawnIds);
    
    // Reconstruct hands:
    // Hand = (original hand - tiles played to chain) + tiles drawn from boneyard
    const player1CurrentHand = originalPlayer1Hand
      .filter(d => !chainIds.has(d.id))
      .concat(Array.from(player1DrawnIdsSet).map(id => getDominoById(id)));
    
    const player2CurrentHand = originalPlayer2Hand
      .filter(d => !chainIds.has(d.id))
      .concat(Array.from(player2DrawnIdsSet).map(id => getDominoById(id)));
    
    // Set my hand and opponent count based on which player I am
    if (amIPlayer1Ref.current) {
      setMyHand(player1CurrentHand);
      setOpponentHandCount(player2CurrentHand.length);
    } else {
      setMyHand(player2CurrentHand);
      setOpponentHandCount(player1CurrentHand.length);
    }
    
    setBoneyard((persisted.boneyardIds || []).map(id => getDominoById(id)));
    
    // Restore turn state
    const isMyTurnNow = (persisted.currentTurnPlayer === 1 && amIPlayer1Ref.current) ||
                        (persisted.currentTurnPlayer === 2 && !amIPlayer1Ref.current);
    setIsMyTurn(isMyTurnNow);
    setGameStatus(isMyTurnNow ? "Your turn" : "Opponent's turn");
    
    // Restore game over state
    if (persisted.gameOver) {
      setGameOver(true);
      if (persisted.winner === "draw") {
        setWinner("draw");
      } else if (persisted.winner === "player1") {
        setWinner(amIPlayer1Ref.current ? "me" : "opponent");
      } else if (persisted.winner === "player2") {
        setWinner(amIPlayer1Ref.current ? "opponent" : "me");
      }
    }
    
    setSessionRestored(true);
  }, [getDominoById, roomPda]);

  // Game session persistence hook
  const { loadSession, saveSession, finishSession } = useGameSessionPersistence({
    roomPda,
    gameType: 'dominos',
    enabled: roomPlayers.length >= 2 && !!address,
    onStateRestored: handleStateRestored,
    callerWallet: address, // Pass caller wallet for secure RPC validation
  });

  // Track drawn tiles for each player
  const [player1DrawnIds, setPlayer1DrawnIds] = useState<number[]>([]);
  const [player2DrawnIds, setPlayer2DrawnIds] = useState<number[]>([]);

  // Helper to create persisted state
  const createPersistedState = useCallback((): PersistedGameState => {
    const boneyardIds = boneyard.map(d => d.id);
    const currentTurnPlayer: 1 | 2 = isMyTurn ? (amIPlayer1 ? 1 : 2) : (amIPlayer1 ? 2 : 1);
    
    let winnerValue: "player1" | "player2" | "draw" | null = null;
    if (winner === "me") {
      winnerValue = amIPlayer1 ? "player1" : "player2";
    } else if (winner === "opponent") {
      winnerValue = amIPlayer1 ? "player2" : "player1";
    } else if (winner === "draw") {
      winnerValue = "draw";
    }
    
    return {
      chain,
      boneyardIds,
      player1DrawnIds,
      player2DrawnIds,
      currentTurnPlayer,
      gameOver,
      winner: winnerValue,
    };
  }, [chain, boneyard, player1DrawnIds, player2DrawnIds, isMyTurn, amIPlayer1, gameOver, winner]);

  // Save state whenever game state changes
  const saveGameState = useCallback(() => {
    if (!gameInitialized || !roomPlayers.length) return;
    
    const currentTurnWallet = isMyTurn ? address : roomPlayers.find(p => p.toLowerCase() !== address?.toLowerCase());
    const persisted = createPersistedState();
    
    saveSession(
      persisted,
      currentTurnWallet || null,
      roomPlayers[0] || '',
      roomPlayers[1] || null,
      gameOver ? 'finished' : 'active',
      getRoomMode(roomPda || '')
    );
  }, [gameInitialized, roomPlayers, isMyTurn, address, createPersistedState, saveSession, gameOver]);

  // Fetch REAL players from on-chain room account
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let mounted = true;
    
    async function fetchRoomPlayers() {
      if (!roomPda || !address || !mounted) return;
      
      // Don't keep polling once we have both players
      if (roomPlayers.length >= 2) {
        if (interval) clearInterval(interval);
        return;
      }
      
      console.log(`[DominosGame] Fetching on-chain room data for PDA: ${roomPda}`);
      
      try {
        const connection = getConnection();
        const roomData = await fetchRoomByPda(connection, roomPda);
        
        if (!roomData || !mounted) {
          if (!roomData) {
            console.error("[DominosGame] Room not found on-chain");
            toast({
              title: "Room Not Found",
              description: "This game room doesn't exist or has been closed.",
              variant: "destructive",
            });
          }
          setLoadingRoom(false);
          return;
        }
        
        // Get REAL player addresses from on-chain account
        const realPlayers = roomData.players;
        console.log("[DominosGame] On-chain players:", realPlayers);
        
        if (realPlayers.length < 2) {
          console.log("[DominosGame] Waiting for opponent to join...");
          setGameStatus("Waiting for opponent...");
          setLoadingRoom(false);
          return;
        }
        
        // Stop polling once we have 2 players
        if (interval) clearInterval(interval);
        
        setRoomPlayers(realPlayers);
        setEntryFeeSol(roomData.entryFeeSol); // Store stake amount
        
        // Determine if I'm player 1 based on on-chain order
        const myIndex = realPlayers.findIndex(p => 
          p.toLowerCase() === address.toLowerCase()
        );
        
        if (myIndex === -1) {
          console.error("[DominosGame] Current wallet not found in room players");
          toast({
            title: "Not in Room",
            description: "Your wallet is not a player in this room.",
            variant: "destructive",
          });
          setLoadingRoom(false);
          return;
        }
        
        setAmIPlayer1(myIndex === 0);
        console.log(`[DominosGame] I am player ${myIndex + 1} (${myIndex === 0 ? 'creator' : 'joiner'})`);
        
      } catch (error) {
        console.error("[DominosGame] Failed to fetch room:", error);
        toast({
          title: "Connection Error",
          description: "Failed to fetch room data from blockchain.",
          variant: "destructive",
        });
      }
      
      setLoadingRoom(false);
    }
    
    fetchRoomPlayers();
    
    // Poll for updates every 5 seconds ONLY while waiting for opponent
    interval = setInterval(fetchRoomPlayers, 5000);
    
    return () => {
      mounted = false;
      if (interval) clearInterval(interval);
    };
  }, [roomPda, address, roomPlayers.length]);

  // Initialize game with DETERMINISTIC shuffle using roomPda as seed
  // First try to restore from saved session
  useEffect(() => {
    if (!roomPda || roomPlayers.length < 2 || gameInitialized) return;
    
    const initGame = async () => {
      console.log(`[DominosGame] Checking for saved session...`);
      
      // Try to load existing session first
      const savedState = await loadSession();
      
      if (savedState && Object.keys(savedState).length > 0) {
        console.log('[DominosGame] Found saved session, restoring...');
        handleStateRestored(savedState);
        setGameInitialized(true);
        toast({
          title: "Game Restored",
          description: "Your game session has been recovered.",
        });
        return;
      }
      
      console.log(`[DominosGame] No saved session, initializing new game with seed: ${roomPda}`);
      
      // Use roomPda as seed - BOTH devices get identical shuffle
      const allDominos = seededShuffle(generateDominoSet(), roomPda);
      
      // Player order is based on on-chain order (player 0 = creator goes first)
      const player1Hand = allDominos.slice(0, 7);
      const player2Hand = allDominos.slice(7, 14);
      const initialBoneyard = allDominos.slice(14);
      
      console.log("[DominosGame] Deterministic game init:", {
        amIPlayer1,
        myHandIds: (amIPlayer1 ? player1Hand : player2Hand).map(d => d.id),
        boneyardSize: initialBoneyard.length,
      });
      
      setMyHand(amIPlayer1 ? player1Hand : player2Hand);
      setOpponentHandCount(7);
      setBoneyard(initialBoneyard);
      setChain([]);
      
      // Player 1 (room creator) always goes first
      setIsMyTurn(amIPlayer1);
      setGameStatus(amIPlayer1 ? "Your turn" : "Opponent's turn");
      setGameOver(false);
      setSelectedDomino(null);
      setWinner(null);
      setGameInitialized(true);
    };
    
    initGame();
  }, [roomPda, roomPlayers, amIPlayer1, gameInitialized, loadSession, handleStateRestored]);

  // Save game state after each significant change
  useEffect(() => {
    if (gameInitialized && !sessionRestored) {
      // Debounce saves slightly to avoid rapid updates
      const timeout = setTimeout(() => {
        saveGameState();
      }, 500);
      return () => clearTimeout(timeout);
    }
  }, [chain, myHand, boneyard, isMyTurn, gameOver, winner, gameInitialized, sessionRestored, saveGameState]);

  // Mark session as finished when game ends
  useEffect(() => {
    if (gameOver && gameInitialized) {
      finishSession();
    }
  }, [gameOver, gameInitialized, finishSession]);

  // Ranked ready gate - both players must accept rules before gameplay
  const roomMode = getRoomMode(roomPda || "");
  const isRankedGame = roomMode === "ranked";
  
  const rankedGate = useRankedReadyGate({
    roomPda,
    myWallet: address,
    isRanked: isRankedGame,
    enabled: roomPlayers.length >= 2,
  });

  const handleAcceptRulesModal = async () => {
    const success = await rankedGate.setReady();
    if (success) {
      toast({ title: "Rules accepted", description: "Waiting for opponent..." });
    } else {
      toast({ title: "Failed to accept", description: "Please try again", variant: "destructive" });
    }
  };

  const handleLeaveMatch = () => {
    navigate("/room-list");
  };

  // Block gameplay until both players are ready (for ranked games)
  const canPlayRanked = !isRankedGame || rankedGate.bothReady;

  // Turn notification players
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      return {
        address: playerAddress,
        name: isMe ? "You" : `Player ${index + 1}`,
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

  // Chat players derived from turn players
  const chatPlayers: ChatPlayer[] = useMemo(() => {
    return turnPlayers.map((tp) => ({
      wallet: tp.address,
      displayName: tp.name,
      color: tp.color,
      seatIndex: tp.seatIndex,
    }));
  }, [turnPlayers]);

  // Rematch hook
  const rematch = useRematch("Dominos", roomPlayers);

  // Rematch players for display
  const rematchPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
    }));
  }, [turnPlayers]);

  // Winner address for GameEndScreen
  const winnerAddress = useMemo(() => {
    if (!gameOver) return null;
    if (winner === "draw") return "draw";
    if (winner === "me") return address;
    if (winner === "opponent") return roomPlayers.find(p => p.toLowerCase() !== address?.toLowerCase()) || null;
    return null;
  }, [gameOver, winner, address, roomPlayers]);

  // Players for GameEndScreen
  const gameEndPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
      color: tp.color === "gold" ? "#FFD700" : "#333333",
    }));
  }, [turnPlayers]);

  // Rematch acceptance modal state
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [rematchInviteData, setRematchInviteData] = useState<any>(null);

  // Check for rematch invite on mount
  useEffect(() => {
    if (roomId) {
      const { isRematch, data } = rematch.checkRematchInvite(roomId);
      if (isRematch && data) {
        setRematchInviteData(data);
        setShowAcceptModal(true);
      }
    }
  }, [roomId]);

  // Refs for WebRTC rematch functions
  const sendRematchInviteRef = useRef<((data: any) => boolean) | null>(null);
  const sendRematchAcceptRef = useRef<((roomId: string) => boolean) | null>(null);
  const sendRematchDeclineRef = useRef<((roomId: string) => boolean) | null>(null);
  const sendRematchReadyRef = useRef<((roomId: string) => boolean) | null>(null);

  const handleAcceptRematch = async (rematchRoomId: string) => {
    const result = await rematch.acceptRematch(rematchRoomId);
    sendRematchAcceptRef.current?.(rematchRoomId);
    if (result.allAccepted) {
      toast({ title: "All players accepted!", description: "Game is starting..." });
      sendRematchReadyRef.current?.(rematchRoomId);
      window.location.href = `/game/dominos/${rematchRoomId}`;
    }
  };

  const handleDeclineRematch = (rematchRoomId: string) => {
    rematch.declineRematch(rematchRoomId);
    sendRematchDeclineRef.current?.(rematchRoomId);
    navigate('/room-list');
  };

  // Sync rematch invite via WebRTC when created
  useEffect(() => {
    if (rematch.state.newRoomId && rematch.state.inviteLink && sendRematchInviteRef.current) {
      const rematchData = rematch.getRematchData(rematch.state.newRoomId);
      if (rematchData) {
        sendRematchInviteRef.current(rematchData);
      }
    }
  }, [rematch.state.newRoomId, rematch.state.inviteLink]);

  // Game chat hook ref (sendChat defined after WebRTC hook)
  const chatRef = useRef<ReturnType<typeof useGameChat> | null>(null);

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

  // Stable version of getLegalMoves that uses refs
  const getLegalMovesFromRef = useCallback((): Domino[] => {
    const currentChain = chainRef.current;
    if (currentChain.length === 0) return myHandRef.current;
    
    const first = currentChain[0];
    const last = currentChain[currentChain.length - 1];
    const left = first.flipped ? first.right : first.left;
    const right = last.flipped ? last.left : last.right;
    
    return myHandRef.current.filter(d => 
      d.left === left || d.right === left || d.left === right || d.right === right
    );
  }, []); // Stable - uses refs

  // Ref for recordPlayerMove to avoid stale closure
  const recordPlayerMoveRef = useRef(recordPlayerMove);
  useEffect(() => { recordPlayerMoveRef.current = recordPlayerMove; }, [recordPlayerMove]);

  // WebRTC message handler - STABLE with refs
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    console.log("[DominosGame] Received message:", message.type);
    
    // Handle chat messages
    if (message.type === "chat" && message.payload) {
      try {
        const chatMsg = typeof message.payload === "string" 
          ? JSON.parse(message.payload) 
          : message.payload;
        chatRef.current?.receiveMessage(chatMsg);
      } catch (e) {
        console.error("[DominosGame] Failed to parse chat message:", e);
      }
      return;
    }
    
    // Handle sync request - send our game state to peer
    if (message.type === "sync_request") {
      console.log("[DominosGame] Peer requested sync");
      return;
    }
    
    // Handle sync response - update our state from peer
    if (message.type === "sync_response" && message.payload) {
      console.log("[DominosGame] Received sync response");
      const state = message.payload as GameState;
      setChain(state.chain);
      setOpponentHandCount(state.opponentHandCount);
      setBoneyard(state.boneyard);
      setIsMyTurn(state.isMyTurn);
      setGameStatus(state.isMyTurn ? "Your turn" : "Opponent's turn");
      return;
    }
    
    if (message.type === "move" && message.payload) {
      const moveData = message.payload as DominoMove;
      
      if (moveData.action === "play") {
        play('domino/place');
        setChain(moveData.chain);
        setOpponentHandCount(moveData.playerHand.length);
        setBoneyard(moveData.boneyard);
        
        // Use refs for stable access
        const opponentIndex = amIPlayer1Ref.current ? 1 : 0;
        recordPlayerMoveRef.current(roomPlayersRef.current[opponentIndex] || "", "played");
        
        if (moveData.playerHand.length === 0) {
          setGameOver(true);
          setWinner("opponent");
          setGameStatus("Opponent wins!");
          chatRef.current?.addSystemMessage("Opponent wins!");
          play('domino/lose');
        } else {
          setIsMyTurn(true);
          setGameStatus("Your turn");
        }
      } else if (moveData.action === "draw") {
        play('domino/draw');
        setBoneyard(moveData.boneyard);
        setOpponentHandCount(prev => prev + 1);
        setGameStatus("Opponent drew a tile");
        
        // Track opponent's drawn tile
        if (amIPlayer1Ref.current) {
          // I'm player 1, opponent is player 2
          setPlayer2DrawnIds(prev => [...prev, moveData.domino.id]);
        } else {
          // I'm player 2, opponent is player 1
          setPlayer1DrawnIds(prev => [...prev, moveData.domino.id]);
        }
      } else if (moveData.action === "pass") {
        setGameStatus("Opponent passed");
        setIsMyTurn(true);
        
        // Use stable ref-based function
        const myLegalMoves = getLegalMovesFromRef();
        if (myLegalMoves.length === 0 && moveData.boneyard.length === 0) {
          // Check blocked game inline to avoid stale closure
          const myPips = myHandRef.current.reduce((sum, d) => sum + d.left + d.right, 0);
          setGameOver(true);
          setWinner("draw");
          setGameStatus("Game blocked - Draw!");
          chatRef.current?.addSystemMessage("Game blocked - Draw!");
        }
      }
    } else if (message.type === "resign") {
      setGameOver(true);
      setWinner("me");
      setGameStatus("Opponent resigned - You win!");
      chatRef.current?.addSystemMessage("Opponent resigned");
      play('domino/win');
      toast({
        title: "Victory!",
        description: "Your opponent has resigned.",
      });
    } else if (message.type === "rematch_invite" && message.payload) {
      setRematchInviteData(message.payload);
      setShowAcceptModal(true);
      toast({ title: "Rematch Invite", description: "Your opponent wants a rematch!" });
    } else if (message.type === "rematch_accept") {
      toast({ title: "Rematch Accepted!", description: "Opponent accepted. Starting new game..." });
    } else if (message.type === "rematch_decline") {
      toast({ title: "Rematch Declined", description: "Opponent declined the rematch.", variant: "destructive" });
      rematch.closeRematchModal();
    } else if (message.type === "rematch_ready" && message.payload) {
      toast({ title: "Rematch Ready!", description: "Starting new game..." });
      navigate(`/game/dominos/${message.payload.roomId}`);
    }
  }, [play, getLegalMovesFromRef, rematch, navigate]); // Minimal stable deps

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
    sendChat,
    requestSync,
    respondSync,
    sendRematchInvite,
    sendRematchAccept,
    sendRematchDecline,
    sendRematchReady,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length === 2,
  });

  // Request sync when we connect as player 2 (late joiner)
  useEffect(() => {
    if (peerConnected && !amIPlayer1 && chain.length === 0 && gameInitialized) {
      console.log("[DominosGame] Player 2 connected - requesting state sync");
      requestSync();
    }
  }, [peerConnected, amIPlayer1, chain.length, gameInitialized, requestSync]);

  // Update refs with WebRTC functions
  useEffect(() => {
    sendRematchInviteRef.current = sendRematchInvite;
    sendRematchAcceptRef.current = sendRematchAccept;
    sendRematchDeclineRef.current = sendRematchDecline;
    sendRematchReadyRef.current = sendRematchReady;
  }, [sendRematchInvite, sendRematchAccept, sendRematchDecline, sendRematchReady]);

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
    if (roomPlayers.length === 2 && chat.messages.length === 0 && gameInitialized) {
      chat.addSystemMessage("Game started! Good luck!");
    }
  }, [roomPlayers.length, gameInitialized]);

  const checkBlockedGame = useCallback(() => {
    const myPips = myHand.reduce((sum, d) => sum + d.left + d.right, 0);
    // We don't know opponent's exact pips, but we can estimate they won
    // In real implementation, both sides would reveal hands
    setGameOver(true);
    setWinner("draw");
    setGameStatus("Game blocked - Draw!");
    chatRef.current?.addSystemMessage("Game blocked - Draw!");
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
    
    play('domino/place');
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
      play('domino/win');
    } else {
      setIsMyTurn(false);
      setGameStatus("Opponent's turn");
    }
  }, [chain, myHand, boneyard, opponentHandCount, getChainEnds, play, sendMove, recordPlayerMove, address]);

  // Handle player play - halfClicked indicates which pip section was touched
  const handlePlayerPlay = useCallback((domino: Domino, halfClicked?: TileHalfClicked) => {
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
      // Both ends match - use the clicked half to determine placement
      // The half clicked corresponds to the pip value the player wants to place
      // If they click the "1" side (left value), we find which chain end matches that value
      const clickedValue = halfClicked === "left" ? domino.left : domino.right;
      const ends = getChainEnds();
      
      if (ends) {
        // Determine which chain end matches the clicked pip value
        if (clickedValue === ends.left) {
          playDomino(domino, "left");
        } else if (clickedValue === ends.right) {
          playDomino(domino, "right");
        } else {
          // Clicked value doesn't match either end directly, use the other value
          const otherValue = halfClicked === "left" ? domino.right : domino.left;
          if (otherValue === ends.left) {
            playDomino(domino, "left");
          } else {
            playDomino(domino, "right");
          }
        }
      } else {
        // No chain yet, just play left
        playDomino(domino, "left");
      }
      setSelectedDomino(null);
    }
  }, [isMyTurn, gameOver, canPlay, chain.length, playDomino, getChainEnds]);

  // Handle draw
  const handleDraw = useCallback(() => {
    if (!isMyTurn || gameOver || boneyard.length === 0) return;
    
    const drawn = boneyard[0];
    const newBoneyard = boneyard.slice(1);
    const newHand = [...myHand, drawn];
    
    setMyHand(newHand);
    setBoneyard(newBoneyard);
    play('domino/draw');
    
    // Track the drawn tile for this player
    if (amIPlayer1) {
      setPlayer1DrawnIds(prev => [...prev, drawn.id]);
    } else {
      setPlayer2DrawnIds(prev => [...prev, drawn.id]);
    }
    
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
  }, [isMyTurn, gameOver, boneyard, myHand, chain, opponentHandCount, play, sendMove, amIPlayer1]);

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
    play('domino/lose');
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

  // Loading state
  if (loadingRoom) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>
        <div className="text-center py-12">
          <RefreshCw className="h-16 w-16 text-primary mx-auto mb-4 animate-spin" />
          <h3 className="text-xl font-semibold mb-2">Loading Room...</h3>
          <p className="text-muted-foreground">Fetching game data from blockchain</p>
        </div>
      </div>
    );
  }

  // Waiting for opponent
  if (roomPlayers.length < 2) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Rooms
        </Button>
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">Waiting for Opponent...</h3>
          <p className="text-muted-foreground mb-4">Share this room link with your opponent</p>
          <code className="bg-muted px-3 py-2 rounded text-sm block max-w-md mx-auto break-all">
            {window.location.href}
          </code>
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
                    Dominos
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {peerConnected ? (
                    <><Wifi className="w-3 h-3 text-green-500" /> P2P Connected</>
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
                    onClick={(halfClicked) => handlePlayerPlay(domino, halfClicked)}
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

              {gameOver ? (
                <div className="flex gap-3">
                  <Button onClick={() => rematch.openRematchModal()} className="gap-2">
                    <RefreshCw className="w-4 h-4" />
                    Rematch
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/room-list">Exit</Link>
                  </Button>
                </div>
              ) : (
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
      
      {/* Chat Panel */}
      <GameChatPanel chat={chat} />

      {/* Rules Info Panel (Ranked only) */}
      <RulesInfoPanel 
        stakeSol={rankedGate.stakeLamports / 1_000_000_000} 
        isRanked={isRankedGame} 
      />

      {/* Game End Screen */}
      {gameOver && (
        <GameEndScreen
          gameType="Dominos"
          winner={winnerAddress}
          winnerName={winnerAddress === "draw" ? undefined : gameEndPlayers.find(p => p.address === winnerAddress)?.name}
          myAddress={address}
          players={gameEndPlayers}
          onRematch={() => rematch.openRematchModal()}
          onExit={() => navigate("/room-list")}
          roomPda={roomPda}
          isStaked={entryFeeSol > 0}
        />
      )}

      {/* Rematch Modal */}
      <RematchModal
        isOpen={rematch.isModalOpen}
        onClose={rematch.closeRematchModal}
        gameType="Dominos"
        players={rematchPlayers}
        rematchHook={rematch}
      />

      {/* Rematch Accept Modal */}
      <RematchAcceptModal
        isOpen={showAcceptModal}
        onClose={() => setShowAcceptModal(false)}
        rematchData={rematchInviteData}
        onAccept={handleAcceptRematch}
        onDecline={handleDeclineRematch}
      />

      {/* Accept Rules Modal (Ranked only) */}
      <AcceptRulesModal
        open={rankedGate.showAcceptModal}
        onAccept={handleAcceptRulesModal}
        onLeave={handleLeaveMatch}
        stakeSol={rankedGate.stakeLamports / 1_000_000_000}
        isLoading={rankedGate.isSettingReady}
        opponentReady={rankedGate.opponentReady}
      />

      {/* Waiting for opponent panel (Ranked - I accepted, waiting for opponent) */}
      {isRankedGame && rankedGate.iAmReady && !rankedGate.bothReady && (
        <WaitingForOpponentPanel onLeave={handleLeaveMatch} roomPda={roomPda} />
      )}
    </div>
  );
};

export default DominosGame;
