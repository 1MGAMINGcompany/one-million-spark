import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { getOpponentWallet, isSameWallet, isRealWallet, DEFAULT_SOLANA_PUBKEY } from "@/lib/walletUtils";
import { incMissed, resetMissed, clearRoom } from "@/lib/missedTurns";
import { GameErrorBoundary } from "@/components/GameErrorBoundary";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Chess, Square, PieceSymbol, Color } from "chess.js";
import { ChessBoardPremium } from "@/components/ChessBoardPremium";
import { useCaptureAnimations } from "@/components/CaptureAnimationLayer";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Gem, Star, Flag, Users, Wifi, WifiOff, LogOut } from "lucide-react";
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
import { useStartRoll } from "@/hooks/useStartRoll";
import { useTurnTimer, DEFAULT_RANKED_TURN_TIME } from "@/hooks/useTurnTimer";
import { useOpponentTimeoutDetection } from "@/hooks/useOpponentTimeoutDetection";
import { useDurableGameSync, GameMove } from "@/hooks/useDurableGameSync";
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
import { DiceRollStart } from "@/components/DiceRollStart";
import { RulesGate } from "@/components/RulesGate";
import { InAppBrowserRecovery } from "@/components/InAppBrowserRecovery";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PublicKey, Connection } from "@solana/web3.js";
import { parseRoomAccount } from "@/lib/solana-program";
import { getSolanaEndpoint } from "@/lib/solana-config";
import { useTxLock } from "@/contexts/TxLockContext";
import { dbg, isDebugEnabled } from "@/lib/debugLog";

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
  const [winnerWallet, setWinnerWallet] = useState<string | null>(null); // Direct wallet address of winner

  // Room players - in production, this comes from on-chain room data
  const [roomPlayers, setRoomPlayers] = useState<string[]>([]);
  const [myColor, setMyColor] = useState<"w" | "b">("w");
  
  // Leave/Forfeit dialog states
  const [showForfeitDialog, setShowForfeitDialog] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [entryFeeSol, setEntryFeeSol] = useState(0);
  const [stakeLamports, setStakeLamports] = useState<number | undefined>(undefined); // Guardrail A: Canonical on-chain stake
  const [isCancellingRoom, setIsCancellingRoom] = useState(false);
  
  // Solana rooms hook for forfeit/cancel
  const { cancelRoomByPda } = useSolanaRooms();
  
  // WebRTC refs for cleanup
  const webrtcCleanupRef = useRef<(() => void) | null>(null);
  const supabaseCleanupRef = useRef<(() => void) | null>(null);

  // Refs for stable callback access
  const gameRef = useRef(game);
  const roomPlayersRef = useRef<string[]>([]);
  const animationsEnabledRef = useRef(animationsEnabled);
  
  useEffect(() => { gameRef.current = game; }, [game]);
  useEffect(() => { roomPlayersRef.current = roomPlayers; }, [roomPlayers]);
  useEffect(() => { animationsEnabledRef.current = animationsEnabled; }, [animationsEnabled]);

  // Fetch real player order from on-chain room account with polling for second player
  useEffect(() => {
    if (!address || !roomPda) return;

    let pollCount = 0;
    const MAX_POLLS = 30; // 30 seconds max wait
    let pollInterval: NodeJS.Timeout | null = null;

    const fetchRoomPlayers = async (): Promise<boolean> => {
      try {
        const connection = new Connection(getSolanaEndpoint(), "confirmed");
        const pdaKey = new PublicKey(roomPda);
        const accountInfo = await connection.getAccountInfo(pdaKey);
        
        if (accountInfo?.data) {
          const parsed = parseRoomAccount(accountInfo.data as Buffer);
          if (parsed) {
            // Get raw player addresses from on-chain
            const p1 = parsed.players?.[0]?.toBase58();
            const p2 = parsed.players?.[1]?.toBase58();
            
            // Normalize: replace default pubkey (empty slot) with waiting- placeholder
            const normalizedPlayers = [
              p1,
              p2 === DEFAULT_SOLANA_PUBKEY ? `waiting-${roomPda.slice(0, 8)}` : p2,
            ].filter(Boolean) as string[];
            
            setRoomPlayers(normalizedPlayers);
            
            // Extract entry fee from on-chain (CRITICAL for correct modal display)
            // Guardrail A: Store canonical lamports directly from on-chain
            if (parsed.entryFee !== undefined) {
              setStakeLamports(parsed.entryFee);
              setEntryFeeSol(parsed.entryFee / 1_000_000_000);
            }
            
            // Note: myColor is set by start roll, NOT by on-chain position
            // On-chain index only affects who is player1/player2, dice roll determines who is white
            console.log("[ChessGame] On-chain players:", normalizedPlayers, "Entry fee:", parsed.entryFee);
            
            // ✅ Only stop polling when room truly has 2 real players
            if (parsed.playerCount >= 2 && p2 && p2 !== DEFAULT_SOLANA_PUBKEY) {
              return true; // Stop polling
            }
            return false; // Continue polling
          }
        }
        
        // Room not ready yet (waiting for second player)
        console.log("[ChessGame] Waiting for second player... (poll", pollCount + 1, "/", MAX_POLLS, ")");
        return false; // Continue polling
      } catch (err) {
        console.error("[ChessGame] Failed to fetch room players:", err);
        return false; // Continue polling on error
      }
    };

    // Initial fetch
    fetchRoomPlayers().then(success => {
      if (!success) {
        // Start polling if room not ready
        pollInterval = setInterval(async () => {
          pollCount++;
          const success = await fetchRoomPlayers();
          if (success || pollCount >= MAX_POLLS) {
            if (pollInterval) {
              clearInterval(pollInterval);
              pollInterval = null;
            }
            // If max polls reached without 2 players, set waiting state
            if (!success && pollCount >= MAX_POLLS) {
              console.log("[ChessGame] Max polls reached, still waiting for opponent");
              setRoomPlayers([address, `waiting-${roomPda.slice(0, 8)}`]);
              // Note: myColor is set by start roll, not here
            }
          }
        }, 1000);
      }
    });

    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
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
          duration: 3000, // 3 seconds, dismissible
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
  const { mode: roomMode, isRanked: isRankedGame, isPrivate, turnTimeSeconds: roomTurnTime, isLoaded: modeLoaded } = useRoomMode(roomPda);

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

  // Durable game sync - persists moves to DB for reliability
  const handleDurableMoveReceived = useCallback((move: GameMove) => {
    // Only apply moves from opponents (we already applied our own locally)
    if (!isSameWallet(move.wallet, address)) {
      console.log("[ChessGame] Applying move from DB:", move.turn_number);
      const moveData = move.move_data as any;
      
      // Handle turn_timeout events
      if (moveData?.action === "turn_timeout") {
        // Clear any turn override since we're processing a timeout
        setTurnOverrideWallet(moveData.nextTurnWallet || null);
        
        if (moveData.missedCount >= 3) {
          // Opponent forfeited by missing 3 turns
          setGameOver(true);
          setWinnerWallet(address || null);
          setGameStatus(t('gameSession.opponentForfeited'));
          play('chess_win');
          toast({
            title: t('gameSession.opponentForfeited'),
            description: t('gameSession.youWin'),
          });
          return;
        }
        // Skip event - I get another turn
        toast({ 
          title: t('gameSession.opponentSkipped'),
          description: t('gameSession.yourTurnNow'),
        });
        return;
      }
      
      // Normal move - apply and clear override
      const chessMove = moveData as ChessMove;
      if (chessMove && chessMove.from && chessMove.to) {
        const gameCopy = new Chess(gameRef.current.fen());
        try {
          const result = gameCopy.move({
            from: chessMove.from,
            to: chessMove.to,
            promotion: (chessMove.promotion || 'q') as 'q' | 'r' | 'b' | 'n',
          });
          if (result) {
            setGame(new Chess(gameCopy.fen()));
            setMoveHistory(gameCopy.history());
            setTurnOverrideWallet(null); // Clear override on real move
            // Reset missed turns for the mover
            if (move.wallet && roomPda) {
              resetMissed(roomPda, move.wallet);
            }
          }
        } catch (e) {
          console.error("[ChessGame] Failed to apply DB move:", e);
        }
      }
    }
  }, [address, roomPda, play, t]);

  const { submitMove: persistMove, moves: dbMoves, isLoading: isSyncLoading } = useDurableGameSync({
    roomPda: roomPda || "",
    enabled: (isRankedGame || isPrivate) && roomPlayers.length >= 2,
    onMoveReceived: handleDurableMoveReceived,
  });

  // Check if we have 2 real player wallets (not placeholders including 111111...)
  const hasTwoRealPlayers = 
    roomPlayers.length >= 2 && 
    isRealWallet(roomPlayers[0]) && 
    isRealWallet(roomPlayers[1]);

  const rankedGate = useRankedReadyGate({
    roomPda,
    myWallet: address,
    isRanked: isRankedGame,
    enabled: hasTwoRealPlayers && modeLoaded,
  });

  // TxLock for preventing Phantom "Request blocked" popups
  const { isTxInFlight, withTxLock } = useTxLock();

  // Guardrail B: isDataLoaded must mean "room + session + wallet loaded", not dependent on entryFeeSol > 0
  const isDataLoaded = useMemo(() => {
    return (
      !!roomPda &&
      roomPlayers.length > 0 &&
      stakeLamports !== undefined &&
      (rankedGate.turnTimeSeconds > 0 || !isRankedGame) &&
      rankedGate.isDataLoaded
    );
  }, [roomPda, roomPlayers.length, stakeLamports, rankedGate.turnTimeSeconds, isRankedGame, rankedGate.isDataLoaded]);

  // Deterministic start roll for ALL games (casual + ranked)
  const startRoll = useStartRoll({
    roomPda,
    gameType: "chess",
    myWallet: address,
    isRanked: isRankedGame,
    roomPlayers,
    hasTwoRealPlayers,
    initialColor: isSameWallet(roomPlayers[0], address) ? "w" : "b",
    bothReady: rankedGate.bothReady,
  });

  // Update myColor based on start roll result - THIS IS THE ONLY PLACE THAT SETS COLOR
  useEffect(() => {
    if (startRoll.isFinalized && startRoll.startingWallet) {
      const isStarter = isSameWallet(startRoll.startingWallet, address);
      const newColor = isStarter ? "w" : "b";
      setMyColor(newColor);
      console.log("[ChessGame] Dice roll finalized. Starter:", startRoll.startingWallet, "My color:", newColor === "w" ? "white" : "black");
      
      toast({
        title: isStarter ? t("gameMultiplayer.youGoFirst") : t("gameMultiplayer.opponentGoesFirst"),
        description: isStarter ? t("gameMultiplayer.playAsWhite") : t("gameMultiplayer.playAsBlack"),
      });
    }
  }, [startRoll.isFinalized, startRoll.startingWallet, address, t]);

  const handleAcceptRules = async () => {
    const result = await rankedGate.acceptRules();
    if (result.success) {
      toast({ title: t('gameSession.rulesAccepted'), description: t('gameSession.signedAndReady') });
    } else {
      toast({ title: t('gameSession.failedToAccept'), description: result.error || t('gameSession.tryAgain'), variant: "destructive" });
    }
  };

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

  // NOTE: handleUILeave, handleCancelRoom, handleForfeitMatch are defined AFTER useForfeit hook
  // See below after useForfeit is initialized

  // Opponent wallet for forfeit - exclude placeholder wallets
  const opponentWallet = useMemo(() => {
    if (!address || roomPlayers.length < 2) return null;
    return roomPlayers.find(p => isRealWallet(p) && !isSameWallet(p, address)) || null;
  }, [address, roomPlayers]);

  // useForfeit hook - will be set up after WebRTC is available
  // Placeholder for now - actual hook is added after WebRTC initialization

  // Block gameplay until start roll is finalized (for ranked games, also need rules accepted)
  const canPlay = startRoll.isFinalized && (!isRankedGame || rankedGate.bothReady);

  // Use startRoll.myColor as source of truth when finalized
  const effectiveColor = startRoll.isFinalized ? startRoll.myColor : myColor;
  
  // Turn override for skip functionality (when opponent times out, we get another turn)
  const [turnOverrideWallet, setTurnOverrideWallet] = useState<string | null>(null);

  // Check if it's my turn from engine
  const isMyTurnFromEngine = game.turn() === effectiveColor && !gameOver;
  
  // Override takes priority if set
  const isMyTurnOverride = turnOverrideWallet 
    ? isSameWallet(turnOverrideWallet, address) 
    : null;
  const isActuallyMyTurn = isMyTurnOverride ?? isMyTurnFromEngine;
  
  // isMyTurn includes canPlay gate - used for board disable
  const isMyTurn = canPlay && isActuallyMyTurn;

  // Ref for forfeit function - will be set by useForfeit hook
  const forfeitFnRef = useRef<(() => Promise<void>) | null>(null);

  // Turn timer for ranked games - skip on timeout, 3 strikes = forfeit
  // FIX: Allow processing when opponent times out (detected by useOpponentTimeoutDetection)
  const handleTurnTimeout = useCallback((timedOutWalletArg?: string | null) => {
    if (gameOver || !address || !roomPda) return;

    // Get the wallet that timed out - either passed in or current turn holder
    const timedOutWallet = timedOutWalletArg || activeTurnAddress || null;
    if (!timedOutWallet) return;
    
    const iTimedOut = isSameWallet(timedOutWallet, address);
    const opponentWalletAddr = getOpponentWallet(roomPlayers, address);
    
    // VALIDATION: Only process if timedOutWallet matches either me or opponent
    // This prevents stale closure issues while still allowing opponent timeout detection
    const isValidTimeout = iTimedOut || (opponentWalletAddr && isSameWallet(timedOutWallet, opponentWalletAddr));
    if (!isValidTimeout) {
      console.log("[ChessGame] Ignoring timeout - wallet doesn't match player or opponent", {
        timedOutWallet: timedOutWallet?.slice(0, 8),
        myWallet: address?.slice(0, 8),
        opponentWallet: opponentWalletAddr?.slice(0, 8),
      });
      return;
    }
    
    const newMissedCount = incMissed(roomPda, timedOutWallet);
    
    if (newMissedCount >= 3) {
      // 3 STRIKES = AUTO FORFEIT
      toast({
        title: t('gameSession.autoForfeit'),
        description: t('gameSession.missedThreeTurns'),
        variant: "destructive",
      });
      
      // Persist auto_forfeit event (changed from turn_timeout)
      if ((isRankedGame || isPrivate) && opponentWalletAddr) {
        persistMove({
          action: "auto_forfeit",
          timedOutWallet: timedOutWallet,
          winnerWallet: iTimedOut ? opponentWalletAddr : address,
          missedCount: newMissedCount,
        } as any, address);
      }
      
      if (iTimedOut) {
        // I missed 3 turns -> I lose
        // FIX: Notify opponent via WebRTC BEFORE navigating away
        sendResignRef.current?.();
        
        forfeitFnRef.current?.();
        setGameOver(true);
        setWinnerWallet(opponentWalletAddr);
        setGameStatus(myColor === 'w' ? t('game.black') + " wins" : t('game.white') + " wins");
        play('chess_lose');
      } else {
        // Opponent missed 3 turns -> I win
        setGameOver(true);
        setWinnerWallet(address);
        setGameStatus(myColor === 'w' ? t('game.white') + " wins" : t('game.black') + " wins");
        play('chess_win');
      }
      
    } else {
      // SKIP to opponent
      toast({
        title: t('gameSession.turnSkipped'),
        description: `${newMissedCount}/3 ${t('gameSession.missedTurns')}`,
        variant: "destructive",
      });
      
      // Persist minimal turn_timeout event
      if ((isRankedGame || isPrivate) && opponentWalletAddr) {
        persistMove({
          action: "turn_timeout",
          timedOutWallet: timedOutWallet,
          // FIX: nextTurnWallet depends on WHO timed out
          nextTurnWallet: iTimedOut ? opponentWalletAddr : address,
          missedCount: newMissedCount,
        } as any, address);
      }
      
      // FIX: Set turnOverrideWallet based on who timed out
      // If I timed out, opponent gets turn. If opponent timed out, I get turn.
      if (iTimedOut) {
        setTurnOverrideWallet(opponentWalletAddr);
      } else {
        // Opponent timed out - I get the turn
        setTurnOverrideWallet(address);
      }
    }
  }, [gameOver, address, roomPda, isActuallyMyTurn, roomPlayers, myColor, isRankedGame, persistMove, play, t]);

  // Use turn time from room mode (DB source of truth) or fallback to ranked gate
  const effectiveTurnTime = roomTurnTime || rankedGate.turnTimeSeconds || DEFAULT_RANKED_TURN_TIME;
  
  // Timer should show when turn time is configured and game has started
  const gameStarted = startRoll.isFinalized && roomPlayers.length >= 2;
  const shouldShowTimer = effectiveTurnTime > 0 && gameStarted && !gameOver;
  
  const turnTimer = useTurnTimer({
    turnTimeSeconds: effectiveTurnTime,
    // Timer counts down only on my turn, enabled for ranked/private with turn time
    enabled: shouldShowTimer && isActuallyMyTurn,
    isMyTurn: isActuallyMyTurn,
    onTimeExpired: handleTurnTimeout,
    roomId: roomPda,
  });

  // Convert to TurnPlayer format for notifications
  const turnPlayers: TurnPlayer[] = useMemo(() => {
    return roomPlayers.map((playerAddress, index) => {
      const isMe = isSameWallet(playerAddress, address);
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

  // Opponent timeout detection - polls DB to detect if opponent has timed out
  const handleOpponentTimeoutDetected = useCallback((missedCount: number) => {
    // When opponent times out, call handleTurnTimeout with their wallet
    const opponentWallet = getOpponentWallet(roomPlayers, address);
    if (opponentWallet) {
      handleTurnTimeout(opponentWallet);
    }
  }, [roomPlayers, address, handleTurnTimeout]);

  const handleOpponentAutoForfeit = useCallback(() => {
    // Opponent missed 3 turns - they auto-forfeit, we win
    const opponentWallet = getOpponentWallet(roomPlayers, address);
    if (opponentWallet) {
      handleTurnTimeout(opponentWallet);
    }
  }, [roomPlayers, address, handleTurnTimeout]);

  const opponentTimeout = useOpponentTimeoutDetection({
    roomPda: roomPda || "",
    // Enable for ranked/private when it's NOT my turn AND both players ready
    enabled: shouldShowTimer && !isActuallyMyTurn && startRoll.isFinalized && rankedGate.bothReady,
    isMyTurn: isActuallyMyTurn,
    turnTimeSeconds: effectiveTurnTime,
    myWallet: address,
    onOpponentTimeout: handleOpponentTimeoutDetected,
    onAutoForfeit: handleOpponentAutoForfeit,
    bothReady: rankedGate.bothReady,
  });

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

  // Winner address for end screen - prioritize winnerWallet (from resign/forfeit)
  const winnerAddress = useMemo(() => {
    // Direct wallet address from resign/forfeit takes priority
    if (winnerWallet) return winnerWallet;
    
    // Fallback for normal game endings
    if (!gameOver) return null;
    if (gameStatus.includes("draw") || gameStatus.includes("Stalemate")) return "draw";
    if (gameStatus.includes("win")) return address;
    return getOpponentWallet(roomPlayers, address);
  }, [winnerWallet, gameOver, gameStatus, address, roomPlayers]);

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
  // Ref for sendResign to allow calling from handleTurnTimeout (defined before useWebRTCSync)
  const sendResignRef = useRef<(() => boolean) | null>(null);

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
      // Opponent resigned - I WIN - store MY wallet as winner
      setWinnerWallet(address || null);
      setGameStatus(t("gameMultiplayer.opponentResignedWin"));
      setGameOver(true);
      play('chess_win');
      chatRef.current.addSystemMessage(t("gameMultiplayer.opponentResigned"));
      toast({
        title: t("gameMultiplayer.victory"),
        description: t("gameMultiplayer.opponentResignedVictory"),
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
    sendResignRef.current = sendResign;
  }, [sendRematchInvite, sendRematchAccept, sendRematchDecline, sendRematchReady, sendResign]);

  // useForfeit hook - centralized forfeit/leave logic with guaranteed cleanup
  const { forfeit, leave, isForfeiting, isLeaving, forfeitRef } = useForfeit({
    roomPda: roomPda || null,
    myWallet: address || null,
    opponentWallet,
    stakeLamports: stakeLamports ?? Math.floor(entryFeeSol * 1_000_000_000),
    gameType: "chess",
    mode: isRankedGame ? 'ranked' : 'casual',
    // CRITICAL: Pass validation state for ranked games
    bothRulesAccepted: rankedGate.bothReady,
    gameStarted: startRoll.isFinalized,
    onCleanupWebRTC: () => {
      // Close WebRTC connection - the hook handles this internally
      console.log("[ChessGame] Cleaning up WebRTC via useForfeit");
    },
    onCleanupSupabase: () => {
      // Supabase channels are cleaned up by the hook
      console.log("[ChessGame] Cleaning up Supabase via useForfeit");
    },
  });
  
  // Connect forfeit ref for timeout handler
  useEffect(() => {
    forfeitFnRef.current = forfeitRef.current;
  }, [forfeitRef]);

  // ========== Leave/Forfeit handlers (defined after useForfeit) ==========
  
  // UI-only leave handler - NO wallet calls
  const handleUILeave = useCallback(() => {
    console.log("[LeaveMatch] UI exit only");
    leave(); // This is the UI-only cleanup + navigate function
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

  // Open leave modal - NEVER triggers wallet
  const handleLeaveClick = useCallback(() => {
    console.log("[LeaveMatch] Opening leave modal (UI only)");
    setShowLeaveModal(true);
  }, []);

  // isActuallyMyTurn already computed above with turn override support

  useEffect(() => {
    if (roomPlayers.length < 2) {
      setGameStatus(t("gameMultiplayer.waitingForOpponent"));
    } else if (effectiveConnectionState === "connecting" && !inWalletBrowser) {
      // Only show "Connecting" if NOT in wallet browser - realtime/polling handles sync
      setGameStatus(t("gameMultiplayer.connectingToOpponent"));
    } else if (effectiveConnectionState === "connected" || inWalletBrowser) {
      // In wallet browsers, proceed even if still "connecting" - polling/realtime will sync
      setGameStatus(isActuallyMyTurn ? t("gameMultiplayer.yourTurn") : t("gameMultiplayer.opponentsTurn"));
    } else if (effectiveConnectionState === "disconnected") {
      setGameStatus(t("gameMultiplayer.connectionLost"));
    }
  }, [roomPlayers.length, effectiveConnectionState, isActuallyMyTurn, inWalletBrowser, t]);

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

      // Persist move to DB for ranked games (durable sync)
      if (isRankedGame && address) {
        persistMove(moveData, address);
      }

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

  const handleResign = useCallback(async () => {
    // 1. Send WebRTC message immediately for instant opponent UX
    sendResign();
    
    // 2. Update local UI optimistically - opponent wins, store their wallet
    const opponentWalletAddr = getOpponentWallet(roomPlayers, address);
    setWinnerWallet(opponentWalletAddr);
    setGameStatus(t("gameMultiplayer.youResignedLose"));
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
  }, [sendResign, play, t, forfeit, roomPlayers, address]);


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
    <GameErrorBoundary>
    <InAppBrowserRecovery roomPda={roomPda || ""} onResubscribeRealtime={resubscribeRealtime} bypassOverlay={true}>
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
              remainingTime={shouldShowTimer ? turnTimer.remainingTime : undefined}
              showTimer={shouldShowTimer}
            />
          </div>
        </div>

        {/* Main Content - HARD GATED: Only render game board when game can actually be played */}
        {/* For ranked games: requires bothReady + dice roll finalized */}
        {/* For casual games: requires dice roll finalized */}
        {canPlay ? (
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
                        flipped={effectiveColor === "b"}
                        playerColor={effectiveColor}
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
                        variant="destructive" 
                        onClick={handleResign}
                        disabled={isForfeiting}
                        className="text-xs">
                        {isForfeiting ? "Settling..." : <><Flag className="w-3 h-3 mr-1" />{t("gameMultiplayer.resign")}</>}
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
        ) : (
          /* Waiting state - show when game cannot be played yet */
          <div className="max-w-6xl mx-auto px-4 py-8 text-center">
            <div className="text-muted-foreground">
              {roomPlayers.length < 2 ? (
                <p>{t("gameMultiplayer.waitingForOpponent")}</p>
              ) : isRankedGame && !rankedGate.bothReady ? (
                <p>{t("gameSession.waitingForRulesAcceptance", "Waiting for rules acceptance...")}</p>
              ) : (
                <p>{t("gameMultiplayer.preparingGame", "Preparing game...")}</p>
              )}
            </div>
          </div>
        )}
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

      {/* RulesGate + DiceRollStart - RulesGate handles accept modal internally */}
      {(() => {
        // Don't require bothReady here - let RulesGate handle showing the accept modal
        const shouldShowRulesGate =
          roomPlayers.length >= 2 &&
          !!address &&
          !startRoll.isFinalized;

        if (isDebugEnabled()) {
          dbg("dice.gate", {
            game: "chess",
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
          opponentWallet={roomPlayers.find(p => isRealWallet(p) && !isSameWallet(p, address))}
          onAcceptRules={handleAcceptRules}
          onLeave={handleLeaveClick}
          isDataLoaded={isDataLoaded}
          startRollFinalized={startRoll.isFinalized}
        >
          {/* DiceRollStart - rendered based on shouldShowDice, not showDiceRoll */}
          {(!isRankedGame || rankedGate.bothReady) && (
            <DiceRollStart
              roomPda={roomPda || ""}
              myWallet={address}
              player1Wallet={roomPlayers[0]}
              player2Wallet={roomPlayers[1]}
              onComplete={startRoll.handleRollComplete}
              onLeave={handleLeaveClick}
              onForfeit={handleForfeitMatch}
              isLeaving={isLeaving}
              isForfeiting={isForfeiting}
            />
          )}
        </RulesGate>
        ) : null;
      })()}

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

      {/* Forfeit Confirmation Dialog (legacy - keeping for direct forfeit button) */}
      <ForfeitConfirmDialog
        open={showForfeitDialog}
        onOpenChange={setShowForfeitDialog}
        onConfirm={forfeit}
        isLoading={isForfeiting}
        gameType="2player"
        stakeSol={entryFeeSol}
      />
    </div>
    </InAppBrowserRecovery>
    </GameErrorBoundary>
  );
};

export default ChessGame;