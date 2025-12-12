import { useMemo, useCallback, useState, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";

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
  });

  // Fetch all rooms using batch RPC
  const fetchRooms = useCallback(async () => {
    if (!nextRoomId || nextRoomId <= 1n) {
      setRooms([]);
      return;
    }

    setIsLoadingRooms(true);

    try {
      // Build JSON-RPC batch calls for getRoom
      const calls = [];
      for (let i = 1n; i < nextRoomId; i++) {
        // Function selector for getRoom(uint256) is 0xd5b8bc48
        const data = "0xd5b8bc48" + i.toString(16).padStart(64, "0");
        calls.push({
          jsonrpc: "2.0",
          id: Number(i),
          method: "eth_call",
          params: [{ to: ROOM_MANAGER_ADDRESS, data }, "latest"],
        });
      }

      const response = await fetch("https://polygon-rpc.com", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(calls),
      });

      const results = await response.json();
      const publicRooms: PublicRoom[] = [];

      for (const result of results) {
        if (result.result && result.result !== "0x" && result.result.length > 2) {
          try {
            const hex = result.result.slice(2);
            
            // ABI decode the Room struct
            // (uint256 id, address creator, uint256 entryFee, uint8 maxPlayers, bool isPrivate, uint8 status, address[] players, address winner)
            const id = BigInt("0x" + hex.slice(0, 64));
            const creator = ("0x" + hex.slice(24, 64).toLowerCase()) as `0x${string}`;
            const entryFee = BigInt("0x" + hex.slice(64, 128));
            const maxPlayers = parseInt(hex.slice(184, 192), 16);
            const isPrivate = parseInt(hex.slice(248, 256), 16) === 1;
            const status = parseInt(hex.slice(312, 320), 16) as RoomStatus;
            
            // Parse players array - offset is at position 6 (320-384)
            const playersOffset = parseInt(hex.slice(320, 384), 16) * 2;
            const playersLength = parseInt(hex.slice(playersOffset, playersOffset + 64), 16);
            const players: `0x${string}`[] = [];
            
            for (let j = 0; j < playersLength; j++) {
              const playerStart = playersOffset + 64 + j * 64;
              const playerAddr = ("0x" + hex.slice(playerStart + 24, playerStart + 64).toLowerCase()) as `0x${string}`;
              players.push(playerAddr);
            }
            
            // Winner address - it's after the players array offset pointer
            const winner = ("0x" + hex.slice(408, 448).toLowerCase()) as `0x${string}`;

            // Only include public rooms in Created status
            if (!isPrivate && status === RoomStatus.Created) {
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
          } catch (parseError) {
            console.error(`Error parsing room ${result.id}:`, parseError);
          }
        }
      }

      setRooms(publicRooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [nextRoomId]);

  // Fetch rooms when nextRoomId changes or refreshKey changes
  useEffect(() => {
    if (nextRoomId !== undefined) {
      fetchRooms();
    }
  }, [nextRoomId, fetchRooms, refreshKey]);

  const refetch = useCallback(async () => {
    await refetchNextId();
    setRefreshKey(prev => prev + 1);
  }, [refetchNextId]);

  return {
    rooms,
    isLoading: isLoadingNextId || isLoadingRooms,
    refetch,
    nextRoomId,
  };
}
