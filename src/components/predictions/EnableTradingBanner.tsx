import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

interface EnableTradingBannerProps {
  hasSession: boolean;
  canTrade: boolean;
  loading: boolean;
  error?: string | null;
  safeDeployed?: boolean;
  status?: string;
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
  status,
  onEnable,
}: EnableTradingBannerProps) {
  const isIncomplete = hasSession && !canTrade;

  const title = canTrade
    ? "Trading wallet ready"
    : loading
      ? "Finalizing trading wallet"
      : isIncomplete
        ? safeDeployed
          ? "Trading wallet needs final setup"
          : "Trading wallet deployment incomplete"
        : "Set Up Trading Wallet";

  const description = canTrade
    ? safeDeployed
      ? "Your gasless trading wallet is active and ready for predictions."
      : "Your trading wallet is active."
    : loading
      ? "We’re creating your personal trading wallet and exchange permissions now."
      : isIncomplete
        ? safeDeployed
          ? "Your wallet exists, but approvals or exchange credentials are still incomplete. Retry setup to finish."
          : "Your setup started, but the gasless wallet deployment did not complete. Retry setup to continue."
        : "Sign once to create your personal trading wallet before placing predictions.";

  const icon = canTrade ? (
    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  ) : loading ? (
    <Loader2 className="w-4 h-4 text-primary shrink-0 mt-0.5 animate-spin" />
  ) : isIncomplete ? (
    <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  ) : (
    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  );

  return (
    <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {icon}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">{title}</p>
            <p className="text-[10px] leading-tight text-muted-foreground">{description}</p>
            {isIncomplete && status ? (
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                Status: {status.replace(/_/g, " ")}
              </p>
            ) : null}
          </div>
        </div>
        {!canTrade ? (
          <Button
            size="sm"
            variant={isIncomplete ? "outline" : "default"}
            onClick={onEnable}
            disabled={loading}
            className="shrink-0 h-auto px-3 py-1.5 text-xs"
          >
            {loading ? "Working…" : isIncomplete ? "Retry setup" : "Set Up"}
          </Button>
        ) : null}
      </div>
      {error ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[10px] text-destructive">
          {error}
        </div>
      ) : null}
    </div>
  );
}
