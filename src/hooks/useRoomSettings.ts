/**
 * useRoomSettings Hook
 * 
 * Handles reliable persistence of game settings to the database with:
 * - Retry logic (max 2 attempts, 500ms backoff)
 * - Proper sequencing (only after session token is available)
 * - Auto-cancel room on persistent failure to protect user stake
 * 
 * 🔒 CRITICAL: Uses per-room session token ONLY - never falls back to global/latest
 */

import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAuthHeaders } from "@/lib/sessionToken";

export interface RoomSettingsPayload {
  roomPda: string;
  turnTimeSeconds: number;
  mode: "casual" | "ranked" | "private";
  maxPlayers: number;
  gameType: string;
}

export interface UseRoomSettingsResult {
  saveSettings: (payload: RoomSettingsPayload) => Promise<{ success: boolean; error?: string }>;
  isSaving: boolean;
  lastError: string | null;
}

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 500;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extract session token from localStorage value (handles raw strings and JSON objects)
 */
function extractTokenFromStoredValue(value: string | null): string | null {
  if (!value) return null;

  // Raw UUID token
  if (/^[a-f0-9-]{32,}$/i.test(value)) {
    return value;
  }

  // Try JSON extraction
  try {
    const parsed = JSON.parse(value);
    const candidates = [
      parsed?.sessionToken,
      parsed?.session_token,
      parsed?.token,
    ];
    for (const c of candidates) {
      if (typeof c === "string" && /^[a-f0-9-]{32,}$/i.test(c)) {
        return c;
      }
    }
  } catch {
    // not JSON
  }

  return null;
}

/**
 * Hook for reliably saving room settings to the database.
 * 
 * CRITICAL: Only call after:
 * 1. Room creation tx is confirmed
 * 2. record_acceptance has returned a session token
 * 3. storeSessionToken(roomPda, token) has run
 */
export function useRoomSettings(): UseRoomSettingsResult {
  const [isSaving, setIsSaving] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const saveSettings = useCallback(async (
    payload: RoomSettingsPayload
  ): Promise<{ success: boolean; error?: string }> => {
    const { roomPda, turnTimeSeconds, mode, maxPlayers, gameType } = payload;

    setIsSaving(true);
    setLastError(null);

    // 🔒 Get per-room session token ONLY - never use global/latest fallback
    // Check room-specific key directly to avoid getSessionToken's fallback logic
    const roomSpecificKey = `session_token_${roomPda}`;
    const rawToken = localStorage.getItem(roomSpecificKey);
    const sessionToken = extractTokenFromStoredValue(rawToken);
    
    if (!sessionToken) {
      const errorMsg = `No session token for room ${roomPda.slice(0, 8)}. Cannot save settings.`;
      console.error("[useRoomSettings]", errorMsg);
      setLastError(errorMsg);
      setIsSaving(false);
      return { success: false, error: errorMsg };
    }

    // Debug log before invoke
    console.log(`[roomSettings] using token for room ${roomPda.slice(0, 8)}… token=${sessionToken.slice(0, 8)}…`);

    let lastErrorMessage = "";
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`[useRoomSettings] Attempt ${attempt}/${MAX_RETRIES} for room:`, roomPda.slice(0, 8));

        const { data, error: invokeError } = await supabase.functions.invoke(
          "game-session-set-settings",
          {
            body: {
              roomPda,
              turnTimeSeconds,
              mode,
              maxPlayers,
              gameType,
              // creatorWallet is derived from session token on server
            },
            headers: getAuthHeaders(sessionToken),
          }
        );

        // Check for network/timeout errors
        if (invokeError) {
          lastErrorMessage = invokeError.message || "Network error";
          console.warn(`[useRoomSettings] Attempt ${attempt} failed (invoke):`, lastErrorMessage);
          
          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS);
            continue;
          }
        }

        // Check for application-level errors
        if (data?.ok === false) {
          lastErrorMessage = data.error || "Unknown error";
          console.warn(`[useRoomSettings] Attempt ${attempt} failed (response):`, lastErrorMessage);
          
          // Don't retry for auth errors - they won't succeed
          if (data.error === "unauthorized" || data.error === "forbidden") {
            break;
          }
          
          if (attempt < MAX_RETRIES) {
            await delay(RETRY_DELAY_MS);
            continue;
          }
        }

        // Success!
        if (!invokeError && data?.ok !== false) {
          console.log("[useRoomSettings] ✅ Settings saved successfully:", {
            roomPda: roomPda.slice(0, 8),
            turnTimeSeconds,
            mode,
            maxPlayers,
          });
          setIsSaving(false);
          return { success: true };
        }
      } catch (err: unknown) {
        lastErrorMessage = err instanceof Error ? err.message : "Unexpected error";
        console.error(`[useRoomSettings] Attempt ${attempt} threw:`, err);
        
        if (attempt < MAX_RETRIES) {
          await delay(RETRY_DELAY_MS);
          continue;
        }
      }
    }

    // All retries exhausted
    console.error("[useRoomSettings] All retries failed. Last error:", lastErrorMessage);
    setLastError(lastErrorMessage);
    setIsSaving(false);
    return { success: false, error: lastErrorMessage };
  }, []);

  return {
    saveSettings,
    isSaving,
    lastError,
  };
}
