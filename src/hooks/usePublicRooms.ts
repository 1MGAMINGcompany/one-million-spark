import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, fallback } from "viem";
import { polygon } from "viem/chains";
import {
  ROOM_MANAGER_ADDRESS,
  ROOM_MANAGER_ABI,
  RoomStatus,
} from "@/contracts/roomManager";

export type PublicRoom = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  gameType: number;
  turnTimeSeconds: number;
  playerCount: number;
  winner: `0x${string}`;
};

const publicClient = createPublicClient({
  chain: polygon,
  transport: fallback([
    http("https://polygon-rpc.com"),
    http("https://rpc.ankr.com/polygon"),
    http("https://polygon-bor-rpc.publicnode.com"),
  ]),
});

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextRoomId = (await publicClient.readContract({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI as any,
        functionName: "nextRoomId",
      } as any)) as bigint;

      if (nextRoomId <= 1n) {
        setRooms([]);
        return;
      }

      const list: PublicRoom[] = [];

      for (let roomId = 1n; roomId < nextRoomId; roomId++) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const room = (await publicClient.readContract({
            address: ROOM_MANAGER_ADDRESS,
            abi: ROOM_MANAGER_ABI as any,
            functionName: "getRoomView",
            args: [roomId],
          } as any)) as readonly [
            bigint,
            `0x${string}`,
            bigint,
            number,
            boolean,
            number,
            number,
            number,
            `0x${string}`
          ];

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const playerCount = (await publicClient.readContract({
            address: ROOM_MANAGER_ADDRESS,
            abi: ROOM_MANAGER_ABI as any,
            functionName: "getPlayerCount",
            args: [roomId],
          } as any)) as bigint;

          const [
            id,
            creator,
            entryFee,
            maxPlayers,
            isPrivate,
            status,
            gameType,
            turnTimeSeconds,
            winner,
          ] = room;

          if (isPrivate) continue;
          if (
            status !== RoomStatus.Created &&
            status !== RoomStatus.Started
          )
            continue;
          if (Number(playerCount) >= maxPlayers) continue;

          list.push({
            id,
            creator,
            entryFee,
            maxPlayers,
            isPrivate,
            status,
            gameType,
            turnTimeSeconds,
            playerCount: Number(playerCount),
            winner,
          });
        } catch {
          continue;
        }
      }

      setRooms(list.reverse());
    } catch {
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return { rooms, isLoading, refetch: fetchRooms };
}
