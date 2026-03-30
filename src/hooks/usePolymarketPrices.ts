/**
 * usePolymarketPrices — Polls public market prices for imported events.
 *
 * This is SEPARATE from user-authenticated position data.
 * Uses the polymarket-prices edge function which hits public CLOB API.
 */
import { useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const PRICE_POLL_MS = 45_000; // 45s

export function usePolymarketPrices(enabled = true) {
  const lastRefresh = useRef<number>(0);
  const inFlight = useRef(false);
  const cooldownUntil = useRef(0);

  const refreshPrices = useCallback(async () => {
    const now = Date.now();

    // Debounce: skip if last refresh was < 30s ago
    if (inFlight.current || now < cooldownUntil.current || now - lastRefresh.current < 30_000) return;

    try {
      inFlight.current = true;
      lastRefresh.current = now;
      const { error } = await supabase.functions.invoke("polymarket-prices", {
        body: {},
      });
      if (error) throw error;
      cooldownUntil.current = 0;
    } catch (err) {
      cooldownUntil.current = Date.now() + 120_000;
      console.warn("[usePolymarketPrices] refresh error:", err);
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    refreshPrices();
    const id = setInterval(refreshPrices, PRICE_POLL_MS);
    return () => clearInterval(id);
  }, [enabled, refreshPrices]);

  return { refreshPrices };
}
