import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Loader2 } from "lucide-react";
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
  const hasSolanaProvider = !!win?.solana;
  return isInPhantom || isInSolflare || hasSolanaProvider;
};

// SOLANA-ONLY: Allowed wallet names
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
  const [desktopDialogOpen, setDesktopDialogOpen] = useState(false);
  const [connectTimeout, setConnectTimeout] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showFallbackPanel, setShowFallbackPanel] = useState(false);
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
      setIsConnecting(false);
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

  // Find MWA wallet for mobile
  const getMWAWallet = useCallback(() => {
    return wallets.find(w => 
      w.adapter.name.toLowerCase().includes('mobile wallet adapter')
    );
  }, [wallets]);

  // Find first available Solana wallet (for wallet browser or desktop)
  const getFirstSolanaWallet = useCallback(() => {
    const filtered = wallets.filter(w => {
      const name = w.adapter.name.toLowerCase();
      if (BLOCKED_WALLET_NAMES.some(blocked => name.includes(blocked))) return false;
      if (name.includes('mobile wallet adapter')) return false;
      return ALLOWED_SOLANA_WALLETS.some(allowed => name.includes(allowed));
    });
    
    // Prioritize installed wallets
    const installed = filtered.find(w => w.readyState === 'Installed');
    return installed || filtered[0];
  }, [wallets]);

  // MOBILE: One-tap connect via MWA
  const handleMobileConnect = useCallback(async () => {
    setIsConnecting(true);
    setConnectTimeout(false);
    setShowFallbackPanel(false);

    // Start timeout
    connectTimeoutRef.current = setTimeout(() => {
      if (!connected) {
        setConnectTimeout(true);
        setShowFallbackPanel(true);
        setIsConnecting(false);
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      // If in wallet browser, use injected provider
      if (isInWalletBrowser) {
        const solanaWallet = getFirstSolanaWallet();
        if (solanaWallet) {
          select(solanaWallet.adapter.name);
        } else {
          throw new Error('No wallet detected');
        }
        return;
      }

      // On Android, use MWA
      if (isAndroid) {
        const mwaWallet = getMWAWallet();
        if (mwaWallet) {
          select(mwaWallet.adapter.name);
          return;
        }
      }

      // Fallback: try first available wallet
      const solanaWallet = getFirstSolanaWallet();
      if (solanaWallet) {
        select(solanaWallet.adapter.name);
      } else {
        // No wallet available, show fallback panel
        setShowFallbackPanel(true);
        setIsConnecting(false);
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
        }
      }
    } catch (err) {
      console.error('[Wallet] Mobile connect error:', err);
      setShowFallbackPanel(true);
      setIsConnecting(false);
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    }
  }, [connected, isInWalletBrowser, isAndroid, getFirstSolanaWallet, getMWAWallet, select]);

  // DESKTOP: Select wallet from modal
  const handleDesktopSelectWallet = async (walletName: string) => {
    const selectedWallet = wallets.find(w => w.adapter.name === walletName);
    if (selectedWallet) {
      try {
        select(selectedWallet.adapter.name);
        setDesktopDialogOpen(false);
      } catch (err) {
        console.error('[Wallet] Select error:', err);
        toast.error(t("wallet.connectionFailed"));
      }
    }
  };

  const handleRetryConnect = () => {
    setConnectTimeout(false);
    setShowFallbackPanel(false);
    handleMobileConnect();
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setBalanceError(null);
      setConnectTimeout(false);
      setShowFallbackPanel(false);
      setIsConnecting(false);
    } catch (err) {
      console.error('[Wallet] Disconnect error:', err);
    }
  };

  const handleCopyAddress = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      toast.success(t("wallet.copied"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("wallet.copyFailed"));
    }
  };

  // Filter wallets for desktop modal (no MWA, no EVM)
  const desktopWallets = wallets.filter(w => {
    const name = w.adapter.name.toLowerCase();
    if (BLOCKED_WALLET_NAMES.some(blocked => name.includes(blocked))) return false;
    if (name.includes('mobile wallet adapter')) return false;
    return ALLOWED_SOLANA_WALLETS.some(allowed => name.includes(allowed));
  }).sort((a, b) => {
    const aInstalled = a.readyState === 'Installed';
    const bInstalled = b.readyState === 'Installed';
    if (aInstalled && !bInstalled) return -1;
    if (!aInstalled && bInstalled) return 1;
    
    const priority = ['phantom', 'solflare', 'backpack'];
    const aIdx = priority.findIndex(p => a.adapter.name.toLowerCase().includes(p));
    const bIdx = priority.findIndex(p => b.adapter.name.toLowerCase().includes(p));
    if (aIdx !== -1 && bIdx === -1) return -1;
    if (aIdx === -1 && bIdx !== -1) return 1;
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    return 0;
  });

  // ===== RENDER STATES =====

  // Show fallback panel (only after timeout/error on mobile)
  if (showFallbackPanel && isMobile) {
    return (
      <MobileWalletFallback 
        onClose={() => {
          setShowFallbackPanel(false);
          setConnectTimeout(false);
          setIsConnecting(false);
        }}
        isAndroid={isAndroid}
        isIOS={isIOS}
        selectedWallet={null}
      />
    );
  }

  // Connecting state (spinner)
  if (connecting || isConnecting) {
    return (
      <Button disabled variant="default" size="sm" className="gap-2">
        <Loader2 size={16} className="animate-spin" />
        {t("wallet.connecting")}
      </Button>
    );
  }

  // Connection timeout with retry (mobile)
  if (connectTimeout && isMobile) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border">
        <AlertCircle className="text-amber-500" size={24} />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          {t("wallet.connectionTimedOut")}
        </p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={handleRetryConnect}>
            {t("wallet.retry")}
          </Button>
          <Button size="sm" variant="default" onClick={() => setShowFallbackPanel(true)}>
            {t("wallet.showHelp")}
          </Button>
        </div>
        <Button 
          size="sm" 
          variant="ghost" 
          onClick={() => {
            setConnectTimeout(false);
            setIsConnecting(false);
          }}
          className="mt-1"
        >
          {t("wallet.cancel")}
        </Button>
      </div>
    );
  }

  // Not connected - show connect button
  if (!connected) {
    // MOBILE: Simple one-tap connect button
    if (isMobile) {
      return (
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={handleMobileConnect}
        >
          <Wallet size={16} />
          {t("wallet.connect")}
        </Button>
      );
    }

    // DESKTOP: Button opens wallet selection modal
    return (
      <>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={() => setDesktopDialogOpen(true)}
        >
          <Wallet size={16} />
          {t("wallet.connect")}
        </Button>

        <Dialog open={desktopDialogOpen} onOpenChange={setDesktopDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("wallet.connectWallet")}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-2 py-4">
              {desktopWallets.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-muted-foreground mb-2">
                    {t("wallet.noWalletsDetected")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {t("wallet.installWallet")}
                  </p>
                </div>
              ) : (
                desktopWallets.map((w) => (
                  <Button
                    key={w.adapter.name}
                    variant="outline"
                    className="w-full justify-start gap-3 h-12"
                    onClick={() => handleDesktopSelectWallet(w.adapter.name)}
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
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Connected state
  const shortAddress = publicKey 
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : '--';

  return (
    <div className="flex flex-col items-end gap-2">
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
      
      <NetworkProofBadge compact showBalance={false} />
    </div>
  );
}
