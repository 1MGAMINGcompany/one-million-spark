import { useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, RoomStatus } from "@/contracts/roomManager";
import { createPublicClient, http, type Address } from "viem";
import { polygon } from "viem/chains";

export interface PublicRoom {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  players: readonly `0x${string}`[];
  winner: `0x${string}`;
}

// Minimal ABI for getRoom
const GET_ROOM_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getRoom",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "address[]", name: "players", type: "address[]" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;

const NEXT_ROOM_ID_ABI = [
  {
    inputs: [],
    name: "nextRoomId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Create a public client for direct viem calls
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
    abi: NEXT_ROOM_ID_ABI,
    functionName: "nextRoomId",
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

        // Fetch rooms in parallel using individual calls
        const results = await Promise.all(
          roomIds.map(async (roomId) => {
            try {
              const result = await (publicClient as any).readContract({
                address: ROOM_MANAGER_ADDRESS,
                abi: GET_ROOM_ABI,
                functionName: "getRoom",
                args: [roomId],
              });
              return { status: "success" as const, result };
            } catch (error) {
              return { status: "error" as const, error };
            }
          })
        );

        const publicRooms: PublicRoom[] = [];

        results.forEach((result) => {
          if (result.status === "success" && result.result) {
            const [id, creator, entryFee, maxPlayers, isPrivate, status, players, winner] = result.result as [
              bigint,
              Address,
              bigint,
              number,
              boolean,
              number,
              readonly Address[],
              Address
            ];

            // Only include public rooms (isPrivate === false)
            // Show rooms with status Created (0) or Started (1)
            if (!isPrivate && (status === RoomStatus.Created || status === RoomStatus.Started)) {
              publicRooms.push({
                id,
                creator,
                entryFee,
                maxPlayers,
                isPrivate,
                status: status as RoomStatus,
                players,
                winner,
              });
            }
          }
        });

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
