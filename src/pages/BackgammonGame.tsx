import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { getOpponentWallet, isSameWallet, isRealWallet } from "@/lib/walletUtils";
import { GameErrorBoundary } from "@/components/GameErrorBoundary";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, RotateCw, Gem, Flag, Users, Wifi, WifiOff, RefreshCw, LogOut, Trophy } from "lucide-react";
import { SoundToggle } from "@/components/SoundToggle";
import { ForfeitConfirmDialog } from "@/components/ForfeitConfirmDialog";
import { LeaveMatchModal, MatchState } from "@/components/LeaveMatchModal";
import { useForfeit } from "@/hooks/useForfeit";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { BackgammonRulesDialog } from "@/components/BackgammonRulesDialog";
import { Dice3D, CheckerStack } from "@/components/BackgammonPieces";
import GoldConfettiExplosion from "@/components/GoldConfettiExplosion";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSound } from "@/contexts/SoundContext";
import { AudioManager } from "@/lib/AudioManager";
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
import { useDurableGameSync, GameMove } from "@/hooks/useDurableGameSync";
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
import { InAppBrowserRecovery } from "@/components/InAppBrowserRecovery";
import { toast } from "@/hooks/use-toast";
import { PublicKey, Connection } from "@solana/web3.js";
import { parseRoomAccount } from "@/lib/solana-program";
import { getSolanaEndpoint } from "@/lib/solana-config";
import { dbg, isDebugEnabled } from "@/lib/debugLog";
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

