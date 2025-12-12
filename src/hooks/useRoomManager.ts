// src/hooks/useRoomManager.ts
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther, formatEther } from "viem";
import { polygon } from "@/lib/wagmi-config";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus, type ContractRoomView } from "@/contracts/roomManager";

// ---------- helpers ----------
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
      return "Unknown";
  }
}

// Optional: map gameId -> label (extend anytime)
export function getGameLabel(gameId: number): string {
  switch (gameId) {
    case 0:
      return "Chess";
    case 1:
      return "Dominos";
    case 2:
      return "Backgammon";
    default:
      return `Game #${gameId}`;
  }
}

export function getTurnTimeLabel(turnTimeSeconds: number): string {
  if (!turnTimeSeconds || turnTimeSeconds === 0) return "No timer";
  if (turnTimeSeconds < 60) return `${turnTimeSeconds}s`;
  const mins = Math.round(turnTimeSeconds / 60);
  return `${mins} min`;
}

// ---------- reads ----------
export function useNextRoomId() {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
    chainId: 137,
  });
}

export function useRoomView(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoomView",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: { enabled: roomId !== undefined },
  });
}

export function usePlayerCount(roomId: bigint | undefined) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getPlayerCount",
    args: roomId !== undefined ? [roomId] : undefined,
    chainId: 137,
    query: { enabled: roomId !== undefined },
  });
}

// Convert wagmi getRoomView tuple into a nice object
export function normalizeRoomView(data: readonly unknown[]): ContractRoomView {
  // outputs: id, creator, entryFee, maxPlayers, isPrivate, status, gameId, turnTimeSeconds, winner
  const [id, creator, entryFee, maxPlayers, isPrivate, status, gameId, turnTimeSeconds, winner] = data as readonly [
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

  return {
    id,
    creator,
    entryFee,
    maxPlayers: Number(maxPlayers),
    isPrivate,
    status: Number(status) as RoomStatus,
    gameId: Number(gameId),
    turnTimeSeconds: Number(turnTimeSeconds),
    winner,
  };
}

// ---------- writes ----------
export function useCreateRoomV2() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  /**
   * createRoom(entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds) payable
   * IMPORTANT: creator must stake too => send value = entryFeeWei
   */
  const createRoom = (
    entryFeeInPol: string,
    maxPlayers: number,
    isPrivate: boolean,
    gameId: number,
    turnTimeSeconds: number,
  ) => {
    if (!address) return;

    const entryFeeWei = parseEther(entryFeeInPol);

    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "createRoom",
      args: [entryFeeWei, maxPlayers, isPrivate, gameId, turnTimeSeconds],
      value: entryFeeWei, // ✅ creator stakes the same amount
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

export function useFinishRoom() {
  const { address } = useAccount();
  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

  const finishRoom = (roomId: bigint, winner: `0x${string}`) => {
    if (!address) return;
    writeContract({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
      functionName: "finishRoom",
      args: [roomId, winner],
      chain: polygon,
      account: address,
    });
  };

  return { finishRoom, hash, isPending, isConfirming, isSuccess, error, reset };
}
