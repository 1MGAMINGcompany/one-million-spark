import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface EnableTradingBannerProps {
  hasSession: boolean;
  canTrade: boolean;
  loading: boolean;
  error?: string | null;
  safeDeployed?: boolean;
  onEnable: () => void;
}

/**
 * Banner prompting the user to set up their personal Polymarket
 * trading wallet (one-time SIWE signature to derive keys + deploy Safe).
 */
export default function EnableTradingBanner({
  hasSession,
  canTrade,
  loading,
  error,
  safeDeployed,
  onEnable,
}: EnableTradingBannerProps) {
  if (canTrade) {
    return (
      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-xs text-green-300 font-medium">
          Trading wallet active {safeDeployed ? "• Gasless enabled" : ""}
        </span>
      </div>
    );
  }

  if (hasSession && !canTrade) {
    return (
      <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-4 py-2.5">
        <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Trading wallet needs funding
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Deposit USDC.e to your trading address to start placing predictions.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Set Up Trading Wallet
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Sign once to create your personal trading wallet. Gasless & secure.
          </p>
        </div>
      </div>
      <Button
        size="sm"
        variant="default"
        onClick={onEnable}
        disabled={loading}
        className="shrink-0 text-xs px-3 py-1.5 h-auto"
      >
        {loading ? (
          <>
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Setting up…
          </>
        ) : (
          "Set Up"
        )}
      </Button>
      {error && (
        <p className="text-[10px] text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}
