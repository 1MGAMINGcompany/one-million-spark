import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { RoomStatus, type RoomDisplay } from "@/lib/solana-program";

// Mainnet program ID
export const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

/**
 * Normalize a transaction signature to base58 format
 * Mobile Wallet Adapter may return:
 * - Uint8Array
 * - base64 string (contains +, /, =)
 * - base58 string (already correct)
 */
export function normalizeSignature(sig: string | Uint8Array): string {
  if (sig instanceof Uint8Array) {
    console.log("[Sig] Normalizing Uint8Array to base58");
    return bs58.encode(sig);
  }
  
  if (typeof sig === "string" && (sig.includes("+") || sig.includes("/") || sig.includes("="))) {
    console.log("[Sig] Detected base64 signature, converting to base58");
    const bytes = Uint8Array.from(atob(sig), c => c.charCodeAt(0));
    return bs58.encode(bytes);
  }
  
  return sig; // already base58
}

/**
 * Get the Room PDA from creator and roomId
 * Seeds: ["room", creator_pubkey, room_id_u64_le]
 */
export function getRoomPda(creator: PublicKey, roomId: number): PublicKey {
  const roomIdBuffer = Buffer.alloc(8);
  roomIdBuffer.writeBigUInt64LE(BigInt(roomId));
  
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("room"), creator.toBuffer(), roomIdBuffer],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Check if we're on a production domain (wallet signing allowed)
 * Returns true for 1mgaming.com and localhost (dev)
 */
export function isProductionDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname === "1mgaming.com" || 
         hostname === "www.1mgaming.com" || 
         hostname === "localhost" ||
         hostname === "127.0.0.1";
}

/**
 * Check if we're on a preview domain (wallet signing blocked)
 */
export function isPreviewDomain(): boolean {
  const hostname = window.location.hostname;
  return hostname.includes("lovable.app") || 
         hostname.includes("lovableproject.com") ||
         hostname.includes("webcontainer");
}

/**
 * Check if device is mobile based on user agent
 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Check if an injected Solana wallet is available
 */
export function hasInjectedSolanaWallet(): boolean {
  const win = window as any;
  return !!(win.solana?.isPhantom || win.solflare?.isSolflare || win.backpack?.isBackpack);
}

/**
 * Validate a base58 public key string
 * Returns the PublicKey if valid, null if invalid
 */
export function validatePublicKey(str: string): PublicKey | null {
  try {
    const decoded = decodeURIComponent(str);
    return new PublicKey(decoded);
  } catch {
    return null;
  }
}

/**
 * Check if a room is truly blocking (requires resolution before new games)
 * Only blocks for: Started + 2+ players + no winner settled
 * Does NOT block: Open rooms, Finished rooms, Cancelled rooms
 * 
 * CRITICAL: Also checks that room is not finished/cancelled to handle
 * stale cache scenarios after settlement.
 */
export function isBlockingRoom(room: RoomDisplay): boolean {
  // Cast to number to handle stale cache with finished/cancelled rooms
  const statusNum = room.status as number;
  
  // Never block on finished (3) or cancelled (4) rooms
  if (statusNum === 3 || statusNum === 4) {
    return false;
  }
  
  // Only block on Started rooms with 2+ players and no winner
  return (
    room.status === RoomStatus.Started &&
    room.playerCount >= 2 &&
    room.winner === null
  );
}
