/**
 * Optimistic hiding of rooms that have been cancelled/forfeited.
 * Prevents UI flicker waiting for backend refresh cycle.
 */

import { dbg } from "./debugLog";

const STORAGE_KEY = "hidden_room_pdas_v1";

type HiddenRoomMap = { [roomPda: string]: number /* expiresAtMs */ };

/**
 * Get the stored hidden rooms map from localStorage.
 */
function getStoredMap(): HiddenRoomMap {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return {};
    return JSON.parse(stored) as HiddenRoomMap;
  } catch {
    return {};
  }
}

/**
 * Save the hidden rooms map to localStorage.
 */
function saveMap(map: HiddenRoomMap): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Hide a room by PDA for a specified TTL (default 60 seconds).
 * After the TTL expires, the room will reappear on next prune.
 */
export function hideRoomPda(roomPda: string, ttlMs: number = 60_000): void {
  const expiresAt = Date.now() + ttlMs;
  const map = getStoredMap();
  map[roomPda] = expiresAt;
  saveMap(map);
  dbg("rooms.hide.optimistic", { roomPda: roomPda.slice(0, 8), expiresAt });
}

/**
 * Check if a room is currently hidden (and not expired).
 * Also prunes expired entries during the check.
 */
export function isRoomHidden(roomPda: string): boolean {
  const now = Date.now();
  const map = getStoredMap();
  
  // Prune expired entries
  let changed = false;
  for (const pda of Object.keys(map)) {
    if (map[pda] < now) {
      delete map[pda];
      changed = true;
    }
  }
  
  if (changed) {
    saveMap(map);
  }
  
  return roomPda in map;
}

/**
 * Prune all expired entries from the hidden rooms map.
 * Call this on component mount for cleanup.
 */
export function pruneHiddenRooms(): void {
  const now = Date.now();
  const map = getStoredMap();
  
  let changed = false;
  for (const pda of Object.keys(map)) {
    if (map[pda] < now) {
      delete map[pda];
      changed = true;
    }
  }
  
  if (changed) {
    saveMap(map);
  }
}

/**
 * Clear all hidden rooms (useful for debugging).
 */
export function clearHiddenRooms(): void {
  localStorage.removeItem(STORAGE_KEY);
}
