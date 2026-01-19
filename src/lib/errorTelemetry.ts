import { getDbg } from "./debugLog";
import { BUILD_VERSION } from "./buildVersion";

/**
 * Detect wallet browser type for telemetry
 */
function detectWalletBrowser(): string {
  if (typeof window === "undefined") return "ssr";
  const ua = (navigator.userAgent || "").toLowerCase();
  const win = window as any;

  if (ua.includes("phantom")) return "phantom";
  if (ua.includes("solflare") || win.solflare?.isInAppBrowser) return "solflare";
  if (win.backpack?.isBackpack) return "backpack";
  if (win.solana?.isPhantom) return "phantom-ext";
  if (win.solflare?.isSolflare) return "solflare-ext";
  if (/mobile|android|iphone|ipad/i.test(ua)) return "mobile-browser";
  return "desktop-browser";
}

/**
 * Report a client-side error to telemetry.
 * Designed to NEVER throw - telemetry failures are silent.
 */
export async function reportClientError(
  error: Error,
  walletAddress?: string
): Promise<void> {
  try {
    const route = typeof window !== "undefined" ? window.location.pathname : "";
    const debugEvents = getDbg().slice(-20); // Last 20 events only

    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!url || !key) return; // Silently fail if not configured

    await fetch(`${url}/functions/v1/client-error`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": key,
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify({
        route,
        walletBrowser: detectWalletBrowser(),
        userAgent: navigator.userAgent,
        errorStack: error.stack,
        errorMessage: error.message,
        debugEvents,
        buildVersion: BUILD_VERSION,
        walletAddress,
      }),
    });
  } catch {
    // Silent fail - telemetry should NEVER break the app
  }
}
