import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Gem, Star, Flag, Users, Wifi, WifiOff, Crown, RotateCcw, LogOut } from "lucide-react";
import { ForfeitConfirmDialog } from "@/components/ForfeitConfirmDialog";
import { LeaveMatchModal, MatchState } from "@/components/LeaveMatchModal";
import { useForfeit } from "@/hooks/useForfeit";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import { useGameChat, ChatPlayer, ChatMessage } from "@/hooks/useGameChat";
import { useRematch } from "@/hooks/useRematch";
import { useGameSessionPersistence } from "@/hooks/useGameSessionPersistence";
import { useRoomMode } from "@/hooks/useRoomMode";
import { useRankedReadyGate } from "@/hooks/useRankedReadyGate";
import { useTurnTimer, DEFAULT_RANKED_TURN_TIME } from "@/hooks/useTurnTimer";
import { useStartRoll } from "@/hooks/useStartRoll";
import { useTxLock } from "@/contexts/TxLockContext";
import { DiceRollStart } from "@/components/DiceRollStart";
import TurnStatusHeader from "@/components/TurnStatusHeader";
import TurnHistoryDrawer from "@/components/TurnHistoryDrawer";
import NotificationToggle from "@/components/NotificationToggle";
import TurnBanner from "@/components/TurnBanner";
import GameChatPanel from "@/components/GameChatPanel";
import { GameEndScreen } from "@/components/GameEndScreen";
import { RematchModal } from "@/components/RematchModal";
import { RematchAcceptModal } from "@/components/RematchAcceptModal";
import { RulesGate } from "@/components/RulesGate";
import { RulesInfoPanel } from "@/components/RulesInfoPanel";
import { toast } from "@/hooks/use-toast";
import { PublicKey, Connection } from "@solana/web3.js";
import { parseRoomAccount } from "@/lib/solana-program";
import { getSolanaEndpoint } from "@/lib/solana-config";

// Persisted checkers game state
interface PersistedCheckersState {
  board: (Piece | null)[][];
  currentPlayer: Player;
  gameOver: Player | "draw" | null;
}

type Player = "gold" | "obsidian";
type PieceType = "normal" | "king";

interface Piece {
  player: Player;
  type: PieceType;
}

interface Position {
  row: number;
  col: number;
}

interface Move {
  from: Position;
  to: Position;
  captures?: Position[];
}

interface CheckersMove {
  from: Position;
  to: Position;
  captures?: Position[];
  board: (Piece | null)[][];
  player: Player;
}

const BOARD_SIZE = 8;

const initializeBoard = (): (Piece | null)[][] => {
  const board: (Piece | null)[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  
  // Place obsidian pieces on top 3 rows
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "obsidian", type: "normal" };
      }
    }
  }
  
  // Place gold pieces on bottom 3 rows
  for (let row = BOARD_SIZE - 3; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "gold", type: "normal" };
      }
    }
  }
  
  return board;
};

