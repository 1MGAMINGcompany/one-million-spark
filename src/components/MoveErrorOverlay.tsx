/**
 * Friendly overlay for move submission errors
 * Shows contextual messages without scary technical language
 */

import { Button } from "@/components/ui/button";
import { RefreshCw, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MoveErrorType } from "@/hooks/useSubmitMove";

interface MoveErrorOverlayProps {
  errorType: MoveErrorType;
  onReReady?: () => void;
  isResyncing?: boolean;
}

export function MoveErrorOverlay({ 
  errorType, 
  onReReady,
  isResyncing = false 
}: MoveErrorOverlayProps) {
  const { t } = useTranslation();

  if (!errorType) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl">
        {errorType === "session_expired" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-amber-500/10 p-3">
              <RotateCcw className="h-6 w-6 text-amber-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('moveError.sessionReset')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('moveError.sessionResetDesc')}
              </p>
            </div>
            <Button 
              onClick={onReReady} 
              className="w-full"
              size="lg"
            >
              {t('moveError.reReady')}
            </Button>
          </div>
        )}

        {errorType === "out_of_sync" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-blue-500/10 p-3">
              <RefreshCw className={`h-6 w-6 text-blue-500 ${isResyncing ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('moveError.outOfSync')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isResyncing ? t('moveError.resyncing') : t('moveError.reconnecting')}
              </p>
            </div>
          </div>
        )}

        {errorType === "hash_conflict" && (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="rounded-full bg-purple-500/10 p-3">
              <RefreshCw className={`h-6 w-6 text-purple-500 ${isResyncing ? "animate-spin" : ""}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">{t('moveError.moveConflict')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {isResyncing ? t('moveError.resolvingConflict') : t('moveError.gettingLatest')}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}