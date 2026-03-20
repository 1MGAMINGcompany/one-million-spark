import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, CheckCircle2 } from "lucide-react";

interface EnableTradingBannerProps {
  hasSession: boolean;
  canTrade: boolean;
  loading: boolean;
  onEnable: () => void;
}

/**
 * Compact banner prompting the user to enable Polymarket trading
 * by signing a one-time SIWE message to derive CLOB credentials.
 */
export default function EnableTradingBanner({
  hasSession,
  canTrade,
  loading,
  onEnable,
}: EnableTradingBannerProps) {
  if (canTrade) {
    return (
      <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
        <span className="text-xs text-green-300 font-medium">
          Polymarket trading enabled
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
      <div className="flex items-center gap-2 min-w-0">
        <ShieldCheck className="w-4 h-4 text-primary shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold text-foreground">
            Enable Polymarket Trading
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            Sign once to connect your wallet for real market predictions.
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
            Signing…
          </>
        ) : (
          "Enable"
        )}
      </Button>
    </div>
  );
}
