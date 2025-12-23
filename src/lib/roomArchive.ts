/**
 * Local archive for confusing old rooms.
 * Stores archivedRoomPdas in localStorage and hides them from:
 * - active room banner
 * - room list
 */

const STORAGE_KEY = "archived_room_pdas";

/**
 * Get all archived room PDAs from localStorage.
 */
export function getArchivedRoomPdas(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Archive a room by PDA. This will hide it from active banner and room list.
 */
export function archiveRoom(pda: string): void {
  const archived = getArchivedRoomPdas();
  if (!archived.includes(pda)) {
    archived.push(pda);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(archived));
    console.log("[RoomArchive] Archived room:", pda);
  }
}

/**
 * Unarchive a room by PDA.
 */
export function unarchiveRoom(pda: string): void {
  const archived = getArchivedRoomPdas();
  const filtered = archived.filter(p => p !== pda);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  console.log("[RoomArchive] Unarchived room:", pda);
}

/**
 * Check if a room is archived.
 */
export function isRoomArchived(pda: string): boolean {
  return getArchivedRoomPdas().includes(pda);
}

/**
 * Clear all archived rooms.
 */
export function clearArchivedRooms(): void {
  localStorage.removeItem(STORAGE_KEY);
  console.log("[RoomArchive] Cleared all archived rooms");
}
