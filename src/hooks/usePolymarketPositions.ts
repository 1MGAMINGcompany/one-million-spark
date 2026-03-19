/**
 * usePolymarketPositions — Fetches and caches user's Polymarket positions.
 *
 * Positions are stored server-side; this hook reads cached data
 * and triggers syncs when needed.
 */
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";

interface Position {
  id: string;
  wallet: string;
  fight_id: string | null;
  condition_id: string;
  outcome_index: number;
  token_id: string | null;
  size: number;
  avg_price: number;
  current_value: number;
  realized_pnl: number;
  pm_order_id: string | null;
  pm_order_status: string | null;
  synced_at: string;
  fight: {
    id: string;
    title: string;
    fighter_a_name: string;
    fighter_b_name: string;
    status: string;
    winner: string | null;
    price_a: number | null;
    price_b: number | null;
    source: string;
  } | null;
}

const SYNC_INTERVAL_MS = 60_000; // 60s

export function usePolymarketPositions() {
  const { walletAddress, isPrivyUser } = usePrivyWallet();
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  const fetchPositions = useCallback(async () => {
    if (!walletAddress) return;

    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke("polymarket-positions", {
        body: { action: "get_positions", wallet: walletAddress },
      });

      if (error) throw error;
      setPositions(data.positions || []);
    } catch (err) {
      console.warn("[usePolymarketPositions] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  const syncPositions = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const { data, error } = await supabase.functions.invoke("polymarket-positions", {
        body: { action: "sync_positions", wallet: walletAddress },
      });

      if (error) throw error;
      setLastSynced(new Date().toISOString());

      // Refetch after sync
      await fetchPositions();
      return data;
    } catch (err) {
      console.warn("[usePolymarketPositions] sync error:", err);
    }
  }, [walletAddress, fetchPositions]);

  // Auto-fetch + auto-sync on interval
  useEffect(() => {
    if (!isPrivyUser || !walletAddress) return;

    fetchPositions();

    const id = setInterval(() => {
      syncPositions();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(id);
  }, [isPrivyUser, walletAddress, fetchPositions, syncPositions]);

  return {
    positions,
    loading,
    lastSynced,
    fetchPositions,
    syncPositions,
  };
}
