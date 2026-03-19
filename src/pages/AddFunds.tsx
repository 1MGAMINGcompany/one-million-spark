import { usePrivy } from "@privy-io/react-auth";
import { useLogin } from "@privy-io/react-auth";
import { CreditCard, Shield, Zap, CheckCircle2, Wallet, DollarSign, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";

const AddFunds = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { walletAddress, isPrivyUser } = usePrivyWallet();

  const isLoggedIn = authenticated && isPrivyUser && !!walletAddress;

  return (
    <div className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Hero Section */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-4">
            <DollarSign className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-3 font-cinzel">
            Add Funds
          </h1>
          <p className="text-xl text-primary font-medium mb-2">
            Fast, simple, and secure ✨
          </p>
          <p className="text-muted-foreground">
            {isLoggedIn
              ? "Your account is ready — add USDC to start playing and predicting."
              : "Create an account in seconds, then add funds with your favorite payment method."}
          </p>
        </div>

        {/* How It Works - Visual Flow */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 border border-primary/20 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-center gap-4 md:gap-8">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">Sign Up</p>
            </div>
            <div className="text-primary text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">Add USDC</p>
            </div>
            <div className="text-primary text-2xl">→</div>
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium">Play!</p>
            </div>
          </div>
          <p className="text-center text-muted-foreground text-sm mt-4">
            Takes less than 2 minutes to get started
          </p>
        </div>

        {/* Wallet Status */}
        {isLoggedIn && (
          <div className="bg-card border border-primary/30 rounded-lg p-4 mb-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              <div>
                <p className="text-sm text-green-400 font-medium">Account Connected</p>
                <p className="font-mono text-xs text-muted-foreground">{walletAddress?.slice(0, 8)}...{walletAddress?.slice(-6)}</p>
              </div>
            </div>
            <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">
              Polygon
            </span>
          </div>
        )}

        <div className="space-y-5">
          {/* Step 1: Create Account */}
          <section className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                1
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  {isLoggedIn ? "✅ Account Created" : "Create Your Account"}
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                  {isLoggedIn
                    ? "Your secure wallet was created automatically when you signed up."
                    : "Sign up with email, Google, or Twitter. A secure wallet is created for you automatically — no extensions or seed phrases needed."}
                </p>

                {!isLoggedIn && (
                  <Button onClick={() => login()} className="w-full" size="lg">
                    <Wallet className="mr-2 h-4 w-4" />
                    Sign Up / Log In
                  </Button>
                )}
              </div>
            </div>
          </section>

          {/* Step 2: Add Funds */}
          <section className="bg-card border border-border rounded-xl p-6 relative overflow-hidden">
            <div className="absolute top-4 right-4">
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
                <Zap className="h-3 w-3" />
                No exchanges needed!
              </span>
            </div>

            <div className="flex items-start gap-4">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-bold shrink-0">
                2
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-foreground mb-1">
                  Add USDC to Your Wallet
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                  Buy USDC instantly with your card. Funds arrive in seconds.
                </p>

                {/* Payment Methods */}
                <div className="flex flex-wrap gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                    <CreditCard className="h-4 w-4 text-primary" />
                    Credit Card
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

                <Button
                  onClick={() => {
                    if (!isLoggedIn) {
                      login();
                    } else {
                      // Privy fund wallet flow — will be wired to Polygon USDC fiat onramp
                      window.open("https://app.moonpay.com/swap?defaultCurrencyCode=usdc_polygon", "_blank");
                    }
                  }}
                  size="lg"
                  variant="gold"
                  className="w-full text-lg"
                >
                  <CreditCard className="mr-2 h-5 w-5" />
                  {isLoggedIn ? "Buy USDC" : "Sign Up & Buy USDC"}
                </Button>

                <p className="text-xs text-muted-foreground mt-3">
                  Already have USDC or crypto? You can also send USDC (Polygon) to your wallet address above.
                </p>
              </div>
            </div>
          </section>

          {/* Quick Info */}
          <section className="bg-muted/20 border border-border/50 rounded-xl p-5">
            <h3 className="font-medium text-foreground mb-3">Quick Info</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Entry fees, prizes, and predictions are in USDC
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Network fees are covered for you (gas-sponsored)
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Winners receive prizes minus 5% platform fee
              </li>
              <li className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                Your wallet is secured by Privy — no seed phrases to lose
              </li>
            </ul>
          </section>

          {/* Fun CTA - Play with Friends */}
          <section className="bg-gradient-to-r from-primary/20 to-primary/10 border border-primary/30 rounded-xl p-6 text-center">
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                <Users className="h-7 w-7 text-primary" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              🎮 Ready to play with friends?
            </h3>
            <p className="text-muted-foreground text-sm mb-4">
              Create a private room and share the link — your friends can join anytime!
            </p>
            <Button onClick={() => navigate("/create-room")} variant="default" size="lg">
              Create a Private Room
            </Button>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AddFunds;
