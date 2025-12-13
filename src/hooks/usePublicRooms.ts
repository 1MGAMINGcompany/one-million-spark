import { useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_V5_ADDRESS, ROOM_MANAGER_V5_ABI, type ContractRoomV5 } from "@/contracts/roomManagerV5";
import { createPublicClient, http } from "viem";
import { polygon } from "viem/chains";

export type PublicRoom = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  gameId: number;
  turnTimeSec: number;
  playerCount: number;
  isOpen: boolean;
  isFinished: boolean;
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

  // Get the latest room ID to know how many rooms exist
  const { 
    data: latestRoomId, 
    isLoading: isLoadingLatestId,
    refetch: refetchLatestId,
  } = useReadContract({
    address: ROOM_MANAGER_V5_ADDRESS,
    abi: ROOM_MANAGER_V5_ABI,
    functionName: "latestRoomId",
    chainId: 137, // Polygon mainnet
  });

  // Fetch all rooms when latestRoomId changes
  useEffect(() => {
    const fetchRooms = async () => {
      if (!latestRoomId || latestRoomId < 1n) {
        setRooms([]);
        return;
      }

      setIsLoadingRooms(true);

      try {
        // Build room IDs array (1-indexed, inclusive of latestRoomId)
        const roomIds: bigint[] = [];
        for (let i = 1n; i <= latestRoomId; i++) {
          roomIds.push(i);
        }

        // Fetch rooms in parallel using getRoom
        const results = await Promise.all(
          roomIds.map(async (roomId) => {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const roomResult = await (publicClient as any).readContract({
                address: ROOM_MANAGER_V5_ADDRESS,
                abi: ROOM_MANAGER_V5_ABI,
                functionName: "getRoom",
                args: [roomId],
              });
              return { status: "success" as const, roomId, result: roomResult };
            } catch (error) {
              console.error(`Error fetching room ${roomId}:`, error);
              return { status: "error" as const, roomId, error };
            }
          })
        );

        // Parse results and filter to only public, open rooms with available slots
        const publicRooms: PublicRoom[] = [];
        
        for (const r of results) {
          if (r.status !== "success" || !r.result) continue;
          
          // getRoom returns: [id, creator, entryFee, maxPlayers, isPrivate, platformFeeBps, gameId, turnTimeSec, playerCount, isOpen, isFinished]
          const [id, creator, entryFee, maxPlayers, isPrivate, , gameId, turnTimeSec, playerCount, isOpen, isFinished] = r.result;
          
          // Only include public rooms that are open, not finished, and have available slots
          if (isPrivate) continue;
          if (!isOpen) continue;
          if (isFinished) continue;
          if (Number(playerCount) >= Number(maxPlayers)) continue;
          
          publicRooms.push({
            id,
            creator: creator as `0x${string}`,
            entryFee,
            maxPlayers: Number(maxPlayers),
            isPrivate,
            gameId: Number(gameId),
            turnTimeSec: Number(turnTimeSec),
            playerCount: Number(playerCount),
            isOpen,
            isFinished,
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
  }, [latestRoomId, refreshKey]);

  const refetch = useCallback(async () => {
    await refetchLatestId();
    setRefreshKey((prev) => prev + 1);
  }, [refetchLatestId]);

  return {
    rooms,
    isLoading: isLoadingLatestId || isLoadingRooms,
    refetch,
    latestRoomId,
  };
}
