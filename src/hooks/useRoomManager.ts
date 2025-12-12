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
import { ROOM_MANAGER_ABI, ROOM_MANAGER_ADDRESS } from "../contracts/roomManager";

export type Room = {
  id: bigint;
  creator: `0x${string}`;
  entryFeeWei: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  platformFeeBps: number;
  gameId: number;
  playerCount: number;
  isOpen: boolean;
};

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
      entryFeeEth: string; // e.g. "0.01"
      maxPlayers: number; // e.g. 2
      isPrivate: boolean;
      platformFeeBps: number; // e.g. 500
      gameId: number; // e.g. 1 chess, 2 dominos, 3 backgammon
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
      });
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
      });
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
      });
    },
    [writeContractAsync]
  );

  const formatEntryFee = useCallback((wei: bigint) => formatEther(wei), []);

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
    formatEntryFee,
    watch,
  };
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
