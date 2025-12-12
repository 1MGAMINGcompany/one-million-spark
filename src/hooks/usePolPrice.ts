import { useState, useEffect } from 'react';

const CACHE_KEY = 'pol_usd_price';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

interface CachedPrice {
  price: number;
  timestamp: number;
}

export function usePolPrice() {
  const [price, setPrice] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      // Check cache first
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { price: cachedPrice, timestamp }: CachedPrice = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_DURATION) {
            setPrice(cachedPrice);
            return;
          }
        }
      } catch (e) {
        // Ignore cache errors
      }

      setIsLoading(true);
      try {
        // Use CoinGecko free API for POL (Polygon) price
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=matic-network&vs_currencies=usd'
        );
        const data = await response.json();
        const polPrice = data['matic-network']?.usd;
        
        if (polPrice) {
          setPrice(polPrice);
          // Cache the price
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            price: polPrice,
            timestamp: Date.now()
          }));
        }
      } catch (error) {
        console.error('Failed to fetch POL price:', error);
        // Set a fallback price if fetch fails
        setPrice(null);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPrice();
  }, []);

  const formatUsd = (polAmount: string | number): string | null => {
    if (price === null) return null;
    const amount = typeof polAmount === 'string' ? parseFloat(polAmount) : polAmount;
    if (isNaN(amount) || amount <= 0) return null;
    const usdValue = amount * price;
    return usdValue < 0.01 ? '<$0.01' : `~$${usdValue.toFixed(2)}`;
  };

  return { price, isLoading, formatUsd };
}
