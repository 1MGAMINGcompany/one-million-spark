/**
 * useCinematicMode – manages cinematic chess overlay state.
 *
 * Capability-based detection replaces hard width gating.
 * Returns a render tier: "3d-full" | "3d-lite" | "2d-fallback"
 *
 * Fail-safe: respects reduced-motion, WebGL availability, and device
 * capability. Silently disables on any error. Default OFF.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

const STORAGE_KEY = "chess-cinematic-mode";

// ─── Render Tier ──────────────────────────────────────────────────────────────

export type CinematicTier = "3d-full" | "3d-lite" | "2d-fallback";

/** Duration per tier — 3D needs longer for swoop-in / move / swoop-out phases */
const TIER_DURATION: Record<CinematicTier, number> = {
  "3d-full": 2800,
  "3d-lite": 2000,
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

/**
 * Simple heuristic to estimate device tier.
 * Uses only safe, synchronous browser signals.
 */
function detectTier(): CinematicTier {
  try {
    // Hard blocks → 2D fallback
    if (prefersReducedMotion()) return "2d-fallback";
    if (!isWebGLAvailable()) return "2d-fallback";

    // Gather capability signals
    const cores = (navigator as any).hardwareConcurrency ?? 0;
    const memoryGB = (navigator as any).deviceMemory ?? 0; // Chrome-only, 0 if unavailable
    const isTouchDevice = hasCoarsePointer();
    const screenArea = screen.width * screen.height;

    // Score: higher = more capable
    let score = 0;

    // CPU cores
    if (cores >= 8) score += 3;
    else if (cores >= 4) score += 2;
    else if (cores >= 2) score += 1;

    // Memory (only available in Chromium)
    if (memoryGB >= 8) score += 3;
    else if (memoryGB >= 4) score += 2;
    else if (memoryGB >= 2) score += 1;
    // memoryGB === 0 means unknown — don't penalize

    // Screen area as a rough proxy for device class
    if (screenArea >= 2_000_000) score += 2; // large tablet / desktop
    else if (screenArea >= 500_000) score += 1; // standard phone

    // Touch penalty — mobile GPUs are generally weaker
    if (isTouchDevice) score -= 1;

    // Decision
    if (score >= 5) return "3d-full";
    if (score >= 2) return "3d-lite";
    return "2d-fallback";
  } catch {
    return "2d-fallback";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface UseCinematicModeReturn {
  /** Whether cinematic mode is enabled by the user */
  enabled: boolean;
  /** Toggle cinematic mode on/off */
  toggle: () => void;
  /** Currently playing event (null when idle) */
  activeEvent: CinematicEvent | null;
  /** Fire a cinematic animation for a completed move */
  fire: (event: CinematicEvent) => void;
  /** Detected render tier */
  tier: CinematicTier;
  /** Whether cinematic is allowed at all (tier !== "2d-fallback" or still usable) */
  isAllowed: boolean;
  /** Animation duration for current tier */
  duration: number;
}

export function useCinematicMode(): UseCinematicModeReturn {
  // Detect tier once on mount
  const tier = useMemo<CinematicTier>(() => detectTier(), []);
  const duration = TIER_DURATION[tier];

  // Persist user preference
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [activeEvent, setActiveEvent] = useState<CinematicEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAllowed = tier !== "2d-fallback" || enabled; // 2d-fallback still works, just simpler

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);

  const fire = useCallback(
    (event: CinematicEvent) => {
      if (!enabled) return;
      try {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setActiveEvent(event);
        timeoutRef.current = setTimeout(() => setActiveEvent(null), duration);
      } catch {
        setActiveEvent(null);
      }
    },
    [enabled, duration],
  );

  useEffect(() => {
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, []);

  return { enabled, toggle, activeEvent, fire, tier, isAllowed, duration };
}
