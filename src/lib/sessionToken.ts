/**
 * Session Token Discovery and Auth Helpers
 * 
 * Provides universal session token lookup for authenticated edge function calls.
 * Tokens are stored in localStorage with various patterns from different flows.
 */

// Validate UUID-like token format (prevents base58 strings from being used)
function isUuidLike(str: string): boolean {
  return /^[a-f0-9]{8}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{4}-?[a-f0-9]{12}$/i.test(str) ||
         /^[a-f0-9]{32,64}$/i.test(str); // Also accept hex tokens
}

// Extract token from stored value (handles raw strings and JSON objects)
function extractTokenFromStoredValue(value: string | null): string | null {
  if (!value) return null;

  // Raw string token
  if (isUuidLike(value)) return value;

  // Try parsing as JSON
  try {
    const parsed = JSON.parse(value);
    const candidates = [
      parsed?.sessionToken,
      parsed?.session_token,
      parsed?.token,
      parsed?.access_token,
      parsed?.data?.sessionToken,
      parsed?.data?.session_token,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && isUuidLike(c)) return c;
    }
  } catch {
    // not JSON
  }

  return null;
}

/**
 * Get session token from localStorage using universal discovery.
 * Checks global latest, room-specific tokens, and JSON session objects.
 * 
 * @param roomPda Optional room PDA to prioritize room-specific token
 * @returns Session token string or null if not found
 */
export function getSessionToken(roomPda?: string): string | null {
  // 1) If roomPda provided, prefer room-specific token
  if (roomPda) {
    const roomToken = extractTokenFromStoredValue(localStorage.getItem(`session_token_${roomPda}`));
    if (roomToken) return roomToken;
  }

  // 2) Global latest
  const latest = extractTokenFromStoredValue(localStorage.getItem("session_token_latest"));
  if (latest) return latest;

  // 3) Scan all keys for known patterns
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;

    // Raw token patterns (session_token_<roomPda>)
    if (key.startsWith("session_token_") && key !== "session_token_latest") {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }

    // JSON session patterns (1mg_session_<roomPda>)
    if (key.startsWith("1mg_session_")) {
      const t = extractTokenFromStoredValue(localStorage.getItem(key));
      if (t) return t;
    }
  }

  return null;
}

/**
 * Build Authorization headers for edge function calls.
 * 
 * @param token Session token
 * @returns Headers object with Authorization bearer token
 */
export function getAuthHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Store session token in localStorage for future use.
 * Stores both room-specific and global latest tokens.
 * 
 * @param roomPda Room PDA
 * @param token Session token to store
 */
export function storeSessionToken(roomPda: string, token: string): void {
  localStorage.setItem(`session_token_${roomPda}`, token);
  localStorage.setItem("session_token_latest", token);
}
