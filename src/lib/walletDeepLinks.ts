/**
 * Wallet browser deep link helpers for Phantom, Solflare, and Backpack.
 * These links open a URL inside the wallet's built-in browser,
 * which is required for signing transactions on mobile.
 * 
 * IMPORTANT: Only trigger deep links on explicit user tap (no auto-redirect).
 */

export type WalletType = 'phantom' | 'solflare' | 'backpack';

/**
 * Build deep link to open a URL inside a wallet's browser.
 * Uses encodeURIComponent for query params (safer than path encoding).
 * 
 * @param wallet - Which wallet to target
 * @param url - The URL to open inside the wallet browser
 * @param ref - Optional referrer URL (defaults to url)
 */
export function buildWalletBrowseDeepLink(
  wallet: WalletType,
  url: string,
  ref?: string
): string {
  const encodedUrl = encodeURIComponent(url);
  const encodedRef = encodeURIComponent(ref || url);
  
  switch (wallet) {
    case 'phantom':
      return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedRef}`;
    case 'solflare':
      return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
    case 'backpack':
      return `https://backpack.app/ul/v1/browse/${encodedUrl}?ref=${encodedRef}`;
  }
}

/**
 * Get the download/install URL for a wallet
 */
export function getWalletInstallUrl(wallet: WalletType): string {
  switch (wallet) {
    case 'phantom':
      return 'https://phantom.app/download';
    case 'solflare':
      return 'https://solflare.com/download';
    case 'backpack':
      return 'https://backpack.app/download';
  }
}

/**
 * Get wallet display name
 */
export function getWalletDisplayName(wallet: WalletType): string {
  switch (wallet) {
    case 'phantom':
      return 'Phantom';
    case 'solflare':
      return 'Solflare';
    case 'backpack':
      return 'Backpack';
  }
}
