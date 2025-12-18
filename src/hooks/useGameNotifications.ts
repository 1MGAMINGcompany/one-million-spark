import { useEffect, useState, useCallback, useRef } from "react";
import {
  initPushNotifications,
  sendGameNotification,
  startNotificationListener,
  requestNotificationPermission,
  showBrowserNotification,
  GameNotificationType,
} from "@/lib/pushNotifications";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";

interface UseGameNotificationsOptions {
  address: string | undefined;
  roomId: string;
  gameType: "chess" | "dominos" | "backgammon";
  opponentAddress: string | undefined;
  enabled?: boolean;
}

export function useGameNotifications({
  address,
  roomId,
  gameType,
  opponentAddress,
  enabled = true,
}: UseGameNotificationsOptions) {
  const { toast } = useToast();
  const { play } = useSound();
  
  const [pushUser, setPushUser] = useState<any | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Initialize Push Protocol
  useEffect(() => {
    if (!enabled || !address) return;

    const init = async () => {
      try {
        // Request browser notification permission
        const hasPermission = await requestNotificationPermission();
        setNotificationPermission(hasPermission);

        // Initialize Push user
        const user = await initPushNotifications(address);
        if (user) {
          setPushUser(user);
          setIsInitialized(true);

          // Start listening for notifications
          cleanupRef.current = await startNotificationListener(user, (notification) => {
            handleIncomingNotification(notification);
          });
        }
      } catch (error) {
        console.error("[GameNotifications] Initialization failed:", error);
      }
    };

    init();

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [enabled, address]);

  // Handle incoming notifications
  const handleIncomingNotification = useCallback(
    (notification: { type: GameNotificationType; title: string; message: string; roomId: string }) => {
      // Only process notifications for this room
      if (notification.roomId !== roomId) return;

      console.log("[GameNotifications] Processing:", notification.type);

      // Play sound based on notification type
      switch (notification.type) {
        case "opponent_joined":
          play("rooms/player-join");
          break;
        case "your_turn":
          play("ui/notify");
          break;
        case "game_started":
          play("rooms/match-start");
          break;
        case "timeout_warning":
          play("system/error");
          break;
        case "game_ended":
          play("chess/win");
          break;
      }

      // Show in-app toast
      toast({
        title: notification.title,
        description: notification.message,
      });

      // Show browser notification if permitted
      if (notificationPermission) {
        showBrowserNotification(notification.title, notification.message);
      }
    },
    [roomId, play, toast, notificationPermission]
  );

  // Send notification to opponent
  const notifyOpponent = useCallback(
    async (type: GameNotificationType, message: string, data?: Record<string, any>) => {
      if (!pushUser || !opponentAddress) {
        console.log("[GameNotifications] Cannot send: not initialized or no opponent");
        return false;
      }

      return await sendGameNotification(pushUser, opponentAddress, {
        type,
        roomId,
        gameType,
        message,
        data,
      });
    },
    [pushUser, opponentAddress, roomId, gameType]
  );

  // Convenience methods for common notifications
  const notifyOpponentJoined = useCallback(() => {
    return notifyOpponent("opponent_joined", "Your opponent has joined the game!");
  }, [notifyOpponent]);

  const notifyYourTurn = useCallback(() => {
    return notifyOpponent("your_turn", "It's your turn to move!");
  }, [notifyOpponent]);

  const notifyOpponentMoved = useCallback((moveDescription?: string) => {
    return notifyOpponent(
      "opponent_moved",
      moveDescription || "Your opponent has made a move."
    );
  }, [notifyOpponent]);

  const notifyGameStarted = useCallback(() => {
    return notifyOpponent("game_started", "The game has started. Good luck!");
  }, [notifyOpponent]);

  const notifyTimeoutWarning = useCallback((secondsRemaining: number) => {
    return notifyOpponent(
      "timeout_warning",
      `You have ${secondsRemaining} seconds remaining!`,
      { secondsRemaining }
    );
  }, [notifyOpponent]);

  const notifyGameEnded = useCallback((winner: string, reason: string) => {
    return notifyOpponent(
      "game_ended",
      `Game over! ${reason}`,
      { winner, reason }
    );
  }, [notifyOpponent]);

  return {
    isInitialized,
    notificationPermission,
    notifyOpponent,
    notifyOpponentJoined,
    notifyYourTurn,
    notifyOpponentMoved,
    notifyGameStarted,
    notifyTimeoutWarning,
    notifyGameEnded,
  };
}
