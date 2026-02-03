import { useCallback, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";

const DEDUPE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const STORAGE_PREFIX = "toast_game_start_";

// In-memory cache for current session
const memoryCache = new Map<string, number>();

/**
 * Get the last time a "game starting" toast was shown for a room
 */
function getLastShown(roomPda: string): number {
  // Check memory first (survives re-renders)
  const memTs = memoryCache.get(roomPda);
  if (memTs && Date.now() - memTs < DEDUPE_WINDOW_MS) {
    return memTs;
  }
  
  // Check localStorage (survives reload)
  try {
    const stored = localStorage.getItem(`${STORAGE_PREFIX}${roomPda}`);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && Date.now() - ts < DEDUPE_WINDOW_MS) {
        // Sync to memory
        memoryCache.set(roomPda, ts);
        return ts;
      }
    }
  } catch {
    // localStorage not available
  }
  
  return 0;
}

/**
 * Mark that a toast was shown for a room
 */
function setLastShown(roomPda: string): void {
  const now = Date.now();
  memoryCache.set(roomPda, now);
  
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${roomPda}`, String(now));
  } catch {
    // localStorage not available
  }
}

/**
 * Clear dedupe key for a room (call when room is finished/canceled/forfeited)
 */
export function clearGameStartDedupe(roomPda: string): void {
  memoryCache.delete(roomPda);
  
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${roomPda}`);
  } catch {
    // localStorage not available
  }
}

/**
 * Check if a toast should be shown (not shown within dedupe window)
 */
export function shouldShowGameStartToast(roomPda: string): boolean {
  const lastShown = getLastShown(roomPda);
  return lastShown === 0 || Date.now() - lastShown >= DEDUPE_WINDOW_MS;
}

/**
 * Show a "game starting" toast with dedupe protection
 * Returns true if toast was shown, false if deduplicated
 */
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
  
  setLastShown(roomPda);
  
  if (variant === "sonner") {
    sonnerToast.success(title, { description });
  } else {
    toast({ title, description });
  }
  
  console.log(`[GameStartToast] Shown toast for ${roomPda.slice(0, 8)}...`);
  return true;
}

/**
 * Hook version for components that need the functions with stable references
 */
export function useGameStartToast() {
  const shownRoomsRef = useRef<Set<string>>(new Set());
  
  const showToast = useCallback((
    roomPda: string,
    title: string,
    description: string,
    variant: "sonner" | "shadcn" = "sonner"
  ): boolean => {
    // Additional in-component dedupe to prevent multiple effect triggers
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
    clearGameStartDedupe(roomPda);
  }, []);
  
  return { showToast, clearDedupe };
}
