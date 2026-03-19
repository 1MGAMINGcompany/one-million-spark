/**
 * Short-lived polling hook for trade order status.
 * Polls the prediction-trade-status edge function for up to ~18s (6 polls × 3s)
 * when the initial status is non-final (submitted/requested/partial_fill).
 *
 * Security: Uses a controlled backend endpoint with Privy JWT authentication.
 * Ownership is resolved server-side from the Privy DID → prediction_accounts mapping.
 * The wallet parameter is sent as a temporary fallback for users whose DID
 * hasn't been bound yet; it will be removed once all users are migrated.
 */
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const FINAL_STATUSES = new Set(["filled", "failed", "cancelled"]);
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 6; // 6 × 3s = 18s window

interface PollState {
  status: string;
  fee_usdc?: number;
  net_amount_usdc?: number;
  filled_shares?: number;
  avg_fill_price?: number;
}

export function useTradeStatusPoll(
  tradeOrderId: string | undefined,
  initialStatus: string | undefined,
  wallet?: string,
  getAccessToken?: () => Promise<string | null>,
) {
  const [live, setLive] = useState<PollState | null>(null);
  const pollCount = useRef(0);
  const stopped = useRef(false);

  // Only start if initial status is non-final
  const shouldPoll =
    !!tradeOrderId &&
    !!initialStatus &&
    !FINAL_STATUSES.has(initialStatus);

  useEffect(() => {
    if (!shouldPoll) return;

    pollCount.current = 0;
    stopped.current = false;

    const poll = async () => {
      if (stopped.current) return;
      pollCount.current += 1;

      try {
        // Get fresh Privy access token for each poll
        const token = getAccessToken ? await getAccessToken() : null;

        const { data, error } = await supabase.functions.invoke(
          "prediction-trade-status",
          {
            // wallet sent as temporary fallback for pre-DID-binding compat
            body: { trade_order_id: tradeOrderId, ...(wallet ? { wallet } : {}) },
            headers: token ? { "x-privy-token": token } : {},
          },
        );

        if (error || !data) return;

        const newStatus = data.trade_status as string;
        setLive({
          status: newStatus,
          fee_usdc: typeof data.fee_usdc === "number" ? data.fee_usdc : undefined,
          net_amount_usdc: typeof data.net_amount_usdc === "number" ? data.net_amount_usdc : undefined,
          filled_shares: typeof data.filled_shares === "number" ? data.filled_shares : undefined,
          avg_fill_price: typeof data.avg_fill_price === "number" ? data.avg_fill_price : undefined,
        });

        if (FINAL_STATUSES.has(newStatus)) {
          stopped.current = true;
        }
      } catch {
        // Swallow – keep last displayed status
      }

      if (pollCount.current >= MAX_POLLS) {
        stopped.current = true;
      }
    };

    // First poll after one interval (give backend time)
    const id = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      stopped.current = true;
      clearInterval(id);
    };
  }, [shouldPoll, tradeOrderId, wallet, getAccessToken]);

  return live;
}
