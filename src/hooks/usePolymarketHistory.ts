import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface PricePoint {
  t: number; // unix seconds
  p: number; // price 0-1
}

type Interval = "1h" | "6h" | "1d" | "1w" | "all";

const FIDELITY_MAP: Record<Interval, string> = {
  "1h": "1",
  "6h": "2",
  "1d": "5",
  "1w": "30",
  "all": "60",
};

export function usePolymarketHistory(
  tokenId: string | null,
  interval: Interval = "1d",
  enabled = true,
) {
  const [history, setHistory] = useState<PricePoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!tokenId || !enabled) return;
    setLoading(true);
    setError(null);

    try {
      const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const fidelity = FIDELITY_MAP[interval] || "5";

      const url = `https://${projectId}.supabase.co/functions/v1/polymarket-price-history?token_id=${encodeURIComponent(tokenId)}&interval=${interval}&fidelity=${fidelity}`;

      const resp = await fetch(url, {
        headers: {
          "apikey": anonKey,
          "Authorization": `Bearer ${anonKey}`,
        },
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const data = await resp.json();
      const points: PricePoint[] = data.history || [];
      setHistory(points);
    } catch (err: any) {
      console.warn("[usePolymarketHistory]", err);
      setError(err.message || "Failed to load history");
      setHistory([]);
    } finally {
      setLoading(false);
    }
  }, [tokenId, interval, enabled]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return { history, loading, error, refetch: fetchHistory };
}
