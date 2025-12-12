// src/hooks/useRoomManager.ts
import { useCallback } from "react";
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus, type RoomView, type ContractRoomView } from "@/contracts/roomManager";

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
    functionName: "getRoomView",
    args: roomId !== undefined ? [roomId] : undefined,
    query: { enabled: roomId !== undefined },
  });
}

export function usePlayerActiveRoom(player: `0x${string}` | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "playerActiveRoom",
    args: player ? [player] : undefined,
    query: { enabled: !!player },
  });
}

export function useCreateRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const createRoom = useCallback(
    (entryFeePol: string, maxPlayers: number, isPrivate: boolean, gameId: number, turnTimeSeconds: number) => {
      if (!address) return;

      const entryFeeWei = parseEther(entryFeePol);

      writeContract({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "createRoom",
        args: [entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds],
        value: entryFeeWei, // ✅ creator pays same stake
        chain: polygon,
        account: address,
      });
    },
    [address, writeContract],
  );

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

// helper type guard
export function asRoomView(x: unknown): RoomView {
  return x as RoomView;
}

// Alias for usePlayerActiveRoom (creator context)
export function useCreatorActiveRoom(player: `0x${string}` | undefined) {
  return usePlayerActiveRoom(player);
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
    functionName: "getPlayers",
    args: roomId !== undefined ? [roomId] : undefined,
    query: { enabled: roomId !== undefined },
  });
}

// Start a room
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

  return { startRoom, hash, isPending, isConfirming, isSuccess, error, reset };
}

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
