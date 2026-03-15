/**
 * Captures ?ref=CODE from URL on landing and stores it in localStorage.
 * On wallet connect, binds the referral via edge function.
 */
import { useEffect, useRef } from "react";

const REFERRAL_STORAGE_KEY = "1mg_pending_referral";

/** Capture referral code from URL query params on page load */
export function captureReferralFromUrl() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const ref = params.get("ref")?.trim().toUpperCase();
  if (ref && ref.length >= 4 && ref.length <= 16) {
    // Only store if no existing referral is pending
    const existing = localStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!existing) {
      localStorage.setItem(REFERRAL_STORAGE_KEY, ref);
      console.log("[Referral] Captured referral code:", ref);
    }
    // Clean URL without reload
    params.delete("ref");
    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }
}

/** Get pending referral code from localStorage */
export function getPendingReferral(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFERRAL_STORAGE_KEY);
}

/** Clear pending referral after successful bind */
export function clearPendingReferral() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REFERRAL_STORAGE_KEY);
}

/**
 * Hook: automatically captures referral on mount and binds when wallet connects.
 */
export function useReferralCapture(walletAddress: string | null) {
  const hasBound = useRef(false);

  // Capture on mount
  useEffect(() => {
    captureReferralFromUrl();
  }, []);

  // Bind when wallet connects
  useEffect(() => {
    if (!walletAddress || hasBound.current) return;

    const pendingRef = getPendingReferral();
    if (!pendingRef) return;

    hasBound.current = true;

    // Call edge function to bind referral
    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    fetch(`https://${projectId}.supabase.co/functions/v1/referral-bind`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
      },
      body: JSON.stringify({
        wallet: walletAddress,
        referralCode: pendingRef,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          console.log("[Referral] Successfully bound referral:", pendingRef);
          clearPendingReferral();
        } else {
          console.warn("[Referral] Bind failed:", data.error);
          // Don't clear on failure so it can retry
          if (data.error === "already_referred" || data.error === "self_referral") {
            clearPendingReferral();
          }
        }
        hasBound.current = false;
      })
      .catch((err) => {
        console.error("[Referral] Bind error:", err);
        hasBound.current = false;
      });
  }, [walletAddress]);
}
