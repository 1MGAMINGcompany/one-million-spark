import { useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOMMANAGER_V7_ADDRESS } from "./useRoomManagerV7";

// USDT address on Polygon mainnet (checksummed)
const USDT_ADDRESS = "0xC2132D05D31c914a87C6611C10748AEb04B58e8F" as const;
const USDT_DECIMALS = 6;

// ERC20 ABI for allowance and balanceOf
const ERC20_ABI = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

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

export function useUsdtPreflight(ownerAddress: `0x${string}` | undefined, entryFeeUnits: bigint) {
  const [lastPreflight, setLastPreflight] = useState<PreflightResult | null>(null);

  // Read allowance
  const { 
    data: allowanceData, 
    refetch: refetchAllowance,
    isLoading: isLoadingAllowance 
  } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, ROOMMANAGER_V7_ADDRESS] : undefined,
    chainId: 137,
    query: {
      enabled: !!ownerAddress,
      refetchInterval: 10000,
    },
  });

  // Read balance
  const { 
    data: balanceData, 
    refetch: refetchBalance,
    isLoading: isLoadingBalance 
  } = useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: ownerAddress ? [ownerAddress] : undefined,
    chainId: 137,
    query: {
      enabled: !!ownerAddress,
      refetchInterval: 10000,
    },
  });

  const allowanceRaw = allowanceData ?? 0n;
  const balanceRaw = balanceData ?? 0n;

  // Run preflight check and log to console
  const runPreflight = useCallback(async (): Promise<PreflightResult> => {
    await Promise.all([refetchAllowance(), refetchBalance()]);
    
    const currentAllowance = allowanceData ?? 0n;
    const currentBalance = balanceData ?? 0n;
    
    const result: PreflightResult = {
      allowanceRaw: currentAllowance,
      balanceRaw: currentBalance,
      allowanceUsdt: formatUsdtUnits(currentAllowance),
      balanceUsdt: formatUsdtUnits(currentBalance),
      hasSufficientAllowance: currentAllowance >= entryFeeUnits,
      hasSufficientBalance: currentBalance >= entryFeeUnits,
    };

    // Console log in single line as requested
    console.log(
      `PRECHECK allowance=${currentAllowance.toString()} balance=${currentBalance.toString()} entryFee=${entryFeeUnits.toString()} spender=${ROOMMANAGER_V7_ADDRESS}`
    );

    setLastPreflight(result);
    return result;
  }, [refetchAllowance, refetchBalance, allowanceData, balanceData, entryFeeUnits]);

  // Update preflight result when data changes
  useEffect(() => {
    if (ownerAddress && !isLoadingAllowance && !isLoadingBalance) {
      const result: PreflightResult = {
        allowanceRaw,
        balanceRaw,
        allowanceUsdt: formatUsdtUnits(allowanceRaw),
        balanceUsdt: formatUsdtUnits(balanceRaw),
        hasSufficientAllowance: allowanceRaw >= entryFeeUnits,
        hasSufficientBalance: balanceRaw >= entryFeeUnits,
      };
      setLastPreflight(result);
      
      // Log on initial load
      console.log(
        `PRECHECK allowance=${allowanceRaw.toString()} balance=${balanceRaw.toString()} entryFee=${entryFeeUnits.toString()} spender=${ROOMMANAGER_V7_ADDRESS}`
      );
    }
  }, [ownerAddress, allowanceRaw, balanceRaw, entryFeeUnits, isLoadingAllowance, isLoadingBalance]);

  return {
    allowanceRaw,
    balanceRaw,
    allowanceUsdt: formatUsdtUnits(allowanceRaw),
    balanceUsdt: formatUsdtUnits(balanceRaw),
    hasSufficientAllowance: allowanceRaw >= entryFeeUnits,
    hasSufficientBalance: balanceRaw >= entryFeeUnits,
    isLoading: isLoadingAllowance || isLoadingBalance,
    runPreflight,
    refetchAllowance,
    refetchBalance,
    lastPreflight,
    spenderAddress: ROOMMANAGER_V7_ADDRESS,
  };
}
