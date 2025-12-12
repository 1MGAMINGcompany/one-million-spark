import { useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";
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

// Create a public client for direct viem calls - Polygon mainnet
const publicClient = createPublicClient({
  chain: polygon,
  transport: http("https://polygon-rpc.com"),
});

// Minimal ABI for rooms mapping (returns fewer fields than getRoom)
const ROOMS_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "rooms",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint8", name: "status", type: "uint8" },
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

// ABI for getRoomPlayers
const GET_ROOM_PLAYERS_ABI = [
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getRoomPlayers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

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

        // Fetch rooms in parallel using the rooms mapping
        const results = await Promise.all(
          roomIds.map(async (roomId) => {
            try {
              const result = await (publicClient as any).readContract({
                address: ROOM_MANAGER_ADDRESS,
                abi: ROOMS_ABI,
                functionName: "rooms",
                args: [roomId],
              });
              return { status: "success" as const, roomId, result };
            } catch (error) {
              console.error(`Error fetching room ${roomId}:`, error);
              return { status: "error" as const, roomId, error };
            }
          })
        );

        // Filter to only public rooms with Created or Started status
        const publicRoomData = results.filter((r) => {
          if (r.status !== "success" || !r.result) return false;
          const [id, creator, entryFee, maxPlayers, isPrivate, status, winner] = r.result;
          // isPrivate must be false, status must be Created(1) or Started(2)
          return !isPrivate && (status === RoomStatus.Created || status === RoomStatus.Started);
        });

        // Fetch players for each public room
        const roomsWithPlayers = await Promise.all(
          publicRoomData.map(async (r) => {
            if (r.status !== "success" || !r.result) return null;
            const [id, creator, entryFee, maxPlayers, isPrivate, status, winner] = r.result;
            
            try {
              const players = await (publicClient as any).readContract({
                address: ROOM_MANAGER_ADDRESS,
                abi: GET_ROOM_PLAYERS_ABI,
                functionName: "getRoomPlayers",
                args: [r.roomId],
              });
              
              return {
                id,
                creator: creator as `0x${string}`,
                entryFee,
                maxPlayers,
                isPrivate,
                status: status as RoomStatus,
                players: players as readonly `0x${string}`[],
                winner: winner as `0x${string}`,
              };
            } catch (error) {
              console.error(`Error fetching players for room ${r.roomId}:`, error);
              // Return room without players array
              return {
                id,
                creator: creator as `0x${string}`,
                entryFee,
                maxPlayers,
                isPrivate,
                status: status as RoomStatus,
                players: [] as readonly `0x${string}`[],
                winner: winner as `0x${string}`,
              };
            }
          })
        );

        const publicRooms = roomsWithPlayers.filter((r): r is PublicRoom => r !== null);
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
