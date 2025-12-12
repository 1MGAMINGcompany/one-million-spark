import { useMemo, useState, useCallback, useEffect } from "react";
import { useReadContract } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI, RoomStatus } from "@/contracts/roomManager";

export interface PublicRoom {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  players: `0x${string}`[];
  winner: `0x${string}`;
}

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  // Get the next room ID to know how many rooms exist
  const { 
    data: nextRoomId, 
    refetch: refetchNextId,
    isLoading: isLoadingNextId 
  } = useReadContract({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    functionName: "nextRoomId",
  });

  // Fetch all rooms using multicall via RPC
  const fetchRooms = useCallback(async () => {
    if (!nextRoomId || nextRoomId <= 1n) {
      setRooms([]);
      return;
    }

    setIsLoadingRooms(true);

    try {
      // Build multicall requests
      const calls = [];
      for (let i = 1n; i < nextRoomId; i++) {
        calls.push({
          jsonrpc: '2.0',
          id: Number(i),
          method: 'eth_call',
          params: [{
            to: ROOM_MANAGER_ADDRESS,
            data: `0xd5b8bc48${i.toString(16).padStart(64, '0')}` // getRoom(uint256) selector
          }, 'latest']
        });
      }

      // Batch RPC call
      const response = await fetch('https://polygon-rpc.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(calls),
      });

      const results = await response.json();
      const fetchedRooms: PublicRoom[] = [];

      for (const result of results) {
        if (result.result && result.result !== '0x' && result.result.length > 2) {
          try {
            const data = result.result.slice(2);
            
            // Parse ABI-encoded tuple
            const id = BigInt('0x' + data.slice(0, 64));
            const creator = ('0x' + data.slice(24, 64)) as `0x${string}`;
            const entryFee = BigInt('0x' + data.slice(64, 128));
            const maxPlayers = parseInt(data.slice(184, 192), 16);
            const isPrivate = parseInt(data.slice(248, 256), 16) === 1;
            const status = parseInt(data.slice(312, 320), 16) as RoomStatus;
            
            // Parse players array offset and length
            const playersOffset = parseInt(data.slice(320, 384), 16) * 2;
            const playersLength = parseInt(data.slice(playersOffset, playersOffset + 64), 16);
            const players: `0x${string}`[] = [];
            
            for (let j = 0; j < playersLength; j++) {
              const playerStart = playersOffset + 64 + (j * 64);
              const playerAddr = ('0x' + data.slice(playerStart + 24, playerStart + 64)) as `0x${string}`;
              players.push(playerAddr);
            }
            
            // Winner is after players array in the encoding
            const winner = ('0x' + data.slice(408, 448)) as `0x${string}`;

            // Only include public rooms in Created status
            if (!isPrivate && status === RoomStatus.Created) {
              fetchedRooms.push({
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

      setRooms(fetchedRooms);
    } catch (error) {
      console.error("Error fetching rooms:", error);
    } finally {
      setIsLoadingRooms(false);
    }
  }, [nextRoomId]);

  // Auto-fetch when nextRoomId changes
  useEffect(() => {
    if (nextRoomId !== undefined) {
      fetchRooms();
    }
  }, [nextRoomId, fetchRooms]);

  const refetch = useCallback(async () => {
    await refetchNextId();
    await fetchRooms();
  }, [refetchNextId, fetchRooms]);

  return {
    rooms,
    isLoading: isLoadingNextId || isLoadingRooms,
    refetch,
    nextRoomId,
  };
}
