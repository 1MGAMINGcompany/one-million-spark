import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Smartphone, Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { fetchBalance as fetchBalanceRpc, is403Error } from "@/lib/solana-rpc";
import { NetworkProofBadge } from "./NetworkProofBadge";
import { MobileWalletFallback } from "./MobileWalletFallback";

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

export function WalletButton() {
  const { t } = useTranslation();
  const { connected, publicKey, disconnect, connecting, wallets, select, wallet } = useWallet();
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

  // Handle MWA timeout - show fallback panel
  const handleMWATimeout = useCallback(() => {
    setConnectTimeout(true);
    setShowFallbackPanel(true);
  }, []);

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
        setShowFallbackPanel(true);
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

  // Show fallback panel
  if (showFallbackPanel) {
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
          <div className="grid gap-2 py-4">
            {/* Mobile: Show wallet-specific buttons */}
            {isMobile && !isInWalletBrowser && (
              <>
                <p className="text-sm text-muted-foreground mb-2">{t("wallet.chooseYourWallet")}</p>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => handleWalletDeepLink('phantom')}
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/phantom.svg" alt="Phantom" className="w-6 h-6" />
                  <div className="flex flex-col items-start">
                    <span>{t("wallet.phantom.title")}</span>
                    <span className="text-xs text-muted-foreground">{t("wallet.openInWalletBrowser")}</span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => handleWalletDeepLink('solflare')}
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/solflare.svg" alt="Solflare" className="w-6 h-6" />
                  <div className="flex flex-col items-start">
                    <span>{t("wallet.solflare.title")}</span>
                    <span className="text-xs text-muted-foreground">
                      {isIOS ? t("wallet.recommendedIPhone") : t("wallet.openInWalletBrowser")}
                    </span>
                  </div>
                  {isIOS && <span className="ml-auto text-xs text-green-500">★</span>}
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start gap-3 h-12"
                  onClick={() => handleWalletDeepLink('backpack')}
                >
                  <img src="https://raw.githubusercontent.com/solana-labs/wallet-adapter/master/packages/wallets/icons/backpack.svg" alt="Backpack" className="w-6 h-6" />
                  <div className="flex flex-col items-start">
                    <span>{t("wallet.backpack.title")}</span>
                    <span className="text-xs text-muted-foreground">{t("wallet.openInWalletBrowser")}</span>
                  </div>
                </Button>
              </>
            )}

            {/* Wallet list */}
            {sortedWallets.length === 0 && !isMobile ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">
                  {t("wallet.noWalletsDetected")}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("wallet.installWallet")}
                </p>
              </div>
            ) : (
              <>
                {sortedWallets.map((w) => {
                  const isMWA = w.adapter.name.toLowerCase().includes('mobile wallet adapter');
                  return (
                    <Button
                      key={w.adapter.name}
                      variant="outline"
                      className="w-full justify-start gap-3 h-12"
                      onClick={() => handleSelectWallet(w.adapter.name)}
                    >
                      {w.adapter.icon && (
                        <img 
                          src={w.adapter.icon} 
                          alt={w.adapter.name} 
                          className="w-6 h-6"
                        />
                      )}
                      <span>{w.adapter.name}</span>
                      {w.readyState === 'Installed' && (
                        <span className="ml-auto text-xs text-green-500">{t("wallet.detected")}</span>
                      )}
                      {isMWA && (
                        <span className="ml-auto text-xs text-blue-500">{t("wallet.android")}</span>
                      )}
                    </Button>
                  );
                })}
              </>
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

            {/* Mobile guidance */}
            {isMobile && !isInWalletBrowser && (
              <div className="text-xs text-amber-500 text-center mt-3 flex flex-col gap-1 bg-amber-500/10 p-3 rounded">
                <p className="flex items-center justify-center gap-1">
                  <Smartphone size={12} />
                  {isIOS ? t("wallet.iphoneHint") : t("wallet.androidHint")}
                </p>
              </div>
            )}

            {isMobile && isInWalletBrowser && (
              <p className="text-xs text-green-500 text-center mt-3 bg-green-500/10 p-2 rounded">
                ✓ {t("wallet.inWalletBrowser")}
              </p>
            )}
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
