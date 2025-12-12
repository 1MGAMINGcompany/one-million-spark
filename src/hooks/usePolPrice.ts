import { useState, useEffect, useCallback, useRef } from 'react';

const CACHE_KEY = 'pol_price_cache';
const CACHE_DURATION = 30 * 1000; // 30 seconds
const MIN_USD = 0.50;

interface CachedPrice {
  price: number;
  timestamp: number;
}

export function usePolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchPrice = useCallback(async () => {
    try {
      // Check cache first
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { price: cachedPrice, timestamp }: CachedPrice = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_DURATION) {
          setPrice(cachedPrice);
          setIsLoading(false);
          setError(null);
          return;
        }
      }

      // Fetch from Coinbase (POL is listed as MATIC)
      const response = await fetch('https://api.coinbase.com/v2/prices/MATIC-USD/spot');
      if (!response.ok) throw new Error('Failed to fetch price');
      
      const data = await response.json();
      const newPrice = parseFloat(data.data.amount);
      
      if (isNaN(newPrice) || newPrice <= 0) {
        throw new Error('Invalid price data');
      }

      // Cache the result
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        price: newPrice,
        timestamp: Date.now(),
      }));

      setPrice(newPrice);
      setError(null);
    } catch (err) {
      console.error('Error fetching POL price:', err);
      setError('Price unavailable');
      // Keep existing price if we have one
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrice();
    
    // Refresh every 30 seconds
    intervalRef.current = setInterval(fetchPrice, 30000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchPrice]);

  // Calculate dynamic minimum POL for ~$0.50 USD
  const minPol = price ? Math.ceil((MIN_USD / price) * 1000) / 1000 : 0.5;

  // Format POL amount to USD string
  const formatUsd = useCallback((polAmount: string | number): string | null => {
    if (!price) return null;
    const amount = typeof polAmount === 'string' ? parseFloat(polAmount) : polAmount;
    if (isNaN(amount) || amount <= 0) return null;
    const usd = amount * price;
    return usd < 0.01 ? '<$0.01' : `~$${usd.toFixed(2)}`;
  }, [price]);

  // Get USD value as number
  const getUsdValue = useCallback((polAmount: string | number): number | null => {
    if (!price) return null;
    const amount = typeof polAmount === 'string' ? parseFloat(polAmount) : polAmount;
    if (isNaN(amount) || amount <= 0) return null;
    return amount * price;
  }, [price]);

  return { 
    price, 
    isLoading, 
    error,
    minPol,
    minUsd: MIN_USD,
    formatUsd,
    getUsdValue,
  };
}
