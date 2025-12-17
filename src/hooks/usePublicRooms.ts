// Stub hook for public rooms - Solana migration
// Replace with Solana program data fetching when available

import { useState, useCallback } from "react";

// Re-export stub address for backwards compatibility
export const ROOMMANAGER_V7_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

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

  const refetch = useCallback(async () => {
    console.warn("Public rooms not available yet - Solana program integration pending");
    // TODO: Fetch rooms from Solana program
    setRooms([]);
  }, []);

  return {
    rooms,
    isLoading: isLoadingRooms,
    refetch,
  };
}
