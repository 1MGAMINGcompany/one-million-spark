// Push Protocol Signaling for cross-device WebRTC connections
import * as PushAPI from "@pushprotocol/restapi";
import { CONSTANTS } from "@pushprotocol/restapi";
import { ethers } from "ethers";

export const PUSH_ENV = CONSTANTS.ENV.PROD;
const SIGNAL_TYPE = "1M_WEBRTC_SIGNAL";

export interface PushSignal {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

// Create a Push Protocol user instance for signaling
export async function initPushUser(address: string): Promise<PushAPI.PushAPI> {
  const provider = (window as any).ethereum;
  if (!provider) {
    throw new Error("No wallet provider found");
  }

  // Create ethers provider and signer
  const { BrowserProvider } = await import("ethers");
  const web3Provider = new BrowserProvider(provider);
  const signer = await web3Provider.getSigner();

  // Initialize Push user with ethers signer
  const user = await PushAPI.PushAPI.initialize(signer, {
    env: PUSH_ENV,
  });
  
  return user;
}

// Send a signal to a peer via Push Protocol chat
export async function sendPushSignal(
  pushUser: PushAPI.PushAPI,
  signal: PushSignal
): Promise<boolean> {
  try {
    const messageContent = JSON.stringify({
      signalType: SIGNAL_TYPE,
      ...signal,
    });

    await pushUser.chat.send(signal.to, {
      type: "Text",
      content: messageContent,
    });

    console.log(`[PushSignal] Sent ${signal.type} to ${signal.to}`);
    return true;
  } catch (error) {
    console.error("[PushSignal] Failed to send signal:", error);
    return false;
  }
}

// Listen for incoming signals via Push Protocol stream
export async function startPushSignalListener(
  pushUser: PushAPI.PushAPI,
  roomId: string,
  localAddress: string,
  onSignal: (signal: PushSignal) => void
): Promise<() => void> {
  const processedTimestamps = new Set<number>();

  // Create a stream to listen for incoming messages
  const stream = await pushUser.initStream([PushAPI.STREAM.CHAT]);

  stream.on(PushAPI.STREAM.CHAT, (message: any) => {
    try {
      // Parse the message content
      const content = message.message?.content || message.payload?.body;
      if (!content) return;

      const parsed = JSON.parse(content);

      // Check if it's a WebRTC signal for our room
      if (
        parsed.signalType !== SIGNAL_TYPE ||
        parsed.roomId !== roomId ||
        parsed.to?.toLowerCase() !== localAddress.toLowerCase()
      ) {
        return;
      }

      // Deduplicate by timestamp
      if (processedTimestamps.has(parsed.timestamp)) return;
      processedTimestamps.add(parsed.timestamp);

      console.log(`[PushSignal] Received ${parsed.type} from ${parsed.from}`);

      const signal: PushSignal = {
        type: parsed.type,
        roomId: parsed.roomId,
        from: parsed.from,
        to: parsed.to,
        payload: parsed.payload,
        timestamp: parsed.timestamp,
      };

      onSignal(signal);
    } catch (e) {
      // Not a signal message, ignore
    }
  });

  await stream.connect();
  console.log("[PushSignal] Stream connected, listening for signals");

  // Return cleanup function
  return () => {
    stream.disconnect();
    console.log("[PushSignal] Stream disconnected");
  };
}

// Fetch recent chat history to catch any missed signals
export async function fetchRecentSignals(
  pushUser: PushAPI.PushAPI,
  peerAddress: string,
  roomId: string,
  localAddress: string,
  maxAgeMs: number = 60000
): Promise<PushSignal[]> {
  try {
    const chats = await pushUser.chat.history(peerAddress, { limit: 20 });
    const now = Date.now();
    const signals: PushSignal[] = [];

    for (const chat of chats) {
      try {
        const content = chat.messageContent || chat.cid;
        if (!content) continue;

        const parsed = JSON.parse(content);

        if (
          parsed.signalType !== SIGNAL_TYPE ||
          parsed.roomId !== roomId ||
          parsed.to?.toLowerCase() !== localAddress.toLowerCase()
        ) {
          continue;
        }

        if (now - parsed.timestamp > maxAgeMs) continue;

        signals.push({
          type: parsed.type,
          roomId: parsed.roomId,
          from: parsed.from,
          to: parsed.to,
          payload: parsed.payload,
          timestamp: parsed.timestamp,
        });
      } catch (e) {
        // Not a valid signal, skip
      }
    }

    return signals.sort((a, b) => a.timestamp - b.timestamp);
  } catch (error) {
    console.error("[PushSignal] Failed to fetch history:", error);
    return [];
  }
}
