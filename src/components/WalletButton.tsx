import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { fetchBalance as fetchBalanceRpc, is403Error } from "@/lib/solana-rpc";
import { NetworkProofBadge } from "./NetworkProofBadge";

const CONNECT_TIMEOUT_MS = 8000;

// Platform detection
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const getIsAndroid = () => /Android/i.test(navigator.userAgent);
const getIsIOS = () => /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function WalletButton() {
  const { t } = useTranslation();
  const { connected, publicKey, disconnect, connecting, connect, wallet, select, wallets } = useWallet();
  const { setVisible } = useWalletModal();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showHelpPanel, setShowHelpPanel] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = getIsMobile();
  const isAndroid = getIsAndroid();
  const isIOS = getIsIOS();

  // Clear timeout on unmount or when connected
  useEffect(() => {
    if (connected) {
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      setIsConnecting(false);
      setShowHelpPanel(false);
      setConnectError(null);
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

  // Main connect handler - calls connect() directly
  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    setConnectError(null);
    setShowHelpPanel(false);

    // Start timeout
    connectTimeoutRef.current = setTimeout(() => {
      if (!connected) {
        setShowHelpPanel(true);
        setConnectError(t("wallet.connectionTimedOut"));
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      // On mobile, try direct connect first (uses MWA on Android)
      if (isMobile) {
        // If no wallet selected, try to select the first available
        if (!wallet) {
          const phantomAdapter = wallets.find(w => 
            w.adapter.name.toLowerCase().includes('phantom')
          );
          const solflareAdapter = wallets.find(w => 
            w.adapter.name.toLowerCase().includes('solflare')
          );
          const mwaAdapter = wallets.find(w => 
            w.adapter.name.toLowerCase().includes('mobile wallet adapter')
          );
          
          // Prefer MWA on Android, then Phantom, then Solflare
          const preferredWallet = (isAndroid && mwaAdapter) || phantomAdapter || solflareAdapter;
          
          if (preferredWallet) {
            select(preferredWallet.adapter.name);
            // Give time for selection to take effect
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        }
        
        // Try to connect
        await connect();
      } else {
        // Desktop: show the wallet modal
        setVisible(true);
        setIsConnecting(false);
        if (connectTimeoutRef.current) {
          clearTimeout(connectTimeoutRef.current);
        }
      }
    } catch (err) {
      console.error('[Wallet] Connect error:', err);
      const errorMsg = err instanceof Error ? err.message : 'Connection failed';
      setConnectError(errorMsg);
      setShowHelpPanel(true);
      
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
      }
    } finally {
      // Only set not connecting if we didn't open modal
      if (isMobile) {
        // Keep connecting state until timeout or success
      } else {
        setIsConnecting(false);
      }
    }
  }, [connected, connect, wallet, wallets, select, setVisible, isMobile, isAndroid, t]);

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setBalanceError(null);
      setShowHelpPanel(false);
      setConnectError(null);
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

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t("wallet.copied"));
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handleRetry = () => {
    setShowHelpPanel(false);
    setConnectError(null);
    handleConnect();
  };

  // Connecting state
  if ((connecting || isConnecting) && !showHelpPanel) {
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
      <>
        <Button
          variant="default"
          size="sm"
          className="gap-2"
          onClick={handleConnect}
          disabled={isConnecting}
        >
          <Wallet size={16} />
          {t("wallet.connect")}
        </Button>

        {/* Help panel - only shown if connect fails or times out */}
        <Sheet open={showHelpPanel} onOpenChange={setShowHelpPanel}>
          <SheetContent side="bottom" className="max-h-[60vh]">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <AlertCircle className="text-amber-500" size={20} />
                {t("wallet.connectionFailed")}
              </SheetTitle>
            </SheetHeader>
            
            <div className="py-4 space-y-4">
              {connectError && (
                <p className="text-sm text-muted-foreground">{connectError}</p>
              )}
              
              <div className="space-y-3">
                <p className="text-sm font-medium">{t("wallet.tryTheseSteps")}</p>
                
                {isAndroid && (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>1. {t("wallet.phantom.step1")}</p>
                    <p>2. {t("wallet.phantom.step2")}</p>
                    <p>3. {t("wallet.phantom.step3")}</p>
                  </div>
                )}
                
                {isIOS && (
                  <div className="text-sm text-muted-foreground space-y-2">
                    <p>{t("wallet.mobileBrowserLimitation")}</p>
                    <p>1. {t("wallet.phantom.step1")}</p>
                    <p>2. {t("wallet.phantom.step2")}</p>
                    <p>3. {t("wallet.phantom.step3")}</p>
                  </div>
                )}
                
                {!isMobile && (
                  <p className="text-sm text-muted-foreground">
                    {t("wallet.desktopWalletRequired")}
                  </p>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <Button onClick={handleCopyLink} variant="outline" className="gap-2">
                  <Copy size={16} />
                  {t("wallet.copyLink")}
                </Button>
                
                <Button onClick={handleRetry} variant="default" className="gap-2">
                  <RefreshCw size={16} />
                  {t("wallet.retryConnection")}
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
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
