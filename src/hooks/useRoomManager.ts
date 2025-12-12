import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSimulateContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "wagmi/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus, type ContractRoomView } from "@/contracts/roomManager";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

// Helper to extract revert reason from error
function extractRevertReason(error: unknown): string {
  if (!error) return "Unknown error";
  const errorStr = String(error);
  const match = errorStr.match(/reason:\s*([^\n]+)/i) || errorStr.match(/reverted with reason string '([^']+)'/);
  if (match) return match[1];
  if (error instanceof Error) return error.message;
  return "Transaction would fail";
}

// ============ UTILITIES ============

export function formatEntryFee(entryFeeWei: bigint): string {
  return formatEther(entryFeeWei);
}

export function getRoomStatusLabel(status: number): string {
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

export interface FormattedRoom {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: number;
  gameId: number;
  turnTimeSeconds: number;
  winner: `0x${string}`;
}

export function formatRoomView(data: ContractRoomView): FormattedRoom {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    status: data[5],
    gameId: data[6],
    turnTimeSeconds: data[7],
    winner: data[8],
  };
}

// ============ HOOKS ============

// Hook to create a room (creator stakes too; createRoom is payable)
export function useCreateRoom() {
  const { address } = useAccount();
  const { toast } = useToast();
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const [simulationError, setSimulationError] = useState<Error | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [simArgs, setSimArgs] = useState<{
    entryFeeWei: bigint;
    maxPlayers: number;
    isPrivate: boolean;
    gameId: number;
    turnTimeSeconds: number;
  } | null>(null);

  const { refetch: simulate } = useSimulateContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "createRoom",
    args: simArgs
      ? [
          simArgs.entryFeeWei,
          simArgs.maxPlayers,
          simArgs.isPrivate,
          simArgs.gameId,
          simArgs.turnTimeSeconds,
        ]
      : undefined,
    value: simArgs ? simArgs.entryFeeWei : undefined,
    query: { enabled: false },
  });

  const createRoom = useCallback(
    async (
      entryFeeInPol: string,
      maxPlayers: number,
      isPrivate: boolean,
      gameId: number,
      turnTimeSeconds: number,
    ) => {
      if (!address) return;

      const entryFeeWei = parseEther(entryFeeInPol);

      setSimArgs({ entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds });
      setSimulationError(null);
      setIsSimulating(true);

      try {
        const simResult = await simulate();

        if (simResult.error) {
          const revertReason = extractRevertReason(simResult.error);
          setSimulationError(simResult.error);
          toast({
            title: "Transaction will fail",
            description: revertReason,
            variant: "destructive",
          });
          return;
        }

        if (simResult.data?.request) {
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
    },
    [address, simulate, writeContract, toast],
  );

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

// Hook to join a room (payable)
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

// Hook to get room data
export function useRoom(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoomView",
    args: roomId ? [roomId] : undefined,
    query: {
      enabled: !!roomId,
    },
  });
}

// Hook to get room players
export function useRoomPlayers(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getPlayers",
    args: roomId ? [roomId] : undefined,
    query: {
      enabled: !!roomId,
    },
  });
}

// Hook to check if creator has an active room
export function useCreatorActiveRoom(address: `0x${string}` | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "creatorActiveRoomId",
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
    },
  });
}
