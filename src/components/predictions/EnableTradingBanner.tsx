import { useTranslation } from "react-i18next";
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

const ERROR_KEY_MAP: Record<string, string> = {
  safe_deploy_failed: "tradingWallet.deploymentFailed",
  setup_failed: "tradingWallet.setupFailed",
  approval_failed: "tradingWallet.approvalFailed",
  credential_failed: "tradingWallet.credentialFailed",
};

export default function EnableTradingBanner({
  hasSession,
  canTrade,
  loading,
  error,
  safeDeployed,
  status,
  onEnable,
}: EnableTradingBannerProps) {
  const { t } = useTranslation();
  const isIncomplete = hasSession && !canTrade;

  const title = canTrade
    ? t("tradingWallet.ready")
    : loading
      ? t("tradingWallet.finalizing")
      : isIncomplete
        ? safeDeployed
          ? t("tradingWallet.needsFinalSetup")
          : t("tradingWallet.deploymentIncomplete")
        : t("tradingWallet.setUp");

  const description = canTrade
    ? safeDeployed
      ? t("tradingWallet.readyDescSafe")
      : t("tradingWallet.readyDesc")
    : loading
      ? t("tradingWallet.finalizingDesc")
      : isIncomplete
        ? safeDeployed
          ? t("tradingWallet.incompleteDesc")
          : t("tradingWallet.deploymentDesc")
        : t("tradingWallet.signOnce");

  const icon = canTrade ? (
    <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  ) : loading ? (
    <Loader2 className="w-4 h-4 text-primary shrink-0 mt-0.5 animate-spin" />
  ) : isIncomplete ? (
    <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  ) : (
    <ShieldCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
  );

  // Map known error codes to translated strings
  const translatedError = error
    ? t(ERROR_KEY_MAP[error] ?? "tradingWallet.unknownError")
    : null;

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
                {t("tradingWallet.statusLabel")}: {status.replace(/_/g, " ")}
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
            {loading ? t("tradingWallet.working") : isIncomplete ? t("tradingWallet.retrySetup") : t("tradingWallet.setUpButton")}
          </Button>
        ) : null}
      </div>
      {translatedError ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-[10px] text-destructive">
          {translatedError}
        </div>
      ) : null}
    </div>
  );
}
