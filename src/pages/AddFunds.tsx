import { useWallet } from "@/hooks/useWallet";
import { useSolPrice } from "@/hooks/useSolPrice";
import { Wallet, ArrowRightLeft, Send, Info, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletModal } from "@/components/SolanaProvider";
import { getSolanaCluster } from "@/lib/solana-config";

const AddFunds = () => {
  const { isConnected, address } = useWallet();
  const { setVisible } = useWalletModal();
  const { price, loading, refetch } = useSolPrice();
  const cluster = getSolanaCluster();
  const isDevnet = cluster === "devnet";

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-2 font-cinzel">
            Add SOL Funds
          </h1>
          <p className="text-muted-foreground">
            Fund your wallet with SOL to play competitive games
          </p>
          
          {/* SOL Price Display */}
          <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 bg-card border border-border rounded-lg">
            <span className="text-sm text-muted-foreground">SOL Price:</span>
            <span className="font-semibold text-primary">
              {loading ? "..." : price ? `$${price.toFixed(2)}` : "N/A"}
            </span>
            <button 
              onClick={refetch} 
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Refresh price"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>

        {/* Wallet Connection Status */}
        {!isConnected ? (
          <div className="bg-card border border-border rounded-lg p-6 text-center mb-8">
            <Wallet className="mx-auto text-primary mb-4" size={48} />
            <h2 className="text-xl font-semibold mb-2">Connect Your Wallet</h2>
            <p className="text-muted-foreground mb-4">
              Connect your Solana wallet to view your balance and add funds.
            </p>
            <Button onClick={() => setVisible(true)}>
              <Wallet className="mr-2" size={18} />
              Connect Wallet
            </Button>
          </div>
        ) : (
          <div className="bg-card border border-primary/30 rounded-lg p-6 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Connected Wallet</p>
                <p className="font-mono text-sm">{address?.slice(0, 8)}...{address?.slice(-8)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Network</p>
                <p className={`font-medium ${isDevnet ? "text-amber-500" : "text-green-500"}`}>
                  Solana {isDevnet ? "Devnet" : "Mainnet"}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-6">
          {/* Step 1 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Wallet className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  1. Get a Solana Wallet
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  Install a Solana wallet like Phantom, Solflare, or Backpack. These are browser extensions that securely store your SOL.
                </p>
                <div className="flex flex-wrap gap-2">
                  <a 
                    href="https://phantom.app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Phantom <ExternalLink size={12} />
                  </a>
                  <a 
                    href="https://solflare.com" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Solflare <ExternalLink size={12} />
                  </a>
                  <a 
                    href="https://backpack.app" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                  >
                    Backpack <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            </div>
          </section>

          {/* Step 2 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <ArrowRightLeft className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  2. Buy or Transfer SOL
                </h2>
                <p className="text-muted-foreground leading-relaxed mb-3">
                  Purchase SOL from an exchange (Coinbase, Binance, Kraken) or transfer from another wallet. Most wallets also have built-in purchase options.
                </p>
                {isDevnet && (
                  <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-sm text-amber-500 font-medium mb-2">🧪 Devnet Mode</p>
                    <p className="text-sm text-muted-foreground mb-2">
                      Get free test SOL from the Solana faucet:
                    </p>
                    <a 
                      href="https://faucet.solana.com" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      Solana Faucet <ExternalLink size={12} />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Step 3 */}
          <section className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Send className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-2">
                  3. Start Playing
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  Once you have SOL in your wallet, you can create or join game rooms. Entry fees are paid in SOL, and winners receive their prize directly to their wallet.
                </p>
              </div>
            </div>
          </section>

          {/* Important Info */}
          <section className="bg-primary/5 border border-primary/20 rounded-lg p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-full shrink-0">
                <Info className="text-primary" size={24} />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-3">
                  Important Information
                </h2>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    All entry fees and prizes are in <strong className="text-foreground">SOL</strong> on the Solana network.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    You'll need a small amount of SOL for network fees (typically less than $0.01).
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    1M Gaming does NOT buy, sell, or trade cryptocurrency.
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 bg-primary rounded-full mt-2 shrink-0" />
                    Winners receive prizes minus a 5% platform fee.
                  </li>
                </ul>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddFunds;
