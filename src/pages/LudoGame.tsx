import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { isSameWallet, isRealWallet } from "@/lib/walletUtils";
import { GameErrorBoundary } from "@/components/GameErrorBoundary";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Music, Music2, Volume2, VolumeX, Users, Wifi, WifiOff, RefreshCw, LogOut } from "lucide-react";
import { ForfeitConfirmDialog } from "@/components/ForfeitConfirmDialog";
import { LeaveMatchModal, MatchState } from "@/components/LeaveMatchModal";
import { useForfeit } from "@/hooks/useForfeit";
import { useSolanaRooms } from "@/hooks/useSolanaRooms";
import { toast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useWallet } from "@/hooks/useWallet";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useGameSessionPersistence } from "@/hooks/useGameSessionPersistence";
import { useRoomMode } from "@/hooks/useRoomMode";
import { useRankedReadyGate } from "@/hooks/useRankedReadyGate";
import { useTurnTimer, DEFAULT_RANKED_TURN_TIME } from "@/hooks/useTurnTimer";
import { useStartRoll } from "@/hooks/useStartRoll";
import { useTxLock } from "@/contexts/TxLockContext";
import { useDurableGameSync, GameMove } from "@/hooks/useDurableGameSync";
import { DiceRollStart } from "@/components/DiceRollStart";
import LudoBoard from "@/components/ludo/LudoBoard";
import EgyptianDice from "@/components/ludo/EgyptianDice";
import TurnIndicator from "@/components/ludo/TurnIndicator";
import { Player, PlayerColor, initializePlayers } from "@/components/ludo/ludoTypes";
import { useLudoEngine, LudoMove } from "@/hooks/useLudoEngine";
import { useTurnNotifications, TurnPlayer } from "@/hooks/useTurnNotifications";
import { useGameChat, ChatPlayer, ChatMessage } from "@/hooks/useGameChat";
import { useRematch } from "@/hooks/useRematch";
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

// Persisted ludo game state
interface PersistedLudoState {
  players: Player[];
  currentPlayerIndex: number;
  diceValue: number | null;
  gameOver: PlayerColor | null;
}

// Player color to wallet mapping (would come from room data in production)
const PLAYER_COLORS: PlayerColor[] = ["gold", "ruby", "emerald", "sapphire"];

