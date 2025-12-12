import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "wagmi/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus, type ContractRoomView } from "@/contracts/roomManager";

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
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createRoom = (
    entryFeeInPol: string,
    maxPlayers: number,
    isPrivate: boolean,
    gameId: number,
    turnTimeSeconds: number
  ) => {
    if (!address) return;

    const entryFeeWei = parseEther(entryFeeInPol);

    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "createRoom",
      args: [entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds],
      value: entryFeeWei,
      chain: polygon,
      account: address,
    });
  };

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
