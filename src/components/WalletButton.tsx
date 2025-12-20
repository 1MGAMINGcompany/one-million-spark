import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useState, useEffect, useCallback } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

// Mobile detection helper
function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// Check if we're in a wallet's in-app browser
function isInWalletBrowser(): boolean {
  const win = window as any;
  return !!(
    win.phantom?.solana?.isPhantom ||
    win.solana?.isPhantom ||
    win.solflare?.isSolflare ||
    win.backpack?.isBackpack
  );
}

export function WalletButton() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showMobileHint, setShowMobileHint] = useState(false);

  // Show mobile hint on mobile if not in wallet browser
  useEffect(() => {
    if (isMobileDevice() && !isInWalletBrowser() && !connected) {
      setShowMobileHint(true);
    } else {
      setShowMobileHint(false);
    }
  }, [connected]);

  const fetchBalance = useCallback(async () => {
    // Only check balance when wallet is fully connected with publicKey
    if (!connected || !publicKey || !connection) {
      setBalance(null);
      return;
    }
    
    try {
      setLoadingBalance(true);
      // Use 'confirmed' commitment for reliable balance
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      const sol = lamports / LAMPORTS_PER_SOL;
      setBalance(sol);
      
      // Log for debugging (minimal, non-debug way)
      console.info(`[Wallet] Balance: ${sol.toFixed(4)} SOL | Address: ${publicKey.toBase58().slice(0, 8)}...`);
    } catch (err) {
      console.warn('[Wallet] Failed to fetch balance:', err);
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [connected, publicKey, connection]);

  // Fetch balance on mount and when connection state changes
  useEffect(() => {
    if (connected && publicKey) {
      fetchBalance();
      
      // Refresh balance every 30 seconds
      const interval = setInterval(fetchBalance, 30000);
      return () => clearInterval(interval);
    } else {
      setBalance(null);
    }
  }, [connected, publicKey, fetchBalance]);

  // Subscribe to account changes for real-time updates
  useEffect(() => {
    if (!connected || !publicKey || !connection) return;

    const subId = connection.onAccountChange(
      publicKey,
      (accountInfo) => {
        const sol = accountInfo.lamports / LAMPORTS_PER_SOL;
        setBalance(sol);
      },
      'confirmed'
    );

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [connected, publicKey, connection]);

  return (
    <div className="flex flex-col items-end gap-1">
      {/* Standard Wallet Multi Button */}
      <WalletMultiButton 
        style={{
          backgroundColor: 'hsl(var(--primary))',
          color: 'hsl(var(--primary-foreground))',
          borderRadius: '0.5rem',
          fontSize: '0.875rem',
          height: '2.25rem',
          padding: '0 1rem',
        }}
      />
      
      {/* Mobile helper hint */}
      {showMobileHint && (
        <p className="text-xs text-muted-foreground max-w-[200px] text-right">
          💡 For best results, open this site in your wallet's browser
        </p>
      )}
      
      {/* Balance display when connected */}
      {connected && publicKey && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">{publicKey.toBase58().slice(0, 4)}...{publicKey.toBase58().slice(-4)}</span>
          <span className="text-primary font-medium">
            {loadingBalance ? '...' : balance !== null ? `${balance.toFixed(4)} SOL` : '--'}
          </span>
        </div>
      )}
    </div>
  );
}
