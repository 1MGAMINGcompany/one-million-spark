// Push Protocol Signaling removed - Solana migration
// WebRTC signaling will use localStorage/BroadcastChannel only

export interface PushSignal {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

export async function initPushUser(address: string): Promise<null> {
  console.warn("Push signaling not available on Solana");
  return null;
}

export async function sendPushSignal(
  pushUser: any,
  signal: PushSignal
): Promise<boolean> {
  console.warn("Push signaling not available on Solana");
  return false;
}

export async function startPushSignalListener(
  pushUser: any,
  roomId: string,
  localAddress: string,
  onSignal: (signal: PushSignal) => void
): Promise<() => void> {
  console.warn("Push signaling not available on Solana");
  return () => {};
}

export async function fetchRecentSignals(
  pushUser: any,
  peerAddress: string,
  roomId: string,
  localAddress: string,
  maxAgeMs: number = 60000
): Promise<PushSignal[]> {
  console.warn("Push signaling not available on Solana");
  return [];
}
