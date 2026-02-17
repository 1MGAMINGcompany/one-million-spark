import { useWallet } from "@/hooks/useWallet";
import { useSolPrice } from "@/hooks/useSolPrice";
import { usePrivySolBalance } from "@/hooks/usePrivySolBalance";
import { AddSolCard } from "@/components/AddSolCard";
import { Wallet, CreditCard, Gamepad2, Link2, CheckCircle2, ExternalLink, RefreshCw, Sparkles, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFundWallet } from "@privy-io/react-auth/solana";
import { useLogin } from "@privy-io/react-auth";

const AddFunds = () => {
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();
  const { setVisible } = useWalletModal();
  const { price, loading, refetch } = useSolPrice();
  const navigate = useNavigate();
  const { isPrivyUser, walletAddress, balanceSol } = usePrivySolBalance();
  const { fundWallet } = useFundWallet();
  const { login } = useLogin();

  const handleBuyWithCard = async () => {
    if (!walletAddress) return;
    try {
      await fundWallet({
        address: walletAddress,
        options: {
          chain: "solana:mainnet",
          amount: "0.05",
        },
      });
    } catch (e) {
      console.warn("[AddFunds] fundWallet dismissed or failed:", e);
    }
  };

  const handleBuyOrLogin = async () => {
    if (isPrivyUser && walletAddress) {
      await handleBuyWithCard();
    } else {
      login();
    }
  };

  // Privy users with embedded wallets get the simplified view
  if (isPrivyUser && walletAddress) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 font-cinzel">
              {t("addFunds.heroTitle")}
            </h1>
            <p className="text-muted-foreground">
              {t("addFunds.heroSubtitlePrivy")}
            </p>
          </div>
          <AddSolCard walletAddress={walletAddress} balanceSol={balanceSol} />

          {/* Quick Info */}
          <div className="max-w-md mx-auto mt-6">
            <QuickInfoSection t={t} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 font-cinzel">
            {t("addFunds.heroTitle")}
          </h1>
          <p className="text-xl text-primary font-medium mb-2">
            {t("addFunds.heroTagline")}
          </p>
          <p className="text-muted-foreground">
            {t("addFunds.heroSubtitle")}
          </p>
          
          {/* SOL Price Display */}
          <div className="flex flex-col items-center gap-2 mt-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg">
              <span className="text-sm text-muted-foreground">{t("addFunds.solPrice")}:</span>
              <span className="font-semibold text-primary">
                {loading ? "..." : price ? `$${price.toFixed(2)}` : "N/A"}
              </span>
              <button 
                onClick={refetch} 
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={t("addFunds.refreshPrice")}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              <span className="text-primary">💰</span>
              <span>{t("addFunds.minEntry")}: <span className="text-foreground font-medium">$0.50 USD</span></span>
              <span className="text-muted-foreground/60">
                (~{price ? (0.5 / price).toFixed(4) : "0.004"} SOL)
              </span>
            </div>
          </div>

          {/* Buy with Card - Top CTA */}
          <div className="mt-5">
            <Button onClick={handleBuyOrLogin} size="lg" variant="gold" className="w-full text-lg">
              <CreditCard className="mr-2 h-5 w-5" />
              Buy with Card
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Credit Card · Apple Pay · Google Pay
            </p>
          </div>
        </div>

        {/* How Easy It Is - Visual Flow */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-center gap-4 md:gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">{t("addFunds.stepConnect")}</p>
            </div>
            <div className="text-primary text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">{t("addFunds.stepBuy")}</p>
            </div>
            <div className="text-primary text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">{t("addFunds.stepPlay")}</p>
            </div>
          </div>
          <p className="text-center text-muted-foreground text-sm mt-4">
            {t("addFunds.takesLessThan2Min")}
          </p>
        </div>

        {/* Wallet Connection Status */}
        {isConnected && (
          <div className="bg-card border border-primary/30 rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-green-400 font-medium">{t("addFunds.walletConnected")}</p>
                <p className="font-mono text-xs text-muted-foreground">{address?.slice(0, 8)}...{address?.slice(-8)}</p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
              Mainnet
            </span>
          </div>
        )}

        <div className="space-y-5">
          {/* Step 1: Get a Wallet */}
          <section className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  {t("addFunds.getWalletTitle")}
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                  {t("addFunds.getWalletDesc")}
                </p>
                
                <WalletGrid />

                {!isConnected && (
                  <Button onClick={() => setVisible(true)} className="w-full mt-4">
                    <Wallet className="mr-2 h-4 w-4" />
                    {t("wallet.connectWallet")}
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Step 2: Buy SOL */}
          <section className="bg-card border border-border rounded-xl p-6 relative overflow-hidden">
            {/* No Exchanges Badge */}
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                <Sparkles className="h-3 w-3" />
                {t("addFunds.noExchanges")}
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  {t("addFunds.buySolTitle")}
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                  {t("addFunds.buySolDesc")}
                </p>
                
                {/* Payment Methods */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                    <CreditCard className="h-4 w-4 text-primary" />
                    {t("addFunds.creditCard")}
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                    <span className="text-base"></span>
                    Apple Pay
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                    <span className="text-base">G</span>
                    Google Pay
                  </span>
                </div>

                <Button onClick={handleBuyOrLogin} size="lg" variant="gold" className="w-full text-lg">
                  <CreditCard className="mr-2 h-5 w-5" />
                  Buy with Card
                </Button>

                <p className="text-xs text-muted-foreground mt-3">
                  {t("addFunds.alreadyHaveSol")}
                </p>

              </div>
            </div>
          </section>

          {/* Quick Info */}
          <QuickInfoSection t={t} />

          {/* Get Wallet Links */}
          <section className="bg-card border border-border rounded-xl p-5">
            <h3 className="font-medium text-foreground mb-2">{t("addFunds.noWalletYet")}</h3>
            <p className="text-sm text-muted-foreground mb-4">{t("addFunds.downloadWallet")}</p>
            <WalletDownloadGrid />
          </section>

          {/* Fun CTA - Play with Friends */}
          <section className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                <Users className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              🎮 {t("addFunds.readyToPlay")}
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              {t("addFunds.createPrivateDesc")}
            </p>
            <p className="text-xs text-primary mb-4">
              ✨ {t("addFunds.privateRoomsNeverExpire")}
            </p>
            <Button onClick={() => navigate("/create-room")} variant="default" size="lg">
              {t("addFunds.createPrivateRoom")}
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
};

function QuickInfoSection({ t }: { t: (key: string) => string }) {
  return (
    <section className="bg-muted/20 border border-border/50 rounded-xl p-5">
      <h3 className="font-medium text-foreground mb-3">{t("addFunds.quickInfo")}</h3>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
          {t("addFunds.infoFeesInSol")}
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
          {t("addFunds.infoNetworkFees")}
        </li>
        <li className="flex items-start gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
          {t("addFunds.infoPlatformFee")}
        </li>
      </ul>
    </section>
  );
}

function WalletGrid() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <a href="https://phantom.app" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center"><span className="text-lg">👻</span></div>
        <span className="text-sm font-medium">Phantom</span>
      </a>
      <a href="https://solflare.com" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center"><span className="text-lg">🔆</span></div>
        <span className="text-sm font-medium">Solflare</span>
      </a>
      <a href="https://backpack.app" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center"><span className="text-lg">🎒</span></div>
        <span className="text-sm font-medium">Backpack</span>
      </a>
    </div>
  );
}

function WalletDownloadGrid() {
  return (
    <div className="grid grid-cols-3 gap-3">
      <a href="https://phantom.app/download" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center"><span className="text-lg">👻</span></div>
        <span className="text-sm font-medium flex items-center gap-1">Phantom <ExternalLink className="h-3 w-3" /></span>
      </a>
      <a href="https://solflare.com/download" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center"><span className="text-lg">🔆</span></div>
        <span className="text-sm font-medium flex items-center gap-1">Solflare <ExternalLink className="h-3 w-3" /></span>
      </a>
      <a href="https://backpack.app/download" target="_blank" rel="noopener noreferrer"
        className="flex flex-col items-center gap-2 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors border border-border/50">
        <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center"><span className="text-lg">🎒</span></div>
        <span className="text-sm font-medium flex items-center gap-1">Backpack <ExternalLink className="h-3 w-3" /></span>
      </a>
    </div>
  );
}

export default AddFunds;
