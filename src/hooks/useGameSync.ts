import { useEffect, useState, useCallback, useRef } from "react";
import { useWatchContractEvent, useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";
import { useWallet } from "@/hooks/useWallet";

// Game move types for different games
export interface ChessMove {
  type: "chess";
  from: string;
  to: string;
  promotion?: string;
  fen: string;
  timestamp: number;
}

export interface DominoMove {
  type: "domino";
  tile: [number, number];
  position: "left" | "right";
  timestamp: number;
}

export interface BackgammonMove {
  type: "backgammon";
  from: number | "bar";
  to: number | "off";
  dice: [number, number];
  timestamp: number;
}

export type GameMove = ChessMove | DominoMove | BackgammonMove;

export interface GameState {
  roomId: string;
  players: string[];
  currentTurn: string;
  moves: GameMove[];
  startedAt: number;
  turnStartedAt: number;
  turnTimeSeconds: number;
  status: "waiting" | "playing" | "finished";
  winner?: string;
  playerGoesFirst?: boolean;
}

interface UseGameSyncOptions {
  roomId: string;
  gameType: "chess" | "dominos" | "backgammon" | "checkers" | "ludo";
  onOpponentMove?: (move: GameMove) => void;
  onGameEnd?: (winner: string) => void;
  onOpponentResign?: () => void;
  onDrawOffered?: () => void;
}

// Storage key for game state
const getStorageKey = (roomId: string) => `game_state_${roomId}`;
const getChannelName = (roomId: string) => `game_channel_${roomId}`;

export function useGameSync({
  roomId,
  gameType,
  onOpponentMove,
  onGameEnd,
  onOpponentResign,
  onDrawOffered,
}: UseGameSyncOptions) {
  const { toast } = useToast();
  const { play } = useSound();
  const { address } = useWallet();
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const lastMoveTimestamp = useRef<number>(0);

  const roomIdBigInt = BigInt(roomId);

  // Read room data from contract
  const { data: roomData, refetch: refetchRoom } = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoomView",
    args: [roomIdBigInt],
    query: { enabled: !!roomId },
  });

  // Read players from contract
  const { data: players, refetch: refetchPlayers } = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "playersOf",
    args: [roomIdBigInt],
    query: { enabled: !!roomId },
  });

  // Watch for room finished event
  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomFinished",
    onLogs(logs) {
      logs.forEach((log) => {
        const eventRoomId = (log as any).args?.roomId;
        const winner = (log as any).args?.winner;

        if (eventRoomId === roomIdBigInt) {
          const isWinner = winner?.toLowerCase() === address?.toLowerCase();
          play(isWinner ? "chess/win" : "chess/lose");
          toast({
            title: isWinner ? "You Won!" : "Game Over",
            description: isWinner
              ? "Congratulations! Winnings sent to your wallet."
              : "Better luck next time!",
          });
          onGameEnd?.(winner);
          setGameState((prev) =>
            prev ? { ...prev, status: "finished", winner } : null
          );
        }
      });
    },
  });

  // Watch for room cancelled
  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomCancelled",
    onLogs(logs) {
      logs.forEach((log) => {
        const eventRoomId = (log as any).args?.roomId;

        if (eventRoomId === roomIdBigInt) {
          toast({
            title: "Game Cancelled",
            description: "The room has been cancelled. Entry fees refunded.",
          });
          setGameState((prev) =>
            prev ? { ...prev, status: "finished" } : null
          );
        }
      });
    },
  });

  // Initialize BroadcastChannel for P2P sync
  useEffect(() => {
    if (!roomId || !address) return;

    const channel = new BroadcastChannel(getChannelName(roomId));
    channelRef.current = channel;
    setIsConnected(true);

    // Load existing state from localStorage
    const savedState = localStorage.getItem(getStorageKey(roomId));
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState) as GameState;
        setGameState(parsed);
        lastMoveTimestamp.current = parsed.moves.length > 0
          ? parsed.moves[parsed.moves.length - 1].timestamp
          : 0;
      } catch (e) {
        console.error("Failed to parse saved game state:", e);
      }
    }

    // Announce presence
    channel.postMessage({
      type: "presence",
      player: address,
      timestamp: Date.now(),
    });

    // Handle incoming messages
    channel.onmessage = (event) => {
      const data = event.data;

      switch (data.type) {
        case "presence":
          if (data.player?.toLowerCase() !== address?.toLowerCase()) {
            setOpponentConnected(true);
            // Respond to presence
            channel.postMessage({
              type: "presence_ack",
              player: address,
              timestamp: Date.now(),
            });
          }
          break;

        case "presence_ack":
          if (data.player?.toLowerCase() !== address?.toLowerCase()) {
            setOpponentConnected(true);
          }
          break;

        case "move":
          if (data.move && data.move.timestamp > lastMoveTimestamp.current) {
            lastMoveTimestamp.current = data.move.timestamp;
            setGameState((prev) => {
              if (!prev) return null;
              const newState = {
                ...prev,
                moves: [...prev.moves, data.move],
                currentTurn: data.nextTurn,
                turnStartedAt: Date.now(),
              };
              localStorage.setItem(getStorageKey(roomId), JSON.stringify(newState));
              return newState;
            });
            onOpponentMove?.(data.move);
            
            // Play sound based on game type
            if (gameType === "chess") {
              play("chess/move");
            } else if (gameType === "dominos") {
              play("domino/place");
            } else if (gameType === "backgammon") {
              play("backgammon/move");
            }
          }
          break;

        case "resign":
          if (data.player?.toLowerCase() !== address?.toLowerCase()) {
            onOpponentResign?.();
            toast({
              title: "Opponent Resigned",
              description: "Your opponent has resigned. You win!",
            });
          }
          break;

        case "draw_offer":
          if (data.player?.toLowerCase() !== address?.toLowerCase()) {
            onDrawOffered?.();
            toast({
              title: "Draw Offered",
              description: "Your opponent has offered a draw.",
            });
          }
          break;

        case "state_sync":
          // Sync full state from opponent
          if (data.state && data.timestamp > lastMoveTimestamp.current) {
            setGameState(data.state);
            localStorage.setItem(getStorageKey(roomId), JSON.stringify(data.state));
          }
          break;
      }
    };

    // Heartbeat for connection status
    const heartbeat = setInterval(() => {
      channel.postMessage({
        type: "heartbeat",
        player: address,
        timestamp: Date.now(),
      });
    }, 5000);

    return () => {
      clearInterval(heartbeat);
      channel.close();
      channelRef.current = null;
      setIsConnected(false);
    };
  }, [roomId, address, gameType, onOpponentMove, onOpponentResign, onDrawOffered, play, toast]);

  // Initialize game state when room data is available
  useEffect(() => {
    if (!roomData || !players || !address) return;

    const status = roomData[5] as RoomStatus;
    const turnTimeSeconds = Number(roomData[7]);

    if (status === RoomStatus.Started && !gameState) {
      const initialState: GameState = {
        roomId,
        players: players as string[],
        currentTurn: players[0] as string,
        moves: [],
        startedAt: Date.now(),
        turnStartedAt: Date.now(),
        turnTimeSeconds,
        status: "playing",
      };
      setGameState(initialState);
      localStorage.setItem(getStorageKey(roomId), JSON.stringify(initialState));
    }
  }, [roomData, players, address, roomId, gameState]);

  // Send a move to opponent
  const sendMove = useCallback(
    (move: Omit<GameMove, "timestamp">) => {
      if (!channelRef.current || !address || !gameState) return;

      const fullMove = { ...move, timestamp: Date.now() } as GameMove;
      
      // Determine next turn
      const currentIndex = gameState.players.findIndex(
        (p) => p.toLowerCase() === address.toLowerCase()
      );
      const nextIndex = (currentIndex + 1) % gameState.players.length;
      const nextTurn = gameState.players[nextIndex];

      // Update local state
      const newState = {
        ...gameState,
        moves: [...gameState.moves, fullMove],
        currentTurn: nextTurn,
        turnStartedAt: Date.now(),
      };
      setGameState(newState);
      localStorage.setItem(getStorageKey(roomId), JSON.stringify(newState));
      lastMoveTimestamp.current = fullMove.timestamp;

      // Broadcast to opponent
      channelRef.current.postMessage({
        type: "move",
        move: fullMove,
        nextTurn,
        timestamp: Date.now(),
      });
    },
    [address, gameState, roomId]
  );

  // Send resignation
  const sendResign = useCallback(() => {
    if (!channelRef.current || !address) return;

    channelRef.current.postMessage({
      type: "resign",
      player: address,
      timestamp: Date.now(),
    });
  }, [address]);

  // Offer draw
  const sendDrawOffer = useCallback(() => {
    if (!channelRef.current || !address) return;

    channelRef.current.postMessage({
      type: "draw_offer",
      player: address,
      timestamp: Date.now(),
    });

    toast({
      title: "Draw Offered",
      description: "Waiting for opponent's response...",
    });
  }, [address, toast]);

  // Accept draw
  const acceptDraw = useCallback(() => {
    if (!channelRef.current || !address) return;

    channelRef.current.postMessage({
      type: "draw_accepted",
      player: address,
      timestamp: Date.now(),
    });
  }, [address]);

  // Request state sync from opponent
  const requestSync = useCallback(() => {
    if (!channelRef.current) return;

    channelRef.current.postMessage({
      type: "sync_request",
      timestamp: Date.now(),
    });
  }, []);

  // Check if it's current player's turn
  const isMyTurn = gameState?.currentTurn?.toLowerCase() === address?.toLowerCase();

  // Calculate remaining time
  const getRemainingTime = useCallback(() => {
    if (!gameState || gameState.status !== "playing") return 0;
    const elapsed = Math.floor((Date.now() - gameState.turnStartedAt) / 1000);
    return Math.max(0, gameState.turnTimeSeconds - elapsed);
  }, [gameState]);

  return {
    gameState,
    isConnected,
    opponentConnected,
    isMyTurn,
    sendMove,
    sendResign,
    sendDrawOffer,
    acceptDraw,
    requestSync,
    getRemainingTime,
    refetchRoom,
    refetchPlayers,
  };
}

// Hook for turn timer
export function useTurnTimer(
  isMyTurn: boolean,
  turnTimeSeconds: number,
  turnStartedAt: number,
  onTimeout: () => void
) {
  const [remainingTime, setRemainingTime] = useState(turnTimeSeconds);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!isMyTurn) {
      setRemainingTime(turnTimeSeconds);
      return;
    }

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - turnStartedAt) / 1000);
      const remaining = Math.max(0, turnTimeSeconds - elapsed);
      setRemainingTime(remaining);

      if (remaining === 0) {
        onTimeout();
      }
    };

    updateTimer();
    timerRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isMyTurn, turnTimeSeconds, turnStartedAt, onTimeout]);

  return remainingTime;
}
