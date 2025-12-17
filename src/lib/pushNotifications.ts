// Push Protocol Notifications for game events
import * as PushAPI from "@pushprotocol/restapi";
import { CONSTANTS } from "@pushprotocol/restapi";
import { ethers } from "ethers";

export const PUSH_ENV = CONSTANTS.ENV.PROD;

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

// Initialize Push user for notifications
export async function initPushNotifications(
  address: string
): Promise<PushAPI.PushAPI | null> {
  try {
    const provider = (window as any).ethereum;
    if (!provider) {
      console.warn("[PushNotifications] No wallet provider found");
      return null;
    }

    const { BrowserProvider } = await import("ethers");
    const web3Provider = new BrowserProvider(provider);
    const signer = await web3Provider.getSigner();

    const pushUser = await PushAPI.PushAPI.initialize(signer, {
      env: PUSH_ENV,
    });

    console.log("[PushNotifications] Initialized for:", address);
    return pushUser;
  } catch (error) {
    console.error("[PushNotifications] Init failed:", error);
    return null;
  }
}

// Send a game notification to a player
export async function sendGameNotification(
  pushUser: PushAPI.PushAPI,
  recipientAddress: string,
  notification: GameNotification
): Promise<boolean> {
  try {
    const title = getNotificationTitle(notification.type, notification.gameType);
    
    await pushUser.chat.send(recipientAddress, {
      type: "Text",
      content: JSON.stringify({
        notificationType: "1M_GAME_NOTIFICATION",
        ...notification,
        title,
        timestamp: Date.now(),
      }),
    });

    console.log(`[PushNotifications] Sent ${notification.type} to ${recipientAddress}`);
    return true;
  } catch (error) {
    console.error("[PushNotifications] Send failed:", error);
    return false;
  }
}

// Get notification title based on type
function getNotificationTitle(
  type: GameNotificationType,
  gameType: string
): string {
  const gameName = gameType.charAt(0).toUpperCase() + gameType.slice(1);
  
  switch (type) {
    case "opponent_joined":
      return `${gameName}: Opponent Joined!`;
    case "your_turn":
      return `${gameName}: Your Turn!`;
    case "opponent_moved":
      return `${gameName}: Opponent Moved`;
    case "game_started":
      return `${gameName}: Game Started!`;
    case "timeout_warning":
      return `${gameName}: Time Running Low!`;
    case "game_ended":
      return `${gameName}: Game Over`;
    default:
      return `${gameName} Notification`;
  }
}

// Start listening for incoming game notifications
export async function startNotificationListener(
  pushUser: PushAPI.PushAPI,
  onNotification: (notification: GameNotification & { title: string }) => void
): Promise<() => void> {
  const stream = await pushUser.initStream([PushAPI.STREAM.CHAT]);

  stream.on(PushAPI.STREAM.CHAT, (message: any) => {
    try {
      const content = message.message?.content || message.payload?.body;
      if (!content) return;

      const parsed = JSON.parse(content);

      if (parsed.notificationType !== "1M_GAME_NOTIFICATION") return;

      console.log("[PushNotifications] Received:", parsed.type);
      
      onNotification({
        type: parsed.type,
        roomId: parsed.roomId,
        gameType: parsed.gameType,
        message: parsed.message,
        title: parsed.title,
        data: parsed.data,
      });
    } catch (e) {
      // Not a notification message, ignore
    }
  });

  await stream.connect();
  console.log("[PushNotifications] Stream connected, listening for notifications");

  return () => {
    stream.disconnect();
    console.log("[PushNotifications] Stream disconnected");
  };
}

// Request browser notification permission
export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) {
    console.warn("[PushNotifications] Browser doesn't support notifications");
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

// Show browser notification
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
