// Stub hook for player active room - Solana migration

import { useState } from "react";

// Re-export stub address for backwards compatibility
export const ROOMMANAGER_V7_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export interface ActiveRoom {
  id: bigint;
  status: number;
  isOpen: boolean;
}

export function usePlayerActiveRoom(address: `0x${string}` | string | undefined) {
  const [activeRoom, setActiveRoom] = useState<ActiveRoom | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // TODO: Fetch from Solana program
  const hasActiveRoom = false;

  return {
    activeRoom,
    hasActiveRoom,
    isLoading,
  };
}
