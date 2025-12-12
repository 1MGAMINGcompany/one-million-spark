import { useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";

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
};

// Create a public client for direct viem calls - Polygon mainnet
const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Get the next room ID to know how many rooms exist
  const { 
    data: nextRoomId, 
    isLoading: isLoadingNextId,
    refetch: refetchNextId,
  } = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
    chainId: 137, // Polygon mainnet
  });

  // Fetch all rooms when nextRoomId changes
  useEffect(() => {
    const fetchRooms = async () => {
      if (!nextRoomId || nextRoomId <= 1n) {
        setRooms([]);
        return;
      }

      setIsLoadingRooms(true);

      try {
        // Build room IDs array
        const roomIds: bigint[] = [];
        for (let i = 1n; i < nextRoomId; i++) {
          roomIds.push(i);
        }

        // Fetch rooms in parallel using getRoomView
        const results = await Promise.all(
          roomIds.map(async (roomId) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result = await (publicClient as any).readContract({
                address: ROOM_MANAGER_ADDRESS,
                abi: ROOM_MANAGER_ABI,
                functionName: "getRoomView",
                args: [roomId],
              });
              return { status: "success" as const, roomId, result };
            } catch (error) {
              console.error(`Error fetching room ${roomId}:`, error);
              return { status: "error" as const, roomId, error };
            }
          })
        );

        // Parse results and filter to only public rooms with Created or Started status
        const publicRooms: PublicRoom[] = [];
        
        for (const r of results) {
          if (r.status !== "success" || !r.result) continue;
          
          // getRoomView returns: [id, creator, entryFee, maxPlayers, isPrivate, status, gameId, turnTimeSeconds, winner]
          const [id, creator, entryFee, maxPlayers, isPrivate, status, gameId, turnTimeSeconds, winner] = r.result;
          
          // Only include public rooms that are Created or Started
          if (isPrivate) continue;
          if (status !== RoomStatus.Created && status !== RoomStatus.Started) continue;
          
          publicRooms.push({
            id,
            creator: creator as `0x${string}`,
            entryFee,
            maxPlayers,
            isPrivate,
            status: status as RoomStatus,
            gameId,
            turnTimeSeconds,
            winner: winner as `0x${string}`,
          });
        }

        // Sort by newest first
        publicRooms.sort((a, b) => Number(b.id - a.id));
        setRooms(publicRooms);
      } catch (error) {
        console.error("Error fetching rooms:", error);
      } finally {
        setIsLoadingRooms(false);
      }
    };

    fetchRooms();
  }, [nextRoomId, refreshKey]);

  const refetch = useCallback(async () => {
    await refetchNextId();
    setRefreshKey((prev) => prev + 1);
  }, [refetchNextId]);

  return {
    rooms,
    isLoading: isLoadingNextId || isLoadingRooms,
    refetch,
    nextRoomId,
  };
}
