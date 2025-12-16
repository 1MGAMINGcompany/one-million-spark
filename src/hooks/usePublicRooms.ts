import { useCallback, useState, useEffect } from "react";
import { BrowserProvider, Contract } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";
import { ROOMMANAGER_V7_ADDRESS } from "@/lib/contractAddresses";

// Re-export for backwards compatibility
export { ROOMMANAGER_V7_ADDRESS };

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

export function usePublicRooms() {
  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);
  const [latestRoomId, setLatestRoomId] = useState<bigint>(0n);

  const fetchRooms = useCallback(async () => {
    setIsLoadingRooms(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setRooms([]);
        return;
      }

      const provider = new BrowserProvider(eth);
      const contract = new Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, provider);

      // Fetch latest room ID
      const latestId = await contract.latestRoomId();
      const latestIdBigInt = BigInt(latestId);
      setLatestRoomId(latestIdBigInt);

      if (latestIdBigInt === 0n) {
        setRooms([]);
        return;
      }

      // Fetch rooms in descending order (most recent first)
      const publicRooms: PublicRoom[] = [];
      const maxRoomsToFetch = latestIdBigInt > 50n ? 50n : latestIdBigInt;

      for (let i = latestIdBigInt; i > latestIdBigInt - maxRoomsToFetch && i >= 1n; i--) {
        try {
          const r = await contract.rooms(i);
          // Only include public, open rooms with available slots AND status=Created (1)
          // Rooms with status=Started (2) should NOT appear in Room List
          const isPrivate = r.isPrivate;
          const isOpen = r.isOpen;
          const isFinished = r.isFinished;
          const status = Number(r.status);
          const playerCount = Number(r.playerCount);
          const maxPlayers = Number(r.maxPlayers);

          // status === 1 means "Created" - game not started yet
          // status === 2 means "Started" - game in play, should be hidden
          if (!isPrivate && isOpen && !isFinished && status === 1 && playerCount < maxPlayers) {
            publicRooms.push({
              id: i,
              creator: r.creator as `0x${string}`,
              entryFee: BigInt(r.entryFee),
              maxPlayers,
              isPrivate,
              gameId: Number(r.gameId),
              turnTimeSec: Number(r.turnTimeSec),
              playerCount,
              isOpen,
              isFinished,
            });
          }
        } catch (e) {
          console.warn(`Failed to fetch room ${i}:`, e);
        }
      }

      setRooms(publicRooms);
    } catch (e) {
      console.error("Failed to fetch rooms:", e);
      setRooms([]);
    } finally {
      setIsLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return {
    rooms,
    isLoading: isLoadingRooms,
    refetch: fetchRooms,
    latestRoomId,
  };
}
