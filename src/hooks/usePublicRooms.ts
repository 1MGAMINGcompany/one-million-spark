import { useCallback, useState, useEffect } from "react";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI } from "@/contracts/roomManager";

export type PublicRoom = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: number; // <-- keep as number for safety
  players: readonly `0x${string}`[];
  winner: `0x${string}`;
};

const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchRooms = useCallback(async () => {
    setIsLoadingRooms(true);

    try {
      // 1) Read nextRoomId directly (no wagmi here = fewer moving parts)
      const nextRoomId = (await publicClient.readContract({
        address: ROOM_MANAGER_ADDRESS,
        abi: ROOM_MANAGER_ABI,
        functionName: "nextRoomId",
      })) as bigint;

      // If nothing exists yet
      if (!nextRoomId || nextRoomId <= 1n) {
        setRooms([]);
        return;
      }

      // 2) Build ids 1..nextRoomId-1
      const ids: bigint[] = [];
      for (let i = 1n; i < nextRoomId; i++) ids.push(i);

      // 3) Fetch all rooms
      const results = await Promise.all(
        ids.map(async (roomId) => {
          try {
            const r = (await publicClient.readContract({
              address: ROOM_MANAGER_ADDRESS,
              abi: ROOM_MANAGER_ABI,
              functionName: "getRoom",
              args: [roomId],
            })) as readonly [bigint, `0x${string}`, bigint, any, boolean, any, readonly `0x${string}`[], `0x${string}`];

            return { ok: true as const, r };
          } catch (e) {
            console.error("getRoom failed", roomId.toString(), e);
            return { ok: false as const };
          }
        }),
      );

      const publicRooms: PublicRoom[] = [];

      for (const item of results) {
        if (!item.ok) continue;

        const [id, creator, entryFee, maxPlayersRaw, isPrivate, statusRaw, players, winner] = item.r;

        const status = Number(statusRaw); // <-- key fix
        const maxPlayers = Number(maxPlayersRaw); // <-- key fix

        // Keep ONLY public & joinable rooms
        if (isPrivate) continue;

        // Created(1) or Started(2)
        if (status !== 1 && status !== 2) continue;

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
      setIsLoadingRooms(false);
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
    isLoading: isLoadingRooms,
    refetch,
  };
}
