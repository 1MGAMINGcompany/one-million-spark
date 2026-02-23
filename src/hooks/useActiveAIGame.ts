/**
 * Shared hook for AI game session continuity.
 * Writes the current route to localStorage on mount,
 * and clears it on game over or reset.
 */
import { useEffect, useCallback } from "react";
import { useLocation } from "react-router-dom";

const STORAGE_KEY = "active-ai-game";

export function useActiveAIGame(isGameOver: boolean) {
  const location = useLocation();

  // Save current AI game route on mount
  useEffect(() => {
    const fullPath = location.pathname + location.search;
    try {
      localStorage.setItem(STORAGE_KEY, fullPath);
    } catch {}
  }, [location.pathname, location.search]);

  // Clear on game over
  useEffect(() => {
    if (isGameOver) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [isGameOver]);

  // Manual clear (for reset)
  const clearActiveGame = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  return { clearActiveGame };
}

/** Read and optionally dismiss the active AI game route */
export function getActiveAIGame(): string | null {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
}

export function dismissActiveAIGame() {
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}
