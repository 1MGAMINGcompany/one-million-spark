/**
 * Detect if running inside a wallet in-app browser (mobile webview).
 * IMPORTANT: This should NOT return true for desktop wallet extensions.
 */
export function isWalletInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof window === "undefined") return false;

  const ua = (navigator.userAgent || "").toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);

  // Solflare exposes explicit in-app flag
  const solflareInApp = !!(window as any).solflare?.isInAppBrowser;

  /**
   * Phantom in-app browser typically includes "Phantom" in the UA on mobile.
   * DO NOT use window.phantom.solana as a signal, because desktop Phantom extension injects it too.
   */
  const phantomInApp = isMobile && ua.includes("phantom");

  // Solflare UA sometimes includes "solflare"
  const solflareUa = isMobile && ua.includes("solflare");

  // Generic fallback: mobile + injected wallet provider
  const hasInjectedWallet =
    !!(window as any).solana ||
    !!(window as any).phantom?.solana ||
    !!(window as any).solflare;

  const genericMobileWallet = isMobile && hasInjectedWallet;

  return phantomInApp || solflareInApp || solflareUa || genericMobileWallet;
}

/**
 * Check if WebRTC should be disabled for current environment
 */
export function shouldDisableWebRTC(): boolean {
  return isWalletInAppBrowser();
}
