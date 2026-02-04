/**
 * Deterministic seat assignment helper
 * 
 * Seat is ALWAYS derived from room.players[] order:
 * - players[0] => creator => white/gold (seat 0)
 * - players[1] => joiner => black/obsidian (seat 1)
 * 
 * This prevents "both white" issues when wallet is temporarily disconnected.
 * 
 * IMPORTANT: Solana Base58 addresses are case-sensitive - use isSameWallet for comparisons
 */
import { isSameWallet } from "./walletUtils";
import { short } from "./safe";

export interface SeatInfo {
  seatIndex: number;
  isCreator: boolean;
  color: "gold" | "obsidian" | "white" | "black";
  /** For Ludo 4-player games */
  ludoColor: "gold" | "ruby" | "emerald" | "sapphire";
  /** Whether seat assignment is valid (wallet found in room) */
  isValid: boolean;
}

const LUDO_COLORS = ["gold", "ruby", "emerald", "sapphire"] as const;

/**
 * Get seat assignment from room players array
 * 
 * @param roomPlayers Array of player wallet addresses from on-chain room
 * @param walletPubkey Current user's wallet public key
 * @returns SeatInfo with deterministic assignment, or invalid if wallet not in room
 */
export function getSeat(
  roomPlayers: string[],
  walletPubkey: string | undefined
): SeatInfo {
  // Default invalid seat
  const invalidSeat: SeatInfo = {
    seatIndex: -1,
    isCreator: false,
    color: "obsidian",
    ludoColor: "gold",
    isValid: false,
  };

  if (!walletPubkey || !roomPlayers || roomPlayers.length === 0) {
    console.log("[getSeat] Invalid input - wallet or players missing", {
      hasWallet: !!walletPubkey,
      playersCount: roomPlayers?.length ?? 0,
    });
    return invalidSeat;
  }

  // Use isSameWallet for proper Base58 comparison (no toLowerCase)
  const seatIndex = roomPlayers.findIndex(
    (p) => isSameWallet(p, walletPubkey)
  );

  if (seatIndex === -1) {
    console.log("[getSeat] Wallet not found in room players", {
      wallet: short(walletPubkey),
      players: roomPlayers.map((p) => short(p)),
    });
    return invalidSeat;
  }

  // Seat 0 = creator = white/gold
  // Seat 1 = joiner = black/obsidian
  const isCreator = seatIndex === 0;
  const color = isCreator ? "gold" : "obsidian";
  const ludoColor = LUDO_COLORS[seatIndex] ?? "gold";

  console.log("[getSeat] Seat assigned", {
    wallet: short(walletPubkey),
    seatIndex,
    isCreator,
    color,
  });

  return {
    seatIndex,
    isCreator,
    color,
    ludoColor,
    isValid: true,
  };
}

/**
 * Get chess-specific color assignment
 */
export function getChessSeat(
  roomPlayers: string[],
  walletPubkey: string | undefined
): { color: "w" | "b"; isValid: boolean } {
  const seat = getSeat(roomPlayers, walletPubkey);
  return {
    color: seat.seatIndex === 0 ? "w" : "b",
    isValid: seat.isValid,
  };
}

/**
 * Get backgammon-specific role assignment
 * "player" = gold (seat 0), "ai" = black (seat 1)
 */
export function getBackgammonSeat(
  roomPlayers: string[],
  walletPubkey: string | undefined
): { role: "player" | "ai"; isValid: boolean } {
  const seat = getSeat(roomPlayers, walletPubkey);
  return {
    role: seat.seatIndex === 0 ? "player" : "ai",
    isValid: seat.isValid,
  };
}
