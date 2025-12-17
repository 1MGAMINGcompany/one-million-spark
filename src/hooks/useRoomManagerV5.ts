// Stub hooks for RoomManagerV5 - Solana migration
// Replace with Solana program interactions when available

import { useState, useCallback } from "react";

// USDT decimals (kept for backwards compatibility)
const USDT_DECIMALS = 6;

export function usdtToUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** USDT_DECIMALS));
}

export function unitsToUsdt(units: bigint): number {
  return Number(units) / 10 ** USDT_DECIMALS;
}

export function formatUsdtUnits(units: bigint): string {
  return `${unitsToUsdt(units).toFixed(2)} USDT`;
}

// Stub hooks - all return empty/disabled state

export function useUsdtAllowanceV5(ownerAddress: `0x${string}` | undefined) {
  return {
    data: 0n,
    isLoading: false,
    refetch: () => {},
  };
}

export function useApproveUsdtV5() {
  return {
    approve: () => console.warn("Not available on Solana"),
    hash: undefined,
    isPending: false,
    isConfirming: false,
    isSuccess: false,
    error: null,
    reset: () => {},
  };
}

export function useLatestRoomIdV5() {
  return {
    data: 0n,
    isLoading: false,
    refetch: () => {},
  };
}

export function useJoinRoomV5() {
  const [isPending, setIsPending] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const joinRoom = useCallback(async (roomId: bigint) => {
    console.warn("RoomManagerV5 not available on Solana - use Solana program");
    setError(new Error("Solana program integration pending"));
  }, []);

  const reset = useCallback(() => {
    setIsPending(false);
    setIsConfirming(false);
    setIsSuccess(false);
    setError(null);
  }, []);

  return {
    joinRoom,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

export function useCancelRoomV5() {
  const [isPending, setIsPending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const cancelRoom = useCallback(async (roomId: bigint) => {
    console.warn("RoomManagerV5 not available on Solana");
  }, []);

  const reset = useCallback(() => {
    setIsPending(false);
    setIsSuccess(false);
    setError(null);
  }, []);

  return {
    cancelRoom,
    isPending,
    isSuccess,
    error,
    reset,
  };
}

export function usePlayersV5(roomId: bigint | undefined) {
  return {
    data: [] as string[],
    isLoading: false,
    refetch: () => {},
  };
}
