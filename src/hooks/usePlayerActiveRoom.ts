import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, Contract } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS =
  "0x4f3998195462100D867129747967BFCb56C07fe2" as const;

export interface ActiveRoom {
  id: bigint;
  status: number; // 0=None, 1=Created, 2=Started, 3=Finished, 4=Cancelled
  isOpen: boolean;
}

/**
 * Checks if a player has an active room they created (Created or Started status).
 * Returns the room info if found, or null if no active room.
 */
export function usePlayerActiveRoom(address: `0x${string}` | undefined) {
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchActiveRoom = useCallback(async () => {
    if (!address) {
      setActiveRoom(null);
      return;
    }

    setIsLoading(true);
    try {
      const eth = (window as any).ethereum;
      if (!eth) {
        setActiveRoom(null);
        return;
      }

      const provider = new BrowserProvider(eth);
      const contract = new Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, provider);

      // Fetch latest room ID
      const latestId = await contract.latestRoomId();
      const latestIdNum = Number(latestId);

      if (latestIdNum === 0) {
        setActiveRoom(null);
        return;
      }

      // Search for an active room created by this address (most recent first)
      const maxRoomsToCheck = Math.min(latestIdNum, 100);

      for (let i = latestIdNum; i > latestIdNum - maxRoomsToCheck && i >= 1; i--) {
        try {
          const r = await contract.rooms(i);
          const creator = r.creator as string;
          const status = Number(r.status);
          const isOpen = r.isOpen;
          const isFinished = r.isFinished;

          // Check if this user created this room and it's still active (Created=1 or Started=2)
          if (
            creator.toLowerCase() === address.toLowerCase() &&
            !isFinished &&
            isOpen &&
            (status === 1 || status === 2)
          ) {
            setActiveRoom({
              id: BigInt(i),
              status,
              isOpen,
            });
            return;
          }
        } catch (e) {
          console.warn(`Failed to fetch room ${i}:`, e);
        }
      }

      // No active room found
      setActiveRoom(null);
    } catch (e) {
      console.error("Failed to check active room:", e);
      setActiveRoom(null);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchActiveRoom();
  }, [fetchActiveRoom]);

  return {
    activeRoom,
    hasActiveRoom: activeRoom !== null,
    isLoading,
    refetch: fetchActiveRoom,
  };
}
