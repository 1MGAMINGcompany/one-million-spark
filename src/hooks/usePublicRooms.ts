// src/hooks/usePublicRooms.ts
import { useCallback, useEffect, useState } from "react";
import { createPublicClient, http, fallback } from "viem";
import { polygon } from "viem/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";

export type PublicRoom = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  gameId: number;
  turnTimeSeconds: number;
  winner: `0x${string}`;
  playerCount: number;
};

const publicClient = createPublicClient({
  chain: polygon,
  transport: fallback([
    http("https://polygon-rpc.com"),
    http("https://rpc.ankr.com/polygon"),
    http("https://polygon-bor-rpc.publicnode.com"),
  ]),
});

async function readContractSafe<T>(params: {
  address: `0x${string}`;
  abi: typeof ROOM_MANAGER_ABI;
  functionName: string;
  args?: readonly unknown[];
}): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return publicClient.readContract(params as any) as Promise<T>;
}

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);

    try {
      const nextRoomId = await readContractSafe<bigint>({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "nextRoomId",
      });

      if (!nextRoomId || nextRoomId <= 1n) {
        setRooms([]);
        return;
      }

      const ids: bigint[] = [];
      for (let i = 1n; i < nextRoomId; i++) ids.push(i);

      // Fetch room views + playerCounts in parallel
      const results = await Promise.all(
        ids.map(async (roomId) => {
          try {
            const rv = await readContractSafe<readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, `0x${string}`]>({
              address: ROOM_MANAGER_ADDRESS,
              abi: ROOM_MANAGER_ABI,
              functionName: "getRoomView",
              args: [roomId],
            });

            const pc = await readContractSafe<bigint>({
              address: ROOM_MANAGER_ADDRESS,
              abi: ROOM_MANAGER_ABI,
              functionName: "getPlayerCount",
              args: [roomId],
            });

            return { ok: true as const, rv, playerCount: Number(pc) };
          } catch {
            return { ok: false as const };
          }
        }),
      );

      const publicRooms: PublicRoom[] = [];

      for (const item of results) {
        if (!item.ok) continue;

        const [id, creator, entryFee, maxPlayersRaw, isPrivate, statusRaw, gameIdRaw, turnTimeSecondsRaw, winner] =
          item.rv;

        const status = Number(statusRaw) as RoomStatus;
        const maxPlayers = Number(maxPlayersRaw);
        const gameId = Number(gameIdRaw);
        const turnTimeSeconds = Number(turnTimeSecondsRaw);

        if (isPrivate) continue;
        if (status !== RoomStatus.Created && status !== RoomStatus.Started) continue;

        // hide full rooms
        if (item.playerCount >= maxPlayers) continue;

        publicRooms.push({
          id,
          creator,
          entryFee,
          maxPlayers,
          isPrivate,
          status,
          gameId,
          turnTimeSeconds,
          winner,
          playerCount: item.playerCount,
        });
      }

      publicRooms.sort((a, b) => Number(b.id - a.id));
      setRooms(publicRooms);
    } catch (e) {
      console.error("[usePublicRooms] fetchRooms error:", e);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms, refreshKey]);

  const refetch = useCallback(() => {
    setRefreshKey((p) => p + 1);
  }, []);

  return { rooms, isLoading, refetch };
}
