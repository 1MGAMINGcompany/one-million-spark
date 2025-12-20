import { useState, useCallback, useEffect, useRef } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle, Smartphone, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fetchBalance as fetchBalanceRpc, is403Error } from "@/lib/solana-rpc";
import { NetworkProofBadge } from "./NetworkProofBadge";

const CONNECT_TIMEOUT_MS = 8000;

// Device detection using navigator.userAgent
const getIsMobile = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// SOLANA-ONLY: Allowed wallet names (case-insensitive substring match)
const ALLOWED_SOLANA_WALLETS = ['phantom', 'solflare', 'backpack', 'glow', 'trust'];

// Wallets to explicitly BLOCK (EVM/non-Solana)
const BLOCKED_WALLET_NAMES = [
  'metamask',
  'mobile wallet adapter', // MWA doesn't work well on desktop
  'walletconnect',
  'coinbase',
  'rainbow',
  'ledger live',
  'torus',
];

export function WalletButton() {
  const { connected, publicKey, disconnect, connecting, wallets, select, wallet } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [connectTimeout, setConnectTimeout] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMobile = getIsMobile();

  // Clear timeout on unmount or when connected
  useEffect(() => {
    if (connected && connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
      setConnectTimeout(false);
      setConnectingWallet(null);
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
      
      // Show specific error for 403
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

  const handleSelectWallet = async (walletName: string) => {
    const selectedWallet = wallets.find(w => w.adapter.name === walletName);
    if (selectedWallet) {
      try {
        setConnectingWallet(walletName);
        setConnectTimeout(false);
        
        // Start timeout for connection
        connectTimeoutRef.current = setTimeout(() => {
          if (!connected) {
            setConnectTimeout(true);
          }
        }, CONNECT_TIMEOUT_MS);

        select(selectedWallet.adapter.name);
        setDialogOpen(false);
      } catch (err) {
        console.error('[Wallet] Select error:', err);
        toast.error('Failed to select wallet');
        setConnectingWallet(null);
      }
    }
  };

  const handleRetryConnect = () => {
    setConnectTimeout(false);
    if (wallet) {
      try {
        wallet.adapter.connect();
      } catch (err) {
        console.error('[Wallet] Retry connect error:', err);
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setBalanceError(null);
      setConnectTimeout(false);
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

  // SOLANA-ONLY: Filter to allowed wallets, block EVM/MetaMask
  const filteredWallets = wallets.filter(w => {
    const name = w.adapter.name.toLowerCase();
    
    // Block any explicitly blocked wallets (MetaMask, WalletConnect, etc.)
    if (BLOCKED_WALLET_NAMES.some(blocked => name.includes(blocked))) {
      return false;
    }
    
    // On desktop: never show MWA
    if (!isMobile && name.includes('mobile wallet adapter')) {
      return false;
    }
    
    // Only allow known Solana wallets
    const isAllowed = ALLOWED_SOLANA_WALLETS.some(allowed => name.includes(allowed));
    
    // Also allow MWA on mobile
    const isMWA = name.includes('mobile wallet adapter');
    if (isMobile && isMWA) {
      return true;
    }
    
    return isAllowed;
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

  // Connection timeout state - show retry UI
  if ((connecting || connectingWallet) && connectTimeout) {
    return (
      <div className="flex flex-col items-center gap-2 p-4 bg-card rounded-lg border">
        <AlertCircle className="text-amber-500" size={24} />
        <p className="text-sm text-muted-foreground text-center max-w-xs">
          Connection didn't start. Please open this site inside your wallet's browser (Phantom/Solflare/Backpack) and try again.
        </p>
        <div className="flex gap-2 mt-2">
          <Button size="sm" variant="outline" onClick={handleRetryConnect}>
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => {
            setConnectTimeout(false);
            setConnectingWallet(null);
            handleDisconnect();
          }}>
            Cancel
          </Button>
        </div>
        {isMobile && (
          <p className="text-xs text-amber-500 flex items-center gap-1 mt-2">
            <Smartphone size={12} />
            Open in wallet browser for best experience
          </p>
        )}
      </div>
    );
  }

  // Show connecting state with wallet name
  if (connecting || connectingWallet) {
    return (
      <Button disabled variant="default" size="sm" className="gap-2">
        <Loader2 size={16} className="animate-spin" />
        Connecting{connectingWallet ? ` to ${connectingWallet}` : ''}...
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
            Select Wallet
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {sortedWallets.length === 0 ? (
              <div className="text-center py-4">
                <p className="text-muted-foreground mb-2">
                  No wallets detected.
                </p>
                <p className="text-sm text-muted-foreground">
                  Please install Phantom, Solflare, or Backpack.
                </p>
                {isMobile && (
                  <p className="text-xs text-amber-500 mt-3 flex items-center justify-center gap-1">
                    <Smartphone size={12} />
                    Open this page in your wallet's browser
                  </p>
                )}
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
                        <span className="ml-auto text-xs text-green-500">Detected</span>
                      )}
                      {isMWA && (
                        <span className="ml-auto text-xs text-muted-foreground">Mobile</span>
                      )}
                    </Button>
                  );
                })}
                {isMobile && (
                  <p className="text-xs text-amber-500 text-center mt-3 flex items-center justify-center gap-1 bg-amber-500/10 p-2 rounded">
                    <Smartphone size={12} />
                    On mobile, open 1mgaming.com inside your wallet's built-in browser for the smoothest connect.
                  </p>
                )}
              </>
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
          <span className="text-muted-foreground">Loading...</span>
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
