import { useState, useEffect, useCallback } from "react";

const COINGECKO_API = "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd";

export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(COINGECKO_API);
      if (!response.ok) throw new Error("Failed to fetch SOL price");
      
      const data = await response.json();
      const solPrice = data.solana?.usd;
      
      if (typeof solPrice === "number") {
        setPrice(solPrice);
        setError(null);
      } else {
        throw new Error("Invalid price data");
      }
    } catch (err) {
      console.error("Failed to fetch SOL price:", err);
      setError(err instanceof Error ? err.message : "Unknown error");
      // Fallback price if API fails
      setPrice(150); // Approximate SOL price as fallback
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    
    // Refresh price every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [fetchPrice]);

  // Convert SOL to USD
  const solToUsd = useCallback((sol: number): number | null => {
    if (price === null) return null;
    return sol * price;
  }, [price]);

  return {
    price,
    isLoading,
    error,
    refetch: fetchPrice,
    solToUsd,
  };
}
