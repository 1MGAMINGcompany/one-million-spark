import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_V5_ADDRESS, ROOM_MANAGER_V5_ABI, type ContractRoomV5 } from "@/contracts/roomManagerV5";
import { USDT_ADDRESS } from "@/contracts/usdt";
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

// Hook to get USDT allowance for RoomManagerV5
export function useUsdtAllowanceV5(ownerAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: USDT_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: ownerAddress ? [ownerAddress, ROOM_MANAGER_V5_ADDRESS] : undefined,
    chainId: 137,
    query: {
      enabled: !!ownerAddress,
      refetchInterval: 5000,
    },
  });
}

// Hook to approve USDT spending for V5 contract
export function useApproveUsdtV5() {
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
      args: [ROOM_MANAGER_V5_ADDRESS, amountUnits],
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
export function useLatestRoomIdV5() {
  return useReadContract({
    address: ROOM_MANAGER_V5_ADDRESS,
    abi: ROOM_MANAGER_V5_ABI,
    functionName: "latestRoomId",
    chainId: 137,
  });
}

// Hook to get a specific room by ID
export function useRoomV5(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_V5_ADDRESS,
    abi: ROOM_MANAGER_V5_ABI,
    functionName: "getRoom",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined,
    },
  });
}

// Hook to get players in a room
export function usePlayersV5(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_V5_ADDRESS,
    abi: ROOM_MANAGER_V5_ABI,
    functionName: "getPlayers",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: {
      enabled: roomId !== undefined,
      refetchInterval: 5000,
    },
  });
}

// Hook to create a room (USDT-based, requires prior approval)
export function useCreateRoomV5() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createRoom = useCallback((
    entryFeeUsdt: number,
    maxPlayers: number,
    isPrivate: boolean,
    platformFeeBps: number = 500, // 5% default
    gameId: number = 1, // Default: Chess
    turnTimeSec: number = 10 // Default: 10 seconds
  ) => {
    if (!address) return;
    
    const entryFeeUnits = usdtToUnits(entryFeeUsdt);
    
    writeContract({
      address: ROOM_MANAGER_V5_ADDRESS,
      abi: ROOM_MANAGER_V5_ABI,
      functionName: "createRoom",
      args: [entryFeeUnits, maxPlayers, isPrivate, platformFeeBps, gameId, turnTimeSec],
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
export function useJoinRoomV5() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const joinRoom = useCallback((roomId: bigint) => {
    if (!address) return;
    
    writeContract({
      address: ROOM_MANAGER_V5_ADDRESS,
      abi: ROOM_MANAGER_V5_ABI,
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

// Hook to finish a game and pay the winner
export function useFinishGameV5() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const finishGame = useCallback((roomId: bigint, winnerAddress: `0x${string}`) => {
    if (!address) return;
    
    writeContract({
      address: ROOM_MANAGER_V5_ADDRESS,
      abi: ROOM_MANAGER_V5_ABI,
      functionName: "finishGame",
      args: [roomId, winnerAddress],
      chain: polygon,
      account: address,
    });
  }, [address, writeContract]);

  return {
    finishGame,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Helper to format room data from getRoom response
export function formatRoomV5(
  data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, number, boolean, boolean]
): ContractRoomV5 {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    platformFeeBps: data[5],
    gameId: data[6],
    turnTimeSec: data[7],
    playerCount: data[8],
    isOpen: data[9],
    isFinished: data[10],
  };
}

// Helper to get game name from gameId
export function getGameNameV5(gameId: number): string {
  switch (gameId) {
    case 1:
      return "Chess";
    case 2:
      return "Dominos";
    case 3:
      return "Backgammon";
    case 4:
      return "Checkers";
    case 5:
      return "Ludo";
    default:
      return "Unknown";
  }
}
