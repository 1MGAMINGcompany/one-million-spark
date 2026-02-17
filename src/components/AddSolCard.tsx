import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, CreditCard, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useFundWallet } from "@privy-io/react-auth/solana";

interface AddSolCardProps {
  walletAddress: string;
  balanceSol: number | null;
}

export function AddSolCard({ walletAddress, balanceSol }: AddSolCardProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);
  const { fundWallet } = useFundWallet();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBuyWithCard = async () => {
    try {
      console.log("[AddSolCard] calling fundWallet for", walletAddress);
      await fundWallet({
        address: walletAddress,
        options: {
          chain: "solana:mainnet",
          amount: "0.05",
        },
      });
      console.log("[AddSolCard] fundWallet resolved");
    } catch (e: any) {
      console.error("[AddSolCard] fundWallet error:", e);
      if (e?.message !== "CLOSED_MODAL" && e?.message !== "User closed modal") {
        toast.error("Could not open payment. Please try again.");
      }
    }
  };

  // Confetti + toast on balance transition from <=0.01 to >0.01
  useEffect(() => {
    const prev = prevBalanceRef.current;
    prevBalanceRef.current = balanceSol;

    if (
      prev !== null &&
      prev <= 0.01 &&
      balanceSol !== null &&
      balanceSol > 0.01
    ) {
      toast.success(t("addSol.funded") + " 🎉", { duration: 3000 });

      import("canvas-confetti").then((mod) => {
        const confetti = mod.default;
        confetti({
          particleCount: 60,
          spread: 55,
          origin: { y: 0.6 },
          colors: ["#D4AF37", "#F5D061", "#C49B2A", "#FFD700"],
          disableForReducedMotion: true,
          ticks: 40,
        });
      });
    }
  }, [balanceSol, t]);

  const isWaiting = balanceSol === null || balanceSol <= 0.01;

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur-sm shadow-lg">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-2 sol-coin-float">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary via-gold-light to-primary flex items-center justify-center shadow-gold-glow">
                <span className="text-background font-bold text-sm font-display">S</span>
              </div>
            </div>

            <h2 className="text-xl font-display font-semibold text-foreground">
              {t("addSol.title")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("addSol.subtitle")}
            </p>
            {balanceSol !== null && (
              <p className="text-xs text-muted-foreground/70 font-mono">
                {t("addSol.balance", { balance: balanceSol.toFixed(4) })}
              </p>
            )}
          </div>

          {/* PRIMARY: Buy with Card */}
          <Button
            onClick={handleBuyWithCard}
            size="lg"
            className="w-full text-base font-semibold gap-2"
          >
            <CreditCard className="w-5 h-5" />
            {t("addSol.buyWithCard")}
          </Button>
          <p className="text-xs text-center text-muted-foreground -mt-3">
            {t("addSol.cardPaymentMethods")}
          </p>

          {/* Waiting for payment pulse */}
          {isWaiting && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <div className="flex items-center gap-2">
                <span className="sol-waiting-dot" />
                <span className="text-sm text-muted-foreground font-medium">
                  {t("addSol.waitingForPayment")}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                {t("addSol.balanceRefreshNote")}
              </p>
            </div>
          )}

          {/* ADVANCED: Already have crypto? */}
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger className="w-full flex items-center justify-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <span>{t("addSol.alreadyHaveCrypto")}</span>
              <ChevronDown className={`w-4 h-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* QR Code + Address */}
              <div className="flex flex-col items-center gap-3">
                <div className="p-3 bg-white rounded-xl">
                  <QRCodeSVG value={walletAddress} size={140} level="M" />
                </div>
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-secondary border border-border hover:border-primary/30 transition-colors group"
                >
                  <span className="flex-1 text-xs font-mono text-foreground truncate text-left">
                    {walletAddress}
                  </span>
                  {copied ? (
                    <Check className="w-4 h-4 text-green-500 shrink-0" />
                  ) : (
                    <Copy className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0 transition-colors" />
                  )}
                </button>
                <p className="text-xs text-muted-foreground text-center">
                  {t("addSol.sendSolDesc")}
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </CardContent>
      </Card>
    </div>
  );
}