const CheckersGame = () => {
  const { roomPda } = useParams<{ roomPda: string }>();
  const roomId = roomPda; // Alias for backward compatibility with hooks/display
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [board, setBoard] = useState<(Piece | null)[][]>(initializeBoard);
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("gold");
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [gameOver, setGameOver] = useState<Player | "draw" | null>(null);
  const [chainCapture, setChainCapture] = useState<Position | null>(null);

  const boardRef = useRef(board);
  boardRef.current = board;

  // Multiplayer state
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<Player>("gold");
  const [flipped, setFlipped] = useState(false);
  
  // Leave/Forfeit dialog states
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [entryFeeSol, setEntryFeeSol] = useState(0);
  const [stakeLamports, setStakeLamports] = useState<number | undefined>(undefined);
  const [isCancellingRoom, setIsCancellingRoom] = useState(false);
  
  // TxLock for preventing Phantom "Request blocked"
  const { isTxInFlight, withTxLock } = useTxLock();
  
  // Solana rooms hook for forfeit/cancel
  const { cancelRoomByPda } = useSolanaRooms();
  
  // Refs for stable callback access
  const roomPlayersRef = useRef<string[]>([]);
  const myColorRef = useRef<Player>("gold");
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);
  useEffect(() => { myColorRef.current = myColor; }, [myColor]);

  // Fetch real player order from on-chain room account
  useEffect(() => {
    if (!address || !roomPda) return;

    const fetchRoomPlayers = async () => {
      try {
        const connection = new Connection(getSolanaEndpoint(), "confirmed");
        const pdaKey = new PublicKey(roomPda);
        const accountInfo = await connection.getAccountInfo(pdaKey);
        
        if (accountInfo?.data) {
          const parsed = parseRoomAccount(accountInfo.data as Buffer);
          if (parsed && parsed.players.length >= 2) {
            // Real player order from on-chain: creator at index 0, joiner at index 1
            const realPlayers = parsed.players.map(p => p.toBase58());
            setRoomPlayers(realPlayers);
            
            // Extract entry fee from on-chain (CRITICAL - Guardrail A: canonical stake)
            if (parsed.entryFee !== undefined) {
              setStakeLamports(parsed.entryFee);
              setEntryFeeSol(parsed.entryFee / 1_000_000_000);
            }
            
            // Determine my color based on on-chain position
            const myIndex = realPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
            const color = myIndex === 0 ? "gold" : "obsidian";
            setMyColor(color);
            setFlipped(color === "obsidian"); // Flip board for obsidian player
            console.log("[CheckersGame] On-chain players:", realPlayers, "My color:", color, "Entry fee:", parsed.entryFee);
            return;
          }
        }
        
        // Fallback if on-chain data not available yet (room still forming)
        console.log("[CheckersGame] Room not ready, using placeholder");
        setRoomPlayers([address, `waiting-${roomPda.slice(0, 8)}`]);
        setMyColor("gold");
        setFlipped(false);
      } catch (err) {
        console.error("[CheckersGame] Failed to fetch room players:", err);
        // Fallback on error
        setRoomPlayers([address, `error-${roomPda.slice(0, 8)}`]);
        setMyColor("gold");
        setFlipped(false);
      }
    };

    fetchRoomPlayers();
  }, [address, roomPda]);

  // Game session persistence - track if we've shown the restored toast
  const restoredToastShownRef = useRef(false);

  const handleCheckersStateRestored = useCallback((state: Record<string, any>, showToast = true) => {
    const persisted = state as PersistedCheckersState;
    console.log('[CheckersGame] Restoring state from database:', persisted);
    
    if (persisted.board) {
      setBoard(persisted.board);
      setCurrentPlayer(persisted.currentPlayer);
      setGameOver(persisted.gameOver);
      
      // Only show toast once per session load
      if (showToast && !restoredToastShownRef.current) {
        restoredToastShownRef.current = true;
        toast({
          title: t('gameSession.gameRestored'),
          description: t('gameSession.sessionRecovered'),
        });
      }
    }
  }, [t]);

  // For realtime updates, don't show toast (silent sync)
  const handleRealtimeStateRestored = useCallback((state: Record<string, any>) => {
    handleCheckersStateRestored(state, false);
  }, [handleCheckersStateRestored]);

  // Room mode hook - fetches from DB for Player 2 who doesn't have localStorage data
  // Must be called before any effects that use roomMode
  const { mode: roomMode, isRanked: isRankedGame, isLoaded: modeLoaded } = useRoomMode(roomPda);

  const { loadSession: loadCheckersSession, saveSession: saveCheckersSession, finishSession: finishCheckersSession } = useGameSessionPersistence({
    roomPda: roomPda,
    gameType: 'checkers',
    enabled: roomPlayers.length >= 2 && !!address,
    onStateRestored: handleRealtimeStateRestored,
    callerWallet: address, // Pass caller wallet for secure RPC validation
  });

  // Load session on mount
  useEffect(() => {
    if (roomPlayers.length >= 2 && address) {
      loadCheckersSession().then(savedState => {
        if (savedState && Object.keys(savedState).length > 0) {
          handleCheckersStateRestored(savedState, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPlayers.length, address]);

  // Save game state after each move
  useEffect(() => {
    if (roomPlayers.length >= 2) {
      const currentTurnWallet = currentPlayer === 'gold' ? roomPlayers[0] : roomPlayers[1];
      const persisted: PersistedCheckersState = {
        board,
        currentPlayer,
        gameOver,
      };
      saveCheckersSession(
        persisted,
        currentTurnWallet,
        roomPlayers[0],
        roomPlayers[1],
        gameOver ? 'finished' : 'active',
        roomMode
      );
    }
  }, [board, currentPlayer, gameOver, roomPlayers, saveCheckersSession, roomMode]);

  // Finish session and archive room when game ends
  useEffect(() => {
    if (gameOver && roomPlayers.length >= 2) {
      finishCheckersSession();
    }
  }, [gameOver, roomPlayers.length, finishCheckersSession]);

  const rankedGate = useRankedReadyGate({
    roomPda,
    myWallet: address,
    isRanked: isRankedGame,
    enabled: roomPlayers.length >= 2 && modeLoaded,
  });

  // Check if we have 2 real player wallets
  const hasTwoRealPlayers = roomPlayers.length >= 2 &&
    !roomPlayers[1]?.startsWith("waiting-") &&
    !roomPlayers[1]?.startsWith("error-");

  // Deterministic start roll for ALL games (casual + ranked)
  const startRoll = useStartRoll({
    roomPda,
    gameType: "checkers",
    myWallet: address,
    isRanked: isRankedGame,
    roomPlayers,
    hasTwoRealPlayers,
    initialColor: myColor === "gold" ? "w" : "b",
  });

  // Update myColor based on start roll result for ranked games
  useEffect(() => {
    if (isRankedGame && startRoll.isFinalized && startRoll.startingWallet) {
      const isStarter = startRoll.startingWallet.toLowerCase() === address?.toLowerCase();
      setMyColor(isStarter ? "gold" : "obsidian");
      setFlipped(!isStarter); // Flip board for non-starter
    }
  }, [isRankedGame, startRoll.isFinalized, startRoll.startingWallet, address]);

  const handleAcceptRules = async () => {
    const result = await rankedGate.acceptRules();
    if (result.success) {
      toast({ title: t('gameSession.rulesAccepted'), description: t('gameSession.signedAndReady') });
    } else {
      toast({ title: t('gameSession.failedToAccept'), description: result.error || t('gameSession.tryAgain'), variant: "destructive" });
    }
  };

  // Guardrail B: Proper isDataLoaded computation (not dependent on entryFeeSol > 0)
  const isDataLoaded = useMemo(() => {
    return (
      !!roomPda &&
      roomPlayers.length > 0 &&
      stakeLamports !== undefined &&
      (rankedGate.turnTimeSeconds > 0 || !isRankedGame) &&
      rankedGate.isDataLoaded
    );
  }, [roomPda, roomPlayers.length, stakeLamports, rankedGate.turnTimeSeconds, isRankedGame, rankedGate.isDataLoaded]);

  // Use canonical stake for turn time
  const effectiveTurnTime = rankedGate.turnTimeSeconds || DEFAULT_RANKED_TURN_TIME;

  // Determine match state for LeaveMatchModal
  const matchState: MatchState = useMemo(() => {
    if (gameOver) return "game_over";
    if (roomPlayers.length < 2) return "waiting_for_opponent";
    if (!rankedGate.iAmReady || !rankedGate.opponentReady) return "rules_pending";
    if (rankedGate.bothReady && startRoll.isFinalized) return "match_active";
    return "opponent_joined";
  }, [gameOver, roomPlayers.length, rankedGate.iAmReady, rankedGate.opponentReady, rankedGate.bothReady, startRoll.isFinalized]);

  // Is current user the room creator? (first player in roomPlayers)
  const isCreator = useMemo(() => {
    if (!address || roomPlayers.length === 0) return false;
    return roomPlayers[0]?.toLowerCase() === address.toLowerCase();
  }, [address, roomPlayers]);

  // Open leave modal - NEVER triggers wallet
  const handleLeaveClick = useCallback(() => {
    console.log("[LeaveMatch] Opening leave modal (UI only)");
    setShowLeaveModal(true);
  }, []);

  // NOTE: handleUILeave, handleCancelRoom, handleForfeitMatch are defined AFTER useForfeit hook

  // Opponent wallet for forfeit
  const opponentWallet = useMemo(() => {
    if (!address || roomPlayers.length < 2) return null;
    return roomPlayers.find(p => p.toLowerCase() !== address.toLowerCase()) || null;
  }, [address, roomPlayers]);

  // Block gameplay until start roll is finalized (for ranked games, also need rules accepted)
  const canPlay = startRoll.isFinalized && (!isRankedGame || rankedGate.bothReady);
  
  // Check if it's actually my turn (based on game state, not canPlay gate)
  const isActuallyMyTurn = currentPlayer === myColor && !gameOver;
  
  // isMyTurn includes canPlay gate - used for board disable
  const isMyTurn = canPlay && isActuallyMyTurn;

  // Ref for forfeit function - will be set by useForfeit hook
  const forfeitFnRef = useRef<(() => Promise<void>) | null>(null);

  // Turn timer for ranked games - auto-forfeit on timeout
  const handleTimeExpired = useCallback(() => {
    if (!gameOver) {
      toast({
        title: t('gameSession.timeExpired'),
        description: t('gameSession.forfeitedMatch'),
        variant: "destructive",
      });
      // Trigger forfeit via finalizeGame (single authoritative payout)
      forfeitFnRef.current?.();
      setGameOver(myColor === "gold" ? "obsidian" : "gold");
      play('checkers_lose');
    }
  }, [gameOver, myColor, play, t]);

  // effectiveTurnTime already defined above in isDataLoaded block
  
  const turnTimer = useTurnTimer({
    turnTimeSeconds: effectiveTurnTime,
    enabled: isRankedGame && canPlay && !gameOver,
    isMyTurn,
    onTimeExpired: handleTimeExpired,
    roomId: roomPda,
  });

  // Turn notification players
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      const color = index === 0 ? "gold" : "obsidian";
      return {
        address: playerAddress,
        name: isMe ? t("common.you") : t("game.opponent"),
        color,
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address]);

  const activeTurnAddress = useMemo(() => {
    const turnIndex = currentPlayer === "gold" ? 0 : 1;
    return turnPlayers[turnIndex]?.address || null;
  }, [currentPlayer, turnPlayers]);

  const {
    isMyTurn: isMyTurnNotification,
    notificationsEnabled,
    hasPermission,
    turnHistory,
    toggleNotifications,
    recordPlayerMove,
  } = useTurnNotifications({
    gameName: "Checkers",
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
  const rematch = useRematch("Checkers", roomPlayers);

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
    if (gameOver === "draw") return "draw";
    if (gameOver === myColor) return address;
    return roomPlayers.find(p => p.toLowerCase() !== address?.toLowerCase()) || null;
  }, [gameOver, myColor, address, roomPlayers]);

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
      toast({ title: t("gameMultiplayer.allPlayersAccepted"), description: t("gameMultiplayer.gameStarting") });
      sendRematchReadyRef.current?.(rematchRoomId);
      window.location.href = `/game/checkers/${rematchRoomId}`;
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
  const getCaptures = useCallback((board: (Piece | null)[][], pos: Position): Move[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];
    
    const captures: Move[] = [];
    const directions = piece.type === "king" 
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.player === "gold" 
        ? [[-1, -1], [-1, 1]]
        : [[1, -1], [1, 1]];
    
    for (const [dr, dc] of directions) {
      const jumpRow = pos.row + dr * 2;
      const jumpCol = pos.col + dc * 2;
      const midRow = pos.row + dr;
      const midCol = pos.col + dc;
      
      if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE) {
        const midPiece = board[midRow][midCol];
        const jumpSquare = board[jumpRow][jumpCol];
        
        if (midPiece && midPiece.player !== piece.player && !jumpSquare) {
          captures.push({
            from: pos,
            to: { row: jumpRow, col: jumpCol },
            captures: [{ row: midRow, col: midCol }]
          });
        }
      }
    }
    
    return captures;
  }, []);

  const getSimpleMoves = useCallback((board: (Piece | null)[][], pos: Position): Move[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];
    
    const moves: Move[] = [];
    const directions = piece.type === "king" 
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.player === "gold" 
        ? [[-1, -1], [-1, 1]]
        : [[1, -1], [1, 1]];
    
    for (const [dr, dc] of directions) {
      const newRow = pos.row + dr;
      const newCol = pos.col + dc;
      
      if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
        if (!board[newRow][newCol]) {
          moves.push({ from: pos, to: { row: newRow, col: newCol } });
        }
      }
    }
    
    return moves;
  }, []);

  const playerHasCaptures = useCallback((board: (Piece | null)[][], player: Player): boolean => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.player === player) {
          if (getCaptures(board, { row, col }).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }, [getCaptures]);

  const getAllMoves = useCallback((board: (Piece | null)[][], player: Player): Move[] => {
    const allCaptures: Move[] = [];
    const allSimple: Move[] = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.player === player) {
          const captures = getCaptures(board, { row, col });
          allCaptures.push(...captures);
          
          if (captures.length === 0) {
            allSimple.push(...getSimpleMoves(board, { row, col }));
          }
        }
      }
    }
    
    return allCaptures.length > 0 ? allCaptures : allSimple;
  }, [getCaptures, getSimpleMoves]);

  const applyMove = useCallback((board: (Piece | null)[][], move: Move): (Piece | null)[][] => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[move.from.row][move.from.col];
    if (!piece) return newBoard;
    
    newBoard[move.to.row][move.to.col] = { ...piece };
    newBoard[move.from.row][move.from.col] = null;
    
    if (move.captures) {
      for (const cap of move.captures) {
        newBoard[cap.row][cap.col] = null;
      }
    }
    
    // King promotion
    if (piece.player === "gold" && move.to.row === 0) {
      newBoard[move.to.row][move.to.col]!.type = "king";
    } else if (piece.player === "obsidian" && move.to.row === BOARD_SIZE - 1) {
      newBoard[move.to.row][move.to.col]!.type = "king";
    }
    
    return newBoard;
  }, []);

  const checkGameOver = useCallback((board: (Piece | null)[][]): Player | "draw" | null => {
    const goldMoves = getAllMoves(board, "gold");
    const obsidianMoves = getAllMoves(board, "obsidian");
    
    let goldPieces = 0;
    let obsidianPieces = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece?.player === "gold") goldPieces++;
        if (piece?.player === "obsidian") obsidianPieces++;
      }
    }
    
    if (goldPieces === 0) return "obsidian";
    if (obsidianPieces === 0) return "gold";
    if (goldMoves.length === 0) return "obsidian";
    if (obsidianMoves.length === 0) return "gold";
    
    return null;
  }, [getAllMoves]);

  // Refs for stable callback access
  const recordPlayerMoveRef = useRef(recordPlayerMove);
  const checkGameOverRef = useRef(checkGameOver);
  useEffect(() => { recordPlayerMoveRef.current = recordPlayerMove; }, [recordPlayerMove]);
  useEffect(() => { checkGameOverRef.current = checkGameOver; }, [checkGameOver]);

  // WebRTC message handler - stable with refs
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    console.log("[CheckersGame] Received message:", message.type);
    
    // Handle chat messages
    if (message.type === "chat" && message.payload) {
      try {
        const chatMsg = typeof message.payload === "string" 
          ? JSON.parse(message.payload) 
          : message.payload;
        chatRef.current?.receiveMessage(chatMsg);
      } catch (e) {
        console.error("[CheckersGame] Failed to parse chat message:", e);
      }
      return;
    }
    
    if (message.type === "move" && message.payload) {
      const moveData = message.payload as CheckersMove;
      
      if (moveData.captures && moveData.captures.length > 0) {
        play('checkers_capture');
      } else {
        play('checkers_slide');
      }
      
      setBoard(moveData.board);
      boardRef.current = moveData.board;
      
      recordPlayerMoveRef.current(roomPlayersRef.current[moveData.player === "gold" ? 0 : 1] || "", "move");
      
      const result = checkGameOverRef.current(moveData.board);
      if (result) {
        setGameOver(result);
        chatRef.current?.addSystemMessage(result === myColorRef.current ? t("gameMultiplayer.youWin") : t("gameMultiplayer.opponentWins"));
        play(result === myColorRef.current ? 'checkers_win' : 'checkers_lose');
      } else {
        setCurrentPlayer(moveData.player === "gold" ? "obsidian" : "gold");
      }
    } else if (message.type === "resign") {
      setGameOver(myColorRef.current);
      chatRef.current?.addSystemMessage(t("gameMultiplayer.opponentResigned"));
      play('checkers_win');
      toast({
        title: t("gameMultiplayer.victory"),
        description: t("gameMultiplayer.opponentResignedVictory"),
      });
    } else if (message.type === "rematch_invite" && message.payload) {
      setRematchInviteData(message.payload);
      setShowAcceptModal(true);
      toast({ title: t("gameMultiplayer.rematchInvite"), description: t("gameMultiplayer.rematchInviteDesc") });
    } else if (message.type === "rematch_accept") {
      toast({ title: t("gameMultiplayer.rematchAccepted"), description: t("gameMultiplayer.rematchAcceptedDesc") });
    } else if (message.type === "rematch_decline") {
      toast({ title: t("gameMultiplayer.rematchDeclined"), description: t("gameMultiplayer.rematchDeclinedDesc"), variant: "destructive" });
      rematch.closeRematchModal();
    } else if (message.type === "rematch_ready" && message.payload) {
      toast({ title: t("gameMultiplayer.rematchReady"), description: t("gameMultiplayer.rematchReadyDesc") });
      navigate(`/game/checkers/${message.payload.roomId}`);
    }
  }, [play, t, rematch, navigate]); // Stable deps - uses refs

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
    sendChat,
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

  // Update refs with WebRTC functions
  useEffect(() => {
    sendRematchInviteRef.current = sendRematchInvite;
    sendRematchAcceptRef.current = sendRematchAccept;
    sendRematchDeclineRef.current = sendRematchDecline;
    sendRematchReadyRef.current = sendRematchReady;
  }, [sendRematchInvite, sendRematchAccept, sendRematchDecline, sendRematchReady]);

  // useForfeit hook - centralized forfeit/leave logic
  const { forfeit, leave, isForfeiting, isLeaving, forfeitRef } = useForfeit({
    roomPda: roomPda || null,
    myWallet: address || null,
    opponentWallet,
    stakeLamports: entryFeeSol * 1_000_000_000,
    gameType: "checkers",
    mode: isRankedGame ? 'ranked' : 'casual',
    // CRITICAL: Pass validation state for ranked games
    bothRulesAccepted: rankedGate.bothReady,
    gameStarted: startRoll.isFinalized,
    onCleanupWebRTC: () => console.log("[CheckersGame] Cleaning up WebRTC"),
    onCleanupSupabase: () => console.log("[CheckersGame] Cleaning up Supabase"),
  });
  
  // Connect forfeit ref for timeout handler
  useEffect(() => {
    forfeitFnRef.current = forfeitRef.current;
  }, [forfeitRef]);

  // ========== Leave/Forfeit handlers (defined after useForfeit) ==========
  
  // UI-only leave handler - NO wallet calls
  const handleUILeave = useCallback(() => {
    console.log("[LeaveMatch] UI exit only");
    leave();
  }, [leave]);

  // On-chain: Cancel room and get refund (creator only)
  const handleCancelRoom = useCallback(async () => {
    console.log("[LeaveMatch] On-chain action: Cancel room (refund)");
    setIsCancellingRoom(true);
    try {
      const result = await cancelRoomByPda(roomPda || "");
      if (result.ok) {
        toast({ title: t('forfeit.roomCancelled'), description: t('forfeit.stakeRefunded') });
      } else {
        toast({ title: t('common.error'), description: result.reason, variant: "destructive" });
      }
      navigate("/room-list");
    } finally {
      setIsCancellingRoom(false);
    }
  }, [cancelRoomByPda, roomPda, navigate, t]);

  // On-chain: Forfeit match (pay opponent)
  const handleForfeitMatch = useCallback(async () => {
    console.log("[ForfeitMatch] On-chain action requested");
    await forfeit();
  }, [forfeit]);

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

  useEffect(() => {
    if (roomPlayers.length === 2 && chat.messages.length === 0) {
      chat.addSystemMessage(t("gameMultiplayer.gameStarted"));
    }
  }, [roomPlayers.length]);

  // Handle square click
  const handleSquareClick = useCallback((row: number, col: number) => {
    if (gameOver || !isMyTurn) return;
    
    // Transform coordinates if board is flipped
    const actualRow = flipped ? BOARD_SIZE - 1 - row : row;
    const actualCol = flipped ? BOARD_SIZE - 1 - col : col;
    
    const clickedPiece = board[actualRow][actualCol];
    
    // Chain capture logic
    if (chainCapture) {
      const move = validMoves.find(m => m.to.row === actualRow && m.to.col === actualCol);
      if (move) {
        play('checkers_capture');
        const newBoard = applyMove(board, move);
        setBoard(newBoard);
        boardRef.current = newBoard;
        
        const moreCaptures = getCaptures(newBoard, move.to);
        if (moreCaptures.length > 0) {
          setChainCapture(move.to);
          setSelectedPiece(move.to);
          setValidMoves(moreCaptures);
        } else {
          // Send move to opponent
          const moveData: CheckersMove = {
            from: move.from,
            to: move.to,
            captures: move.captures,
            board: newBoard,
            player: myColor,
          };
          sendMove(moveData);
          recordPlayerMove(address || "", "capture");
          
          setChainCapture(null);
          setSelectedPiece(null);
          setValidMoves([]);
          
          const result = checkGameOver(newBoard);
          if (result) {
            setGameOver(result);
            play(result === myColor ? 'checkers_win' : 'checkers_lose');
          } else {
            setCurrentPlayer(myColor === "gold" ? "obsidian" : "gold");
          }
        }
      }
      return;
    }
    
    // Regular move selection
    if (selectedPiece) {
      const move = validMoves.find(m => m.to.row === actualRow && m.to.col === actualCol);
      if (move) {
        if (move.captures && move.captures.length > 0) {
          play('checkers_capture');
        } else {
          play('checkers_slide');
        }
        
        const newBoard = applyMove(board, move);
        setBoard(newBoard);
        boardRef.current = newBoard;
        
        if (move.captures && move.captures.length > 0) {
          const moreCaptures = getCaptures(newBoard, move.to);
          if (moreCaptures.length > 0) {
            setChainCapture(move.to);
            setSelectedPiece(move.to);
            setValidMoves(moreCaptures);
            return;
          }
        }
        
        // Send move to opponent
        const moveData: CheckersMove = {
          from: move.from,
          to: move.to,
          captures: move.captures,
          board: newBoard,
          player: myColor,
        };
        sendMove(moveData);
        recordPlayerMove(address || "", move.captures ? "capture" : "move");
        
        setSelectedPiece(null);
        setValidMoves([]);
        
        const result = checkGameOver(newBoard);
        if (result) {
          setGameOver(result);
          play(result === myColor ? 'checkers_win' : 'checkers_lose');
        } else {
          setCurrentPlayer(myColor === "gold" ? "obsidian" : "gold");
        }
        return;
      }
    }
    
    // Select a piece
    if (clickedPiece && clickedPiece.player === myColor) {
      const captures = getCaptures(board, { row: actualRow, col: actualCol });
      const simpleMoves = getSimpleMoves(board, { row: actualRow, col: actualCol });
      const hasAnyCaptures = playerHasCaptures(board, myColor);
      
      if (hasAnyCaptures) {
        if (captures.length === 0) return;
        setSelectedPiece({ row: actualRow, col: actualCol });
        setValidMoves(captures);
      } else {
        setSelectedPiece({ row: actualRow, col: actualCol });
        setValidMoves(simpleMoves);
      }
    } else {
      setSelectedPiece(null);
      setValidMoves([]);
    }
  }, [board, gameOver, isMyTurn, selectedPiece, validMoves, chainCapture, myColor, flipped,
      getCaptures, getSimpleMoves, playerHasCaptures, applyMove, checkGameOver, play, sendMove, recordPlayerMove, address]);

  const handleResign = useCallback(() => {
    sendResign();
    setGameOver(myColor === "gold" ? "obsidian" : "gold");
    play('checkers_lose');
  }, [sendResign, myColor, play]);

  const isValidMoveTarget = (row: number, col: number) => {
    const actualRow = flipped ? BOARD_SIZE - 1 - row : row;
    const actualCol = flipped ? BOARD_SIZE - 1 - col : col;
    return validMoves.some(m => m.to.row === actualRow && m.to.col === actualCol);
  };

  const isSelectedPiece = (row: number, col: number) => {
    if (!selectedPiece) return false;
    const actualRow = flipped ? BOARD_SIZE - 1 - row : row;
    const actualCol = flipped ? BOARD_SIZE - 1 - col : col;
    return selectedPiece.row === actualRow && selectedPiece.col === actualCol;
  };

  // Render board with flipping support
  const renderBoard = () => {
    const rows = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];
    const cols = flipped ? [...Array(BOARD_SIZE).keys()].reverse() : [...Array(BOARD_SIZE).keys()];
    
    return rows.map((row, rowIndex) => (
      <div key={row} className="flex">
        {cols.map((col, colIndex) => {
          const actualRow = flipped ? BOARD_SIZE - 1 - rowIndex : rowIndex;
          const actualCol = flipped ? BOARD_SIZE - 1 - colIndex : colIndex;
          const piece = board[actualRow][actualCol];
          const isDark = (actualRow + actualCol) % 2 === 1;
          const isSelected = isSelectedPiece(rowIndex, colIndex);
          const isTarget = isValidMoveTarget(rowIndex, colIndex);
          
          return (
            <div
              key={`${row}-${col}`}
              onClick={() => handleSquareClick(rowIndex, colIndex)}
              className={`
                w-10 h-10 sm:w-12 sm:h-12 md:w-14 md:h-14 flex items-center justify-center cursor-pointer
                transition-all duration-200
                ${isDark 
                  ? "bg-gradient-to-br from-amber-900/80 to-amber-950/90" 
                  : "bg-gradient-to-br from-amber-200/90 to-amber-300/80"
                }
                ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                ${isTarget ? "ring-2 ring-green-400/60 ring-inset" : ""}
              `}
            >
              {piece && (
                <div
                  className={`
                    w-8 h-8 sm:w-10 sm:h-10 md:w-11 md:h-11 rounded-full
                    flex items-center justify-center
                    transition-all duration-200
                    ${piece.player === "gold"
                      ? "bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-600 shadow-[0_0_12px_hsl(45_93%_54%_/_0.5)]"
                      : "bg-gradient-to-br from-gray-700 via-gray-800 to-gray-900 shadow-[0_0_12px_rgba(0,0,0,0.5)]"
                    }
                    ${piece.player === "gold"
                      ? "border-2 border-yellow-500/50"
                      : "border-2 border-gray-600/50"
                    }
                    ${isSelected ? "scale-110" : ""}
                  `}
                >
                  {piece.type === "king" && (
                    <Crown className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      piece.player === "gold" ? "text-yellow-800" : "text-gray-400"
                    }`} />
                  )}
                </div>
              )}
              {isTarget && !piece && (
                <div className="w-4 h-4 rounded-full bg-green-400/50" />
              )}
            </div>
          );
        })}
      </div>
    ));
  };

  // Require wallet connection
  if (!walletConnected || !address) {
    return (
      <div className="container max-w-4xl py-8 px-4">
        <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
          <ArrowLeft className="mr-2 h-4 w-4" /> {t("gameMultiplayer.backToRooms")}
        </Button>
        <div className="text-center py-12">
          <Users className="h-16 w-16 text-primary mx-auto mb-4" />
          <h3 className="text-xl font-semibold mb-2">{t("gameMultiplayer.connectWalletToPlay")}</h3>
          <p className="text-muted-foreground">{t("gameMultiplayer.connectWalletDesc")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
      
      {/* RulesGate - Hard gate for ranked games */}
      <RulesGate
        isRanked={isRankedGame}
        roomPda={roomPda}
        myWallet={address}
        roomPlayers={roomPlayers}
        iAmReady={rankedGate.iAmReady}
        opponentReady={rankedGate.opponentReady}
        bothReady={rankedGate.bothReady}
        isSettingReady={rankedGate.isSettingReady}
        stakeLamports={stakeLamports}
        turnTimeSeconds={effectiveTurnTime}
        opponentWallet={opponentWallet || undefined}
        onAcceptRules={handleAcceptRules}
        onLeave={handleUILeave}
        onOpenWalletSelector={() => {}}
        isDataLoaded={isDataLoaded}
        startRollFinalized={startRoll.isFinalized}
      >
        {/* Dice Roll Start - only rendered when RulesGate allows */}
        {startRoll.showDiceRoll && roomPlayers.length >= 2 && address && (
          <DiceRollStart
            roomPda={roomPda || ""}
            myWallet={address}
            player1Wallet={roomPlayers[0]}
            player2Wallet={roomPlayers[1]}
            onComplete={startRoll.handleRollComplete}
            onLeave={leave}
            onForfeit={forfeit}
            isLeaving={isLeaving}
            isForfeiting={isForfeiting}
          />
        )}
      </RulesGate>
      
      {/* Turn Banner */}
      <TurnBanner
        gameName="Checkers"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isActuallyMyTurn && !gameOver && !startRoll.showDiceRoll}
      />

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-primary/20 px-4 py-3">
          <div className="max-w-6xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                <Link to="/room-list" className="flex items-center gap-2">
                  <ArrowLeft size={18} />
                  <span className="hidden sm:inline">{t("gameMultiplayer.rooms")}</span>
                </Link>
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <Gem className="w-4 h-4 text-primary" />
                  <h1 className="text-lg font-display font-bold text-primary">
                    Checkers - Room #{roomId}
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {peerConnected ? (
                    <><Wifi className="w-3 h-3 text-green-500" /> {t("gameMultiplayer.connected")}</>
                  ) : (
                    <><WifiOff className="w-3 h-3 text-yellow-500" /> {connectionState}</>
                  )}
                  <span className="mx-1">•</span>
                  {t("gameMultiplayer.playingAs")} {myColor === "gold" ? t("gameMultiplayer.gold") : t("gameMultiplayer.obsidian")}
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
              isMyTurn={isActuallyMyTurn}
              activePlayer={turnPlayers[currentPlayer === "gold" ? 0 : 1]}
              players={turnPlayers}
              myAddress={address}
              remainingTime={isRankedGame ? turnTimer.remainingTime : undefined}
              showTimer={isRankedGame && canPlay}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex flex-col items-center gap-6">
            {/* Board */}
            <div className="relative">
              <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
              <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40">
                <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2">
                  {renderBoard()}
                </div>
              </div>
            </div>

            {/* Game Status */}
            <div className="text-center">
              {gameOver && (
                <div className="space-y-4">
                  <div className={`text-xl font-display font-bold ${
                    gameOver === myColor ? "text-green-400" : "text-red-400"
                  }`}>
                    {gameOver === myColor ? `🎉 ${t("gameMultiplayer.youWin")}` : gameOver === "draw" ? `${t("game.draw")}!` : `${t("gameMultiplayer.youLose")}`}
                  </div>
                  <div className="flex gap-3 justify-center">
                    <Button onClick={() => rematch.openRematchModal()} className="gap-2">
                      <RotateCcw className="w-4 h-4" />
                      {t("gameMultiplayer.rematch")}
                    </Button>
                    <Button asChild variant="outline">
                      <Link to="/room-list">{t("gameMultiplayer.exit")}</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Controls */}
            {!gameOver && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResign}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                <Flag className="w-4 h-4 mr-2" />
                {t("gameMultiplayer.resign")}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Chat Panel */}
      <GameChatPanel chat={chat} />

      {/* Rules Info Panel (Ranked only) */}
      <RulesInfoPanel 
        stakeSol={rankedGate.stakeLamports / 1_000_000_000} 
        isRanked={isRankedGame}
        turnTimeSeconds={effectiveTurnTime}
      />

      {/* Game End Screen */}
      {gameOver && (
        <GameEndScreen
          gameType="Checkers"
          winner={winnerAddress}
          winnerName={gameEndPlayers.find(p => p.address === winnerAddress)?.name}
          myAddress={address}
          players={gameEndPlayers}
          onRematch={() => rematch.openRematchModal()}
          onExit={() => navigate("/room-list")}
          roomPda={roomPda}
          isStaked={false}
        />
      )}

      {/* Leave Match Modal - Safe UI with explicit on-chain action separation */}
      <LeaveMatchModal
        open={showLeaveModal}
        onOpenChange={setShowLeaveModal}
        matchState={matchState}
        roomPda={roomPda || ""}
        isCreator={isCreator}
        stakeSol={entryFeeSol}
        onUILeave={handleUILeave}
        onCancelRoom={handleCancelRoom}
        onForfeitMatch={handleForfeitMatch}
        isCancelling={isCancellingRoom}
        isForfeiting={isForfeiting}
      />

      {/* Rematch Modal */}
      <RematchModal
        isOpen={rematch.isModalOpen}
        onClose={rematch.closeRematchModal}
        gameType="Checkers"
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

      {/* Accept Rules Modal and Waiting Panel - REMOVED: Now handled by Rules Gate above */}

      {/* Forfeit Confirmation Dialog */}
      <ForfeitConfirmDialog
        open={showForfeitDialog}
        onOpenChange={setShowForfeitDialog}
        onConfirm={forfeit}
        isLoading={isForfeiting}
        gameType="2player"
        stakeSol={entryFeeSol}
      />
    </div>
  );
};

export default CheckersGame;
