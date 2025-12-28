/**
 * Game Acceptance and Session System
 * 
 * Players sign a message accepting the game rules before starting.
 * This creates cryptographic proof of rule acceptance and a session token for fast moves.
 */

import bs58 from "bs58";

export interface RulesParams {
  roomPda: string;
  gameType: number;
  mode: "casual" | "ranked";
  maxPlayers: number;
  stakeLamports: number;
  feeBps: number;
  turnTimeSeconds: number;
  forfeitPolicy: string;
  version: number;
}

export interface AcceptancePayload {
  roomPda: string;
  playerWallet: string;
  rulesHash: string;
  nonce: string;
  timestamp: number;
  signature: string;
}

export interface SessionInfo {
  sessionToken: string;
  expiresAt: string;
  roomPda: string;
  rulesHash: string;
}

// Ordered keys for stable JSON serialization
const RULES_KEYS: (keyof RulesParams)[] = [
  "roomPda",
  "gameType",
  "mode",
  "maxPlayers",
  "stakeLamports",
  "feeBps",
  "turnTimeSeconds",
  "forfeitPolicy",
  "version",
];

/**
 * Compute SHA-256 hash of rules with stable key ordering
 */
export async function computeRulesHash(rules: RulesParams): Promise<string> {
  const orderedObj: Record<string, unknown> = {};
  for (const key of RULES_KEYS) {
    orderedObj[key] = rules[key];
  }
  
  const jsonString = JSON.stringify(orderedObj);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a random nonce for replay protection
 */
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Build the acceptance message to be signed
 */
export function buildAcceptanceMessage(
  roomPda: string,
  playerWallet: string,
  rulesHash: string,
  nonce: string,
  timestamp: number
): string {
  return `1MG_ACCEPT_V1|${roomPda}|${playerWallet}|${rulesHash}|${nonce}|${timestamp}`;
}

/**
 * Create default rules from room data
 */
export function createRulesFromRoom(
  roomPda: string,
  gameType: number,
  maxPlayers: number,
  stakeLamports: number,
  mode: "casual" | "ranked" = "casual"
): RulesParams {
  return {
    roomPda,
    gameType,
    mode,
    maxPlayers,
    stakeLamports,
    feeBps: 500, // 5% fee
    turnTimeSeconds: 300, // 5 minutes per turn
    forfeitPolicy: "miss_3_turns_loss",
    version: 1,
  };
}

/**
 * Sign the acceptance message using a Solana wallet
 */
export async function signAcceptance(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  roomPda: string,
  playerWallet: string,
  rules: RulesParams
): Promise<AcceptancePayload> {
  const rulesHash = await computeRulesHash(rules);
  const nonce = generateNonce();
  const timestamp = Date.now();
  
  const message = buildAcceptanceMessage(
    roomPda,
    playerWallet,
    rulesHash,
    nonce,
    timestamp
  );
  
  console.log("[gameAcceptance] Signing message:", message.slice(0, 50) + "...");
  
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await signMessage(messageBytes);
  const signature = bs58.encode(signatureBytes);
  
  return {
    roomPda,
    playerWallet,
    rulesHash,
    nonce,
    timestamp,
    signature,
  };
}

/**
 * Store session info in localStorage for persistence
 */
export function storeSession(session: SessionInfo): void {
  const key = `1mg_session_${session.roomPda}`;
  localStorage.setItem(key, JSON.stringify(session));
}

/**
 * Retrieve stored session for a room
 */
export function getStoredSession(roomPda: string): SessionInfo | null {
  const key = `1mg_session_${roomPda}`;
  const stored = localStorage.getItem(key);
  
  if (!stored) return null;
  
  try {
    const session = JSON.parse(stored) as SessionInfo;
    
    // Check if expired
    if (new Date(session.expiresAt) < new Date()) {
      localStorage.removeItem(key);
      return null;
    }
    
    return session;
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

/**
 * Clear session for a room
 */
export function clearSession(roomPda: string): void {
  const key = `1mg_session_${roomPda}`;
  localStorage.removeItem(key);
}

/**
 * Check if a session is still valid
 */
export function isSessionValid(session: SessionInfo | null): boolean {
  if (!session) return false;
  return new Date(session.expiresAt) > new Date();
}
