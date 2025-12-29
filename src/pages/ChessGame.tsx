import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Chess, Square, PieceSymbol, Color } from "chess.js";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useCaptureAnimations } from "@/components/CaptureAnimationLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star, Flag, Users, Wifi, WifiOff } from "lucide-react";
import { ForfeitConfirmDialog } from "@/components/ForfeitConfirmDialog";
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
import { PublicKey, Connection } from "@solana/web3.js";
import { parseRoomAccount } from "@/lib/solana-program";
import { getSolanaEndpoint } from "@/lib/solana-config";

// Persisted chess game state
interface PersistedChessState {
  fen: string;
  moveHistory: string[];
  gameOver: boolean;
  gameStatus: string;
}

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
  const { roomPda } = useParams<{ roomPda: string }>();
  const roomId = roomPda; // Alias for backward compatibility with hooks/display
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { play } = useSound();
  const { isConnected: walletConnected, address } = useWallet();

  const [game, setGame] = useState(new Chess());
  const [gameStatus, setGameStatus] = useState<string>(t("gameMultiplayer.waitingForOpponent"));
  const [moveHistory, setMoveHistory] = useState<string[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [animationsEnabled, setAnimationsEnabled] = useState(true);
  const [drawOffered, setDrawOffered] = useState(false);
  const [drawOfferFrom, setDrawOfferFrom] = useState<string | null>(null);

  // Room players - in production, this comes from on-chain room data
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<"w" | "b">("w");
  
  // Forfeit dialog state
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [isForfeitLoading, setIsForfeitLoading] = useState(false);
  const [entryFeeSol, setEntryFeeSol] = useState(0);
  
  // Solana rooms hook for forfeit/cancel
  const { cancelRoomByPda, forfeitGame } = useSolanaRooms();

  // Refs for stable callback access
  const gameRef = useRef(game);
  const roomPlayersRef = useRef<string[]>([]);
  const animationsEnabledRef = useRef(animationsEnabled);
  
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);
  useEffect(() => { animationsEnabledRef.current = animationsEnabled; }, [animationsEnabled]);

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
            
            // Determine my color based on on-chain position (white = index 0, black = index 1)
            const myIndex = realPlayers.findIndex(p => p.toLowerCase() === address.toLowerCase());
            const color = myIndex === 0 ? "w" : "b";
            setMyColor(color);
            console.log("[ChessGame] On-chain players:", realPlayers, "My color:", color === "w" ? "white" : "black");
            return;
          }
        }
        
        // Fallback if on-chain data not available yet (room still forming)
        console.log("[ChessGame] Room not ready, using placeholder");
        setRoomPlayers([address, `waiting-${roomPda.slice(0, 8)}`]);
        setMyColor("w");
      } catch (err) {
        console.error("[ChessGame] Failed to fetch room players:", err);
        // Fallback on error
        setRoomPlayers([address, `error-${roomPda.slice(0, 8)}`]);
        setMyColor("w");
      }
    };

    fetchRoomPlayers();
  }, [address, roomPda]);

  // Game session persistence - track if we've shown the restored toast
  const restoredToastShownRef = useRef(false);

  const handleChessStateRestored = useCallback((state: Record<string, any>, showToast = true) => {
    const persisted = state as PersistedChessState;
    console.log('[ChessGame] Restoring state from database:', persisted);
    
    if (persisted.fen) {
      const restoredGame = new Chess(persisted.fen);
      setGame(restoredGame);
      setMoveHistory(persisted.moveHistory || []);
      setGameOver(persisted.gameOver || false);
      if (persisted.gameStatus) {
        setGameStatus(persisted.gameStatus);
      }
      
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
    handleChessStateRestored(state, false);
  }, [handleChessStateRestored]);

  // Room mode hook - fetches from DB for Player 2 who doesn't have localStorage data
  // Must be called before any effects that use roomMode
  const { mode: roomMode, isRanked: isRankedGame, isLoaded: modeLoaded } = useRoomMode(roomPda);

  const { loadSession: loadChessSession, saveSession: saveChessSession, finishSession: finishChessSession } = useGameSessionPersistence({
    roomPda: roomPda,
    gameType: 'chess',
    enabled: roomPlayers.length >= 2 && !!address,
    onStateRestored: handleRealtimeStateRestored,
    callerWallet: address, // Pass caller wallet for secure RPC validation
  });

  // Load session on mount
  useEffect(() => {
    if (roomPlayers.length >= 2 && address) {
      loadChessSession().then(savedState => {
        if (savedState && Object.keys(savedState).length > 0) {
          handleChessStateRestored(savedState, true);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomPlayers.length, address]);

  // Save game state after each move
  useEffect(() => {
    if (roomPlayers.length >= 2 && moveHistory.length > 0) {
      const currentTurnWallet = game.turn() === 'w' ? roomPlayers[0] : roomPlayers[1];
      const persisted: PersistedChessState = {
        fen: game.fen(),
        moveHistory,
        gameOver,
        gameStatus,
      };
      saveChessSession(
        persisted,
        currentTurnWallet,
        roomPlayers[0],
        roomPlayers[1],
        gameOver ? 'finished' : 'active',
        roomMode
      );
    }
  }, [game, moveHistory, gameOver, gameStatus, roomPlayers, saveChessSession, roomMode]);

  // Finish session and archive room when game ends
  useEffect(() => {
    if (gameOver && roomPlayers.length >= 2) {
      finishChessSession();
    }
  }, [gameOver, roomPlayers.length, finishChessSession]);

  // Capture animations hook
  const { animations, triggerAnimation, handleAnimationComplete } = useCaptureAnimations(animationsEnabled);

  const rankedGate = useRankedReadyGate({
    roomPda,
    myWallet: address,
    isRanked: isRankedGame,
    enabled: roomPlayers.length >= 2 && modeLoaded,
  });

  const handleAcceptRules = async () => {
    const result = await rankedGate.acceptRules();
    if (result.success) {
      toast({ title: t('gameSession.rulesAccepted'), description: t('gameSession.signedAndReady') });
    } else {
      toast({ title: t('gameSession.failedToAccept'), description: result.error || t('gameSession.tryAgain'), variant: "destructive" });
    }
  };

  const handleLeaveMatch = async () => {
    // If game is over, just navigate away
    if (gameOver) {
      navigate("/room-list");
      return;
    }
    
    // If creator alone (no opponent) OR opponent hasn't accepted rules yet, cancel room and refund
    if (roomPlayers.length === 1 || (roomPlayers.length >= 2 && !rankedGate.bothReady)) {
      const result = await cancelRoomByPda(roomPda || "");
      if (result.ok) {
        toast({ title: t('forfeit.roomCancelled'), description: t('forfeit.stakeRefunded') });
      } else {
        toast({ title: t('common.error'), description: result.reason, variant: "destructive" });
      }
      navigate("/room-list");
      return;
    }
    
    // If 2 players, both accepted rules, and game not over, show forfeit confirmation
    if (roomPlayers.length >= 2 && rankedGate.bothReady) {
      setShowForfeitDialog(true);
      return;
    }
    
    // Otherwise just navigate away
    navigate("/room-list");
  };

  const handleConfirmForfeit = async () => {
    if (!roomPda) return;
    
    setIsForfeitLoading(true);
    const result = await forfeitGame(roomPda);
    setIsForfeitLoading(false);
    
    if (result.ok) {
      toast({ title: t('forfeit.success'), description: t('forfeit.opponentWins') });
      setShowForfeitDialog(false);
      navigate("/room-list");
    } else {
      toast({ title: t('common.error'), description: result.reason, variant: "destructive" });
    }
  };

  // Block gameplay until both players are ready (for ranked games)
  const canPlay = !isRankedGame || rankedGate.bothReady;

  // Check if it's my turn
  const isMyTurn = canPlay && game.turn() === myColor && !gameOver;

  // Ref for resign function to avoid circular deps with turn timer
  const sendResignRef = useRef<(() => boolean) | null>(null);

  // Turn timer for ranked games - auto-forfeit on timeout
  const handleTimeExpired = useCallback(() => {
    if (!gameOver) {
      toast({
        title: t('gameSession.timeExpired'),
        description: t('gameSession.forfeitedMatch'),
        variant: "destructive",
      });
      sendResignRef.current?.();
      setGameOver(true);
      setGameStatus(myColor === 'w' ? t('game.black') + " wins by timeout" : t('game.white') + " wins by timeout");
      play('chess_lose');
    }
  }, [gameOver, myColor, play, t]);

  // Use turn time from ranked gate (fetched from DB/localStorage)
  const effectiveTurnTime = rankedGate.turnTimeSeconds || DEFAULT_RANKED_TURN_TIME;
  
  const turnTimer = useTurnTimer({
    turnTimeSeconds: effectiveTurnTime,
    enabled: isRankedGame && canPlay && !gameOver,
    isMyTurn,
    onTimeExpired: handleTimeExpired,
    roomId: roomPda,
  });

  // Convert to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = playerAddress.toLowerCase() === address?.toLowerCase();
      const color = index === 0 ? "white" : "black";
      return {
        address: playerAddress,
        name: isMe ? t("common.you") : t("game.opponent"),
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
  // Chat players derived from turn players
  const chatPlayers: ChatPlayer[] = useMemo(() => {
    return turnPlayers.map((tp) => ({
      wallet: tp.address,
      displayName: tp.name,
      color: tp.color,
      seatIndex: tp.seatIndex,
    }));
  }, [turnPlayers]);

  // Handle chat message sending via WebRTC
  const handleChatSend = useCallback((msg: ChatMessage) => {
    sendChat(JSON.stringify(msg));
  }, []);

  // Game chat hook
  const chat = useGameChat({
    roomId: roomId || "",
    myWallet: address,
    players: chatPlayers,
    onSendMessage: handleChatSend,
    enabled: roomPlayers.length === 2,
  });

  // Rematch hook
  const rematch = useRematch("Chess", roomPlayers);

  // Rematch players for display
  const rematchPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
    }));
  }, [turnPlayers]);

  // Winner address for end screen
  const winnerAddress = useMemo(() => {
    if (!gameOver) return null;
    if (gameStatus.includes("draw") || gameStatus.includes("Stalemate")) return "draw";
    if (gameStatus.includes("win")) return address;
    return roomPlayers.find(p => p !== address) || null;
  }, [gameOver, gameStatus, address, roomPlayers]);

  // Players for GameEndScreen
  const gameEndPlayers = useMemo(() => {
    return turnPlayers.map(tp => ({
      address: tp.address,
      name: tp.name,
      color: tp.color === "white" ? "#FFFFFF" : "#333333",
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

  // Refs for WebRTC functions (to avoid circular dependency)
  const sendRematchInviteRef = useRef<((data: any) => boolean) | null>(null);
  const sendRematchAcceptRef = useRef<((roomId: string) => boolean) | null>(null);
  const sendRematchDeclineRef = useRef<((roomId: string) => boolean) | null>(null);
  const sendRematchReadyRef = useRef<((roomId: string) => boolean) | null>(null);

  const handleAcceptRematch = async (rematchRoomId: string) => {
    const result = await rematch.acceptRematch(rematchRoomId);
    // Notify opponent via WebRTC
    sendRematchAcceptRef.current?.(rematchRoomId);
    if (result.allAccepted) {
      toast({ title: t("gameMultiplayer.allPlayersAccepted"), description: t("gameMultiplayer.gameStarting") });
      sendRematchReadyRef.current?.(rematchRoomId);
      window.location.href = `/game/chess/${rematchRoomId}`;
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

  // Add system message when game starts
  useEffect(() => {
    if (roomPlayers.length === 2 && chat.messages.length === 0) {
      chat.addSystemMessage(t("gameMultiplayer.gameStarted"));
    }
  }, [roomPlayers.length]);

  // Ref for stable callback access
  const chatRef = useRef(chat);
  const recordPlayerMoveRef = useRef(recordPlayerMove);
  useEffect(() => { chatRef.current = chat; }, [chat]);
  useEffect(() => { recordPlayerMoveRef.current = recordPlayerMove; }, [recordPlayerMove]);

  // Inline checkGameOver logic for stable callback (avoids circular dependency)
  const checkGameOverInline = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      const isPlayerWin = currentGame.turn() !== myColor;
      const winner = isPlayerWin ? t("gameMultiplayer.checkmateYouWin") : t("gameMultiplayer.checkmateYouLose");
      setGameStatus(winner);
      setGameOver(true);
      play(isPlayerWin ? 'chess_win' : 'chess_lose');
      return true;
    }
    if (currentGame.isStalemate()) {
      setGameStatus(t("gameMultiplayer.drawStalemate"));
      setGameOver(true);
      return true;
    }
    if (currentGame.isDraw()) {
      setGameStatus(t("game.draw"));
      setGameOver(true);
      return true;
    }
    if (currentGame.isCheck()) {
      play('chess_check');
    }
    return false;
  }, [myColor, play, t]);

  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    console.log("[ChessGame] Received message:", message.type);
    
    // Handle chat messages
    if (message.type === "chat" && message.payload) {
      try {
        const chatMsg = typeof message.payload === "string" 
          ? JSON.parse(message.payload) 
          : message.payload;
        chatRef.current.receiveMessage(chatMsg);
      } catch (e) {
        console.error("[ChessGame] Failed to parse chat message:", e);
      }
      return;
    }
    
    if (message.type === "move" && message.payload) {
      const move = message.payload as ChessMove;
      const gameCopy = new Chess(gameRef.current.fen());
      
      const attackingPiece = gameCopy.get(move.from);
      const targetPiece = gameCopy.get(move.to);
      
      try {
        const result = gameCopy.move({
          from: move.from,
          to: move.to,
          promotion: (move.promotion || 'q') as 'q' | 'r' | 'b' | 'n',
        });
        
        if (result) {
          if (targetPiece) {
            play('chess_capture');
            if (animationsEnabledRef.current && attackingPiece) {
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
          recordPlayerMoveRef.current(roomPlayersRef.current[gameRef.current.turn() === "w" ? 1 : 0] || "", result.san);
          
          checkGameOverInline(gameCopy);
        }
      } catch (error) {
        console.error("[ChessGame] Error applying opponent move:", error);
      }
    } else if (message.type === "resign") {
      setGameStatus(t("gameMultiplayer.opponentResignedWin"));
      setGameOver(true);
      play('chess_win');
      chatRef.current.addSystemMessage(t("gameMultiplayer.opponentResigned"));
      toast({
        title: t("gameMultiplayer.victory"),
        description: t("gameMultiplayer.opponentResignedVictory"),
      });
    } else if (message.type === "draw_offer") {
      setDrawOffered(true);
      setDrawOfferFrom(message.sender || "opponent");
      toast({
        title: t("gameMultiplayer.drawOffered"),
        description: t("gameMultiplayer.drawOfferedDesc"),
      });
    } else if (message.type === "draw_accept") {
      setGameStatus(t("gameMultiplayer.drawByAgreement"));
      setGameOver(true);
      chatRef.current.addSystemMessage(t("gameMultiplayer.drawByAgreement"));
      toast({
        title: t("game.draw"),
        description: t("gameMultiplayer.drawByAgreement"),
      });
    } else if (message.type === "draw_reject") {
      setDrawOffered(false);
      setDrawOfferFrom(null);
      toast({
        title: t("gameMultiplayer.drawDeclined"),
        description: t("gameMultiplayer.drawDeclinedDesc"),
      });
    } else if (message.type === "rematch_invite" && message.payload) {
      setRematchInviteData(message.payload);
      setShowAcceptModal(true);
      toast({
        title: t("gameMultiplayer.rematchInvite"),
        description: t("gameMultiplayer.rematchInviteDesc"),
      });
    } else if (message.type === "rematch_accept" && message.payload) {
      toast({
        title: t("gameMultiplayer.rematchAccepted"),
        description: t("gameMultiplayer.rematchAcceptedDesc"),
      });
      if (rematch.state.newRoomId) {
        rematch.acceptRematch(rematch.state.newRoomId);
      }
    } else if (message.type === "rematch_decline") {
      toast({
        title: t("gameMultiplayer.rematchDeclined"),
        description: t("gameMultiplayer.rematchDeclinedDesc"),
        variant: "destructive",
      });
      rematch.closeRematchModal();
    } else if (message.type === "rematch_ready" && message.payload) {
      toast({
        title: t("gameMultiplayer.rematchReady"),
        description: t("gameMultiplayer.rematchReadyDesc"),
      });
      navigate(`/game/chess/${message.payload.roomId}`);
    }
  }, [play, triggerAnimation, checkGameOverInline, t, rematch, navigate]); // Stable deps

  // WebRTC sync
  const {
    isConnected: peerConnected,
    connectionState,
    sendMove,
    sendResign,
    sendDrawOffer,
    sendDrawAccept,
    sendDrawReject,
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

  // Check if it's actually my turn (based on game state, not canPlay gate)
  const isActuallyMyTurn = game.turn() === myColor && !gameOver;

  useEffect(() => {
    if (roomPlayers.length < 2) {
      setGameStatus(t("gameMultiplayer.waitingForOpponent"));
    } else if (connectionState === "connecting") {
      setGameStatus(t("gameMultiplayer.connectingToOpponent"));
    } else if (connectionState === "connected") {
      // Show actual turn status (not gated by canPlay)
      setGameStatus(isActuallyMyTurn ? t("gameMultiplayer.yourTurn") : t("gameMultiplayer.opponentsTurn"));
    } else if (connectionState === "disconnected") {
      setGameStatus(t("gameMultiplayer.connectionLost"));
    }
  }, [roomPlayers.length, connectionState, isActuallyMyTurn, t]);

  const checkGameOver = useCallback((currentGame: Chess) => {
    if (currentGame.isCheckmate()) {
      const isPlayerWin = currentGame.turn() !== myColor;
      const winner = isPlayerWin ? t("gameMultiplayer.checkmateYouWin") : t("gameMultiplayer.checkmateYouLose");
      setGameStatus(winner);
      setGameOver(true);
      play(isPlayerWin ? 'chess_win' : 'chess_lose');
      return true;
    }
    if (currentGame.isStalemate()) {
      setGameStatus(t("gameMultiplayer.drawStalemate"));
      setGameOver(true);
      return true;
    }
    if (currentGame.isDraw()) {
      setGameStatus(t("game.draw"));
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

      if (!checkGameOver(gameCopy)) {
        setGameStatus(t("gameMultiplayer.opponentsTurn"));
      }

      return true;
    } catch {
      return false;
    }
  }, [game, gameOver, isMyTurn, checkGameOver, animationsEnabled, triggerAnimation, play, sendMove, recordPlayerMove, address]);

  const handleResign = useCallback(() => {
    sendResign();
    setGameStatus(t("gameMultiplayer.youResignedLose"));
    setGameOver(true);
    play('chess_lose');
  }, [sendResign, play]);

  const handleDrawOffer = useCallback(() => {
    sendDrawOffer();
    setDrawOffered(true);
  }, [sendDrawOffer]);

  const handleAcceptDraw = useCallback(() => {
    sendDrawAccept();
    setGameStatus(t("gameMultiplayer.drawByAgreement"));
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
        isVisible={!hasPermission && isActuallyMyTurn && !gameOver}
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
                    Chess - Room #{roomId}
                  </h1>
                </div>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  {peerConnected ? (
                    <><Wifi className="w-3 h-3 text-green-500" /> {t("gameMultiplayer.connected")}</>
                  ) : (
                    <><WifiOff className="w-3 h-3 text-yellow-500" /> {connectionState}</>
                  )}
                  <span className="mx-1">•</span>
                  {t("gameMultiplayer.playingAs")} {myColor === "w" ? t("gameMultiplayer.white") : t("gameMultiplayer.black")}
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
              isMyTurn={isActuallyMyTurn}
              activePlayer={turnPlayers[game.turn() === "w" ? 0 : 1]}
              players={turnPlayers}
              myAddress={address}
              remainingTime={isRankedGame ? turnTimer.remainingTime : undefined}
              showTimer={isRankedGame && canPlay}
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
                        className="text-xs">
                        <Flag className="w-3 h-3 mr-1" />
                        {t("gameMultiplayer.resign")}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Rules Info Panel - inline position */}
              <RulesInfoPanel 
                stakeSol={rankedGate.stakeLamports / 1_000_000_000} 
                isRanked={isRankedGame}
                turnTimeSeconds={effectiveTurnTime}
                className="mt-2"
              />

              {/* Draw Offer Dialog */}
              {drawOffered && drawOfferFrom && drawOfferFrom !== address && (
                <div className="bg-primary/10 border border-primary/30 rounded-lg p-4">
                  <p className="text-sm mb-3">{t("gameMultiplayer.opponentOfferedDraw")}</p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleAcceptDraw}>{t("gameMultiplayer.accept")}</Button>
                    <Button size="sm" variant="outline" onClick={handleRejectDraw}>{t("gameMultiplayer.decline")}</Button>
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
                  {t("gameMultiplayer.moveHistory")}
                </h3>
                <div className="max-h-64 overflow-y-auto space-y-1 text-sm">
                  {formattedMoves.length === 0 ? (
                    <p className="text-muted-foreground text-xs">{t("gameMultiplayer.noMovesYet")}</p>
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
                  <h3 className="text-sm font-semibold">{t("gameMultiplayer.gameOver")}</h3>
                  <div className="flex flex-col gap-2">
                    <Button onClick={() => rematch.openRematchModal()} className="w-full gap-2">
                      <RotateCcw className="w-4 h-4" />
                      {t("gameMultiplayer.rematch")}
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/room-list">{t("gameMultiplayer.findNewGame")}</Link>
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Chat Panel */}
      <GameChatPanel chat={chat} />


      {/* Game End Screen */}
      {gameOver && (
        <GameEndScreen
          gameType="Chess"
          winner={winnerAddress}
          winnerName={winnerAddress === "draw" ? undefined : gameEndPlayers.find(p => p.address === winnerAddress)?.name}
          myAddress={address}
          players={gameEndPlayers}
          onRematch={() => rematch.openRematchModal()}
          onExit={() => navigate("/room-list")}
          result={gameStatus.includes("Checkmate") ? "Checkmate" : gameStatus.includes("Stalemate") ? "Stalemate" : undefined}
          roomPda={roomPda}
          isStaked={false}
        />
      )}

      {/* Rematch Modal */}
      <RematchModal
        isOpen={rematch.isModalOpen}
        onClose={rematch.closeRematchModal}
        gameType="Chess"
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
        onAccept={handleAcceptRules}
        onLeave={handleLeaveMatch}
        stakeSol={rankedGate.stakeLamports / 1_000_000_000}
        turnTimeSeconds={effectiveTurnTime}
        isLoading={rankedGate.isSettingReady}
        opponentReady={rankedGate.opponentReady}
      />

      {/* Waiting for opponent panel (Ranked - I accepted, waiting for opponent) */}
      {isRankedGame && rankedGate.iAmReady && !rankedGate.bothReady && (
        <WaitingForOpponentPanel onLeave={handleLeaveMatch} roomPda={roomPda} />
      )}

      {/* Forfeit Confirmation Dialog */}
      <ForfeitConfirmDialog
        open={showForfeitDialog}
        onOpenChange={setShowForfeitDialog}
        onConfirm={handleConfirmForfeit}
        isLoading={isForfeitLoading}
        gameType="2player"
        stakeSol={entryFeeSol}
      />
    </div>
  );
};

export default ChessGame;