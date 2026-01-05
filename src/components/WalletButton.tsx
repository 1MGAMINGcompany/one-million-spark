import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Smartphone, Loader2, ExternalLink, User } from "lucide-react";
import { toast } from "sonner";
import { fetchBalance as fetchBalanceRpc, is403Error } from "@/lib/solana-rpc";
import { NetworkProofBadge } from "./NetworkProofBadge";
import { MobileWalletFallback } from "./MobileWalletFallback";

// Import local wallet icons
import phantomIcon from "@/assets/wallets/phantom.svg";
import solflareIcon from "@/assets/wallets/solflare.svg";
import backpackIcon from "@/assets/wallets/backpack.svg";

const CONNECT_TIMEOUT_MS = 8000;

// ===== ENVIRONMENT DETECTION =====
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsAndroid = () => /Android/i.test(navigator.userAgent);
const getIsIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

// Check if we're inside a wallet's in-app browser
const getIsInWalletBrowser = () => {
  const win = window as any;
  const isInPhantom = !!win?.phantom?.solana?.isPhantom;
  const isInSolflare = !!win?.solflare?.isSolflare;
  // Check for any injected Solana provider (covers other wallet browsers)
  const hasSolanaProvider = !!win?.solana;
  return isInPhantom || isInSolflare || hasSolanaProvider;
};

// SOLANA-ONLY: Allowed wallet names (case-insensitive substring match)
const ALLOWED_SOLANA_WALLETS = ['phantom', 'solflare', 'backpack', 'glow', 'trust'];

// Wallets to explicitly BLOCK (EVM/non-Solana)
const BLOCKED_WALLET_NAMES = [
  'metamask',
  'walletconnect',
  'coinbase',
  'rainbow',
  'ledger live',
  'torus',
];

// Official wallet icons - using local assets for reliability
const WALLET_ICONS: Record<string, string> = {
  phantom: phantomIcon,
  solflare: solflareIcon,
  backpack: backpackIcon,
  glow: phantomIcon, // fallback
  trust: phantomIcon, // fallback
  'mobile wallet adapter': phantomIcon, // fallback
};

// Get the best icon for a wallet
const getWalletIcon = (walletName: string, adapterIcon?: string): string => {
  const nameLower = walletName.toLowerCase();
  
  // Check for exact or partial matches in our icon map
  for (const [key, iconUrl] of Object.entries(WALLET_ICONS)) {
    if (nameLower.includes(key)) {
      return iconUrl;
    }
  }
  
  // Fall back to adapter-provided icon or phantom as default
  return adapterIcon || WALLET_ICONS['phantom'];
};

