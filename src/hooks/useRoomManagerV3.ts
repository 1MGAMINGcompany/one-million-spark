import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_V3_ADDRESS, ROOM_MANAGER_V3_ABI, type ContractRoomV3 } from "@/contracts/roomManagerV3";
import { USDT_ADDRESS } from "@/contracts/usdt";
import { useToast } from "@/hooks/use-toast";
import { useCallback } from "react";

// USDT has 6 decimals
const USDT_DECIMALS = 6;

// ERC20 ABI for approve function
const ERC20_ABI = [
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
] as const;

// Convert USDT amount to token units (6 decimals)
export function usdtToUnits(amount: number): bigint {
  return BigInt(Math.floor(amount * 10 ** USDT_DECIMALS));
}

// Convert token units to USDT amount
export function unitsToUsdt(units: bigint): number {
  return Number(units) / 10 ** USDT_DECIMALS;
}

// Format USDT units for display
export function formatUsdtUnits(units: bigint): string {
  return `${unitsToUsdt(units).toFixed(2)} USDT`;
}

// Hook to get USDT allowance for RoomManagerV3
export function useUsdtAllowance(ownerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, ROOM_MANAGER_V3_ADDRESS] : undefined,
    chainId: 137,
    query: {
      enabled: !!ownerAddress,
      refetchInterval: 5000, // Refetch every 5 seconds to catch approval changes
    },
  });
}

// Hook to approve USDT spending
export function useApproveUsdt() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const approve = useCallback((amountUsdt: number) => {
    if (!address) return;
    
    const amountUnits = usdtToUnits(amountUsdt);
    
    writeContract({
      address: USDT_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [ROOM_MANAGER_V3_ADDRESS, amountUnits],
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

// Hook to get the latest room ID
export function useLatestRoomIdV3() {
  return useReadContract({
    address: ROOM_MANAGER_V3_ADDRESS,
    abi: ROOM_MANAGER_V3_ABI,
    functionName: "latestRoomId",
    chainId: 137,
  });
}

// Hook to get a specific room by ID
export function useRoomV3(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_V3_ADDRESS,
    abi: ROOM_MANAGER_V3_ABI,
    functionName: "getRoom",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined,
    },
  });
}

// Hook to check if player has joined a room
export function useHasJoinedV3(roomId: bigint | undefined, playerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_V3_ADDRESS,
    abi: ROOM_MANAGER_V3_ABI,
    functionName: "hasJoined",
    args: roomId !== undefined && playerAddress ? [roomId, playerAddress] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined && !!playerAddress,
    },
  });
}

// Hook to create a room (USDT-based, requires prior approval)
export function useCreateRoomV3() {
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createRoom = useCallback((
    entryFeeUsdt: number,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number = 500, // 5% default
    gameId: number = 1 // Default: Chess
  ) => {
    if (!address) return;
    
    const entryFeeUnits = usdtToUnits(entryFeeUsdt);
    
    writeContract({
      address: ROOM_MANAGER_V3_ADDRESS,
      abi: ROOM_MANAGER_V3_ABI,
      functionName: "createRoom",
      args: [entryFeeUnits, maxPlayers, isPrivate, platformFeeBps, gameId],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    createRoom,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Hook to join a room (USDT-based, requires prior approval)
export function useJoinRoomV3() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const joinRoom = useCallback((roomId: bigint) => {
    if (!address) return;
    
    writeContract({
      address: ROOM_MANAGER_V3_ADDRESS,
      abi: ROOM_MANAGER_V3_ABI,
      functionName: "joinRoom",
      args: [roomId],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    joinRoom,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Hook to cancel a room
export function useCancelRoomV3() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelRoom = useCallback((roomId: bigint) => {
    if (!address) return;
    
    writeContract({
      address: ROOM_MANAGER_V3_ADDRESS,
      abi: ROOM_MANAGER_V3_ABI,
      functionName: "cancelRoom",
      args: [roomId],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    cancelRoom,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Helper to format room data from getRoom response
export function formatRoomV3(
  data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, boolean]
): ContractRoomV3 {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    platformFeeBps: data[5],
    gameId: data[6],
    playerCount: data[7],
    isOpen: data[8],
  };
}

// Helper to get game name from gameId
export function getGameNameV3(gameId: number): string {
  switch (gameId) {
    case 1:
      return "Chess";
    case 2:
      return "Dominos";
    case 3:
      return "Backgammon";
    default:
      return "Unknown";
  }
}
