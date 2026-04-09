/**
 * usePolymarketLivePrices — Real-time price streaming via Polymarket CLOB WebSocket.
 *
 * Connects to wss://ws-subscriptions-clob.polymarket.com/ws/market
 * and subscribes to token IDs for visible fights. Provides a price map
 * that overwrites DB-cached prices for instant updates.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";

const WS_URL = "wss://ws-subscriptions-clob.polymarket.com/ws/market";
const PING_INTERVAL_MS = 10_000;
const RECONNECT_BASE_MS = 2_000;
const MAX_RECONNECT_MS = 30_000;

export interface LivePrice {
  priceA: number;
  priceB: number;
  updatedAt: number;
}

/** Minimal fight shape needed for token subscription */
export interface FightTokenInfo {
  id: string;
  polymarket_outcome_a_token?: string | null;
  polymarket_outcome_b_token?: string | null;
  source?: string | null;
}

/**
 * Returns a map of fightId → LivePrice from the Polymarket WebSocket.
 * Falls back gracefully — if WS fails, the map is simply empty and
 * consumers use DB prices instead.
 */
export function usePolymarketLivePrices(fights: FightTokenInfo[]) {
  const [prices, setPrices] = useState<Record<string, LivePrice>>({});
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Build token→fight mapping
  const { tokenToFight, tokenIds } = useMemo(() => {
    const map = new Map<string, { fightId: string; side: "a" | "b" }>();
    for (const f of fights) {
      if (f.source !== "polymarket") continue;
      if (f.polymarket_outcome_a_token) {
        map.set(f.polymarket_outcome_a_token, { fightId: f.id, side: "a" });
      }
      if (f.polymarket_outcome_b_token) {
        map.set(f.polymarket_outcome_b_token, { fightId: f.id, side: "b" });
      }
    }
    return { tokenToFight: map, tokenIds: Array.from(map.keys()) };
  }, [fights]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);

        // Handle price_change events
        if (data.event_type === "price_change" && data.asset_id) {
          const info = tokenToFight.get(data.asset_id);
          if (!info) return;

          // Extract best bid as the price (what a buyer would pay)
          const changes = data.price_changes || data.changes || [];
          let bestBid = 0;
          for (const c of changes) {
            if (c.side === "BUY" && parseFloat(c.price || "0") > bestBid) {
              bestBid = parseFloat(c.price);
            }
          }
          if (bestBid <= 0) return;

          setPrices((prev) => {
            const existing = prev[info.fightId] || { priceA: 0, priceB: 0, updatedAt: 0 };
            const complement = Math.round((1 - bestBid) * 10000) / 10000;
            const updated: LivePrice =
              info.side === "a"
                ? { priceA: bestBid, priceB: complement, updatedAt: Date.now() }
                : { priceA: complement, priceB: bestBid, updatedAt: Date.now() };
            // Merge: keep the most recent per-side update
            return {
              ...prev,
              [info.fightId]: {
                priceA: info.side === "a" ? updated.priceA : existing.priceA || updated.priceA,
                priceB: info.side === "b" ? updated.priceB : existing.priceB || updated.priceB,
                updatedAt: Date.now(),
              },
            };
          });
        }

        // Handle best_bid_ask events (custom_feature_enabled)
        if (data.event_type === "best_bid_ask" && data.asset_id) {
          const info = tokenToFight.get(data.asset_id);
          if (!info) return;

          const bestBid = parseFloat(data.best_bid || "0");
          if (bestBid <= 0) return;

          setPrices((prev) => {
            const existing = prev[info.fightId] || { priceA: 0, priceB: 0, updatedAt: 0 };
            const complement = Math.round((1 - bestBid) * 10000) / 10000;
            return {
              ...prev,
              [info.fightId]: {
                priceA: info.side === "a" ? bestBid : (existing.priceA || complement),
                priceB: info.side === "b" ? bestBid : (existing.priceB || complement),
                updatedAt: Date.now(),
              },
            };
          });
        }
      } catch {
        // Ignore malformed messages
      }
    },
    [tokenToFight],
  );

  const connect = useCallback(() => {
    if (!mountedRef.current || tokenIds.length === 0) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) { ws.close(); return; }
        setConnected(true);
        reconnectAttempt.current = 0;

        // Subscribe to all token IDs
        ws.send(
          JSON.stringify({
            assets_ids: tokenIds,
            type: "market",
            custom_feature_enabled: true,
          }),
        );

        // Start ping heartbeat
        pingRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send("ping");
          }
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = handleMessage;

      ws.onclose = () => {
        setConnected(false);
        if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
        if (!mountedRef.current) return;

        // Exponential backoff reconnect
        const delay = Math.min(
          RECONNECT_BASE_MS * Math.pow(2, reconnectAttempt.current),
          MAX_RECONNECT_MS,
        );
        reconnectAttempt.current++;
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (err) {
      console.warn("[usePolymarketLivePrices] connect error:", err);
    }
  }, [tokenIds, handleMessage]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pingRef.current) { clearInterval(pingRef.current); pingRef.current = null; }
      if (reconnectTimer.current) { clearTimeout(reconnectTimer.current); reconnectTimer.current = null; }
    };
  }, [connect]);

  return { livePrices: prices, wsConnected: connected };
}
