/**
 * Detect if running inside a wallet in-app browser (mobile webview).
 * IMPORTANT: This should NOT return true for desktop wallet extensions.
 */
export function isWalletInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof window === "undefined") return false;

  const ua = (navigator.userAgent || "").toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);

  // Only detect as in-app browser on mobile
  if (!isMobile) return false;

  const win = window as any;
  
  // Solflare detection (comprehensive)
  const solflareInApp = isSolflareInAppBrowser();

  /**
   * Phantom in-app browser typically includes "Phantom" in the UA on mobile.
   * DO NOT use window.phantom.solana as a signal, because desktop Phantom extension injects it too.
   */
  const phantomInApp = ua.includes("phantom") || (isMobile && !!win.phantom?.solana?.isPhantom);

  // Backpack detection
  const backpackInApp = isMobile && !!win.backpack?.isBackpack;

  // Generic fallback: mobile + injected wallet provider
  const hasInjectedWallet =
    !!win.solana ||
    !!win.phantom?.solana ||
    !!win.solflare ||
    !!win.Solflare;

  const genericMobileWallet = hasInjectedWallet;

  return phantomInApp || solflareInApp || backpackInApp || genericMobileWallet;
}

/**
 * Robust detection for Solflare in-app browser specifically
 */
export function isSolflareInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  if (typeof window === "undefined") return false;
  
  const ua = (navigator.userAgent || "").toLowerCase();
  const isMobile = /mobile|android|iphone|ipad|ipod/.test(ua);
  
  // Only detect as Solflare in-app browser on mobile
  if (!isMobile) return false;
  
  const win = window as any;
  
  // Explicit Solflare flags
  const hasSolflareInAppFlag = !!win.solflare?.isInAppBrowser;
  const hasSolflareIsSolflare = !!win.solflare?.isSolflare;
  const hasWindowSolflare = !!win.Solflare;
  
  // window.solana may have Solflare flags
  const solanaIsSolflare = !!win.solana?.isSolflare || !!win.solana?.isSolflareWallet;
  
  // UA-based detection (Solflare includes its name in UA)
  const solflareInUA = ua.includes('solflare');
  
  return (
    hasSolflareInAppFlag ||
    hasSolflareIsSolflare ||
    hasWindowSolflare ||
    solanaIsSolflare ||
    solflareInUA
  );
}

/**
 * Check if WebRTC should be disabled for current environment
 */
export function shouldDisableWebRTC(): boolean {
  return isWalletInAppBrowser();
}
