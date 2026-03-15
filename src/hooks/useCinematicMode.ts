/**
 * useCinematicMode – manages cinematic chess overlay state.
 * 
 * Fail-safe: respects reduced-motion, narrow viewports, and silently
 * disables on any error. Default OFF.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import type { CinematicEvent } from "@/lib/buildCinematicEvent";

const STORAGE_KEY = "chess-cinematic-mode";
const ANIMATION_DURATION = 1200; // ms
const MIN_WIDTH_FOR_CINEMATIC = 640; // px – skip on small screens

export interface UseCinematicModeReturn {
  /** Whether cinematic mode is enabled by the user */
  enabled: boolean;
  /** Toggle cinematic mode on/off */
  toggle: () => void;
  /** Currently playing event (null when idle) */
  activeEvent: CinematicEvent | null;
  /** Fire a cinematic animation for a completed move */
  fire: (event: CinematicEvent) => void;
  /** Whether cinematic is actually allowed (respects reduced-motion, screen size) */
  isAllowed: boolean;
  /** Animation duration constant */
  duration: number;
}

export function useCinematicMode(): UseCinematicModeReturn {
  // Persist preference
  const [enabled, setEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [activeEvent, setActiveEvent] = useState<CinematicEvent | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Check reduced-motion preference
  const prefersReducedMotion = useMemo(() => {
    try {
      return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      return false;
    }
  }, []);

  // Check screen width
  const [isWideEnough, setIsWideEnough] = useState(() => {
    try {
      return window.innerWidth >= MIN_WIDTH_FOR_CINEMATIC;
    } catch {
      return true;
    }
  });

  useEffect(() => {
    const handler = () => setIsWideEnough(window.innerWidth >= MIN_WIDTH_FOR_CINEMATIC);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  const isAllowed = !prefersReducedMotion && isWideEnough;

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const fire = useCallback(
    (event: CinematicEvent) => {
      if (!enabled || !isAllowed) return;
      try {
        // Clear any pending animation
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setActiveEvent(event);
        timeoutRef.current = setTimeout(() => {
          setActiveEvent(null);
        }, ANIMATION_DURATION);
      } catch {
        // Fail silently – continue standard 2D chess
        setActiveEvent(null);
      }
    },
    [enabled, isAllowed],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return {
    enabled,
    toggle,
    activeEvent,
    fire,
    isAllowed,
    duration: ANIMATION_DURATION,
  };
}
