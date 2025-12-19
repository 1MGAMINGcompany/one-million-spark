// Push Protocol Notifications - Placeholder for Solana
// Push Protocol currently requires EVM signatures, so this is stubbed for Solana migration
// TODO: Implement Solana-compatible notifications when Push Protocol adds Solana support

export const PUSH_ENV = "prod";

// Notification types
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

// Stub: Initialize Push user for notifications
export async function initPushNotifications(
  address: string
): Promise<any> {
  console.warn("[PushNotifications] Push Protocol not yet available for Solana");
  return null;
}

// Stub: Send a game notification
export async function sendGameNotification(
  pushUser: any,
  recipientAddress: string,
  notification: GameNotification
): Promise<boolean> {
  console.warn("[PushNotifications] Push Protocol not yet available for Solana");
  return false;
}

// Stub: Start listening for notifications
export async function startNotificationListener(
  pushUser: any,
  onNotification: (notification: GameNotification & { title: string }) => void
): Promise<() => void> {
  console.warn("[PushNotifications] Push Protocol not yet available for Solana");
  return () => {};
}

// Request browser notification permission (still works without Push Protocol)
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    if (!("Notification" in window)) {
      console.warn("[PushNotifications] Browser doesn't support notifications");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      console.warn("[PushNotifications] Notifications were previously denied");
      return false;
    }

    // Request permission with timeout to prevent hanging on mobile
    const permissionPromise = Notification.requestPermission();
    const timeoutPromise = new Promise<NotificationPermission>((_, reject) => 
      setTimeout(() => reject(new Error("Permission request timeout")), 10000)
    );

    const permission = await Promise.race([permissionPromise, timeoutPromise]);
    return permission === "granted";
  } catch (error) {
    console.error("[PushNotifications] Error requesting permission:", error);
    return false;
  }
}

// Show browser notification (still works without Push Protocol)
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
