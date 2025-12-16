import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS =
  "0x4f3998195462100D867129747967BFCb56C07fe2" as const;

export interface PublicRoomV7 {
  id: number;
  creator: string;
  entryFee: bigint;
  maxPlayers: number;
  playerCount: number;
  gameId: number;
  turnTimeSec: number;
  isPrivate: boolean;
  isOpen: boolean;
}

export function usePublicRoomsV7() {
  const [rooms, setRooms] = useState<PublicRoomV7[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [latestRoomId, setLatestRoomId] = useState<number>(0);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
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
      const latestIdNum = Number(latestId);
      setLatestRoomId(latestIdNum);

      if (latestIdNum === 0) {
        setRooms([]);
        return;
      }

      // Fetch rooms in descending order (most recent first)
      const fetchedRooms: PublicRoomV7[] = [];
      const maxRoomsToFetch = Math.min(latestIdNum, 50); // Limit to 50 most recent

      for (let i = latestIdNum; i > latestIdNum - maxRoomsToFetch && i >= 1; i--) {
        try {
          const r = await contract.rooms(i);
          // Only include public, open rooms with available slots
          if (!r.isPrivate && r.isOpen && Number(r.playerCount) < Number(r.maxPlayers)) {
            fetchedRooms.push({
              id: i,
              creator: r.creator,
              entryFee: r.entryFee,
              maxPlayers: Number(r.maxPlayers),
              playerCount: Number(r.playerCount),
              gameId: Number(r.gameId),
              turnTimeSec: Number(r.turnTimeSec),
              isPrivate: r.isPrivate,
              isOpen: r.isOpen,
            });
          }
        } catch (e) {
          console.warn(`Failed to fetch room ${i}:`, e);
        }
      }

      setRooms(fetchedRooms);
    } catch (e) {
      console.error("Failed to fetch rooms:", e);
      setRooms([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  return {
    rooms,
    isLoading,
    refetch: fetchRooms,
    latestRoomId,
  };
}
