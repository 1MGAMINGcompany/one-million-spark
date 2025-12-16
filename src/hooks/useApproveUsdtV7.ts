import { useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polygon } from "@/lib/wagmi-config";
import { 
  USDT_ADDRESS, 
  ROOMMANAGER_V7_ADDRESS, 
  USDT_DECIMALS,
  usdtToUnits,
  unitsToUsdt 
} from "@/lib/contractAddresses";

// Re-export helper functions for backwards compatibility
export const usdtToUnitsV7 = usdtToUnits;
export const unitsToUsdtV7 = unitsToUsdt;

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

// Hook to approve USDT spending for V7 contract
export function useApproveUsdtV7() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback((amountUsdt: number) => {
    if (!address) return;
    
    const amountUnits = usdtToUnits(amountUsdt);
    
    console.log("APPROVE_USDT:", {
      usdtAddress: USDT_ADDRESS,
      spender: ROOMMANAGER_V7_ADDRESS,
      amountUsdt,
      amountUnits: amountUnits.toString(),
      userAddress: address,
    });
    
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
