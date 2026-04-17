/**
 * Captures ?ref=CODE on operator-purchase landing pages and stores it in localStorage.
 * Mirrors the player-side useReferralCapture pattern but uses a separate key so
 * player and operator referral systems coexist without collision.
 *
 * Key: 1mg_operator_ref
 */
import { useEffect } from "react";

const OPERATOR_REF_KEY = "1mg_operator_ref";

/** Capture ?ref=CODE from the URL query string and persist to localStorage. */
export function captureOperatorRefFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref")?.trim().toUpperCase();
  if (ref && ref.length >= 4 && ref.length <= 16) {
    const existing = localStorage.getItem(OPERATOR_REF_KEY);
    if (!existing) {
      localStorage.setItem(OPERATOR_REF_KEY, ref);
      console.log("[OperatorReferral] Captured code:", ref);
    }
    // Strip ?ref= from URL without reload
    params.delete("ref");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }
}

/** Read the pending operator referral code (or null if none stored). */
export function getPendingOperatorRef(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(OPERATOR_REF_KEY);
}

/** Clear the pending operator referral code (call after successful purchase). */
export function clearPendingOperatorRef() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(OPERATOR_REF_KEY);
}

/** Hook: captures ?ref=CODE on mount. Safe to call on every operator-facing landing page. */
export function useOperatorReferralCapture() {
  useEffect(() => {
    captureOperatorRefFromUrl();
  }, []);
}
