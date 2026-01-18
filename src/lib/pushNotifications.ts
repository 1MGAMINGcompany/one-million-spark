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
export async function initPushNotifications(address: string): Promise<any> {
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

// --------------------------------------------------------------------
// SAFE Browser Notification Helpers (wallet webviews may not define Notification)
// --------------------------------------------------------------------

function getNotificationAPI(): any | null {
  if (typeof window === "undefined") return null;
  return (window as any).Notification ?? null;
}

// Request browser notification permission (still works without Push Protocol)
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const N = getNotificationAPI();
    if (!N) {
      console.warn("[PushNotifications] Notification API not available in this browser");
      return false;
    }

    if (N.permission === "granted") return true;

    if (N.permission === "denied") {
      console.warn("[PushNotifications] Notifications were previously denied");
      return false;
    }

    // Request permission with timeout to prevent hanging on mobile
    const permissionPromise: Promise<NotificationPermission> = N.requestPermission();
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
): boolean {
  try {
    const N = getNotificationAPI();
    if (!N) return false;
    if (N.permission !== "granted") return false;

    // Some wallet webviews throw even when N exists — wrap in try/catch.
    new N(title, {
      body,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: "1m-gaming",
      ...options,
    });

    return true;
  } catch (err) {
    console.warn("[PushNotifications] showBrowserNotification failed:", err);
    return false;
  }
}
