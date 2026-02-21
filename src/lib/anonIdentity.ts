/**
 * Anonymous identity for free matchmaking (no sign-in required).
 * Stores a persistent UUID and optional display name in localStorage.
 */

const ANON_ID_KEY = 'qm_anon_id';
const DISPLAY_NAME_KEY = 'qm_display_name';
const ACTIVE_ROOM_KEY = 'qm_active_room';

/** Get or create a persistent anonymous player ID */
export function getAnonId(): string {
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

/** Get the last 4 chars of anon ID for default display name */
export function getDefaultGuestName(): string {
  const id = getAnonId();
  return `Guest-${id.slice(-4).toUpperCase()}`;
}

/** Get the user's chosen display name or default Guest-XXXX */
export function getDisplayName(): string {
  return localStorage.getItem(DISPLAY_NAME_KEY) || getDefaultGuestName();
}

/** Set a custom display name */
export function setDisplayName(name: string): void {
  const trimmed = name.trim().slice(0, 20);
  if (trimmed) {
    localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  }
}

/** Save active free room PDA for auto-rejoin */
export function setActiveRoom(roomPda: string): void {
  localStorage.setItem(ACTIVE_ROOM_KEY, roomPda);
}

/** Get active free room PDA */
export function getActiveRoom(): string | null {
  return localStorage.getItem(ACTIVE_ROOM_KEY);
}

/** Clear active free room (on match end / cancel) */
export function clearActiveRoom(): void {
  localStorage.removeItem(ACTIVE_ROOM_KEY);
}
