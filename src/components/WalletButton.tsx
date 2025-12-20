import { useState, useCallback, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Wallet, LogOut, RefreshCw, Copy, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export function WalletButton() {
  const { connected, publicKey, disconnect, connecting, wallets, select, wallet } = useWallet();
  const { connection } = useConnection();
  
  const [balance, setBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!connected || !publicKey) {
      setBalance(null);
      return;
    }
    
    setBalanceLoading(true);
    setBalanceError(null);
    
    try {
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      const sol = lamports / LAMPORTS_PER_SOL;
      setBalance(sol);
      console.info(`[Wallet] Balance: ${sol.toFixed(6)} SOL (${lamports} lamports)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch balance';
      console.error('[Wallet] Balance error:', msg);
      setBalanceError(msg);
      toast.error(`Balance fetch failed: ${msg}`);
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
        select(selectedWallet.adapter.name);
        setDialogOpen(false);
      } catch (err) {
        console.error('[Wallet] Select error:', err);
        toast.error('Failed to select wallet');
      }
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect();
      setBalance(null);
      setBalanceError(null);
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

  // Not connected state
  if (!connected) {
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogTrigger asChild>
          <Button
            disabled={connecting}
            variant="default"
            size="sm"
            className="gap-2"
          >
            <Wallet size={16} />
            {connecting ? 'Connecting...' : 'Select Wallet'}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect Wallet</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {wallets.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                No wallets detected. Please install Phantom, Solflare, or Backpack.
              </p>
            ) : (
              wallets.map((w) => (
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
                </Button>
              ))
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
    <div className="flex flex-col items-end gap-1">
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
      
      {/* Balance display */}
      <div className="flex items-center gap-2 text-xs">
        {balanceError ? (
          <span className="text-destructive flex items-center gap-1">
            <AlertCircle size={12} />
            Error
          </span>
        ) : balanceLoading ? (
          <span className="text-muted-foreground">Loading...</span>
        ) : balance !== null ? (
          <span className="text-primary font-medium">{balance.toFixed(4)} SOL</span>
        ) : (
          <span className="text-muted-foreground">--</span>
        )}
      </div>
    </div>
  );
}
