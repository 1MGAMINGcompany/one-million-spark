// Mobile Wallet Adapter registration for Android
// MUST be called synchronously BEFORE React renders / WalletProvider initializes

import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';

const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export function registerMobileWalletAdapter() {
  if (!isAndroid) {
    console.info('[MWA] Skipping MWA registration (not Android)');
    return;
  }

  try {
    const iconUrl = new URL('/icon-192.png', window.location.origin).toString();

    registerMwa({
      appIdentity: {
        name: '1M Gaming',
        uri: window.location.origin,
        icon: iconUrl,
      },
      authorizationCache: createDefaultAuthorizationCache(),
      chains: ['solana:mainnet'],
      chainSelector: createDefaultChainSelector(),
      onWalletNotFound: createDefaultWalletNotFoundHandler(),
    });

    console.info('[MWA] Mobile Wallet Adapter registered for Android | Chain: solana:mainnet');
  } catch (err) {
    console.warn('[MWA] Failed to register Mobile Wallet Adapter:', err);
  }
}
