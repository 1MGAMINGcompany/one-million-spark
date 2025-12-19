import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { useWalletModal } from "./SolanaProvider";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, LogOut, Loader2, Coins } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function WalletButton() {
  const { connected, connecting, publicKey, disconnect, wallet } = useWallet();
  const { connection } = useConnection();
  const { setVisible } = useWalletModal();
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  const formatAddress = (address: string) =>
    `${address.slice(0, 4)}...${address.slice(-4)}`;

  const formatBalance = (sol: number) => {
    if (sol >= 1) return sol.toFixed(2);
    if (sol >= 0.01) return sol.toFixed(3);
    return sol.toFixed(4);
  };

  const fetchBalance = useCallback(async () => {
    if (!publicKey || !connection) {
      setBalance(null);
      return;
    }
    
    try {
      setLoadingBalance(true);
      const lamports = await connection.getBalance(publicKey);
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch (err) {
      setBalance(null);
    } finally {
      setLoadingBalance(false);
    }
  }, [publicKey, connection]);

  // Fetch balance on mount and when publicKey changes
  useEffect(() => {
    fetchBalance();
    
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  // Subscribe to account changes for real-time updates
  useEffect(() => {
    if (!publicKey || !connection) return;

    const subId = connection.onAccountChange(
      publicKey,
      (accountInfo) => {
        setBalance(accountInfo.lamports / LAMPORTS_PER_SOL);
      },
      "confirmed"
    );

    return () => {
      connection.removeAccountChangeListener(subId);
    };
  }, [publicKey, connection]);

  // Show spinner when connecting or auto-reconnecting
  if (connecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 min-w-[140px]">
        <Loader2 size={16} className="text-primary animate-spin" />
        <span className="text-muted-foreground">Reconnecting...</span>
      </Button>
    );
  }

  if (!connected || !publicKey) {
    return (
      <Button 
        size="sm" 
        onClick={() => setVisible(true)} 
        className="group gap-2 border border-transparent hover:border-primary/30 transition-all"
      >
        <Wallet 
          size={16} 
          className="text-primary-foreground group-hover:drop-shadow-[0_0_4px_hsl(45_93%_54%_/_0.5)] transition-all" 
        />
        Select Wallet
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="group gap-2 border-primary/30 hover:border-primary/50 transition-all"
        >
          {wallet?.adapter.icon && (
            <img 
              src={wallet.adapter.icon} 
              alt={wallet.adapter.name}
              className="w-4 h-4 rounded"
            />
          )}
          <span className="hidden sm:inline">{formatAddress(publicKey.toBase58())}</span>
          {balance !== null && (
            <span className="text-primary font-medium">
              {loadingBalance ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                `${formatBalance(balance)} SOL`
              )}
            </span>
          )}
          <ChevronDown size={14} className="text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover z-50 min-w-[200px]">
        {/* Balance Display */}
        <div className="px-2 py-2 border-b border-border/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Coins size={14} className="text-primary" />
            <span>Balance</span>
          </div>
          <div className="text-lg font-semibold text-foreground mt-1">
            {balance !== null ? (
              <span className="text-primary">{formatBalance(balance)} SOL</span>
            ) : loadingBalance ? (
              <span className="text-muted-foreground">Loading...</span>
            ) : (
              <span className="text-muted-foreground">--</span>
            )}
          </div>
        </div>
        
        <DropdownMenuItem className="gap-2 text-muted-foreground cursor-default">
          <Wallet size={16} />
          {wallet?.adapter.name}
        </DropdownMenuItem>
        <DropdownMenuItem className="gap-2 text-muted-foreground cursor-default text-xs">
          {publicKey.toBase58().slice(0, 12)}...{publicKey.toBase58().slice(-8)}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => setVisible(true)} className="gap-2 cursor-pointer">
          <Wallet size={16} className="text-primary" />
          Change Wallet
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => disconnect()} className="gap-2 cursor-pointer text-destructive">
          <LogOut size={16} />
          Disconnect
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
