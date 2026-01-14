/**
 * Wallet In-App Browser Detection
 * 
 * Detects if the app is running inside a wallet's in-app browser (Phantom, Solflare, etc.)
 * These environments have WebRTC issues due to restricted browser capabilities.
 */

/**
 * Detect if running inside a wallet in-app browser
 * These browsers have WebRTC issues due to restricted environments
 */
export function isWalletInAppBrowser(): boolean {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return false;
  }

  const ua = navigator.userAgent.toLowerCase();

  // Detect Phantom in-app browser
  // Phantom injects `window.phantom` and may include "phantom" in UA
  const isPhantomBrowser =
    ua.includes("phantom") ||
    !!(window as any).phantom?.solana?.isPhantom;

  // Detect Solflare in-app browser
  // Solflare may inject `window.solflare` with `isInAppBrowser` flag
  const isSolflareBrowser =
    ua.includes("solflare") ||
    !!(window as any).solflare?.isSolflare;

  // Detect generic mobile wallet browser patterns
  // If on mobile AND wallet extension is injected, likely in-app browser
  const isMobile =
    ua.includes("mobile") ||
    ua.includes("android") ||
    ua.includes("iphone") ||
    ua.includes("ipad");

  const hasWalletInjected =
    !!(window as any).solana ||
    !!(window as any).phantom ||
    !!(window as any).solflare;

  const isMobileWalletBrowser = isMobile && hasWalletInjected;

  const result = isPhantomBrowser || isSolflareBrowser || isMobileWalletBrowser;

  if (result) {
    console.log("[WalletBrowserDetection] Detected wallet in-app browser:", {
      isPhantomBrowser,
      isSolflareBrowser,
      isMobileWalletBrowser,
      userAgent: ua.slice(0, 100),
    });
  }

  return result;
}

/**
 * Check if WebRTC should be disabled for current environment
 * Returns true if running in a wallet in-app browser where WebRTC is unreliable
 */
export function shouldDisableWebRTC(): boolean {
  return isWalletInAppBrowser();
}
