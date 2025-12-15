import { useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polygon } from "@/lib/wagmi-config";
import { ROOMMANAGER_V7_ADDRESS } from "./useRoomManagerV7";

// USDT address on Polygon mainnet
const USDT_ADDRESS = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f" as const;

// USDT has 6 decimals
const USDT_DECIMALS = 6;

// ERC20 ABI for approve function
const ERC20_APPROVE_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

// Convert USDT amount to token units (6 decimals)
export function usdtToUnitsV7(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** USDT_DECIMALS));
}

// Convert token units to USDT amount
export function unitsToUsdtV7(units: bigint): number {
  return Number(units) / 10 ** USDT_DECIMALS;
}

// Hook to approve USDT spending for V7 contract
export function useApproveUsdtV7() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback((amountUsdt: number) => {
    if (!address) return;
    
    const amountUnits = usdtToUnitsV7(amountUsdt);
    
    writeContract({
      address: USDT_ADDRESS,
      abi: ERC20_APPROVE_ABI,
      functionName: "approve",
      args: [ROOMMANAGER_V7_ADDRESS, amountUnits],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    approve,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}
