import { useState } from "react";
import { X, AlertTriangle } from "lucide-react";

/**
 * Dismissible banner shown during the Polymarket V2 infrastructure migration.
 * Set ACTIVE to false once the cutover is complete.
 */
const POLYMARKET_UPGRADE_ACTIVE = true;

export default function PolymarketUpgradeBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (!POLYMARKET_UPGRADE_ACTIVE || dismissed) return null;

  return (
    <div className="relative bg-amber-500/15 border border-amber-500/30 text-amber-200 px-4 py-2.5 text-center text-sm flex items-center justify-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
      <span>
        <strong>⚠️ Polymarket is upgrading their infrastructure (April 2026).</strong>{" "}
        Predictions are still working. Some features may be briefly unavailable.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-300 hover:text-amber-100 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
