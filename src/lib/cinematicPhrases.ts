/**
 * cinematicPhrases – maps cinematic chess events to short personality phrases.
 *
 * Pure function, no side effects. Returns null when no phrase should show
 * (most normal moves are skipped to keep it tasteful).
 */

import type { CinematicEvent } from "@/lib/buildCinematicEvent";

const MATE_PHRASES = ["Checkmate.", "Victory.", "Game over.", "Finished."];
const CHECK_PHRASES = ["Check.", "Watch out.", "Careful now."];
const CAPTURE_PHRASES = ["Another one down.", "That hurt.", "Taken.", "Gone.", "Nice capture."];
const NORMAL_PHRASES = ["Nice move.", "Good pressure.", "Solid.", "Interesting."];

function pick(arr: readonly string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Returns a short phrase for a cinematic event, or null if this move
 * should play silently (to avoid noise).
 *
 * Probability: mate 100%, check 90%, capture 60%, normal 15%.
 */
export function getCinematicPhrase(event: CinematicEvent): string | null {
  if (event.isMate) return pick(MATE_PHRASES);
  if (event.isCheck) return Math.random() < 0.9 ? pick(CHECK_PHRASES) : null;
  if (event.isCapture) return Math.random() < 0.6 ? pick(CAPTURE_PHRASES) : null;
  return Math.random() < 0.15 ? pick(NORMAL_PHRASES) : null;
}
