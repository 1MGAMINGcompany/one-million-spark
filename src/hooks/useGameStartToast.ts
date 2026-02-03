import { useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================
// TOAST DEDUPE (prevents repeated toasts)
// ============================================================
const TOAST_STORAGE_PREFIX = "toast_game_start_";
const toastMemoryCache = new Map<string, number>();

function getToastLastShown(roomPda: string): number {
  const memTs = toastMemoryCache.get(roomPda);
  if (memTs && Date.now() - memTs < DEDUPE_WINDOW_MS) {
    return memTs;
  }
  
  try {
    const stored = localStorage.getItem(`${TOAST_STORAGE_PREFIX}${roomPda}`);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && Date.now() - ts < DEDUPE_WINDOW_MS) {
        toastMemoryCache.set(roomPda, ts);
        return ts;
      }
    }
  } catch {
    // localStorage not available
  }
  
  return 0;
}

function setToastLastShown(roomPda: string): void {
  const now = Date.now();
  toastMemoryCache.set(roomPda, now);
  
  try {
    localStorage.setItem(`${TOAST_STORAGE_PREFIX}${roomPda}`, String(now));
  } catch {
    // localStorage not available
  }
}

export function clearGameStartDedupe(roomPda: string): void {
  toastMemoryCache.delete(roomPda);
  
  try {
    localStorage.removeItem(`${TOAST_STORAGE_PREFIX}${roomPda}`);
  } catch {
    // localStorage not available
  }
}

export function shouldShowGameStartToast(roomPda: string): boolean {
  const lastShown = getToastLastShown(roomPda);
  return lastShown === 0 || Date.now() - lastShown >= DEDUPE_WINDOW_MS;
}

export function showGameStartToast(
  roomPda: string,
  title: string,
  description: string,
  variant: "sonner" | "shadcn" = "sonner"
): boolean {
  if (!shouldShowGameStartToast(roomPda)) {
    console.log(`[GameStartToast] Dedupe: skipping toast for ${roomPda.slice(0, 8)}...`);
    return false;
  }
  
  setToastLastShown(roomPda);
  
  if (variant === "sonner") {
    sonnerToast.success(title, { description });
  } else {
    toast({ title, description });
  }
  
  console.log(`[GameStartToast] Shown toast for ${roomPda.slice(0, 8)}...`);
  return true;
}

// ============================================================
// GAME START LATCH (prevents repeated event loop triggers)
// ============================================================
const LATCH_STORAGE_PREFIX = "game_start_latch_";
const latchMemoryCache = new Map<string, number>();

/**
 * Check if a game-start latch is active for a room.
 * Returns true if the latch is active (should NOT proceed).
 */
export function isGameStartLatched(roomPda: string): boolean {
  // Check memory first
  const memTs = latchMemoryCache.get(roomPda);
  if (memTs && Date.now() - memTs < DEDUPE_WINDOW_MS) {
    return true;
  }
  
  // Check localStorage
  try {
    const stored = localStorage.getItem(`${LATCH_STORAGE_PREFIX}${roomPda}`);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && Date.now() - ts < DEDUPE_WINDOW_MS) {
        // Sync to memory
        latchMemoryCache.set(roomPda, ts);
        return true;
      } else {
        // Expired, clean up
        localStorage.removeItem(`${LATCH_STORAGE_PREFIX}${roomPda}`);
      }
    }
  } catch {
    // localStorage not available
  }
  
  return false;
}

/**
 * Set the game-start latch for a room.
 * Once set, isGameStartLatched() will return true for 10 minutes.
 */
export function setGameStartLatch(roomPda: string): void {
  const now = Date.now();
  latchMemoryCache.set(roomPda, now);
  
  try {
    localStorage.setItem(`${LATCH_STORAGE_PREFIX}${roomPda}`, String(now));
  } catch {
    // localStorage not available
  }
  
  console.log(`[GameStartLatch] Set latch for ${roomPda.slice(0, 8)}...`);
}

/**
 * Clear the game-start latch for a room.
 * Call when room is finished/canceled/forfeited.
 */
export function clearGameStartLatch(roomPda: string): void {
  latchMemoryCache.delete(roomPda);
  
  try {
    localStorage.removeItem(`${LATCH_STORAGE_PREFIX}${roomPda}`);
  } catch {
    // localStorage not available
  }
  
  console.log(`[GameStartLatch] Cleared latch for ${roomPda.slice(0, 8)}...`);
}

/**
 * Clear all dedupe keys for a room (toast + latch).
 * Call when room is finished/canceled/forfeited.
 */
export function clearAllGameStartKeys(roomPda: string): void {
  clearGameStartDedupe(roomPda);
  clearGameStartLatch(roomPda);
}

// ============================================================
// HOOK VERSION (for components needing stable references)
// ============================================================
export function useGameStartToast() {
  const shownRoomsRef = useRef<Set<string>>(new Set());
  
  const showToast = useCallback((
    roomPda: string,
    title: string,
    description: string,
    variant: "sonner" | "shadcn" = "sonner"
  ): boolean => {
    if (shownRoomsRef.current.has(roomPda)) {
      console.log(`[GameStartToast] Component dedupe: already shown for ${roomPda.slice(0, 8)}...`);
      return false;
    }
    
    const shown = showGameStartToast(roomPda, title, description, variant);
    if (shown) {
      shownRoomsRef.current.add(roomPda);
    }
    return shown;
  }, []);
  
  const clearDedupe = useCallback((roomPda: string) => {
    shownRoomsRef.current.delete(roomPda);
    clearAllGameStartKeys(roomPda);
  }, []);
  
  return { showToast, clearDedupe };
}
