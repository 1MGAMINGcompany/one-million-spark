import { useCallback, useState } from "react";
import {
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
  
  const [isInitialized] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(false);

  // Request browser notification permission only
  const requestPermission = useCallback(async () => {
    const hasPermission = await requestNotificationPermission();
    setNotificationPermission(hasPermission);
    return hasPermission;
  }, []);

  // Show local notification (no Push Protocol on Solana)
  const showNotification = useCallback(
    (type: GameNotificationType, title: string, message: string) => {
      // Play sound based on notification type
      switch (type) {
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
      toast({ title, description: message });

      // Show browser notification if permitted
      if (notificationPermission) {
        showBrowserNotification(title, message);
      }
    },
    [play, toast, notificationPermission]
  );

  // Stub methods for backwards compatibility
  const notifyOpponent = useCallback(async () => false, []);
  const notifyOpponentJoined = useCallback(async () => false, []);
  const notifyYourTurn = useCallback(async () => false, []);
  const notifyOpponentMoved = useCallback(async () => false, []);
  const notifyGameStarted = useCallback(async () => false, []);
  const notifyTimeoutWarning = useCallback(async () => false, []);
  const notifyGameEnded = useCallback(async () => false, []);

  return {
    isInitialized,
    notificationPermission,
    requestPermission,
    showNotification,
    notifyOpponent,
    notifyOpponentJoined,
    notifyYourTurn,
    notifyOpponentMoved,
    notifyGameStarted,
    notifyTimeoutWarning,
    notifyGameEnded,
  };
}
