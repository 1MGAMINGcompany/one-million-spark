// Push Protocol Signaling - Placeholder for Solana
// Push Protocol currently requires EVM signatures, so this is stubbed for Solana migration
// TODO: Implement Solana-compatible signaling when Push Protocol adds Solana support

export const PUSH_ENV = "prod";
const SIGNAL_TYPE = "1M_WEBRTC_SIGNAL";

export interface PushSignal {
  type: "offer" | "answer" | "ice-candidate";
  roomId: string;
  from: string;
  to: string;
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
  timestamp: number;
}

// Stub: Push Protocol not yet available for Solana
export async function initPushUser(address: string): Promise<any> {
  console.warn("[PushSignal] Push Protocol signaling not yet available for Solana");
  return null;
}

// Stub: Send signal via Push Protocol
export async function sendPushSignal(
  pushUser: any,
  signal: PushSignal
): Promise<boolean> {
  console.warn("[PushSignal] Push Protocol signaling not yet available for Solana");
  return false;
}

// Stub: Listen for signals
export async function startPushSignalListener(
  pushUser: any,
  roomId: string,
  localAddress: string,
  onSignal: (signal: PushSignal) => void
): Promise<() => void> {
  console.warn("[PushSignal] Push Protocol signaling not yet available for Solana");
  return () => {};
}

// Stub: Fetch recent signals
export async function fetchRecentSignals(
  pushUser: any,
  peerAddress: string,
  roomId: string,
  localAddress: string,
  maxAgeMs: number = 60000
): Promise<PushSignal[]> {
  console.warn("[PushSignal] Push Protocol signaling not yet available for Solana");
  return [];
}
