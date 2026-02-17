import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ExternalLink, ArrowDownToLine, CreditCard, Wallet, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

interface AddSolCardProps {
  walletAddress: string;
  balanceSol: number | null;
}

export function AddSolCard({ walletAddress, balanceSol }: AddSolCardProps) {
  const [copied, setCopied] = useState(false);
  const prevBalanceRef = useRef<number | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      toast.success("You're funded — let's play! 🎉", { duration: 3000 });

      // Dynamic import for bundle size
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
  }, [balanceSol]);

  const isWaiting = balanceSol === null || balanceSol <= 0.01;

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur-sm shadow-lg">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            {/* Animated SOL coin icon */}
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-2 sol-coin-float">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary via-gold-light to-primary flex items-center justify-center shadow-gold-glow">
                <span className="text-background font-bold text-sm font-display">S</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-1.5">
              <h2 className="text-xl font-display font-semibold text-foreground">
                Add SOL to Start Playing
              </h2>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="text-muted-foreground hover:text-primary transition-colors" aria-label="How it works">
                      <Info className="w-4 h-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="max-w-[220px] bg-background border-primary/30 text-foreground text-xs space-y-1 p-3"
                  >
                    <p>• Your wallet is created automatically</p>
                    <p>• Add SOL to enter skill matches</p>
                    <p>• Balance updates automatically</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <p className="text-sm text-muted-foreground">
              Your wallet is ready. Add SOL to enter skill matches.
            </p>
            {balanceSol !== null && (
              <p className="text-xs text-muted-foreground/70 font-mono">
                Balance: {balanceSol.toFixed(4)} SOL
              </p>
            )}
          </div>

          {/* QR Code + Address */}
          <div className="flex flex-col items-center gap-4">
            <div className="p-3 bg-white rounded-xl">
              <QRCodeSVG value={walletAddress} size={160} level="M" />
            </div>
            <div className="w-full">
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
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
              Funding Options
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          {/* Option 1 — Send SOL */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Send SOL from any wallet
              </h3>
            </div>
            <p className="text-xs text-muted-foreground pl-6">
              Copy your address or scan the QR code to send SOL.
            </p>
          </div>

          {/* Option 2 — Buy in Phantom */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">
                Buy SOL in Phantom
              </h3>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="w-full border-primary/30 hover:border-primary/50"
            >
              <a
                href="https://phantom.app/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2"
              >
                Buy in Phantom
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>

          {/* Option 3 — Transfer from exchange */}
          <div className="space-y-1.5">
            <Accordion type="single" collapsible>
              <AccordionItem value="exchange" className="border-border/50">
                <AccordionTrigger className="py-2 hover:no-underline">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <ExternalLink className="w-4 h-4 text-primary" />
                    Transfer from an exchange
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ol className="space-y-2 pl-6 text-xs text-muted-foreground list-decimal list-outside">
                    <li>Go to your exchange (Coinbase, Binance, etc.)</li>
                    <li>Withdraw SOL</li>
                    <li>Paste your wallet address</li>
                    <li>Select <span className="font-semibold text-foreground">Solana</span> network</li>
                    <li>Confirm transfer</li>
                  </ol>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* Waiting for SOL pulse */}
          {isWaiting && (
            <div className="flex flex-col items-center gap-1.5 pt-2">
              <div className="flex items-center gap-2">
                <span className="sol-waiting-dot" />
                <span className="text-sm text-muted-foreground font-medium">
                  Waiting for SOL…
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground/60">
                Balance refreshes every 10 seconds.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