const LudoGame = () => {
  const { roomPda } = useParams<{ roomPda: string }>();
  const roomId = roomPda; // Alias for backward compatibility with hooks/display
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [musicEnabled, setMusicEnabled] = useState(true); // Auto-start music
  const [sfxEnabled, setSfxEnabled] = useState(true);
  const musicRef = useRef<HTMLAudioElement | null>(null);
  
  // Room players (in production, this comes from on-chain room data)
  // For testing, we simulate 4 players with the current wallet as gold
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [entryFeeSol, setEntryFeeSol] = useState(0);
  const [stakeLamports, setStakeLamports] = useState<number | undefined>(undefined);
  
  // Leave/Forfeit dialog states
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [isForfeitLoading, setIsForfeitLoading] = useState(false);
  const [isCancellingRoom, setIsCancellingRoom] = useState(false);
  
  // TxLock for preventing Phantom "Request blocked"
  const { isTxInFlight, withTxLock } = useTxLock();
  
  // Solana rooms hook for forfeit/cancel
  const { cancelRoomByPda, forfeitGame } = useSolanaRooms();
  
  // For DiceRollStart leave (no payout, just cleanup)
  const handleLeaveFromDice = useCallback(() => {
    // Clear any local state and navigate
    navigate("/room-list");
    toast({ title: t("forfeit.leftRoom"), description: t("forfeit.returnedToLobby") });
  }, [navigate, t]);
  
  // Refs for stable callback access
  const roomPlayersRef = useRef<string[]>([]);
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);
  
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
    captureEvent,
    eliminatedPlayers,
    rollDice,
    executeMove,
    applyExternalMove,
    advanceTurn,
    resetGame,
    eliminatePlayer,
    setDiceValue,
    setMovableTokens,
    setCurrentPlayerIndex,
    clearCaptureEvent,
  } = useLudoEngine({
    onSoundPlay: playSfx,
    onToast: showToast,
  });

  // Game session persistence - track if we've shown the restored toast
  const restoredToastShownRef = useRef(false);

  const handleLudoStateRestored = useCallback((state: Record<string, any>, showToast = true) => {
    const persisted = state as PersistedLudoState;
    console.log('[LudoGame] Restoring state from database:', persisted);
    
    // Note: Full Ludo state restoration would need to integrate with useLudoEngine
    // For now we log that restoration was attempted
    if (persisted.players && persisted.currentPlayerIndex !== undefined) {
      setCurrentPlayerIndex(persisted.currentPlayerIndex);
      if (persisted.diceValue) {
        setDiceValue(persisted.diceValue);
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
  }, [setCurrentPlayerIndex, setDiceValue, t]);

  // For realtime updates, don't show toast (silent sync)
  const handleRealtimeStateRestored = useCallback((state: Record<string, any>) => {
    handleLudoStateRestored(state, false);
  }, [handleLudoStateRestored]);

  // Room mode hook - fetches from DB for Player 2 who doesn't have localStorage data
  // Must be called before any effects that use roomMode
  const { mode: roomMode, isRanked: isRankedGame, isLoaded: modeLoaded } = useRoomMode(roomPda);

  const { loadSession: loadLudoSession, saveSession: saveLudoSession, finishSession: finishLudoSession } = useGameSessionPersistence({
    roomPda: roomPda,
    gameType: 'ludo',
    enabled: roomPlayers.length >= 2 && !!address,
    onStateRestored: handleRealtimeStateRestored,
    callerWallet: address, // Pass caller wallet for secure RPC validation
  });

  // Load session on mount
  useEffect(() => {
    if (roomPlayers.length >= 2 && address) {
      loadLudoSession().then(savedState => {
        if (savedState && Object.keys(savedState).length > 0) {
          handleLudoStateRestored(savedState, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPlayers.length, address]);

  // Save game state after each move
  useEffect(() => {
    if (roomPlayers.length >= 2) {
      const currentTurnWallet = roomPlayers[currentPlayerIndex] || roomPlayers[0];
      const persisted: PersistedLudoState = {
        players,
        currentPlayerIndex,
        diceValue,
        gameOver,
      };
      saveLudoSession(
        persisted,
        currentTurnWallet,
        roomPlayers[0],
        roomPlayers[1] || null,
        gameOver ? 'finished' : 'active',
        roomMode
      );
    }
  }, [players, currentPlayerIndex, diceValue, gameOver, roomPlayers, saveLudoSession, roomMode]);

  // Finish session and archive room when game ends
  useEffect(() => {
    if (gameOver && roomPlayers.length >= 2) {
      finishLudoSession();
    }
  }, [gameOver, roomPlayers.length, finishLudoSession]);

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
      console.log("[LudoGame] Applying move from DB:", move.turn_number);
      const ludoMove = move.move_data as LudoMove;
      if (ludoMove) {
        applyExternalMove(ludoMove);
      }
    }
  }, [address, applyExternalMove]);

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
    gameType: "ludo",
    myWallet: address,
    isRanked: isRankedGame,
    roomPlayers,
    hasTwoRealPlayers,
    initialColor: "w", // Ludo doesn't use w/b, but we need a value
    bothReady: rankedGate.bothReady,
  });

  // Find which player index the current wallet is
  const myPlayerIndex = useMemo(() => {
    if (!address || roomPlayers.length === 0) return -1;
    return roomPlayers.findIndex(p => isSameWallet(p, address));
  }, [address, roomPlayers]);

  // Update starting player based on start roll result for ranked games
  useEffect(() => {
    if (isRankedGame && startRoll.isFinalized && startRoll.startingWallet) {
      const starterIndex = roomPlayers.findIndex(p => isSameWallet(p, startRoll.startingWallet));
      if (starterIndex >= 0 && starterIndex !== currentPlayerIndex) {
        setCurrentPlayerIndex(starterIndex);
      }
    }
  }, [isRankedGame, startRoll.isFinalized, startRoll.startingWallet, roomPlayers, currentPlayerIndex, setCurrentPlayerIndex]);

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

  // Determine match state for LeaveMatchModal
  const humanPlayers = useMemo(() => roomPlayers.filter(p => !p.startsWith('ai-')), [roomPlayers]);
  
  const matchState: MatchState = useMemo(() => {
    if (gameOver) return "game_over";
    if (humanPlayers.length < 2) return "waiting_for_opponent";
    if (!rankedGate.iAmReady || !rankedGate.opponentReady) return "rules_pending";
    if (rankedGate.bothReady && startRoll.isFinalized) return "match_active";
    return "opponent_joined";
  }, [gameOver, humanPlayers.length, rankedGate.iAmReady, rankedGate.opponentReady, rankedGate.bothReady, startRoll.isFinalized]);

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

  // Ref for sendPlayerEliminated to use in forfeit handler
  const sendPlayerEliminatedRef = useRef<((playerIndex: number) => boolean) | null>(null);

  const handleConfirmForfeit = useCallback(async () => {
    if (!roomPda || myPlayerIndex < 0) return;
    
    setIsForfeitLoading(true);
    
    // First eliminate the player locally (remove tokens, skip turns)
    eliminatePlayer(myPlayerIndex);
    
    // Broadcast elimination to other players via WebRTC
    sendPlayerEliminatedRef.current?.(myPlayerIndex);
    
    // Then notify the backend
    const result = await forfeitGame(roomPda);
    setIsForfeitLoading(false);
    
    if (result.ok) {
      toast({ title: t('forfeit.eliminated'), description: t('forfeit.gameContinues') });
      setShowForfeitDialog(false);
      navigate("/room-list");
    } else {
      toast({ title: t('common.error'), description: result.reason, variant: "destructive" });
    }
  }, [roomPda, myPlayerIndex, eliminatePlayer, forfeitGame, navigate, t]);

  // Block gameplay until start roll is finalized (for ranked games, also need rules accepted)
  const canPlay = startRoll.isFinalized && (!isRankedGame || rankedGate.bothReady);

  // Check if it's actually my turn (based on game state, not canPlay gate)
  const isActuallyMyTurn = myPlayerIndex >= 0 && myPlayerIndex === currentPlayerIndex && !gameOver;

  // isMyTurnLocal includes canPlay gate - used for board disable
  const isMyTurnLocal = canPlay && isActuallyMyTurn;

  // Ref for forfeit function - will be set to handleConfirmForfeit
  const forfeitFnRef = useRef<(() => void) | null>(null);
  
  // Connect forfeit ref to handleConfirmForfeit
  useEffect(() => {
    forfeitFnRef.current = handleConfirmForfeit;
  }, [handleConfirmForfeit]);

  // ========== Leave/Forfeit handlers ==========
  
  // UI-only leave handler - NO wallet calls
  const handleUILeave = useCallback(() => {
    console.log("[LeaveMatch] UI exit only");
    navigate("/room-list");
    toast({ title: t("forfeit.leftRoom"), description: t("forfeit.returnedToLobby") });
  }, [navigate, t]);

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

  // On-chain: Forfeit match (calls handleConfirmForfeit for Ludo)
  const handleForfeitMatch = useCallback(async () => {
    console.log("[ForfeitMatch] On-chain action requested");
    await handleConfirmForfeit();
  }, [handleConfirmForfeit]);

  // Turn timer for ranked games - auto-forfeit on timeout
  const handleTimeExpired = useCallback(() => {
    if (!gameOver) {
      toast({
        title: t('gameSession.timeExpired'),
        description: t('gameSession.forfeitedMatch'),
        variant: "destructive",
      });
      // Trigger forfeit via the forfeit handler
      forfeitFnRef.current?.();
      play('ludo_dice');
    }
  }, [gameOver, play, t]);

  // Use turn time from ranked gate (fetched from DB/localStorage)
  const effectiveTurnTime = rankedGate.turnTimeSeconds || DEFAULT_RANKED_TURN_TIME;
  
  const turnTimer = useTurnTimer({
    turnTimeSeconds: effectiveTurnTime,
    enabled: isRankedGame && canPlay && !gameOver,
    isMyTurn: isMyTurnLocal,
    onTimeExpired: handleTimeExpired,
    roomId: roomPda,
  });

  // Convert Ludo players to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return players.map((player, index) => {
      const walletAddress = roomPlayers[index] || `player-${index}`;
      const isHuman = walletAddress.toLowerCase() === address?.toLowerCase();
      
      return {
        address: walletAddress,
        name: isHuman ? t('common.you') : `${player.color.charAt(0).toUpperCase() + player.color.slice(1)} ${t('game.player')}`,
        color: player.color,
        status: player.tokens.every(t => t.position === 62) ? "finished" : "active" as const,
        seatIndex: index,
      };
    });
  }, [players, roomPlayers, address, t]);

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
  const rematch = useRematch("Ludo", roomPlayers);

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
    const winnerIndex = players.findIndex(p => p.color === gameOver);
    return winnerIndex >= 0 ? (roomPlayers[winnerIndex] || null) : null;
  }, [gameOver, players, roomPlayers]);

  // Players for GameEndScreen
  const gameEndPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
      color: tp.color === 'gold' ? '#FFD700' : tp.color === 'ruby' ? '#E74C3C' : tp.color === 'emerald' ? '#2ECC71' : '#3498DB',
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
      window.location.href = `/game/ludo/${rematchRoomId}`;
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

  // WebRTC sync for multiplayer - stable with refs
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    // Handle chat messages
    if (message.type === "chat" && message.payload) {
      try {
        const chatMsg = typeof message.payload === "string" 
          ? JSON.parse(message.payload) 
          : message.payload;
        chatRef.current?.receiveMessage(chatMsg);
      } catch (e) {
        console.error("[LudoGame] Failed to parse chat message:", e);
      }
      return;
    }
    
    if (message.type === "move" && message.payload) {
      const move = message.payload as LudoMove;
      applyExternalMove(move);
      recordPlayerMoveRef.current(roomPlayersRef.current[move.playerIndex] || "", `Moved to position ${move.endPosition}`);
    } else if (message.type === "player_eliminated" && message.payload) {
      // Handle remote player elimination
      const { playerIndex } = message.payload;
      console.log(`[LudoGame] Player ${playerIndex} eliminated via WebRTC`);
      eliminatePlayer(playerIndex);
      toast({ 
        title: t('forfeit.playerEliminated'), 
        description: t('forfeit.playerLeft', { player: turnPlayers[playerIndex]?.name || `Player ${playerIndex + 1}` }),
        variant: "destructive" 
      });
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
      navigate(`/game/ludo/${message.payload.roomId}`);
    }
  }, [applyExternalMove, eliminatePlayer, turnPlayers, rematch, navigate, t]); // Stable deps - uses refs

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    inWalletBrowser,
    sendMove,
    sendChat,
    sendRematchInvite,
    sendRematchAccept,
    sendRematchDecline,
    sendRematchReady,
    sendPlayerEliminated,
    resubscribeRealtime,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: roomPlayers,
    onMessage: handleWebRTCMessage,
    enabled: roomPlayers.length >= 2,
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
    sendPlayerEliminatedRef.current = sendPlayerEliminated;
  }, [sendRematchInvite, sendRematchAccept, sendRematchDecline, sendRematchReady, sendPlayerEliminated]);

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
    enabled: roomPlayers.length >= 2,
  });
  chatRef.current = chat;

  // Add system message when game starts
  useEffect(() => {
    if (roomPlayers.length >= 2 && chat.messages.length === 0) {
      chat.addSystemMessage("Game started! Good luck!");
    }
  }, [roomPlayers.length]);

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
  const noMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Cleanup no-move timeout on unmount
  useEffect(() => {
    return () => {
      if (noMoveTimeoutRef.current) clearTimeout(noMoveTimeoutRef.current);
    };
  }, []);
  
  const handleRollComplete = useCallback((dice: number, movable: number[]) => {
    const player = players[currentPlayerIndex];
    console.log(`[LUDO MULTI] ${player.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
    
    if (movable.length === 0) {
      toast({
        title: t('toast.noValidMoves'),
        description: t('toast.cannotMoveToken'),
        duration: 1500,
      });
      noMoveTimeoutRef.current = setTimeout(() => {
        setDiceValue(null);
        advanceTurn(dice);
      }, 1000);
    }
  }, [players, currentPlayerIndex, advanceTurn, setDiceValue, t]);

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
        title: t('toast.illegalMove'),
        description: t('toast.tokenCannotMove'),
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
      
      // Persist move to DB for ranked games (durable sync)
      if (isRankedGame && address) {
        const moveData: LudoMove = {
          playerIndex: currentPlayerIndex,
          tokenIndex,
          diceValue: currentDice,
          startPosition: startPos,
          endPosition: endPos,
        };
        persistMove(moveData, address);
      }
      
      setDiceValue(null);
      moveStartedRef.current = false;
      setTimeout(() => advanceTurn(currentDice), 200);
    });
    
    if (!success) {
      moveStartedRef.current = false;
    }
  }, [isAnimating, currentPlayerIndex, myPlayerIndex, diceValue, isRolling, movableTokens, players, executeMove, advanceTurn, setDiceValue, setMovableTokens, recordPlayerMove, address, isRankedGame, persistMove]);

  // AI turn handling (for simulated opponents)
  const aiTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiMoveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const aiAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastProcessedAiTurnRef = useRef<string | null>(null);
  
  // Cleanup AI timeouts on unmount
  useEffect(() => {
    return () => {
      if (aiTimeoutRef.current) clearTimeout(aiTimeoutRef.current);
      if (aiMoveTimeoutRef.current) clearTimeout(aiMoveTimeoutRef.current);
      if (aiAdvanceTimeoutRef.current) clearTimeout(aiAdvanceTimeoutRef.current);
    };
  }, []);
  
  useEffect(() => {
    // Only trigger AI if it's not human's turn
    if (currentPlayerIndex === myPlayerIndex || gameOver || myPlayerIndex < 0) {
      return;
    }
    
    // Wait for clean state (no dice, not rolling, not animating)
    if (diceValue !== null || isRolling || isAnimating) {
      return;
    }
    
    // Create a unique key for this turn state - include turnSignal to differentiate bonus turns
    const turnKey = `${currentPlayerIndex}-${turnSignal}`;
    if (lastProcessedAiTurnRef.current === turnKey) {
      return;
    }
    
    const delay = 800;
    aiTimeoutRef.current = setTimeout(() => {
      // Mark this turn as being processed
      lastProcessedAiTurnRef.current = turnKey;
      
      rollDice((dice, movable) => {
        console.log(`[LUDO MULTI] AI ${currentPlayer.color} rolled ${dice}, movable: [${movable.join(', ')}]`);
        
        if (movable.length === 0) {
          aiAdvanceTimeoutRef.current = setTimeout(() => {
            setDiceValue(null);
            advanceTurn(dice);
          }, 1000);
        } else {
          const capturedDice = dice;
          setMovableTokens([]);
          
          aiMoveTimeoutRef.current = setTimeout(() => {
            // Simple AI: random token selection
            const chosenToken = movable[Math.floor(Math.random() * movable.length)];
            
            executeMove(currentPlayerIndex, chosenToken, capturedDice, () => {
              const token = players[currentPlayerIndex].tokens[chosenToken];
              const endPos = token.position === -1 ? 0 : token.position + capturedDice;
              recordPlayerMove(roomPlayers[currentPlayerIndex] || "", `Moved to position ${endPos}`);
              
              setDiceValue(null);
              aiAdvanceTimeoutRef.current = setTimeout(() => {
                advanceTurn(capturedDice);
              }, 200);
            });
          }, 600);
        }
      });
    }, delay);
    
    return () => {
      if (aiTimeoutRef.current) {
        clearTimeout(aiTimeoutRef.current);
        aiTimeoutRef.current = null;
      }
    };
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
    <InAppBrowserRecovery roomPda={roomPda || ""} onResubscribeRealtime={resubscribeRealtime}>
    <div className="min-h-screen bg-background flex flex-col">
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
        opponentWallet={roomPlayers.find(p => p.toLowerCase() !== address?.toLowerCase())}
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
            onLeave={handleLeaveFromDice}
            isLeaving={false}
            isForfeiting={false}
          />
        )}
      </RulesGate>
      
      {/* Turn Banner (fallback for no permission) */}
      <TurnBanner
        gameName="Ludo"
        roomId={roomId || "unknown"}
        isVisible={!hasPermission && isActuallyMyTurn && !gameOver && !startRoll.showDiceRoll}
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
            isMyTurn={isActuallyMyTurn}
            activePlayer={turnPlayers[currentPlayerIndex]}
            players={turnPlayers}
            myAddress={address}
            remainingTime={isRankedGame ? turnTimer.remainingTime : undefined}
            showTimer={isRankedGame && canPlay}
          />
        </div>
      </div>

      {/* Game Area */}
      <div className="flex-1 flex items-center justify-center p-2 md:p-4 relative">
        <div className="w-full max-w-4xl flex flex-col items-center justify-center gap-4">
          {/* Game Board */}
          <LudoBoard
            players={players}
            currentPlayerIndex={currentPlayerIndex}
            movableTokens={isAnimating ? [] : (currentPlayerIndex !== myPlayerIndex ? [] : movableTokens)}
            onTokenClick={handleTokenClick}
            captureEvent={captureEvent}
            onCaptureAnimationComplete={clearCaptureEvent}
            eliminatedPlayers={eliminatedPlayers}
          />
        </div>

        {/* Dice Controls - Bottom Left */}
        <div className="absolute bottom-4 left-4 flex flex-col items-center gap-2 bg-card/90 backdrop-blur-sm rounded-lg p-3 border border-primary/30 shadow-lg">
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
            <p className="text-xs text-muted-foreground text-center max-w-[100px]">
              Tap a glowing token
            </p>
          )}
          
          {/* Audio Controls */}
          <div className="flex gap-2 mt-1">
            <Button
              variant="outline"
              size="icon"
              onClick={toggleMusic}
              className="w-7 h-7 border-primary/30"
              title={musicEnabled ? "Disable Music" : "Enable Music"}
            >
              {musicEnabled ? <Music size={12} /> : <Music2 size={12} />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={toggleSfx}
              className="w-7 h-7 border-primary/30"
              title={sfxEnabled ? "Disable SFX" : "Enable SFX"}
            >
              {sfxEnabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            </Button>
          </div>
        </div>
      </div>

      {/* Game End Screen */}
      {gameOver && (
        <GameEndScreen
          gameType="Ludo"
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
              <span>{player.tokens.filter(t => t.position === 62).length}/4</span>
            </div>
          ))}
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

      {/* Rematch Modal */}
      <RematchModal
        isOpen={rematch.isModalOpen}
        onClose={rematch.closeRematchModal}
        gameType="Ludo"
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

      {/* Forfeit Confirmation Dialog - Ludo specific (player eliminated, game continues) */}
      <ForfeitConfirmDialog
        open={showForfeitDialog}
        onOpenChange={setShowForfeitDialog}
        onConfirm={handleConfirmForfeit}
        isLoading={isForfeitLoading}
        gameType="ludo"
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
        playerCount={roomPlayers.filter(p => !p.startsWith('ai-')).length}
        onUILeave={handleUILeave}
        onCancelRoom={handleCancelRoom}
        onForfeitMatch={handleForfeitMatch}
        isCancelling={isCancellingRoom}
        isForfeiting={isForfeitLoading}
      />
    </div>
    </InAppBrowserRecovery>
    </GameErrorBoundary>
  );
};

export default LudoGame;