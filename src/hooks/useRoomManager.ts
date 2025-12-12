import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount, useSimulateContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus, type ContractRoomView } from "@/contracts/roomManager";
import { useToast } from "@/hooks/use-toast";
import { useCallback, useState } from "react";

// Hook to get the next room ID
export function useNextRoomId() {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
  });
}

// Hook to get a specific room by ID (returns getRoomView data)
export function useRoom(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoomView",
    args: roomId !== undefined ? [roomId] : undefined,
    query: {
      enabled: roomId !== undefined,
    },
  });
}

// Hook to get players for a room
export function useRoomPlayers(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getPlayers",
    args: roomId !== undefined ? [roomId] : undefined,
    query: {
      enabled: roomId !== undefined,
    },
  });
}

// Hook to get creator's active room
export function useCreatorActiveRoom(creatorAddress: `0x${string}` | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "creatorActiveRoomId",
    args: creatorAddress ? [creatorAddress] : undefined,
    query: {
      enabled: !!creatorAddress,
    },
  });
}

// Hook to create a room with simulation
export function useCreateRoom() {
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  const [simulationError, setSimulationError] = useState<Error | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Simulation args state
  const [simArgs, setSimArgs] = useState<{
    entryFeeWei: bigint;
    maxPlayers: number;
    isPrivate: boolean;
  } | null>(null);

  // Simulate contract call
  const { refetch: simulate } = useSimulateContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "createRoom",
    args: simArgs ? [simArgs.entryFeeWei, simArgs.maxPlayers, simArgs.isPrivate] : undefined,
    query: {
      enabled: false, // Manual trigger only
    },
  });

  const createRoom = useCallback(async (entryFeeInPol: string, maxPlayers: number, isPrivate: boolean) => {
    if (!address) return;
    
    const entryFeeWei = parseEther(entryFeeInPol);
    setSimArgs({ entryFeeWei, maxPlayers, isPrivate });
    setSimulationError(null);
    setIsSimulating(true);

    try {
      // Run simulation first
      const simResult = await simulate();
      
      if (simResult.error) {
        const revertReason = extractRevertReason(simResult.error);
        setSimulationError(simResult.error);
        toast({
          title: "Transaction will fail",
          description: revertReason,
          variant: "destructive",
        });
        setIsSimulating(false);
        return;
      }

      if (simResult.data?.request) {
        // Simulation succeeded, send the transaction
        writeContract(simResult.data.request);
      }
    } catch (err) {
      const revertReason = extractRevertReason(err);
      setSimulationError(err as Error);
      toast({
        title: "Simulation failed",
        description: revertReason,
        variant: "destructive",
      });
    } finally {
      setIsSimulating(false);
    }
  }, [address, simulate, writeContract, toast]);

  return {
    createRoom,
    hash,
    isPending: isPending || isSimulating,
    isConfirming,
    isSuccess,
    error: writeError || simulationError,
    reset: () => {
      reset();
      setSimulationError(null);
      setSimArgs(null);
    },
  };
}

// Hook to join a room
export function useJoinRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const joinRoom = (roomId: bigint, entryFeeWei: bigint) => {
    if (!address) return;
    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "joinRoom",
      args: [roomId],
      value: entryFeeWei,
      chain: polygon,
      account: address,
    });
  };

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
export function useCancelRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const cancelRoom = (roomId: bigint) => {
    if (!address) return;
    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "cancelRoom",
      args: [roomId],
      chain: polygon,
      account: address,
    });
  };

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

// Hook to start a room
export function useStartRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const startRoom = (roomId: bigint) => {
    if (!address) return;
    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "startRoom",
      args: [roomId],
      chain: polygon,
      account: address,
    });
  };

  return {
    startRoom,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    error,
    reset,
  };
}

// Helper to extract revert reason from error
function extractRevertReason(error: unknown): string {
  if (!error) return "Unknown error";
  
  const errorStr = String(error);
  
  // Try to extract revert reason from common patterns
  const patterns = [
    /reason="([^"]+)"/,
    /reverted with reason string '([^']+)'/,
    /Error: ([^(]+)\(/,
    /execution reverted: ([^"]+)/i,
    /ContractFunctionExecutionError: ([^.]+)/,
  ];

  for (const pattern of patterns) {
    const match = errorStr.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  // Check for common error messages in the error object
  if (typeof error === 'object' && error !== null) {
    const err = error as Record<string, unknown>;
    if (err.shortMessage && typeof err.shortMessage === 'string') {
      return err.shortMessage;
    }
    if (err.message && typeof err.message === 'string') {
      // Truncate long messages
      const msg = err.message;
      if (msg.length > 150) {
        return msg.substring(0, 150) + "...";
      }
      return msg;
    }
  }

  return "Transaction simulation failed";
}

// Helper to format room data from contract response (getRoomView)
export function formatRoomView(data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, `0x${string}`]): ContractRoomView {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: Number(data[3]),
    isPrivate: data[4],
    status: Number(data[5]) as RoomStatus,
    gameId: Number(data[6]),
    turnTimeSeconds: Number(data[7]),
    winner: data[8],
  };
}

// Helper to format entry fee for display
export function formatEntryFee(weiAmount: bigint): string {
  return formatEther(weiAmount);
}

// Helper to get room status label
export function getRoomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case RoomStatus.Created:
      return "Waiting";
    case RoomStatus.Started:
      return "In Progress";
    case RoomStatus.Finished:
      return "Finished";
    case RoomStatus.Cancelled:
      return "Cancelled";
    default:
      return "Unknown";
  }
}