// Persisted backgammon game state
interface PersistedBackgammonState {
  gameState: GameState;
  dice: number[];
  remainingMoves: number[];
  currentPlayer: "player" | "ai";
  gameOver: boolean;
  gameStatus: string;
}

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
  const { roomPda } = useParams<{ roomPda: string }>();
  const roomId = roomPda; // Alias for backward compatibility with hooks/display
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
  const [winnerWallet, setWinnerWallet] = useState<string | null>(null); // Direct wallet address of winner

  // Multiplayer state
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myRole, setMyRole] = useState<"player" | "ai">("player"); // "player" = Gold, "ai" = Black
  const [entryFeeSol, setEntryFeeSol] = useState(0);
  const [stakeLamports, setStakeLamports] = useState<number | undefined>(undefined);
  
  // Leave/Forfeit dialog states
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isCancellingRoom, setIsCancellingRoom] = useState(false);
  
  // TxLock for preventing Phantom "Request blocked"
  const { isTxInFlight, withTxLock } = useTxLock();
  
  // Solana rooms hook for forfeit/cancel
  const { cancelRoomByPda } = useSolanaRooms();

  // Refs for stable callback access
  const roomPlayersRef = useRef<string[]>([]);
  const currentPlayerRef = useRef<"player" | "ai">("player");
  const myRoleRef = useRef<"player" | "ai">("player");
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);
  useEffect(() => { currentPlayerRef.current = currentPlayer; }, [currentPlayer]);
  useEffect(() => { myRoleRef.current = myRole; }, [myRole]);

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
            // Real player order from on-chain: creator at index 0 (gold), joiner at index 1 (black)
            const realPlayers = parsed.players.map(p => p.toBase58());
            setRoomPlayers(realPlayers);
            
            // Extract entry fee from on-chain (CRITICAL - Guardrail A: canonical stake)
            if (parsed.entryFee !== undefined) {
              setStakeLamports(parsed.entryFee);
              setEntryFeeSol(parsed.entryFee / 1_000_000_000);
            }
            
            // Determine my role based on on-chain position (only for fallback before dice roll)
            // Note: For ranked games, start roll determines who plays first
            const myIndex = realPlayers.findIndex(p => isSameWallet(p, address));
            const role = myIndex === 0 ? "player" : "ai"; // "player" = gold, "ai" = black
            setMyRole(role);
            console.log("[BackgammonGame] On-chain players:", realPlayers, "Initial role:", role === "player" ? "gold" : "black", "Entry fee:", parsed.entryFee);
            return;
          }
        }
        
        // Fallback if on-chain data not available yet (room still forming)
        console.log("[BackgammonGame] Room not ready, using placeholder");
        setRoomPlayers([address, `waiting-${roomPda.slice(0, 8)}`]);
        setMyRole("player");
      } catch (err) {
        console.error("[BackgammonGame] Failed to fetch room players:", err);
        // Fallback on error
        setRoomPlayers([address, `error-${roomPda.slice(0, 8)}`]);
        setMyRole("player");
      }
    };

    fetchRoomPlayers();
  }, [address, roomPda]);

  // Game session persistence - track if we've shown the restored toast
  const restoredToastShownRef = useRef(false);

  const handleBackgammonStateRestored = useCallback((state: Record<string, any>, showToast = true) => {
    const persisted = state as PersistedBackgammonState;
    console.log('[BackgammonGame] Restoring state from database:', persisted);
    
    if (persisted.gameState) {
      setGameState(persisted.gameState);
      setCurrentPlayer(persisted.currentPlayer);
      setGameOver(persisted.gameOver || false);
      setGameStatus(persisted.gameStatus || t('game.yourTurn'));
      
      // CRITICAL: Clear stale dice on restore if it's my turn
      // Dice from previous turn can bleed into the restored state
      const restoredPlayer = persisted.currentPlayer;
      const isRestoredToMyTurn = restoredPlayer === myRoleRef.current;
      
      if (isRestoredToMyTurn && persisted.dice?.length > 0) {
        console.log("[BackgammonGame] Clearing stale dice on session restore - it's my turn but dice exist");
        setDice([]);
        setRemainingMoves([]);
      } else {
        setDice(persisted.dice || []);
        setRemainingMoves(persisted.remainingMoves || []);
      }
      
      // Only show toast once per session load
      if (showToast && !restoredToastShownRef.current) {
        restoredToastShownRef.current = true;
        toast({
          title: t('gameSession.gameRestored'),
          description: t('gameSession.sessionRecovered'),
          duration: 3000, // 3 seconds, dismissible
        });
      }
    }
  }, [t]);

  // For realtime updates, don't show toast (silent sync)
  const handleRealtimeStateRestored = useCallback((state: Record<string, any>) => {
    handleBackgammonStateRestored(state, false);
  }, [handleBackgammonStateRestored]);

  // Room mode hook - fetches from DB for Player 2 who doesn't have localStorage data
  // Must be called before any effects that use roomMode
  const { mode: roomMode, isRanked: isRankedGame, isLoaded: modeLoaded } = useRoomMode(roomPda);

  const { loadSession: loadBackgammonSession, saveSession: saveBackgammonSession, finishSession: finishBackgammonSession } = useGameSessionPersistence({
    roomPda: roomPda,
    gameType: 'backgammon',
    enabled: roomPlayers.length >= 2 && !!address,
    onStateRestored: handleRealtimeStateRestored,
    callerWallet: address, // Pass caller wallet for secure RPC validation
  });

  // Load session on mount
  useEffect(() => {
    if (roomPlayers.length >= 2 && address) {
      loadBackgammonSession().then(savedState => {
        if (savedState && Object.keys(savedState).length > 0) {
          handleBackgammonStateRestored(savedState, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPlayers.length, address]);

  // Save game state after each move
  useEffect(() => {
    if (roomPlayers.length >= 2) {
      const currentTurnWallet = currentPlayer === 'player' ? roomPlayers[0] : roomPlayers[1];
      const persisted: PersistedBackgammonState = {
        gameState,
        dice,
        remainingMoves,
        currentPlayer,
        gameOver,
        gameStatus,
      };
      saveBackgammonSession(
        persisted,
        currentTurnWallet,
        roomPlayers[0],
        roomPlayers[1],
        gameOver ? 'finished' : 'active',
        roomMode
      );
    }
  }, [gameState, dice, remainingMoves, currentPlayer, gameOver, gameStatus, roomPlayers, saveBackgammonSession, roomMode]);

  // Finish session and archive room when game ends
  useEffect(() => {
    if (gameOver && roomPlayers.length >= 2) {
      finishBackgammonSession();
    }
  }, [gameOver, roomPlayers.length, finishBackgammonSession]);

  const rankedGate = useRankedReadyGate({
    roomPda,
    myWallet: address,
    isRanked: isRankedGame,
    enabled: roomPlayers.length >= 2 && modeLoaded,
  });

  // Durable game sync - persists moves to DB for reliability
  const handleDurableMoveReceived = useCallback((move: GameMove) => {
    // Only apply moves from opponents (we already applied our own locally)
    if (!isSameWallet(move.wallet, address)) {
      console.log("[BackgammonGame] Applying move from DB:", move.turn_number, move.move_data);
      const bgMove = move.move_data as BackgammonMoveMessage;
      
      if (bgMove.type === "dice_roll" && bgMove.dice) {
        // Opponent rolled dice - set dice and remainingMoves
        console.log("[BackgammonGame] Received dice_roll from opponent:", bgMove.dice);
        setDice(bgMove.dice);
        const moves = bgMove.dice[0] === bgMove.dice[1] 
          ? [bgMove.dice[0], bgMove.dice[0], bgMove.dice[0], bgMove.dice[0]]
          : bgMove.dice;
        setRemainingMoves(bgMove.remainingMoves || moves);
        setGameStatus("Opponent rolled dice");
      } else if (bgMove.type === "turn_end") {
        // Opponent ended their turn - switch to my turn, clear dice
        console.log("[BackgammonGame] Received turn_end from opponent");
        setCurrentPlayer(prev => prev === "player" ? "ai" : "player");
        setDice([]);
        setRemainingMoves([]);
        setGameStatus("Your turn - Roll the dice!");
      } else if (bgMove && bgMove.gameState) {
        // Normal move - apply game state
        setGameState(bgMove.gameState);
        if (bgMove.remainingMoves) setRemainingMoves(bgMove.remainingMoves);
        if (bgMove.dice) setDice(bgMove.dice);
      }
    }
  }, [address]);

  const { submitMove: persistMove, moves: dbMoves, isLoading: isSyncLoading } = useDurableGameSync({
    roomPda: roomPda || "",
    enabled: isRankedGame && roomPlayers.length >= 2,
    onMoveReceived: handleDurableMoveReceived,
  });

  // Check if we have 2 real player wallets (not placeholders including 111111...)
  const hasTwoRealPlayers = 
    roomPlayers.length >= 2 && 
    isRealWallet(roomPlayers[0]) && 
    isRealWallet(roomPlayers[1]);

  // Deterministic start roll for ALL games (casual + ranked)
  const startRoll = useStartRoll({
    roomPda,
    gameType: "backgammon",
    myWallet: address,
    isRanked: isRankedGame,
    roomPlayers,
    hasTwoRealPlayers,
    initialColor: myRole === "player" ? "w" : "b",
    bothReady: rankedGate.bothReady,
  });

  // Update myRole based on start roll result for ranked games
  useEffect(() => {
    if (isRankedGame && startRoll.isFinalized && startRoll.startingWallet) {
      const isStarter = isSameWallet(startRoll.startingWallet, address);
      setMyRole(isStarter ? "player" : "ai");
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
    return isSameWallet(roomPlayers[0], address);
  }, [address, roomPlayers]);

  // Open leave modal - NEVER triggers wallet
  const handleLeaveClick = useCallback(() => {
    console.log("[LeaveMatch] Opening leave modal (UI only)");
    setShowLeaveModal(true);
  }, []);

  // NOTE: handleUILeave, handleCancelRoom, handleForfeitMatch are defined AFTER useForfeit hook

  // Opponent wallet for forfeit - exclude placeholder wallets
  const opponentWallet = useMemo(() => {
    if (!address || roomPlayers.length < 2) return null;
    return roomPlayers.find(p => isRealWallet(p) && !isSameWallet(p, address)) || null;
  }, [address, roomPlayers]);

  // Block gameplay until start roll is finalized (for ranked games, also need rules accepted)
  const canPlay = startRoll.isFinalized && (!isRankedGame || rankedGate.bothReady);
  const isMyTurnRaw = currentPlayer === myRole;
  
  // Check if it's actually my turn (based on game state, not canPlay gate)
  const isActuallyMyTurn = isMyTurnRaw && !gameOver;
  
  // isMyTurn includes canPlay gate - used for board disable
  const isMyTurn = canPlay && isActuallyMyTurn;
  const isFlipped = myRole === "ai"; // Black player sees flipped board

  // Convert to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = isSameWallet(playerAddress, address);
      const color = index === 0 ? "gold" : "black";
      return {
        address: playerAddress,
        name: isMe ? t('common.you') : t('game.opponent'),
        color,
        status: "active" as const,
        seatIndex: index,
      };
    });
  }, [roomPlayers, address, t]);

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

  // Rematch hook
  const rematch = useRematch("Backgammon", roomPlayers);

  // Rematch players for display
  const rematchPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
    }));
  }, [turnPlayers]);

  // Winner address for GameEndScreen - prioritize winnerWallet (from resign/forfeit)
  const winnerAddress = useMemo(() => {
    // Direct wallet address from resign/forfeit takes priority
    if (winnerWallet) return winnerWallet;
    
    // Fallback to role-based calculation for normal game endings
    if (!gameOver || !gameResultInfo?.winner) return null;
    if (gameResultInfo.winner === myRole) return address;
    return getOpponentWallet(roomPlayers, address);
  }, [winnerWallet, gameOver, gameResultInfo, myRole, address, roomPlayers]);

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
      toast({ title: t('toast.allPlayersAccepted'), description: t('toast.gameStarting') });
      sendRematchReadyRef.current?.(rematchRoomId);
      window.location.href = `/game/backgammon/${rematchRoomId}`;
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

  // Refs for stable callback access
  const recordPlayerMoveRef = useRef(recordPlayerMove);
  useEffect(() => { recordPlayerMoveRef.current = recordPlayerMove; }, [recordPlayerMove]);

  // Handle WebRTC messages - stable with refs
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
        recordPlayerMoveRef.current(roomPlayersRef.current[currentPlayerRef.current === "player" ? 0 : 1] || "", `Moved checker`);
        
        // Check for winner
        const winner = checkWinner(moveMsg.gameState);
        if (winner) {
          const result = getGameResult(moveMsg.gameState);
          setGameResultInfo(result);
          const resultDisplay = formatResultType(result.resultType);
          setGameStatus(winner === myRoleRef.current ? `You win! ${resultDisplay.label}` : `You lose! ${resultDisplay.label}`);
          setGameOver(true);
          chatRef.current?.addSystemMessage(winner === myRoleRef.current ? "You win!" : "Opponent wins!");
          play(winner === myRoleRef.current ? 'chess_win' : 'chess_lose');
        }
      } else if (moveMsg.type === "turn_end") {
        setCurrentPlayer(prev => prev === "player" ? "ai" : "player");
        setDice([]);
        setRemainingMoves([]);
        // Use current state to determine message
        setGameStatus("Your turn - Roll the dice!");
      }
    } else if (message.type === "resign") {
      // Opponent resigned - I WIN - store MY wallet as winner
      const forfeitingWallet = message.payload?.forfeitingWallet;
      console.log("[BackgammonGame] Received resign from:", forfeitingWallet?.slice(0, 8));
      
      // Set winner wallet directly to MY address (I won because opponent resigned)
      setWinnerWallet(address || null);
      setGameResultInfo({ winner: myRoleRef.current, resultType: "single", multiplier: 1 });
      setGameStatus("Opponent resigned - You win!");
      setGameOver(true);
      chatRef.current?.addSystemMessage("Opponent resigned");
      play('chess_win');
      toast({ title: t('toast.victory'), description: t('toast.opponentResigned') });
    } else if (message.type === "rematch_invite" && message.payload) {
      setRematchInviteData(message.payload);
      setShowAcceptModal(true);
      toast({ title: t('toast.rematchInvite'), description: t('toast.opponentWantsRematch') });
    } else if (message.type === "rematch_accept") {
      toast({ title: t('toast.rematchAccepted'), description: t('toast.opponentAcceptedRematch') });
    } else if (message.type === "rematch_decline") {
      toast({ title: t('toast.rematchDeclined'), description: t('toast.opponentDeclinedRematch'), variant: "destructive" });
      rematch.closeRematchModal();
    } else if (message.type === "rematch_ready" && message.payload) {
      toast({ title: t('toast.rematchReady'), description: t('toast.startingNewGame') });
      navigate(`/game/backgammon/${message.payload.roomId}`);
    }
  }, [play, rematch, navigate]); // Stable deps - uses refs

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    inWalletBrowser,
    sendMove,
    sendResign,
    sendChat,
    sendRematchInvite,
    sendRematchAccept,
    sendRematchDecline,
    sendRematchReady,
    resubscribeRealtime,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length === 2,
  });
  
  // In wallet browsers, don't block on WebRTC - use effective connection state
  const effectiveConnectionState = inWalletBrowser && connectionState === "connecting" 
    ? "connected" 
    : connectionState;

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
    stakeLamports: stakeLamports ?? Math.floor(entryFeeSol * 1_000_000_000),
    gameType: "backgammon",
    mode: isRankedGame ? 'ranked' : 'casual',
    // CRITICAL: Pass validation state for ranked games
    bothRulesAccepted: rankedGate.bothReady,
    gameStarted: startRoll.isFinalized,
    onCleanupWebRTC: () => console.log("[BackgammonGame] Cleaning up WebRTC"),
    onCleanupSupabase: () => console.log("[BackgammonGame] Cleaning up Supabase"),
  });

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

  // Add system message when game starts
  useEffect(() => {
    if (roomPlayers.length === 2 && chat.messages.length === 0) {
      chat.addSystemMessage("Game started! Good luck!");
    }
  }, [roomPlayers.length]);

  // Update status based on connection - don't block on WebRTC in wallet browsers
  useEffect(() => {
    if (roomPlayers.length < 2) {
      setGameStatus("Waiting for opponent...");
    } else if (connectionState === "connecting" && !inWalletBrowser) {
      // Only show "Connecting" if NOT in wallet browser - realtime fallback handles sync
      setGameStatus("Connecting to opponent...");
    } else if ((connectionState === "connected" || inWalletBrowser) && !gameOver) {
      // In wallet browsers, proceed even if still "connecting" - polling/realtime will sync
      setGameStatus(isActuallyMyTurn ? "Your turn - Roll the dice!" : "Opponent's turn");
    }
  }, [roomPlayers.length, connectionState, isActuallyMyTurn, gameOver, inWalletBrowser]);

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
    
    // Unlock audio on first user gesture (mobile browsers require this)
    AudioManager.unlockAudio();
    
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    const newDice = [d1, d2];
    const moves = d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
    
    play('backgammon_dice');
    setDice(newDice);
    setRemainingMoves(moves);
    
    // Send to opponent via WebRTC (fast path)
    const moveMsg: BackgammonMoveMessage = {
      type: "dice_roll",
      dice: newDice,
      gameState,
      remainingMoves: moves,
    };
    sendMove(moveMsg);
    
    // CRITICAL: Persist dice_roll to DB for cross-device sync (durable path)
    if (isRankedGame && address) {
      persistMove(moveMsg, address);
    }
    
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
  }, [isMyTurn, dice, gameOver, gameState, myRole, play, sendMove, isRankedGame, address, persistMove]);

  // End turn
  const endTurn = useCallback(() => {
    // Send via WebRTC (fast path)
    const moveMsg: BackgammonMoveMessage = {
      type: "turn_end",
      gameState,
      remainingMoves: [],
    };
    sendMove(moveMsg);
    
    // CRITICAL: Persist turn_end to DB for cross-device sync (durable path)
    // Explicitly set dice: [] so opponent's client knows dice are cleared
    if (isRankedGame && address) {
      persistMove({ 
        type: "turn_end", 
        gameState, 
        remainingMoves: [], 
        dice: [] 
      } as BackgammonMoveMessage & { dice: number[] }, address);
    }
    
    setCurrentPlayer(prev => prev === "player" ? "ai" : "player");
    setDice([]);
    setRemainingMoves([]);
    setSelectedPoint(null);
    setValidMoves([]);
    setGameStatus("Opponent's turn");
  }, [gameState, sendMove, isRankedGame, address, persistMove]);

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
        
        // Persist move to DB for ranked games
        if (isRankedGame && address) {
          persistMove(moveMsg, address);
        }
        
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
          
          // Persist move to DB for ranked games
          if (isRankedGame && address) {
            persistMove(moveMsg, address);
          }
          
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

  const handleResign = useCallback(async () => {
    // 1. Send WebRTC message immediately for instant opponent UX
    sendResign();
    
    // 2. Update local UI optimistically - opponent wins, store their wallet
    const opponentWalletAddr = getOpponentWallet(roomPlayers, address);
    setWinnerWallet(opponentWalletAddr);
    const opponentRole = myRole === "player" ? "ai" : "player";
    setGameResultInfo({ winner: opponentRole, resultType: "single", multiplier: 1 });
    setGameStatus("You resigned - Opponent wins!");
    setGameOver(true);
    play('chess_lose');
    
    // 3. CRITICAL: Trigger on-chain settlement via edge function
    try {
      await forfeit();
    } catch (err) {
      console.error("[handleResign] forfeit settlement failed:", err);
      toast({
        title: "Settlement pending",
        description: "On-chain settlement may still complete",
        variant: "destructive",
      });
    }
  }, [sendResign, play, myRole, forfeit, roomPlayers, address]);

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
        {/* Triangle */}
        <svg
          width={48}
          height={140}
          viewBox="0 0 48 140"
          className={cn(
            "transition-all duration-200",
            isTop ? "" : "rotate-180",
            isValidTarget && "drop-shadow-[0_0_25px_hsl(45_93%_70%)] drop-shadow-[0_0_50px_hsl(45_93%_60%)]"
          )}
        >
          <defs>
            <linearGradient id={`goldTri-mp-${displayIndex}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(45 93% 50%)" />
              <stop offset="40%" stopColor="hsl(45 80% 45%)" />
              <stop offset="100%" stopColor="hsl(35 70% 35%)" />
            </linearGradient>
            <linearGradient id={`sandTri-mp-${displayIndex}`} x1="0%" y1="100%" x2="0%" y2="0%">
              <stop offset="0%" stopColor="hsl(35 50% 55%)" />
              <stop offset="40%" stopColor="hsl(35 45% 45%)" />
              <stop offset="100%" stopColor="hsl(30 40% 35%)" />
            </linearGradient>
          </defs>

          <polygon points="24,5 3,135 45,135" fill="rgba(0,0,0,0.2)" transform="translate(1, 1)" />
          <polygon
            points="24,5 3,135 45,135"
            fill={displayIndex % 2 === 0 ? `url(#goldTri-mp-${displayIndex})` : `url(#sandTri-mp-${displayIndex})`}
            stroke={displayIndex % 2 === 0 ? "hsl(35 80% 35%)" : "hsl(30 40% 30%)"}
            strokeWidth="1"
          />
          <polygon
            points="24,18 10,125 38,125"
            fill="none"
            stroke={displayIndex % 2 === 0 ? "hsl(45 93% 65% / 0.25)" : "hsl(35 50% 60% / 0.25)"}
            strokeWidth="1"
          />
          {isValidTarget && (
            <>
              <polygon points="24,5 3,135 45,135" fill="hsl(45 93% 75% / 0.7)" className="animate-pulse" />
              <polygon points="24,5 3,135 45,135" fill="none" stroke="hsl(45 100% 80%)" strokeWidth="4" className="animate-pulse" />
            </>
          )}
        </svg>
        
        {/* Checkers - positioned on triangle */}
        {checkerCount > 0 && (
          <div 
            className={cn(
              "absolute transition-all duration-500",
              isTop ? "top-2" : "bottom-2"
            )}
            style={{ left: '50%', transform: 'translateX(-50%)' }}
          >
            <CheckerStack
              count={checkerCount}
              variant={isPlayer ? "gold" : "obsidian"}
              isSelected={isSelected}
              isValidTarget={isValidTarget}
              onClick={() => handlePointClick(displayIndex)}
              isTop={isTop}
              size="md"
            />
          </div>
        )}
        
        <span className={`absolute ${isTop ? "-bottom-5" : "-top-5"} text-xs text-primary/40 font-medium`}>
          {displayIndex + 1}
        </span>
      </div>
    );
  };

  // Render point for mobile (vertical layout)
  const renderMobilePoint = (index: number, isLeftSide: boolean) => {
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
          "h-[calc((100%-8px)/6)]",
          isLeftSide ? "flex-row" : "flex-row-reverse"
        )}
      >
        {/* Triangle pointing toward center */}
        <svg
          viewBox="0 0 60 28"
          className={cn(
            "h-full w-[50px] shrink-0 transition-all duration-300",
            isValidTarget && "drop-shadow-[0_0_12px_hsl(45_93%_70%)]",
            isSelected && "drop-shadow-[0_0_8px_hsl(45_93%_60%/_0.5)]"
          )}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`mGold-mp-${displayIndex}`} x1={isLeftSide ? "0%" : "100%"} y1="0%" x2={isLeftSide ? "100%" : "0%"} y2="0%">
              <stop offset="0%" stopColor="hsl(45 93% 48%)" />
              <stop offset="100%" stopColor="hsl(35 70% 32%)" />
            </linearGradient>
            <linearGradient id={`mSand-mp-${displayIndex}`} x1={isLeftSide ? "0%" : "100%"} y1="0%" x2={isLeftSide ? "100%" : "0%"} y2="0%">
              <stop offset="0%" stopColor="hsl(35 50% 50%)" />
              <stop offset="100%" stopColor="hsl(30 40% 32%)" />
            </linearGradient>
          </defs>

          <polygon
            points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
            fill={displayIndex % 2 === 0 ? `url(#mGold-mp-${displayIndex})` : `url(#mSand-mp-${displayIndex})`}
            stroke={displayIndex % 2 === 0 ? "hsl(35 80% 30%)" : "hsl(30 40% 28%)"}
            strokeWidth="0.5"
          />
          {isValidTarget && (
            <>
              <polygon
                points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
                fill="hsl(45 93% 65% / 0.5)"
              />
              <polygon
                points={isLeftSide ? "0,2 0,26 58,14" : "60,2 60,26 2,14"}
                fill="none"
                stroke="hsl(45 100% 75%)"
                strokeWidth="1.5"
                className="animate-pulse"
              />
            </>
          )}
        </svg>
        
        {/* Checker stack */}
        <div 
          className={cn(
            "absolute flex items-center justify-center cursor-pointer min-w-[48px] min-h-[48px] transition-all active:scale-95",
            isLeftSide ? "left-[50px]" : "right-[50px]"
          )}
          onClick={(e) => {
            e.stopPropagation();
            handlePointClick(displayIndex);
          }}
        >
          {checkerCount > 0 && (
            <div className="flex flex-row items-center gap-0">
              {Array.from({ length: Math.min(checkerCount, 4) }).map((_, i) => (
                <div
                  key={i}
                  className="transition-all"
                  style={{
                    marginLeft: i > 0 ? '-8px' : 0,
                    zIndex: i,
                  }}
                >
                  <div
                    className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md",
                      isPlayer 
                        ? "bg-gradient-to-br from-primary via-primary to-amber-700 text-amber-900 border-2 border-amber-500" 
                        : "bg-gradient-to-br from-slate-600 via-slate-800 to-slate-900 text-primary border-2 border-primary/40",
                      isSelected && i === Math.min(checkerCount, 4) - 1 && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                      isValidTarget && i === Math.min(checkerCount, 4) - 1 && "ring-2 ring-primary"
                    )}
                    style={{
                      boxShadow: isSelected 
                        ? '0 0 12px hsl(45 93% 60% / 0.6), 0 2px 4px rgba(0,0,0,0.3)' 
                        : '0 2px 4px rgba(0,0,0,0.3)'
                    }}
                  >
                    {i === Math.min(checkerCount, 4) - 1 && checkerCount > 4 ? checkerCount : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <GameErrorBoundary>
    <InAppBrowserRecovery roomPda={roomPda || ""} onResubscribeRealtime={resubscribeRealtime} bypassOverlay={true}>
    <div className="min-h-screen bg-background flex flex-col relative overflow-x-hidden">
      {/* Gold Confetti Explosion on Win */}
      <GoldConfettiExplosion 
        active={gameOver && gameStatus.includes("win")} 
      />
      
      {/* RulesGate + DiceRollStart - RulesGate handles accept modal internally */}
      {(() => {
        // Don't require bothReady here - let RulesGate handle showing the accept modal
        const shouldShowRulesGate =
          roomPlayers.length >= 2 &&
          !!address &&
          !startRoll.isFinalized;

        if (isDebugEnabled()) {
          dbg("dice.gate", {
            game: "backgammon",
            roomPda,
            roomPlayersLen: roomPlayers.length,
            hasAddress: !!address,
            isRankedGame,
            bothReady: rankedGate.bothReady,
            isFinalized: startRoll.isFinalized,
            showDiceRoll: startRoll.showDiceRoll,
            shouldShowRulesGate,
          });
        }

        return shouldShowRulesGate ? (
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
        </RulesGate>
        ) : null;
      })()}
      
      <TurnBanner
        gameName="Backgammon"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isActuallyMyTurn && !gameOver && !startRoll.showDiceRoll}
      />

      {/* Header - Compact on mobile, full on desktop */}
      {isMobile ? (
        <header className="border-b border-primary/20 px-3 py-1.5 shrink-0">
          <div className="flex items-center justify-between">
            {/* Back button */}
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-primary p-1 -ml-1">
              <Link to="/room-list">
                <ArrowLeft size={16} />
              </Link>
            </Button>
            
            {/* Title */}
            <div className="flex items-center gap-1.5 flex-1 justify-center">
              <Gem className="w-3 h-3 text-primary" />
              <h1 className="text-sm font-display font-bold" style={{
                background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                Backgammon
              </h1>
              <Gem className="w-3 h-3 text-primary" />
            </div>
            
            {/* Sound & Rules */}
            <div className="flex items-center gap-2">
              <SoundToggle size="sm" />
              <BackgammonRulesDialog className="h-8 w-8" />
            </div>
          </div>
        </header>
      ) : (
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
                  {myRole === "player" ? <RotateCcw className="w-3 h-3" /> : <RotateCw className="w-3 h-3" />}
                  {myRole === "player" ? "Counter-CW" : "Clockwise"}
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
      )}

      {/* Turn Status - Desktop only (mobile uses bottom status bar) */}
      {!isMobile && (
        <div className="px-4 py-2">
          <div className="max-w-6xl mx-auto">
            <TurnStatusHeader
              isMyTurn={isActuallyMyTurn}
              activePlayer={turnPlayers[currentPlayer === "player" ? 0 : 1]}
              players={turnPlayers}
              myAddress={address}
            />
          </div>
        </div>
      )}

      {/* Game Area */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden min-h-0",
        isMobile ? "px-2 pt-1 pb-2" : "px-4 py-4"
      )}>
        {/* Mobile Layout - Viewport-fit container to prevent zoom */}
        {isMobile ? (
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full">
              {/* Score Row */}
              <div className="flex justify-between items-center px-2 py-1 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">Opponent:</span>
                  <span className="text-primary font-bold text-sm">{myRole === "player" ? gameState.bearOff.ai : gameState.bearOff.player}</span>
                  <span className="text-[10px] text-muted-foreground/60">/15</span>
                </div>
                {/* Direction indicators */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-primary/40 bg-primary/5">
                    <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-primary to-amber-600" />
                    <RotateCcw className="w-3 h-3 text-primary" strokeWidth={2.5} />
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full border border-slate-500/40 bg-slate-800/30">
                    <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-br from-slate-600 to-slate-900" />
                    <RotateCw className="w-3 h-3 text-slate-400" strokeWidth={2.5} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">You:</span>
                  <span className="text-primary font-bold text-sm">{myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}</span>
                  <span className="text-[10px] text-muted-foreground/60">/15</span>
                </div>
              </div>

              {/* Board Container - Aspect-ratio scaling to 100vw, max-height to fit viewport */}
              <div className="relative w-full flex-1 min-h-0" style={{ maxHeight: '60vh' }}>
                {/* Subtle glow */}
                <div className="absolute -inset-1 bg-primary/10 rounded-xl blur-lg opacity-30" />
                
                {/* Gold frame */}
                <div className="relative h-full p-[3px] rounded-lg bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40">
                  <div className="h-full flex bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-md overflow-hidden">
                    
                    {/* LEFT Column - Points 24→13 */}
                    <div className="flex-1 flex flex-col p-1">
                      <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                        {[23, 22, 21, 20, 19, 18].map(i => renderMobilePoint(i, true))}
                      </div>
                      <div className="flex-1 flex flex-col justify-evenly">
                        {[17, 16, 15, 14, 13, 12].map(i => renderMobilePoint(i, true))}
                      </div>
                    </div>

                    {/* Center Bar */}
                    <div className="w-14 bg-gradient-to-b from-background via-midnight-light to-background border-x border-primary/20 flex flex-col items-center justify-center shrink-0">
                      {/* Opponent Bar */}
                      {(myRole === "player" ? gameState.bar.ai : gameState.bar.player) > 0 && (
                        <div className="flex flex-col items-center mb-2">
                          <span className="text-[8px] text-muted-foreground mb-0.5">OPP</span>
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-slate-600 to-slate-900 border border-primary/30 flex items-center justify-center text-[10px] text-primary font-bold">
                            {myRole === "player" ? gameState.bar.ai : gameState.bar.player}
                          </div>
                        </div>
                      )}
                      
                      {/* Dice */}
                      {dice.length > 0 && (
                        <div className="flex flex-col gap-1 my-2">
                          <Dice3D value={dice[0]} variant={isMyTurn ? "ivory" : "obsidian"} size="xs" />
                          <Dice3D value={dice[1]} variant={isMyTurn ? "ivory" : "obsidian"} size="xs" />
                        </div>
                      )}
                      
                      {/* My Bar */}
                      {(myRole === "player" ? gameState.bar.player : gameState.bar.ai) > 0 && (
                        <div 
                          className={cn(
                            "flex flex-col items-center justify-center cursor-pointer rounded-lg p-2 min-w-[44px] min-h-[44px] transition-all active:scale-95",
                            selectedPoint === -1 
                              ? "ring-2 ring-primary bg-primary/20 shadow-[0_0_12px_hsl(45_93%_54%_/_0.4)]" 
                              : isMyTurn && remainingMoves.length > 0 && !gameOver
                                ? "bg-primary/10 animate-pulse"
                                : ""
                          )}
                          onClick={() => handlePointClick(-1)}
                        >
                          <div className={cn(
                            "w-7 h-7 rounded-full bg-gradient-to-br from-primary to-amber-700 border-2 border-amber-500 flex items-center justify-center text-[11px] text-amber-900 font-bold shadow-md",
                            selectedPoint === -1 && "ring-2 ring-offset-1 ring-offset-background ring-primary"
                          )}>
                            {myRole === "player" ? gameState.bar.player : gameState.bar.ai}
                          </div>
                          <span className="text-[9px] text-primary font-medium mt-1">TAP</span>
                        </div>
                      )}
                    </div>

                    {/* RIGHT Column - Points 12→1 */}
                    <div className="flex-1 flex flex-col p-1">
                      <div className="flex-1 flex flex-col justify-evenly border-b border-primary/20">
                        {[0, 1, 2, 3, 4, 5].map(i => renderMobilePoint(i, false))}
                      </div>
                      <div className="flex-1 flex flex-col justify-evenly">
                        {[6, 7, 8, 9, 10, 11].map(i => renderMobilePoint(i, false))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Controls Area - Fixed height section below board */}
              <div className="shrink-0 mt-2 space-y-2" style={{ minHeight: '80px' }}>
                {/* Roll Button */}
                <div style={{ minHeight: '52px' }}>
                  {isMyTurn && dice.length === 0 && !gameOver ? (
                    <Button 
                      variant="gold" 
                      size="lg" 
                      className="w-full py-3 text-base font-bold shadow-[0_0_24px_-6px_hsl(45_93%_54%_/_0.6)]" 
                      onClick={rollDice}
                    >
                      🎲 ROLL DICE
                    </Button>
                  ) : null}
                </div>

                {/* Status Bar */}
                <div 
                  className={cn(
                    "rounded-lg border px-3 py-1.5",
                    gameOver 
                      ? gameStatus.includes("win") 
                        ? "bg-green-500/10 border-green-500/30" 
                        : "bg-red-500/10 border-red-500/30"
                      : "bg-primary/5 border-primary/20"
                  )}
                >
                  {/* Turn Indicator */}
                  {!gameOver && (
                    <div className="flex items-center justify-center gap-2 mb-0.5">
                      {isMyTurn ? (
                        <span className="text-[10px] font-medium text-primary">YOUR TURN</span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400">OPPONENT'S TURN</span>
                      )}
                    </div>
                  )}
                  <p 
                    className={cn(
                      "font-display font-bold text-sm text-center",
                      gameOver 
                        ? gameStatus.includes("win") ? "text-green-400" : "text-red-400"
                        : "text-primary"
                    )}
                    style={!gameOver ? {
                      background: "linear-gradient(135deg, #FCE68A 0%, #FACC15 50%, #AB8215 100%)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    } : undefined}
                  >
                    {gameStatus}
                  </p>
                  {/* Game Result Display */}
                  {gameOver && gameResultInfo && (
                    <div className="mt-2 flex items-center justify-center gap-2">
                      <Trophy className={cn("w-4 h-4", formatResultType(gameResultInfo.resultType).color)} />
                      <span className={cn("text-sm font-bold", formatResultType(gameResultInfo.resultType).color)}>
                        {formatResultType(gameResultInfo.resultType).multiplier} Points
                      </span>
                    </div>
                  )}
                  {remainingMoves.length > 0 && isMyTurn && (
                    <p className="text-[10px] text-muted-foreground mt-0.5 text-center">
                      Moves left: {remainingMoves.join(", ")}
                    </p>
                  )}
                </div>

                {/* Bear Off Zone - Mobile - Always visible, disabled when not allowed */}
                <div 
                  className={cn(
                    "w-full py-2 rounded-lg flex items-center justify-center gap-2 transition-all",
                    validMoves.includes(-2) 
                      ? "bg-primary/20 border-2 border-primary animate-pulse cursor-pointer shadow-[0_0_20px_hsl(45_93%_54%_/_0.4)]" 
                      : canBearOff(gameState, myRole)
                        ? "border border-primary/30 bg-primary/5 cursor-pointer"
                        : "border border-primary/10 bg-muted/5 opacity-50"
                  )}
                  onClick={() => {
                    if (validMoves.includes(-2)) handlePointClick(-2);
                  }}
                >
                  <Trophy className={cn("w-4 h-4", validMoves.includes(-2) ? "text-primary" : "text-primary/50")} />
                  <span className={cn(
                    "font-bold",
                    validMoves.includes(-2) ? "text-primary" : canBearOff(gameState, myRole) ? "text-muted-foreground" : "text-muted-foreground/50"
                  )}>
                    {validMoves.includes(-2) 
                      ? "Tap to Bear Off" 
                      : canBearOff(gameState, myRole)
                        ? `Bear Off: ${myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}/15`
                        : "Bear Off (locked)"}
                  </span>
                  {validMoves.includes(-2) && (
                    <span className="text-xs text-primary/70">({myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}/15)</span>
                  )}
                  {!canBearOff(gameState, myRole) && (
                    <span className="text-[10px] text-muted-foreground/50">Move all to home first</span>
                  )}
                </div>

                {/* Resign button - mobile */}
                {!gameOver && isMyTurn && (
                  <Button variant="destructive" size="sm" className="w-full" onClick={handleResign} disabled={isForfeiting}>
                    {isForfeiting ? "Settling..." : <><Flag className="w-4 h-4 mr-1" /> Resign</>}
                  </Button>
                )}
              </div>
            </div>
        ) : (
          /* Desktop Layout - Premium version matching AI */
          <div className="max-w-4xl mx-auto w-full">
            <div className="relative">
              {/* Outer glow */}
              <div className="absolute -inset-2 bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 rounded-2xl blur-xl opacity-50" />
              
              {/* Gold frame */}
              <div className="relative p-1 rounded-xl bg-gradient-to-br from-primary/40 via-primary/20 to-primary/40 shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.4)]">
                <div className="bg-gradient-to-b from-midnight-light via-background to-midnight-light rounded-lg p-2 md:p-4 overflow-hidden">
                      
                  {/* Opponent Bear Off / Bar + Direction Indicators */}
                  <div className="flex justify-between items-center mb-3 px-2">
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      Opp. Bear Off: <span className="text-primary font-bold">{myRole === "player" ? gameState.bearOff.ai : gameState.bearOff.player}</span>
                    </div>
                    {/* Direction indicators */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-primary/40 bg-primary/5">
                        <div className="w-3 h-3 rounded-full bg-gradient-to-br from-primary to-amber-600 border border-amber-500/50" />
                        <RotateCcw className="w-3.5 h-3.5 text-primary" strokeWidth={2.5} />
                        <span className="text-[10px] font-medium text-primary">CCW</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-slate-500/40 bg-slate-800/30">
                        <div className="w-3 h-3 rounded-full bg-gradient-to-br from-slate-600 to-slate-900 border border-slate-500/50" />
                        <RotateCw className="w-3.5 h-3.5 text-slate-400" strokeWidth={2.5} />
                        <span className="text-[10px] font-medium text-slate-400">CW</span>
                      </div>
                    </div>
                    {(myRole === "player" ? gameState.bar.ai : gameState.bar.player) > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Opp. Bar:</span>
                        <CheckerStack count={myRole === "player" ? gameState.bar.ai : gameState.bar.player} variant="obsidian" isTop={true} />
                      </div>
                    )}
                  </div>

                  {/* Top points (13-24 or flipped) */}
                  <div className="flex justify-center gap-0.5 mb-1">
                    <div className="flex gap-0.5">
                      {[12, 13, 14, 15, 16, 17].map(i => renderPoint(isFlipped ? 23 - i : i, true))}
                    </div>
                    <div className="w-6 md:w-8 bg-gradient-to-b from-primary/20 to-primary/10 rounded border border-primary/20" />
                    <div className="flex gap-0.5">
                      {[18, 19, 20, 21, 22, 23].map(i => renderPoint(isFlipped ? 23 - i : i, true))}
                    </div>
                  </div>

                  {/* Middle bar with dice */}
                  <div className="h-16 bg-gradient-to-r from-midnight-light via-background to-midnight-light my-2 rounded-lg border border-primary/20 flex items-center justify-center gap-1">
                    {dice.length > 0 && (
                      <div className="flex gap-4 items-center">
                        <Dice3D value={dice[0]} variant={isMyTurn ? "ivory" : "obsidian"} />
                        <Dice3D value={dice[1]} variant={isMyTurn ? "ivory" : "obsidian"} />
                      </div>
                    )}
                  </div>

                  {/* Bottom points (1-12 or flipped) */}
                  <div className="flex justify-center gap-0.5 mt-1">
                    <div className="flex gap-0.5">
                      {[11, 10, 9, 8, 7, 6].map(i => renderPoint(isFlipped ? 23 - i : i, false))}
                    </div>
                    <div className="w-6 md:w-8 bg-gradient-to-t from-primary/20 to-primary/10 rounded border border-primary/20" />
                    <div className="flex gap-0.5">
                      {[5, 4, 3, 2, 1, 0].map(i => renderPoint(isFlipped ? 23 - i : i, false))}
                    </div>
                  </div>

                  {/* Player Bar / Bear Off Zone */}
                  <div className="flex justify-between items-center mt-3 px-2">
                    {(myRole === "player" ? gameState.bar.player : gameState.bar.ai) > 0 ? (
                      <div 
                        className={cn(
                          "flex items-center gap-2 cursor-pointer transition-all rounded-lg p-1",
                          selectedPoint === -1 && "ring-2 ring-primary bg-primary/10"
                        )}
                        onClick={() => handlePointClick(-1)}
                      >
                        <span className="text-xs text-muted-foreground">Your Bar:</span>
                        <CheckerStack 
                          count={myRole === "player" ? gameState.bar.player : gameState.bar.ai} 
                          variant="gold" 
                          isSelected={selectedPoint === -1}
                          onClick={() => handlePointClick(-1)}
                          isTop={false} 
                        />
                      </div>
                    ) : <div />}
                    
                    {/* Bear Off Zone - Always visible, clickable when valid */}
                    <div 
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-3 py-2 transition-all",
                        validMoves.includes(-2) 
                          ? "cursor-pointer bg-primary/20 border-2 border-primary animate-pulse hover:bg-primary/30 shadow-[0_0_20px_hsl(45_93%_54%_/_0.4)]" 
                          : canBearOff(gameState, myRole) 
                            ? "border border-primary/30 bg-primary/5 cursor-pointer" 
                            : "border border-primary/10 opacity-50"
                      )}
                      onClick={() => validMoves.includes(-2) && handlePointClick(-2)}
                    >
                      <Trophy className={cn("w-4 h-4", validMoves.includes(-2) ? "text-primary" : "text-primary/40")} />
                      <span className={cn(
                        "text-xs font-medium",
                        validMoves.includes(-2) ? "text-primary" : canBearOff(gameState, myRole) ? "text-muted-foreground" : "text-muted-foreground/50"
                      )}>
                        {canBearOff(gameState, myRole) ? "Bear Off:" : "Bear Off (locked)"}
                      </span>
                      <span className={cn(
                        "font-bold",
                        validMoves.includes(-2) ? "text-primary text-lg" : canBearOff(gameState, myRole) ? "text-primary" : "text-muted-foreground/50"
                      )}>
                        {myRole === "player" ? gameState.bearOff.player : gameState.bearOff.ai}
                      </span>
                      <span className="text-xs text-muted-foreground">/15</span>
                      {validMoves.includes(-2) && (
                        <Trophy className="w-4 h-4 text-primary ml-1" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls - Desktop only */}
        {!isMobile && (
          <div className="mt-4 flex flex-wrap gap-3 items-center justify-center max-w-4xl mx-auto">
            {isMyTurn && dice.length === 0 && !gameOver && (
              <Button variant="gold" size="lg" className="min-w-[140px] shadow-[0_0_30px_-8px_hsl(45_93%_54%_/_0.5)]" onClick={rollDice}>
                🎲 Roll Dice
              </Button>
            )}
            
            {/* Dice display when rolled */}
            {dice.length > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                Moves left: {remainingMoves.length > 0 ? remainingMoves.join(", ") : "None"}
              </div>
            )}
            
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

            {/* Resign button - always available once game started */}
            {!gameOver && roomPlayers.length >= 2 && (
              <Button variant="destructive" size="sm" onClick={handleResign} disabled={isForfeiting}>
                {isForfeiting ? "Settling..." : <><Flag className="w-4 h-4 mr-1" /> Resign</>}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Game End Screen */}
      {gameOver && (
        <GameEndScreen
          gameType="Backgammon"
          winner={winnerAddress}
          winnerName={gameEndPlayers.find(p => p.address === winnerAddress)?.name}
          myAddress={address}
          players={gameEndPlayers}
          onRematch={() => rematch.openRematchModal()}
          onExit={() => navigate("/room-list")}
          result={gameResultInfo ? `${formatResultType(gameResultInfo.resultType).label} (${formatResultType(gameResultInfo.resultType).multiplier})` : undefined}
          roomPda={roomPda}
          isStaked={false}
        />
      )}
      
      {/* Chat Panel */}
      <GameChatPanel chat={chat} />

      {/* Rematch Modal */}
      <RematchModal
        isOpen={rematch.isModalOpen}
        onClose={rematch.closeRematchModal}
        gameType="Backgammon"
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

      {/* Forfeit Confirmation Dialog */}
      <ForfeitConfirmDialog
        open={showForfeitDialog}
        onOpenChange={setShowForfeitDialog}
        onConfirm={forfeit}
        isLoading={isForfeiting}
        gameType="2player"
        stakeSol={entryFeeSol}
      />

      {/* Leave Match Modal - Safe UI with explicit on-chain action separation */}
      <LeaveMatchModal
        open={showLeaveModal}
        onOpenChange={setShowLeaveModal}
        matchState={matchState}
        roomPda={roomPda || ""}
        isCreator={isCreator}
        stakeSol={entryFeeSol}
        playerCount={roomPlayers.length}
        onUILeave={handleUILeave}
        onCancelRoom={handleCancelRoom}
        onForfeitMatch={handleForfeitMatch}
        isCancelling={isCancellingRoom}
        isForfeiting={isForfeiting}
      />

      {/* Rules Info Panel (Ranked only) */}
      <RulesInfoPanel 
        stakeSol={rankedGate.stakeLamports / 1_000_000_000} 
        isRanked={isRankedGame}
        turnTimeSeconds={rankedGate.turnTimeSeconds || 60}
      />

      {/* Accept Rules Modal and Waiting Panel - REMOVED: Now handled by Rules Gate above */}
    </div>
    </InAppBrowserRecovery>
    </GameErrorBoundary>
  );
};

export default BackgammonGame;