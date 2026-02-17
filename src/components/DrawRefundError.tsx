/**
 * DrawRefundError - Shows a clear error message when draw refund fails
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrawRefundErrorProps {
  error: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function DrawRefundError({ error, onRetry, isRetrying }: DrawRefundErrorProps) {
  const { t } = useTranslation();
  
  const isInstructionMissing = 
    error.toLowerCase().includes("not enabled") ||
    error.toLowerCase().includes("instruction not") ||
    error.toLowerCase().includes("not available");

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
        <div className="space-y-1">
          <h4 className="font-semibold text-amber-400">{t("drawRefund.title")}</h4>
          <p className="text-sm text-muted-foreground">
            {isInstructionMissing
              ? t("drawRefund.notEnabled")
              : error}
          </p>
        </div>
      </div>

      {isInstructionMissing && (
        <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground space-y-2">
          <p>
            <strong>{t("drawRefund.whatThisMeans")}</strong>
          </p>
          <p>
            <strong>{t("drawRefund.whatYouCanDo")}</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>{t("drawRefund.contactSupport")}</li>
            <li>{t("drawRefund.waitForUpdate")}</li>
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        {onRetry && (
          <Button
            onClick={onRetry}
            disabled={isRetrying}
            variant="outline"
            size="sm"
            className="gap-2 border-amber-500/50 text-amber-400 hover:bg-amber-500/20"
          >
            <RefreshCw size={14} className={isRetrying ? "animate-spin" : ""} />
            {isRetrying ? t("drawRefund.retrying") : t("drawRefund.tryAgain")}
          </Button>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          asChild
        >
          <a
            href="https://discord.gg/your-support-channel"
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} />
            {t("drawRefund.contactSupportBtn")}
          </a>
        </Button>
      </div>
    </div>
  );
}
