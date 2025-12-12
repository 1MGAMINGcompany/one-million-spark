import { useCallback, useState, useEffect } from "react";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";

export type PublicRoom = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  players: readonly `0x${string}`[];
  winner: `0x${string}`;
};

const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nextRoomId = await (publicClient as any).readContract({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "nextRoomId",
      }) as bigint;

      if (!nextRoomId || nextRoomId <= 1n) {
        setRooms([]);
        return;
      }

      const ids: bigint[] = [];
      for (let i = 1n; i < nextRoomId; i++) ids.push(i);

      const results = await Promise.all(
        ids.map(async (roomId) => {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = await (publicClient as any).readContract({
              address: ROOM_MANAGER_ADDRESS,
              abi: ROOM_MANAGER_ABI,
              functionName: "getRoom",
              args: [roomId],
            }) as readonly [bigint, `0x${string}`, bigint, number, boolean, number, readonly `0x${string}`[], `0x${string}`];
            return { ok: true as const, r };
          } catch {
            return { ok: false as const };
          }
        })
      );

      const publicRooms: PublicRoom[] = [];

      for (const item of results) {
        if (!item.ok) continue;

        const [id, creator, entryFee, maxPlayersRaw, isPrivate, statusRaw, players, winner] = item.r;

        const status = Number(statusRaw) as RoomStatus;
        const maxPlayers = Number(maxPlayersRaw);

        if (isPrivate) continue;
        if (status !== RoomStatus.Created && status !== RoomStatus.Started) continue;

        publicRooms.push({
          id,
          creator,
          entryFee,
          maxPlayers,
          isPrivate,
          status,
          players,
          winner,
        });
      }

      publicRooms.sort((a, b) => Number(b.id - a.id));
      setRooms(publicRooms);
    } catch (e) {
      console.error("fetchRooms error:", e);
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

  return {
    rooms,
    isLoading,
    refetch,
  };
}
