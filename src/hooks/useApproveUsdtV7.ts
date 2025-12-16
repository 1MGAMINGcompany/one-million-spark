import { useCallback } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseUnits, isAddress, erc20Abi } from "viem";
import { polygon } from "@/lib/wagmi-config";
import { USDT_ADDRESS, ROOMMANAGER_V7_ADDRESS, USDT_DECIMALS } from "@/lib/contractAddresses";

// Re-export helper functions for backwards compatibility
export function usdtToUnitsV7(amount: number): bigint {
  return parseUnits(amount.toString(), USDT_DECIMALS);
}

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
    
    // Debug log address lengths before validation
    console.log("USDT_ADDRESS_CHECK:", USDT_ADDRESS, "length:", (USDT_ADDRESS as string).length);
    console.log("ROOM_MANAGER_CHECK:", ROOMMANAGER_V7_ADDRESS, "length:", (ROOMMANAGER_V7_ADDRESS as string).length);
    
    // Validate addresses before calling
    if (!isAddress(USDT_ADDRESS)) {
      throw new Error("BAD_USDT_ADDRESS");
    }
    if (!isAddress(ROOMMANAGER_V7_ADDRESS)) {
      throw new Error("BAD_ROOM_MANAGER_ADDRESS");
    }
    
    // Convert to bigint using viem parseUnits
    const amountUnits = parseUnits(amountUsdt.toString(), USDT_DECIMALS);
    
    // Debug logging
    console.log("APPROVE_USDT_CALL", {
      USDT: USDT_ADDRESS,
      USDT_LENGTH: USDT_ADDRESS.length,
      SPENDER: ROOMMANAGER_V7_ADDRESS,
      SPENDER_LENGTH: ROOMMANAGER_V7_ADDRESS.length,
      amountUsdt,
      amountUnits: amountUnits.toString(),
      userAddress: address,
    });
    
    writeContract({
      address: USDT_ADDRESS,
      abi: erc20Abi,
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
