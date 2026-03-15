/**
 * useCinematicMode – manages cinematic chess overlay state.
 *
 * Capability-based detection replaces hard width gating.
 * Returns a render tier: "3d-full" | "3d-lite" | "2d-fallback"
 *
 * Persistent 3D: After a move fires, the 3D scene stays mounted until
 * dismiss() is called (typically when it's the local player's turn).
 * Additional moves that fire while 3D is active play in-place without
 * swoop-in/out — only the final dismiss triggers the swoop-out.
 *
 * Fail-safe: respects reduced-motion, WebGL availability, and device
 * capability. Silently disables on any error. Default OFF.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

const STORAGE_KEY = "chess-cinematic-mode";

// ─── Render Tier ──────────────────────────────────────────────────────────────

export type CinematicTier = "3d-full" | "3d-lite" | "2d-fallback";

/** Duration per tier for a single move animation */
const TIER_DURATION: Record<CinematicTier, number> = {
  "3d-full": 3200,
  "3d-lite": 2400,
  "2d-fallback": 1000,
};

// ─── Device Capability Detection ──────────────────────────────────────────────

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function hasCoarsePointer(): boolean {
  try {
    return window.matchMedia("(pointer: coarse)").matches;
  } catch {
    return false;
  }
}

function detectTier(): CinematicTier {
  try {
    if (prefersReducedMotion()) return "2d-fallback";
    if (!isWebGLAvailable()) return "2d-fallback";

    const cores = (navigator as any).hardwareConcurrency ?? 0;
    const memoryGB = (navigator as any).deviceMemory ?? 0;
    const isTouchDevice = hasCoarsePointer();
    const screenArea = screen.width * screen.height;

    let score = 0;
    if (cores >= 8) score += 3;
    else if (cores >= 4) score += 2;
    else if (cores >= 2) score += 1;

    if (memoryGB >= 8) score += 3;
    else if (memoryGB >= 4) score += 2;
    else if (memoryGB >= 2) score += 1;

    if (screenArea >= 2_000_000) score += 2;
    else if (screenArea >= 500_000) score += 1;

    if (isTouchDevice) score -= 1;

    if (score >= 5) return "3d-full";
    if (score >= 2) return "3d-lite";
    return "2d-fallback";
  } catch {
    return "2d-fallback";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCinematicModeReturn {
  enabled: boolean;
  toggle: () => void;
  /** Currently playing event (null when idle) */
  activeEvent: CinematicEvent | null;
  /** Whether 3D scene is persistent (waiting for dismiss) */
  isPersistent: boolean;
  /** Fire a cinematic animation for a completed move */
  fire: (event: CinematicEvent) => void;
  /** Dismiss the 3D scene — triggers swoop-out and fade back to 2D */
  dismiss: () => void;
  tier: CinematicTier;
  isAllowed: boolean;
  duration: number;
}

export function useCinematicMode(): UseCinematicModeReturn {
  const tier = useMemo<CinematicTier>(() => detectTier(), []);
  const duration = TIER_DURATION[tier];

  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [activeEvent, setActiveEvent] = useState<CinematicEvent | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAllowed = tier !== "2d-fallback" || enabled;

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  /**
   * Fire a cinematic event. The 3D scene will stay mounted (persistent)
   * until dismiss() is called. If already persistent, a new event
   * replaces the current one and plays in-place.
   */
  const fire = useCallback(
    (event: CinematicEvent) => {
      if (!enabled) return;
      try {
        if (dismissTimeoutRef.current) {
          clearTimeout(dismissTimeoutRef.current);
          dismissTimeoutRef.current = null;
        }
        setActiveEvent(event);
        setIsPersistent(true);
      } catch {
        setActiveEvent(null);
        setIsPersistent(false);
      }
    },
    [enabled],
  );

  /**
   * Dismiss the persistent 3D scene. The 3D scene will play its
   * swoop-out animation and then unmount.
   */
  const dismiss = useCallback(() => {
    // The overlay/3D scene handles fade-out via onComplete
    // We clear after a delay to allow the swoop-out to play
    setIsPersistent(false);
    // Give the scene time to play swoop-out + fade
    dismissTimeoutRef.current = setTimeout(() => {
      setActiveEvent(null);
    }, duration + 500);
  }, [duration]);

  useEffect(() => {
    return () => {
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  return { enabled, toggle, activeEvent, isPersistent, fire, dismiss, tier, isAllowed, duration };
}
