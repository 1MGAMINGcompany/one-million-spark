// src/hooks/useRoomManager.ts
import { useCallback, useMemo } from "react";
import { parseEther, formatEther } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
} from "wagmi";
import { ROOM_MANAGER_ABI, ROOM_MANAGER_ADDRESS, RoomStatus } from "../contracts/roomManager";

export type Room = {
  id: bigint;
  creator: `0x${string}`;
  entryFeeWei: bigint;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  platformFeeBps: number;
  gameId: number;
  playerCount: number;
  isOpen: boolean;
  status: RoomStatus;
  winner: `0x${string}`;
};

export type ContractRoomView = readonly [
  bigint,           // id
  `0x${string}`,    // creator
  bigint,           // entryFeeWei
  number,           // maxPlayers
  boolean,          // isPrivate
  number,           // platformFeeBps
  number,           // gameId
  number,           // playerCount
  boolean,          // isOpen
];

export function formatRoomView(data: ContractRoomView): Room {
  return {
    id: data[0],
    creator: data[1],
    entryFeeWei: data[2],
    entryFee: data[2],
    maxPlayers: Number(data[3]),
    isPrivate: Boolean(data[4]),
    platformFeeBps: Number(data[5]),
    gameId: Number(data[6]),
    playerCount: Number(data[7]),
    isOpen: Boolean(data[8]),
    status: Boolean(data[8]) ? RoomStatus.Created : RoomStatus.Finished,
    winner: "0x0000000000000000000000000000000000000000" as `0x${string}`,
  };
}

export function formatEntryFee(wei: bigint): string {
  return formatEther(wei);
}

export function getRoomStatusLabel(status: RoomStatus): string {
  switch (status) {
    case RoomStatus.None: return "None";
    case RoomStatus.Created: return "Waiting";
    case RoomStatus.Started: return "In Progress";
    case RoomStatus.Finished: return "Finished";
    case RoomStatus.Cancelled: return "Cancelled";
    default: return "Unknown";
  }
}

export function useRoomManager() {
  const { address } = useAccount();
  const { writeContractAsync, data: txHash, isPending } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
  } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const latestRoomId = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getLatestRoomId",
  });

  const openRoomIds = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getOpenRoomIds",
    args: [0n, 50n],
    query: { refetchInterval: 4000 },
  });

  const createRoom = useCallback(
    async (args: {
      entryFeeEth: string;
      maxPlayers: number;
      isPrivate: boolean;
      platformFeeBps: number;
      gameId: number;
    }) => {
      const entryFeeWei = parseEther(args.entryFeeEth);

      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "createRoom",
        args: [
          entryFeeWei,
          args.maxPlayers,
          args.isPrivate,
          args.platformFeeBps,
          args.gameId,
        ],
        value: entryFeeWei,
      } as any);
    },
    [writeContractAsync]
  );

  const joinRoom = useCallback(
    async (roomId: bigint, entryFeeWei: bigint) => {
      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "joinRoom",
        args: [roomId],
        value: entryFeeWei,
      } as any);
    },
    [writeContractAsync]
  );

  const cancelRoom = useCallback(
    async (roomId: bigint) => {
      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "cancelRoom",
        args: [roomId],
      } as any);
    },
    [writeContractAsync]
  );

  const formatEntryFeeLocal = useCallback((wei: bigint) => formatEther(wei), []);

  const watch = useMemo(
    () => ({
      address: ROOM_MANAGER_ADDRESS,
      abi: ROOM_MANAGER_ABI,
    }),
    []
  );

  return {
    address,
    latestRoomId,
    openRoomIds,
    createRoom,
    joinRoom,
    cancelRoom,
    txHash,
    isPending,
    isConfirming,
    isConfirmed,
    formatEntryFee: formatEntryFeeLocal,
    watch,
  };
}

// Separate hooks for individual operations
export function useCreateRoom() {
  const { writeContractAsync, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const createRoom = useCallback(
    async (
      entryFeeEth: string,
      maxPlayers: number,
      isPrivate: boolean,
      gameId: number,
      turnTimeSeconds: number
    ) => {
      const entryFeeWei = parseEther(entryFeeEth);
      const platformFeeBps = 500; // 5% platform fee

      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "createRoom",
        args: [entryFeeWei, maxPlayers, isPrivate, platformFeeBps, gameId],
        value: entryFeeWei,
      } as any);
    },
    [writeContractAsync]
  );

  return { createRoom, isPending, isConfirming, isSuccess, error, reset };
}

export function useJoinRoom() {
  const { writeContractAsync, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const joinRoom = useCallback(
    async (roomId: bigint, entryFeeWei: bigint) => {
      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "joinRoom",
        args: [roomId],
        value: entryFeeWei,
      } as any);
    },
    [writeContractAsync]
  );

  return { joinRoom, isPending, isConfirming, isSuccess, error, reset };
}

export function useCancelRoom() {
  const { writeContractAsync, data: txHash, isPending, error, reset } = useWriteContract();

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const cancelRoom = useCallback(
    async (roomId: bigint) => {
      return writeContractAsync({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "cancelRoom",
        args: [roomId],
      } as any);
    },
    [writeContractAsync]
  );

  return { cancelRoom, isPending, isConfirming, isSuccess, error, reset };
}

export function useRoom(roomId?: bigint) {
  return useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "getRoom",
    args: roomId ? [roomId] : undefined,
    query: { enabled: !!roomId, refetchInterval: 4000 },
  });
}

export function useRoomPlayers(roomId?: bigint) {
  // The contract doesn't have a separate players function - playerCount is in getRoom
  // Return empty array since we don't have individual player addresses
  return { data: [] as `0x${string}`[], refetch: () => {} };
}

export function useRoomEvents(onAnyEvent?: () => void) {
  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomCreated",
    onLogs: () => onAnyEvent?.(),
  });

  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomJoined",
    onLogs: () => onAnyEvent?.(),
  });

  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomCancelled",
    onLogs: () => onAnyEvent?.(),
  });
}

// Helper functions for display
export function formatTurnTime(seconds: number) {
  if (!seconds || seconds <= 0) return "No timer";
  if (seconds < 60) return `${seconds}s/turn`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s/turn` : `${m}m/turn`;
}

export function gameName(gameId: number) {
  switch (gameId) {
    case 1:
      return "Chess";
    case 2:
      return "Dominos";
    case 3:
      return "Backgammon";
    default:
      return `Game ${gameId}`;
  }
}
