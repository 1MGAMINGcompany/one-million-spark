/**
 * DrawRefundError - Shows a clear error message when draw refund fails
 * 
 * This is displayed when the settle-draw edge function fails, especially
 * when the refund_draw instruction is not yet deployed on-chain.
 */

import { AlertTriangle, ExternalLink, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DrawRefundErrorProps {
  error: string;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function DrawRefundError({ error, onRetry, isRetrying }: DrawRefundErrorProps) {
  const isInstructionMissing = 
    error.toLowerCase().includes("not enabled") ||
    error.toLowerCase().includes("instruction not") ||
    error.toLowerCase().includes("not available");

  return (
    <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
        <div className="space-y-1">
          <h4 className="font-semibold text-amber-400">Draw Refund Issue</h4>
          <p className="text-sm text-muted-foreground">
            {isInstructionMissing
              ? "Draw refund is not enabled yet. The on-chain program may need to be updated."
              : error}
          </p>
        </div>
      </div>

      {isInstructionMissing && (
        <div className="bg-muted/30 rounded p-3 text-xs text-muted-foreground space-y-2">
          <p>
            <strong>What this means:</strong> The on-chain program doesn't have a refund_draw 
            instruction yet. Your funds are safe in the vault.
          </p>
          <p>
            <strong>What you can do:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Contact support to manually process the refund</li>
            <li>Wait for the program update and try again later</li>
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
            {isRetrying ? "Retrying..." : "Try Again"}
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
            Contact Support
          </a>
        </Button>
      </div>
    </div>
  );
}