export function WalletButton() {
  const { t } = useTranslation();
  const { connected, publicKey, disconnect, connecting, wallets, select, wallet, connect } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectTimeout, setConnectTimeout] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [showFallbackPanel, setShowFallbackPanel] = useState(false);
  const [selectedWalletType, setSelectedWalletType] = useState<'phantom' | 'solflare' | 'backpack' | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Platform detection
  const isMobile = getIsMobile();
  const isAndroid = getIsAndroid();
  const isIOS = getIsIOS();
  const isInWalletBrowser = getIsInWalletBrowser();


  // Clear timeout on unmount or when connected
  useEffect(() => {
    if (connected && connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
      setConnectTimeout(false);
      setConnectingWallet(null);
      setShowFallbackPanel(false);
    }
    return () => {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    };
  }, [connected]);

  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }
    
    setBalanceLoading(true);
    setBalanceError(null);
    
    try {
      const { balance: lamports, endpoint } = await fetchBalanceRpc(publicKey, connection);
      const sol = lamports / LAMPORTS_PER_SOL;
      setBalance(sol);
      console.info(`[Wallet] Balance: ${sol.toFixed(6)} SOL via ${endpoint}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch balance';
      console.error('[Wallet] Balance error:', msg);
      setBalanceError(msg);
      
      if (is403Error(err)) {
        toast.error('RPC access denied - using public fallback failed');
      } else {
        toast.error(`Balance fetch failed: ${msg.slice(0, 100)}`);
      }
    } finally {
      setBalanceLoading(false);
    }
  }, [connected, publicKey, connection]);

  // Fetch balance when connected
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
    }
  }, [connected, publicKey, fetchBalance]);

  // Handle MWA timeout - show fallback panel (MOBILE ONLY)
  const handleMWATimeout = useCallback(() => {
    setConnectTimeout(true);
    // Only show mobile fallback panel on mobile - desktop gets different UI
    if (isMobile) {
      setShowFallbackPanel(true);
    }
  }, [isMobile]);

  const handleSelectWallet = async (walletName: string) => {
    const selectedWallet = wallets.find(w => w.adapter.name === walletName);
    if (selectedWallet) {
      const isMWA = walletName.toLowerCase().includes('mobile wallet adapter');
      
      try {
        setConnectingWallet(walletName);
        setConnectTimeout(false);
        
        // Start timeout for connection - especially important for MWA
        connectTimeoutRef.current = setTimeout(() => {
          if (!connected) {
            handleMWATimeout();
          }
        }, CONNECT_TIMEOUT_MS);

        select(selectedWallet.adapter.name);
        setDialogOpen(false);
        
        // For MWA on Android, show immediate feedback
        if (isMWA && isAndroid) {
          toast.info(t("wallet.openingWallet"));
        }
      } catch (err) {
        console.error('[Wallet] Select error:', err);
        toast.error('Failed to select wallet');
        setConnectingWallet(null);
        
        // On error, show fallback panel for mobile
        if (isMobile) {
          setShowFallbackPanel(true);
        }
      }
    }
  };

  const handleRetryConnect = () => {
    setConnectTimeout(false);
    setShowFallbackPanel(false);
    if (wallet) {
      try {
        wallet.adapter.connect();
        // Restart timeout
        connectTimeoutRef.current = setTimeout(() => {
          if (!connected) {
            handleMWATimeout();
          }
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        console.error('[Wallet] Retry connect error:', err);
        // Only show mobile fallback on mobile
        if (isMobile) {
          setShowFallbackPanel(true);
        }
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setBalanceError(null);
      setConnectTimeout(false);
      setShowFallbackPanel(false);
    } catch (err) {
      console.error('[Wallet] Disconnect error:', err);
    }
  };

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      toast.success('Address copied!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const getWalletDeepLink = (walletType: 'phantom' | 'solflare' | 'backpack'): string => {
    const currentUrl = window.location.href;
    const encodedUrl = encodeURIComponent(currentUrl);
    
    switch (walletType) {
      case 'phantom':
        return `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodeURIComponent('https://www.1mgaming.com')}`;
      case 'solflare':
        return `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodeURIComponent('https://www.1mgaming.com')}`;
      case 'backpack':
        return `https://backpack.app/ul/browse/${encodedUrl}`;
      default:
        return currentUrl;
    }
  };

  const handleWalletDeepLink = (walletType: 'phantom' | 'solflare' | 'backpack') => {
    setSelectedWalletType(walletType);
    setDialogOpen(false);
    
    const deepLink = getWalletDeepLink(walletType);
    
    // Try to open the deep link
    window.location.href = deepLink;
    
    // Show fallback panel after a short delay in case user comes back
    setTimeout(() => {
      setShowFallbackPanel(true);
    }, 1500);
  };

  // SOLANA-ONLY: Filter to allowed wallets, block EVM/MetaMask
  const filteredWallets = wallets.filter(w => {
    const name = w.adapter.name.toLowerCase();
    
    // Block any explicitly blocked wallets (MetaMask, WalletConnect, etc.)
    if (BLOCKED_WALLET_NAMES.some(blocked => name.includes(blocked))) {
      return false;
    }
    
    const isMWA = name.includes('mobile wallet adapter');
    
    // On desktop: never show MWA
    if (!isMobile && isMWA) {
      return false;
    }
    
    // On mobile in wallet browser: hide MWA (use injected provider instead)
    if (isMobile && isInWalletBrowser && isMWA) {
      return false;
    }
    
    // On mobile outside wallet browser:
    // - Android: show MWA
    // - iOS: hide MWA (doesn't work reliably)
    if (isMobile && !isInWalletBrowser && isMWA) {
      return isAndroid; // Only show MWA on Android
    }
    
    // Only allow known Solana wallets
    return ALLOWED_SOLANA_WALLETS.some(allowed => name.includes(allowed));
  });

  // Sort: Installed wallets first, then by priority
  const sortedWallets = [...filteredWallets].sort((a, b) => {
    const aInstalled = a.readyState === 'Installed';
    const bInstalled = b.readyState === 'Installed';
    if (aInstalled && !bInstalled) return -1;
    if (!aInstalled && bInstalled) return 1;
    
    // Prioritize known wallets in order
    const priority = ['phantom', 'solflare', 'backpack', 'glow', 'trust'];
    const aIdx = priority.findIndex(p => a.adapter.name.toLowerCase().includes(p));
    const bIdx = priority.findIndex(p => b.adapter.name.toLowerCase().includes(p));
    if (aIdx !== -1 && bIdx === -1) return -1;
    if (aIdx === -1 && bIdx !== -1) return 1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return 0;
  });

  // Debug logging for wallet detection
  useEffect(() => {
    const win = window as any;
    console.log('[WalletDetect]', {
      isMobile,
      isInWalletBrowser,
      hasWindowSolana: !!win.solana,
      isPhantom: !!win.phantom?.solana?.isPhantom,
      isSolflare: !!win.solflare?.isSolflare,
      walletsCount: wallets.length,
      sortedWalletsCount: sortedWallets.length,
    });
  }, [isMobile, isInWalletBrowser, wallets.length, sortedWallets.length]);

  // Auto-sync for in-app wallet browsers (Solflare, Phantom, etc.)
  // CRITICAL: Runs ONCE on mount to detect already-connected wallet
  // This fixes the "Connect Wallet" loop in Solflare in-app browser
  useEffect(() => {
    const win = window as any;
    
    // Skip if already connected or currently connecting
    if (connected || connecting) return;
    
    // Only auto-sync in wallet browser environments
    if (!isInWalletBrowser) return;
    
    // Check if window.solana reports connected
    if (win.solana?.isConnected && win.solana?.publicKey) {
      console.log("[WalletState] In-app browser has connected wallet, syncing...");
      
      // Find matching installed adapter
      const installedWallet = wallets.find(w => w.readyState === 'Installed');
      if (installedWallet) {
        select(installedWallet.adapter.name);
        // Single connect call (NOT in a loop)
        connect().catch(err => {
          console.warn("[WalletState] Auto-connect failed:", err);
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - run ONCE on mount

  // Log wallet state changes for debugging
  useEffect(() => {
    console.log('[WalletState]', {
      connected,
      publicKey: publicKey?.toBase58()?.slice(0, 8),
      adapterName: wallet?.adapter?.name,
      inWalletBrowser: isInWalletBrowser,
    });
  }, [connected, publicKey, wallet?.adapter?.name, isInWalletBrowser]);

  // Show fallback panel - MOBILE ONLY for MobileWalletFallback
  if (showFallbackPanel && isMobile) {
    return (
      <MobileWalletFallback 
        onClose={() => {
          setShowFallbackPanel(false);
          setConnectTimeout(false);
          setConnectingWallet(null);
          setSelectedWalletType(null);
        }}
        isAndroid={isAndroid}
        isIOS={isIOS}
        selectedWallet={selectedWalletType}
      />
    );
  }

  // DESKTOP fallback: show install/unlock prompt when connection failed
  if (showFallbackPanel && !isMobile) {
    const hasAnyWallet = sortedWallets.length > 0 || !!(window as any).solana;
    return (
      <div className="flex flex-col items-center gap-3 p-4 bg-card rounded-lg border max-w-xs">
        <AlertCircle className="text-amber-500" size={24} />
        {hasAnyWallet ? (
          <>
            <p className="text-sm text-muted-foreground text-center">
              Connection failed. Please unlock your wallet extension and try again.
            </p>
            <Button size="sm" variant="default" onClick={handleRetryConnect} className="gap-2">
              <RefreshCw size={14} />
              Retry Connection
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground text-center">
              No Solana wallet detected. Install a browser extension to continue.
            </p>
            <Button 
              size="sm" 
              variant="default" 
              onClick={() => window.open('https://phantom.app/download', '_blank')}
              className="gap-2"
            >
              <ExternalLink size={14} />
              Install Phantom
            </Button>
          </>
        )}
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => {
            setShowFallbackPanel(false);
            setConnectTimeout(false);
            setConnectingWallet(null);
            setSelectedWalletType(null);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  // Connection timeout state - show retry UI with platform-specific guidance
  if ((connecting || connectingWallet) && connectTimeout) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border">
        <AlertCircle className="text-amber-500" size={24} />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          {isAndroid 
            ? t("wallet.walletDidntOpen")
            : isIOS
            ? t("wallet.iphoneBrowserLimit")
            : t("wallet.connectionFailed")
          }
        </p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={handleRetryConnect}>
            {t("wallet.retry")}
          </Button>
          {isMobile && (
            <Button size="sm" variant="default" onClick={() => handleWalletDeepLink('phantom')} className="gap-1">
              <ExternalLink size={14} />
              {t("wallet.openInWalletBrowser")}
            </Button>
          )}
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => {
            setConnectTimeout(false);
            setConnectingWallet(null);
            handleDisconnect();
          }}
          className="mt-1"
        >
          {t("wallet.cancel")}
        </Button>
      </div>
    );
  }

  // Show connecting state with wallet name
  if (connecting || connectingWallet) {
    return (
      <Button disabled variant="default" size="sm" className="gap-2">
        <Loader2 size={16} className="animate-spin" />
        {t("wallet.connecting")}
      </Button>
    );
  }

  // Wallet config for clean UI - using local assets
  const WALLET_CONFIG = [
    {
      id: 'phantom',
      name: 'Phantom',
      icon: phantomIcon,
    },
    {
      id: 'solflare', 
      name: 'Solflare',
      icon: solflareIcon,
    },
    {
      id: 'backpack',
      name: 'Backpack', 
      icon: backpackIcon,
    },
  ];

  const isWalletDetected = (walletId: string) => {
    return sortedWallets.some(w => 
      w.adapter.name.toLowerCase().includes(walletId) && 
      w.readyState === 'Installed'
    );
  };

  const handleWalletClick = (walletId: string) => {
    // Find matching wallet from detected wallets
    const matchingWallet = sortedWallets.find(w => 
      w.adapter.name.toLowerCase().includes(walletId)
    );
    
    if (matchingWallet) {
      // CRITICAL: Call select() and connect() IMMEDIATELY in user gesture context
      // No awaits/toasts/setTimeout BEFORE connect() to preserve Chrome's user gesture
      try {
        setConnectingWallet(matchingWallet.adapter.name);
        setConnectTimeout(false);
        setDialogOpen(false);
        
        select(matchingWallet.adapter.name);
        connect(); // Call immediately, no awaits before this
        
        // Start timeout AFTER connect() is called
        connectTimeoutRef.current = setTimeout(() => {
          if (!connected) {
            handleMWATimeout();
          }
        }, CONNECT_TIMEOUT_MS);
      } catch (err) {
        console.error('[Wallet] Connect failed:', err);
        setConnectingWallet(null);
        if (isMobile) {
          setShowFallbackPanel(true);
        }
      }
    } else if (isMobile && !isInWalletBrowser) {
      // On mobile outside wallet browser, open deep link
      handleWalletDeepLink(walletId as 'phantom' | 'solflare' | 'backpack');
    } else {
      toast.error(`${walletId} wallet not detected. Please install it first.`);
    }
  };

  // Not connected state
  if (!connected) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="default"
            size="sm"
            className="gap-2"
          >
            <Wallet size={16} />
            {t("wallet.connect")}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-4">
            {/* Mobile helper text */}
            {isMobile && !isInWalletBrowser && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-2">
                <div className="flex items-start gap-2">
                  <Smartphone size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    For best experience, open this site inside your wallet's built-in browser (Phantom/Solflare/Backpack).
                  </p>
                </div>
              </div>
            )}

            {/* 3 Wallet buttons with icons - clean custom UI */}
            {WALLET_CONFIG.map((wallet) => {
              const detected = isWalletDetected(wallet.id);
              return (
                <Button
                  key={wallet.id}
                  variant="outline"
                  className="w-full justify-start gap-3 h-14"
                  onClick={() => handleWalletClick(wallet.id)}
                >
                  <img 
                    src={wallet.icon} 
                    alt={wallet.name} 
                    className="w-8 h-8"
                  />
                  <div className="flex flex-col items-start">
                    <span className="font-medium">{wallet.name}</span>
                    {detected && (
                      <span className="text-xs text-green-500">{t("wallet.detected")}</span>
                    )}
                    {isMobile && !isInWalletBrowser && !detected && (
                      <span className="text-xs text-muted-foreground">{t("wallet.openInWalletBrowser")}</span>
                    )}
                  </div>
                </Button>
              );
            })}

            {/* Mobile: How to open in wallet browser with globe images */}
            {isMobile && !isInWalletBrowser && (
              <div className="border-t border-border pt-4 mt-2">
                <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <span className="text-lg">🌐</span>
                  How to open in wallet browser
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {/* Phantom */}
                  <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/50">
                    <img 
                      src={phantomIcon} 
                      alt="Phantom" 
                      className="w-6 h-6"
                    />
                    <span className="text-[10px] font-medium">Phantom</span>
                    <div className="w-full aspect-square bg-muted/50 rounded flex flex-col items-center justify-center p-1">
                      <span className="text-2xl mb-0.5">🌐</span>
                      <span className="text-[8px] text-muted-foreground text-center leading-tight">Tap globe<br/>bottom nav</span>
                    </div>
                  </div>
                  
                  {/* Solflare */}
                  <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/50">
                    <img 
                      src={solflareIcon} 
                      alt="Solflare" 
                      className="w-6 h-6"
                    />
                    <span className="text-[10px] font-medium">Solflare</span>
                    <div className="w-full aspect-square bg-muted/50 rounded flex flex-col items-center justify-center p-1">
                      <span className="text-2xl mb-0.5">🌐</span>
                      <span className="text-[8px] text-muted-foreground text-center leading-tight">Browser<br/>tab</span>
                    </div>
                  </div>
                  
                  {/* Backpack */}
                  <div className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 border border-border/50">
                    <img 
                      src={backpackIcon} 
                      alt="Backpack" 
                      className="w-6 h-6"
                    />
                    <span className="text-[10px] font-medium">Backpack</span>
                    <div className="w-full aspect-square bg-muted/50 rounded flex flex-col items-center justify-center p-1">
                      <span className="text-2xl mb-0.5">🌐</span>
                      <span className="text-[8px] text-muted-foreground text-center leading-tight">Tap globe<br/>icon</span>
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  Open wallet app → tap globe icon → paste 1mgaming.com
                </p>
              </div>
            )}

            {/* In wallet browser success */}
            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-2 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}

            {/* Get Wallet Section */}
            <div className="border-t border-border pt-4 mt-2">
              <p className="text-sm font-medium text-foreground mb-2">{t("wallet.getWallet")}</p>
              <p className="text-xs text-muted-foreground mb-3">{t("wallet.getWalletDesc")}</p>
              <div className="grid grid-cols-3 gap-2">
                <a
                  href="https://phantom.app/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg" alt="Phantom" className="w-6 h-6" />
                  <span className="text-xs font-medium flex items-center gap-1">
                    Phantom <ExternalLink size={10} />
                  </span>
                </a>
                <a
                  href="https://solflare.com/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg" alt="Solflare" className="w-6 h-6" />
                  <span className="text-xs font-medium flex items-center gap-1">
                    Solflare <ExternalLink size={10} />
                  </span>
                </a>
                <a
                  href="https://backpack.app/download"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col items-center gap-1.5 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50"
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg" alt="Backpack" className="w-6 h-6" />
                  <span className="text-xs font-medium flex items-center gap-1">
                    Backpack <ExternalLink size={10} />
                  </span>
                </a>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Connected state
  const shortAddress = publicKey 
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : '--';

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Main wallet button with disconnect option */}
      <div className="flex items-center gap-1">
        <Link to={`/player/${publicKey?.toBase58()}`}>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            title="My Profile"
          >
            <User size={14} />
          </Button>
        </Link>
        
        <Button
          onClick={handleCopyAddress}
          variant="outline"
          size="sm"
          className="gap-2 font-mono text-xs"
        >
          {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          {shortAddress}
        </Button>
        
        <Button
          onClick={fetchBalance}
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          disabled={balanceLoading}
        >
          <RefreshCw size={14} className={balanceLoading ? 'animate-spin' : ''} />
        </Button>
        
        <Button
          onClick={handleDisconnect}
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
        >
          <LogOut size={14} />
        </Button>
      </div>
      
      {/* Balance display with error banner */}
      <div className="flex items-center gap-2 text-xs">
        {balanceError ? (
          <div className="bg-destructive/10 border border-destructive/30 rounded px-2 py-1 text-destructive flex items-center gap-1">
            <AlertCircle size={12} />
            <span className="max-w-[200px] truncate" title={balanceError}>
              {balanceError.slice(0, 50)}{balanceError.length > 50 ? '...' : ''}
            </span>
          </div>
        ) : balanceLoading ? (
          <span className="text-muted-foreground">{t("common.loading")}</span>
        ) : balance !== null ? (
          <span className="text-primary font-medium">{balance.toFixed(4)} SOL</span>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </div>
      
      {/* Network Proof Badge - compact view */}
      <NetworkProofBadge compact showBalance={false} />
    </div>
  );
}
