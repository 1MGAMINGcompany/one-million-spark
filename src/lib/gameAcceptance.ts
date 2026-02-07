/**
 * Game Acceptance and Session System
 * 
 * Players sign a message accepting the game rules before starting.
 * This creates cryptographic proof of rule acceptance and a session token for fast moves.
 */

import bs58 from "bs58";
import { supabase } from "@/integrations/supabase/client";

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
  
  const hashBuffer = await crypto.subtle.digest("SHA-256", data.buffer as ArrayBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  
  return Array.from(hashArray)
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
 * Action 1: Issue nonce from server and sign acceptance message
 * 
 * 1. Compute rulesHash
 * 2. Call issue_nonce RPC to get server-issued nonce
 * 3. Build message with nonce
 * 4. Sign message with wallet
 * 5. Return payload for verification
 */
export async function issueNonceAndSignAccept(
  signMessage: (message: Uint8Array) => Promise<Uint8Array>,
  roomPda: string,
  playerWallet: string,
  rules: RulesParams
): Promise<AcceptancePayload> {
  // 1. Compute rules hash
  const rulesHash = await computeRulesHash(rules);
  
  console.log("[gameAcceptance] Requesting nonce from server...");
  
  // 2. Call issue_nonce RPC to get server-issued nonce
  const { data: nonce, error: nonceError } = await supabase.rpc("issue_nonce", {
    p_room_pda: roomPda,
    p_wallet: playerWallet,
    p_rules_hash: rulesHash,
  });
  
  if (nonceError || !nonce) {
    console.error("[gameAcceptance] Failed to get nonce:", nonceError);
    throw new Error("Failed to get nonce from server");
  }
  
  console.log("[gameAcceptance] Got nonce:", nonce.slice(0, 8) + "...");
  
  // 3. Build message with server-issued nonce
  const timestamp = Date.now();
  const message = buildAcceptanceMessage(
    roomPda,
    playerWallet,
    rulesHash,
    nonce,
    timestamp
  );
  
  console.log("[gameAcceptance] Signing message:", message.slice(0, 50) + "...");
  
  // 4. Sign message with wallet
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await signMessage(messageBytes);
  const signature = bs58.encode(signatureBytes);
  
  // 5. Return payload
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

// Legacy export for backwards compatibility (deprecated)
export const signAcceptance = issueNonceAndSignAccept;
export const generateNonce = () => {
  console.warn("[gameAcceptance] generateNonce is deprecated, nonces are now server-issued");
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};
