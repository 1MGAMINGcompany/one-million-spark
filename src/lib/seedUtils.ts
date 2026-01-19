import { keccak256, toHex, hexToBytes } from "viem";

/**
 * Generate a cryptographically secure random secret (32 bytes)
 * Returns hex string with 0x prefix
 */
export function generateRandomSecret(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes) as `0x${string}`;
}

/**
 * Compute commitment hash from secret
 * commitment = keccak256(secret)
 */
export function computeCommitment(secret: `0x${string}`): `0x${string}` {
  return keccak256(secret);
}

/**
 * Store secret in localStorage
 * Key format: seedSecret:${roomId}:${walletAddress}
 * NOTE: Use trim only - Solana Base58 addresses are case-sensitive
 */
export function storeSecret(roomId: string, walletAddress: string, secret: `0x${string}`): void {
  const key = `seedSecret:${roomId}:${walletAddress.trim()}`;
  localStorage.setItem(key, secret);
}

/**
 * Retrieve secret from localStorage
 * Returns null if not found
 * NOTE: Use trim only - Solana Base58 addresses are case-sensitive
 */
export function getStoredSecret(roomId: string, walletAddress: string): `0x${string}` | null {
  const key = `seedSecret:${roomId}:${walletAddress.trim()}`;
  const secret = localStorage.getItem(key);
  return secret ? (secret as `0x${string}`) : null;
}

/**
 * Remove secret from localStorage after successful reveal
 * NOTE: Use trim only - Solana Base58 addresses are case-sensitive
 */
export function clearStoredSecret(roomId: string, walletAddress: string): void {
  const key = `seedSecret:${roomId}:${walletAddress.trim()}`;
  localStorage.removeItem(key);
}

/**
 * Convert finalSeedHash (bytes32) to integer seed for game engine
 * Takes first 4 bytes, keeps in 31-bit range for safe integer operations
 */
export function seedIntFromFinalSeedHash(finalSeedHash: `0x${string}`): number {
  // Take first 4 bytes of bytes32 (8 hex chars after 0x prefix)
  const first4Hex = finalSeedHash.slice(2, 10);
  const n = parseInt(first4Hex, 16) >>> 0; // Ensure unsigned
  return n & 0x7fffffff; // Keep in 31-bit range
}

/**
 * Store finalized seed hash for room (for replay/verifiability)
 */
export function storeFinalSeedHash(roomId: string, finalSeedHash: `0x${string}`): void {
  const key = `finalSeed:${roomId}`;
  localStorage.setItem(key, finalSeedHash);
}

/**
 * Retrieve finalized seed hash for room
 */
export function getStoredFinalSeedHash(roomId: string): `0x${string}` | null {
  const key = `finalSeed:${roomId}`;
  const hash = localStorage.getItem(key);
  return hash ? (hash as `0x${string}`) : null;
}

/**
 * Check if a hex string is a valid bytes32
 */
export function isValidBytes32(hex: string): hex is `0x${string}` {
  return /^0x[a-fA-F0-9]{64}$/.test(hex);
}

/**
 * Format bytes32 for display (shortened)
 */
export function shortenBytes32(hash: `0x${string}`): string {
  return `${hash.slice(0, 10)}...${hash.slice(-8)}`;
}

/**
 * Creates a deterministic hash from a string seed
 */
export function hashSeed(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Linear Congruential Generator for deterministic random numbers
 */
export function createSeededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Deterministic shuffle using a seeded random function
 * Same seed + same array = same result on all devices
 */
export function seededShuffle<T>(array: T[], seed: string): T[] {
  const arr = [...array];
  const random = createSeededRandom(seed);
  
  // Fisher-Yates shuffle with seeded random
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  
  return arr;
}
