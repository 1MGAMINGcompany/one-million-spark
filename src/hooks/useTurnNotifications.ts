import { useCallback, useEffect, useRef, useState } from "react";
import { showBrowserNotification, requestNotificationPermission } from "@/lib/pushNotifications";
import { useSound } from "@/contexts/SoundContext";
import { toast } from "@/hooks/use-toast";

// Safe helper: wallet webviews may not define Notification
function getNotificationAPI(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).Notification ?? null;
}

export type PlayerStatus = "active" | "finished" | "disconnected";

export interface TurnPlayer {
  address: string;
  name?: string;
  color?: string;
  status: PlayerStatus;
  seatIndex: number;
}

export interface TurnEvent {
  id: string;
  type: "turn_change" | "player_moved" | "player_finished" | "player_disconnected";
  playerAddress: string;
  playerName?: string;
  playerColor?: string;
  timestamp: number;
  message: string;
}

interface UseTurnNotificationsOptions {
  gameName: string;
  roomId: string;
  players: TurnPlayer[];
  activeTurnAddress: string | null;
  myAddress: string | undefined;
  enabled?: boolean;
}

const MAX_HISTORY_EVENTS = 10;

export function useTurnNotifications({
  gameName,
  roomId,
  players,
  activeTurnAddress,
  myAddress,
  enabled = true,
}: UseTurnNotificationsOptions) {
  const { play } = useSound();
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => {
    const stored = localStorage.getItem("turnNotificationsEnabled");
    return stored !== null ? stored === "true" : true;
  });
  const [hasPermission, setHasPermission] = useState(false);
  const [turnHistory, setTurnHistory] = useState<TurnEvent[]>([]);
  const lastActiveTurnRef = useRef<string | null>(null);
  const hasNotifiedRef = useRef<Set<string>>(new Set());

  // Check notification permission on mount (safe for wallet webviews)
  useEffect(() => {
    const N = getNotificationAPI();
    setHasPermission(!!N && N.permission === "granted");
  }, []);

  // Persist notifications enabled preference
  useEffect(() => {
    localStorage.setItem("turnNotificationsEnabled", String(notificationsEnabled));
  }, [notificationsEnabled]);

  // Get current active player info
  const activePlayer = players.find((p) => p.address === activeTurnAddress);
  const isMyTurn = Boolean(myAddress && activeTurnAddress === myAddress);

  // Get next player in rotation (skipping finished/disconnected)
  const getNextActivePlayer = useCallback(
    (currentAddress: string): TurnPlayer | null => {
      const activePlayers = players.filter((p) => p.status === "active");
      if (activePlayers.length === 0) return null;

      const currentIndex = activePlayers.findIndex((p) => p.address === currentAddress);
      if (currentIndex === -1) return activePlayers[0];

      const nextIndex = (currentIndex + 1) % activePlayers.length;
      return activePlayers[nextIndex];
    },
    [players]
  );

  // Get player display name
  const getPlayerDisplayName = useCallback((player: TurnPlayer): string => {
    if (player.name) return player.name;
    if (player.color) return `${player.color} Player`;
    return `Player ${player.seatIndex + 1}`;
  }, []);

  // Add event to history
  const addTurnEvent = useCallback((event: Omit<TurnEvent, "id" | "timestamp">) => {
    const newEvent: TurnEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
    };

    setTurnHistory((prev) => {
      const updated = [newEvent, ...prev].slice(0, MAX_HISTORY_EVENTS);
      return updated;
    });
  }, []);

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<boolean> => {
    try {
      const granted = await requestNotificationPermission();
      setHasPermission(granted);
      return granted;
    } catch (error) {
      console.error("[TurnNotifications] Permission request failed:", error);
      setHasPermission(false);
      return false;
    }
  }, []);

  // Enable notifications with permission request
  const enableNotifications = useCallback(async () => {
    try {
      const granted = await requestPermission();
      if (granted) {
        setNotificationsEnabled(true);
        toast({
          title: "Notifications enabled",
          description: "You'll be notified when it's your turn.",
        });
        return true;
      }
      // Permission was denied
      toast({
        title: "Notifications blocked",
        description: "Please enable notifications in your browser settings to receive turn alerts.",
        variant: "destructive",
      });
      return false;
    } catch (error) {
      console.error("[TurnNotifications] Enable notifications failed:", error);
      toast({
        title: "Notification error",
        description: "Failed to enable notifications. Please try again.",
        variant: "destructive",
      });
      return false;
    }
  }, [requestPermission]);

  // Disable notifications
  const disableNotifications = useCallback(() => {
    setNotificationsEnabled(false);
  }, []);

  // Toggle notifications
  const toggleNotifications = useCallback(async () => {
    if (notificationsEnabled) {
      disableNotifications();
    } else {
      await enableNotifications();
    }
  }, [notificationsEnabled, enableNotifications, disableNotifications]);

  // Send turn notification
  const sendTurnNotification = useCallback(
    (isMyTurnNow: boolean) => {
      if (!enabled || !notificationsEnabled || !hasPermission) return;
      if (!isMyTurnNow) return;

      const notificationKey = `${roomId}-${activeTurnAddress}-${Date.now()}`;
      if (hasNotifiedRef.current.has(notificationKey)) return;
      hasNotifiedRef.current.add(notificationKey);

      // Play notification sound
      play("ui/notify");

      // Show browser notification
      const playerCount = players.filter((p) => p.status === "active").length;
      showBrowserNotification(
        "1M GAMING — Your Turn",
        `It's your move in ${gameName}. ${playerCount}-player game.`,
        {
          tag: `turn-${roomId}`,
          data: { roomId, gameName },
          requireInteraction: false,
        }
      );
    },
    [enabled, notificationsEnabled, hasPermission, roomId, activeTurnAddress, players, gameName, play]
  );

  // Watch for turn changes
  useEffect(() => {
    if (!enabled || !activeTurnAddress) return;
    if (lastActiveTurnRef.current === activeTurnAddress) return;

    const previousTurn = lastActiveTurnRef.current;
    lastActiveTurnRef.current = activeTurnAddress;

    // Skip initial mount
    if (previousTurn === null) return;

    const newActivePlayer = players.find((p) => p.address === activeTurnAddress);
    if (!newActivePlayer) return;

    const isMyTurnNow = myAddress === activeTurnAddress;

    // Add turn change event to history
    addTurnEvent({
      type: "turn_change",
      playerAddress: activeTurnAddress,
      playerName: newActivePlayer.name,
      playerColor: newActivePlayer.color,
      message: isMyTurnNow
        ? `Your turn in ${gameName}`
        : `${getPlayerDisplayName(newActivePlayer)}'s turn`,
    });

    // Send notification only to the active player
    sendTurnNotification(isMyTurnNow);
  }, [
    enabled,
    activeTurnAddress,
    myAddress,
    players,
    gameName,
    addTurnEvent,
    getPlayerDisplayName,
    sendTurnNotification,
  ]);

  // Record player move
  const recordPlayerMove = useCallback(
    (playerAddress: string, moveDescription?: string) => {
      const player = players.find((p) => p.address === playerAddress);
      if (!player) return;

      addTurnEvent({
        type: "player_moved",
        playerAddress,
        playerName: player.name,
        playerColor: player.color,
        message: moveDescription || `${getPlayerDisplayName(player)} moved`,
      });
    },
    [players, addTurnEvent, getPlayerDisplayName]
  );

  // Record player finished
  const recordPlayerFinished = useCallback(
    (playerAddress: string) => {
      const player = players.find((p) => p.address === playerAddress);
      if (!player) return;

      addTurnEvent({
        type: "player_finished",
        playerAddress,
        playerName: player.name,
        playerColor: player.color,
        message: `${getPlayerDisplayName(player)} finished`,
      });
    },
    [players, addTurnEvent, getPlayerDisplayName]
  );

  // Record player disconnected
  const recordPlayerDisconnected = useCallback(
    (playerAddress: string) => {
      const player = players.find((p) => p.address === playerAddress);
      if (!player) return;

      addTurnEvent({
        type: "player_disconnected",
        playerAddress,
        playerName: player.name,
        playerColor: player.color,
        message: `${getPlayerDisplayName(player)} disconnected`,
      });
    },
    [players, addTurnEvent, getPlayerDisplayName]
  );

  // Get waiting message for non-active players
  const getWaitingMessage = useCallback((): string => {
    if (!activePlayer) return "Waiting...";
    return `Waiting for ${getPlayerDisplayName(activePlayer)}`;
  }, [activePlayer, getPlayerDisplayName]);

  // Clear old notification refs periodically
  useEffect(() => {
    const interval = setInterval(() => {
      hasNotifiedRef.current.clear();
    }, 60000); // Clear every minute
    return () => clearInterval(interval);
  }, []);

  return {
    // State
    isMyTurn,
    activePlayer,
    notificationsEnabled,
    hasPermission,
    turnHistory,

    // Computed
    waitingMessage: getWaitingMessage(),
    activePlayers: players.filter((p) => p.status === "active"),
    finishedPlayers: players.filter((p) => p.status === "finished"),

    // Actions
    enableNotifications,
    disableNotifications,
    toggleNotifications,
    requestPermission,
    recordPlayerMove,
    recordPlayerFinished,
    recordPlayerDisconnected,
    getNextActivePlayer,
    getPlayerDisplayName,
  };
}
