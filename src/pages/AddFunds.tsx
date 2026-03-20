import { useState } from "react";
import { usePrivy, useFundWallet } from "@privy-io/react-auth";
import { useLogin } from "@privy-io/react-auth";
import {
  CreditCard,
  Shield,
  Zap,
  CheckCircle2,
  Wallet,
  DollarSign,
  Copy,
  ExternalLink,
  Loader2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import { toast } from "sonner";

const AddFunds = () => {
  const navigate = useNavigate();
  const { authenticated } = usePrivy();
  const { login } = useLogin();
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const {
    usdc_balance_formatted,
    usdc_balance,
    is_loading: usdcLoading,
    error: usdcError,
  } = usePolygonUSDC();
  const { fundWallet } = useFundWallet();
  const [funding, setFunding] = useState(false);

  const isLoggedIn = authenticated && isPrivyUser && !!walletAddress;
  const hasBalance = (usdc_balance ?? 0) > 0;

  const handleCopyAddress = async () => {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.success("Wallet address copied!");
    } catch {
      toast.error("Could not copy address");
    }
  };

  const handleFundWallet = async () => {
    if (!walletAddress) return;
    setFunding(true);
    try {
      await fundWallet({ address: walletAddress });
    } catch (e: any) {
      if (e?.message !== "CLOSED_MODAL" && e?.message !== "User closed modal") {
        console.error("[AddFunds] fundWallet error:", e);
        toast.error("Could not open funding. Please try again.");
      }
    } finally {
      setFunding(false);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-lg mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-3">
            <DollarSign className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-2 font-cinzel">
            {isLoggedIn ? "Your Wallet" : "Add Funds"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {isLoggedIn
              ? "Fund your account with USDC to start predicting."
              : "Create an account in seconds — a secure wallet is set up automatically."}
          </p>
        </div>

        {/* ── Not logged in ── */}
        {!isLoggedIn && (
          <div className="space-y-5">
            {/* Visual flow */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-center gap-3 md:gap-6 mb-4">
                {[
                  { icon: Wallet, label: "Sign Up" },
                  { icon: CreditCard, label: "Add USDC" },
                  { icon: Zap, label: "Predict!" },
                ].map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    {i > 0 && <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="text-center">
                      <div className="w-10 h-10 rounded-full bg-primary/15 flex items-center justify-center mx-auto mb-1">
                        <step.icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-xs font-medium text-foreground">{step.label}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-center text-muted-foreground text-xs">
                Takes less than 2 minutes · No extensions or seed phrases
              </p>
            </div>

            <Button onClick={() => login()} className="w-full" size="lg">
              <Wallet className="mr-2 h-5 w-5" />
              Sign Up / Log In
            </Button>

            <div className="bg-muted/20 border border-border/50 rounded-xl p-4">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <Shield className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  We create a secure wallet for you automatically
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  No crypto experience needed — just sign up and fund
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  Gas fees are covered — you only need USDC
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* ── Logged in ── */}
        {isLoggedIn && (
          <div className="space-y-4">
            {/* Balance card */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              {/* Balance display */}
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                  USDC Balance
                </p>
                {usdcLoading ? (
                  <div className="flex items-center justify-center gap-2 py-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">Loading...</span>
                  </div>
                ) : usdcError ? (
                  <div className="text-center py-2">
                    <p className="text-sm text-muted-foreground mb-1">Unable to load balance</p>
                    <p className="text-xs text-destructive/70 mb-2 break-all">{usdcError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.location.reload()}
                    >
                      Retry
                    </Button>
                  </div>
                ) : (
                  <p className="text-4xl font-bold text-foreground tracking-tight">
                    ${usdc_balance_formatted ?? "0.00"}
                  </p>
                )}
                <p className="text-xs text-muted-foreground mt-1">on Polygon</p>
              </div>

              {/* Primary CTA */}
              <div className="px-5 pb-5">
                <Button
                  onClick={handleFundWallet}
                  disabled={funding}
                  size="lg"
                  variant="gold"
                  className="w-full text-lg"
                >
                  {funding ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Opening...
                    </>
                  ) : (
                    <>
                      <CreditCard className="mr-2 h-5 w-5" />
                      Add USDC
                    </>
                  )}
                </Button>
                <p className="text-center text-xs text-muted-foreground mt-2">
                  Buy with card, Apple Pay, or Google Pay
                </p>
              </div>
            </div>

            {/* Wallet address card */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                  Your Wallet Address
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopyAddress}
                    className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    title="Copy address"
                  >
                    <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                  </button>
                  <a
                    href={`https://polygonscan.com/address/${walletAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    title="View on Polygonscan"
                  >
                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  </a>
                </div>
              </div>
              <p className="font-mono text-xs text-foreground break-all select-all">
                {walletAddress}
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Already have USDC? Send it directly to this address on <strong>Polygon network only</strong>.
              </p>
            </div>

            {/* Network warning */}
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-200/80">
                <strong>Important:</strong> Only send USDC on the <strong>Polygon</strong> network. Funds sent on other networks (Ethereum, Solana, etc.) cannot be recovered.
              </p>
            </div>

            {/* Success CTA when funded */}
            {hasBalance && (
              <div className="bg-gradient-to-r from-primary/15 to-primary/5 border border-primary/25 rounded-xl p-5 text-center">
                <CheckCircle2 className="h-8 w-8 text-primary mx-auto mb-2" />
                <h3 className="font-semibold text-foreground mb-1">You're ready!</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Your account is funded — start making predictions now.
                </p>
                <Button onClick={() => navigate("/predictions")} size="lg" className="w-full">
                  Go to Predictions
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Quick info */}
            <div className="bg-muted/20 border border-border/50 rounded-xl p-4">
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  Predictions and prizes are in USDC
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  Gas fees are covered for you
                </li>
                <li className="flex items-start gap-2">
                  <Shield className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  Wallet secured by Privy — no seed phrases
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AddFunds;
