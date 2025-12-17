import { useState, useEffect, useCallback } from "react";

// Cache for SOL price
let cachedPrice: number | null = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 30000; // 30 seconds

export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(cachedPrice);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = useCallback(async () => {
    const now = Date.now();
    
    // Return cached price if still valid
    if (cachedPrice !== null && now - lastFetchTime < CACHE_DURATION_MS) {
      setPrice(cachedPrice);
      return cachedPrice;
    }

    setLoading(true);
    setError(null);

    try {
      // Use CoinGecko simple price API (free, no API key required)
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
        { headers: { Accept: "application/json" } }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch SOL price");
      }

      const data = await response.json();
      const solPrice = data.solana?.usd;

      if (typeof solPrice === "number") {
        cachedPrice = solPrice;
        lastFetchTime = now;
        setPrice(solPrice);
        return solPrice;
      } else {
        throw new Error("Invalid price data");
      }
    } catch (err) {
      console.error("[useSolPrice] Error fetching price:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch price");
      // Return cached price if available, even if stale
      if (cachedPrice !== null) {
        setPrice(cachedPrice);
        return cachedPrice;
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on mount
  useEffect(() => {
    fetchPrice();
  }, [fetchPrice]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchPrice, CACHE_DURATION_MS);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  // Format USD value
  const formatUsd = useCallback((solAmount: number | string): string | null => {
    if (price === null) return null;
    const sol = typeof solAmount === "string" ? parseFloat(solAmount) : solAmount;
    if (isNaN(sol)) return null;
    const usd = sol * price;
    return `~$${usd.toFixed(2)}`;
  }, [price]);

  return {
    price,
    loading,
    error,
    formatUsd,
    refetch: fetchPrice,
  };
}
