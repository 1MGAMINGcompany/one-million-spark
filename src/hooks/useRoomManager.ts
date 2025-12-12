// src/hooks/useRoomManager.ts
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";

export function useNextRoomId() {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
  });
}

export function useRoomView(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoom",
    args: roomId !== undefined ? [roomId] : undefined,
    query: { enabled: roomId !== undefined },
  });
}

export function useCreateRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createRoom = (
    entryFeeInPol: string,
    maxPlayers: number,
    isPrivate: boolean
  ) => {
    if (!address) return;

    // ✅ ALWAYS convert POL → wei here
    const entryFeeWei = parseEther(entryFeeInPol);

    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "createRoom",
      args: [entryFeeWei, maxPlayers, isPrivate],
      chain: polygon,
      account: address,
    });
  };

  return { createRoom, hash, isPending, isConfirming, isSuccess, error, reset };
}

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

  return { joinRoom, hash, isPending, isConfirming, isSuccess, error, reset };
}

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

  return { cancelRoom, hash, isPending, isConfirming, isSuccess, error, reset };
}

export function formatEntryFee(weiAmount: bigint): string {
  return formatEther(weiAmount);
}

export function getRoomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case RoomStatus.None:
      return "None";
    case RoomStatus.Created:
      return "Waiting";
    case RoomStatus.Started:
      return "In Progress";
    case RoomStatus.Finished:
      return "Finished";
    case RoomStatus.Cancelled:
      return "Cancelled";
    default:
      return `Status ${status}`;
  }
}

export function gameName(gameId: number) {
  switch (gameId) {
    case 0:
      return "Chess";
    case 1:
      return "Dominos";
    case 2:
      return "Backgammon";
    default:
      return `Game ${gameId}`;
  }
}

export function formatTurnTime(seconds: number) {
  if (!seconds || seconds <= 0) return "No timer";
  if (seconds < 60) return `${seconds}s/turn`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s/turn` : `${m}m/turn`;
}

// RoomView type for parsed contract data
export type RoomView = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  gameId: number;
  turnTimeSeconds: number;
  winner: `0x${string}`;
};

// Contract tuple type
export type ContractRoomView = readonly [
  bigint,
  `0x${string}`,
  bigint,
  number,
  boolean,
  number,
  number,
  number,
  `0x${string}`,
];

// Parse contract tuple into RoomView object
export function parseRoomView(data: ContractRoomView): RoomView {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    status: data[5] as RoomStatus,
    gameId: data[6],
    turnTimeSeconds: data[7],
    winner: data[8],
  };
}

// Format room view for display
export function formatRoomView(data: ContractRoomView) {
  const room = parseRoomView(data);
  return {
    ...room,
    entryFeeFormatted: formatEther(room.entryFee),
    statusLabel: getRoomStatusLabel(room.status),
    gameLabel: gameName(room.gameId),
    turnTimeLabel: formatTurnTime(room.turnTimeSeconds),
  };
}

// Alias for useRoomView
export function useRoom(roomId: bigint | undefined) {
  return useRoomView(roomId);
}

// Get players for a room
export function useRoomPlayers(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "playersOf",
    args: roomId !== undefined ? [roomId] : undefined,
    query: { enabled: roomId !== undefined },
  });
}
