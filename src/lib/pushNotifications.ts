// Push Protocol Notifications removed - Solana migration

export type GameNotificationType = 
  | "opponent_joined"
  | "your_turn"
  | "opponent_moved"
  | "game_started"
  | "timeout_warning"
  | "game_ended";

interface GameNotification {
  type: GameNotificationType;
  roomId: string;
  gameType: "chess" | "dominos" | "backgammon";
  message: string;
  data?: Record<string, any>;
}

export async function initPushNotifications(address: string): Promise<null> {
  console.warn("Push notifications not available on Solana");
  return null;
}

export async function sendGameNotification(
  pushUser: any,
  recipientAddress: string,
  notification: GameNotification
): Promise<boolean> {
  console.warn("Push notifications not available on Solana");
  return false;
}

export async function startNotificationListener(
  pushUser: any,
  onNotification: (notification: GameNotification & { title: string }) => void
): Promise<() => void> {
  console.warn("Push notifications not available on Solana");
  return () => {};
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    return false;
  }
  if (Notification.permission === "granted") {
    return true;
  }
  if (Notification.permission !== "denied") {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  }
  return false;
}

export function showBrowserNotification(
  title: string,
  body: string,
  options?: NotificationOptions
): void {
  if (Notification.permission === "granted") {
    new Notification(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "1m-gaming",
      ...options,
    });
  }
}
