import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check, ExternalLink, ChevronDown, Wallet, ArrowDownToLine, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface AddSolCardProps {
  walletAddress: string;
  balanceSol: number | null;
}

export function AddSolCard({ walletAddress, balanceSol }: AddSolCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md border-border/60 bg-card/90 backdrop-blur-sm shadow-lg">
        <CardContent className="p-6 space-y-6">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 border border-primary/20 mx-auto mb-2">
              <Wallet className="w-6 h-6 text-primary" />
            </div>
            <h2 className="text-xl font-display font-semibold text-foreground">
              Add SOL to Start Playing
            </h2>
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

          {/* Auto-refresh hint */}
          <p className="text-center text-[11px] text-muted-foreground/60">
            Balance refreshes automatically every 10 seconds
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
