import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from '@solana-mobile/wallet-standard-mobile';

// Android only - iOS Safari doesn't support MWA reliably
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

if (isAndroid) {
  // Absolute URL for icon (required by some wallets)
  const iconUrl = new URL('/icon-192.png', window.location.origin).toString();
  
  registerMwa({
    appIdentity: {
      name: '1M Gaming',
      uri: window.location.origin,
      icon: iconUrl,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: ['solana:mainnet'], // Correct chain ID per Solana Mobile docs
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  });
  
  console.info('[MWA] Mobile Wallet Adapter registered for Android | Chain: solana:mainnet');
}

export {};
