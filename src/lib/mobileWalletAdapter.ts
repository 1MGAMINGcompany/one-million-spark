// Defer MWA registration to avoid React initialization conflicts
const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

if (isAndroid) {
  // Wait for DOM to be ready before registering MWA
  const registerMWA = async () => {
    try {
      const {
        createDefaultAuthorizationCache,
        createDefaultChainSelector,
        createDefaultWalletNotFoundHandler,
        registerMwa,
      } = await import('@solana-mobile/wallet-standard-mobile');

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
  };

  // Register after a microtask to ensure React is initialized
  queueMicrotask(registerMWA);
}

export {};
