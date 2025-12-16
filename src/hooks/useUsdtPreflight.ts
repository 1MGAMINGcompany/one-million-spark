import { useCallback, useState, useEffect } from "react";
import { ethers } from "ethers";
import { ROOMMANAGER_V7_ADDRESS } from "./useRoomManagerV7";

// Extend Window type for ethereum
declare global {
  interface Window {
    ethereum?: ethers.Eip1193Provider;
  }
}

// USDT address on Polygon mainnet (checksummed)
const USDT_ADDRESS = "0xC2132D05D31c914a87C6611C10748AEb04B58e8F";
const USDT_DECIMALS = 6;
const FALLBACK_RPC = "https://polygon-rpc.com";

// Minimal ERC20 ABI for reads
const ERC20_ABI = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

// Format raw units to USDT string (6 decimals)
export function formatUsdtUnits(units: bigint): string {
  const num = Number(units) / 10 ** USDT_DECIMALS;
  return num.toFixed(6);
}

export interface PreflightResult {
  allowanceRaw: bigint;
  balanceRaw: bigint;
  allowanceUsdt: string;
  balanceUsdt: string;
  hasSufficientAllowance: boolean;
  hasSufficientBalance: boolean;
}

// Safe read helper with fallback
async function safeRead<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>
): Promise<T> {
  try {
    return await primaryFn();
  } catch (e1) {
    console.warn("BrowserProvider read failed, falling back to RPC", e1);
    return await fallbackFn();
  }
}

export function useUsdtPreflight(ownerAddress: `0x${string}` | undefined, entryFeeUnits: bigint) {
  const [lastPreflight, setLastPreflight] = useState<PreflightResult | null>(null);
  const [allowanceRaw, setAllowanceRaw] = useState<bigint>(0n);
  const [balanceRaw, setBalanceRaw] = useState<bigint>(0n);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Create fallback read-only provider
  const getFallbackProvider = useCallback(() => {
    return new ethers.JsonRpcProvider(FALLBACK_RPC);
  }, []);

  // Create browser provider if available
  const getBrowserProvider = useCallback(() => {
    if (typeof window !== "undefined" && window.ethereum) {
      return new ethers.BrowserProvider(window.ethereum);
    }
    return null;
  }, []);

  // Fetch allowance and balance
  const fetchPreflightData = useCallback(async (): Promise<PreflightResult | null> => {
    if (!ownerAddress) {
      setIsConnected(false);
      return null;
    }

    setIsLoading(true);
    setIsConnected(true);

    try {
      const browserProvider = getBrowserProvider();
      const fallbackProvider = getFallbackProvider();

      // Create contract instances
      const createContract = (provider: ethers.Provider) => 
        new ethers.Contract(USDT_ADDRESS, ERC20_ABI, provider);

      // Safe read allowance
      const allowance = await safeRead(
        async () => {
          if (!browserProvider) throw new Error("No browser provider");
          const contract = createContract(browserProvider);
          return BigInt(await contract.allowance(ownerAddress, ROOMMANAGER_V7_ADDRESS));
        },
        async () => {
          const contract = createContract(fallbackProvider);
          return BigInt(await contract.allowance(ownerAddress, ROOMMANAGER_V7_ADDRESS));
        }
      );

      // Safe read balance
      const balance = await safeRead(
        async () => {
          if (!browserProvider) throw new Error("No browser provider");
          const contract = createContract(browserProvider);
          return BigInt(await contract.balanceOf(ownerAddress));
        },
        async () => {
          const contract = createContract(fallbackProvider);
          return BigInt(await contract.balanceOf(ownerAddress));
        }
      );

      // Get chainId for logging
      let chainId = "unknown";
      try {
        if (browserProvider) {
          const network = await browserProvider.getNetwork();
          chainId = network.chainId.toString();
        }
      } catch {
        chainId = "137"; // Assume Polygon
      }

      setAllowanceRaw(allowance);
      setBalanceRaw(balance);

      const result: PreflightResult = {
        allowanceRaw: allowance,
        balanceRaw: balance,
        allowanceUsdt: formatUsdtUnits(allowance),
        balanceUsdt: formatUsdtUnits(balance),
        hasSufficientAllowance: allowance >= entryFeeUnits,
        hasSufficientBalance: balance >= entryFeeUnits,
      };

      // Console log in required format
      console.log(
        `PRECHECK_OK chainId=${chainId} user=${ownerAddress} spender=${ROOMMANAGER_V7_ADDRESS} allowance=${allowance.toString()} balance=${balance.toString()}`
      );

      setLastPreflight(result);
      return result;
    } catch (error) {
      console.error("Preflight check failed:", error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [ownerAddress, entryFeeUnits, getBrowserProvider, getFallbackProvider]);

  // Run preflight on mount and when address changes
  useEffect(() => {
    if (ownerAddress) {
      fetchPreflightData();
    } else {
      setAllowanceRaw(0n);
      setBalanceRaw(0n);
      setLastPreflight(null);
      setIsConnected(false);
    }
  }, [ownerAddress, fetchPreflightData]);

  // Refetch functions
  const refetchAllowance = useCallback(async () => {
    await fetchPreflightData();
  }, [fetchPreflightData]);

  const refetchBalance = useCallback(async () => {
    await fetchPreflightData();
  }, [fetchPreflightData]);

  const runPreflight = useCallback(async (): Promise<PreflightResult> => {
    const result = await fetchPreflightData();
    return result || {
      allowanceRaw: 0n,
      balanceRaw: 0n,
      allowanceUsdt: "0.000000",
      balanceUsdt: "0.000000",
      hasSufficientAllowance: false,
      hasSufficientBalance: false,
    };
  }, [fetchPreflightData]);

  return {
    allowanceRaw,
    balanceRaw,
    allowanceUsdt: formatUsdtUnits(allowanceRaw),
    balanceUsdt: formatUsdtUnits(balanceRaw),
    hasSufficientAllowance: allowanceRaw >= entryFeeUnits,
    hasSufficientBalance: balanceRaw >= entryFeeUnits,
    isLoading,
    isConnected,
    runPreflight,
    refetchAllowance,
    refetchBalance,
    lastPreflight,
    spenderAddress: ROOMMANAGER_V7_ADDRESS,
  };
}
