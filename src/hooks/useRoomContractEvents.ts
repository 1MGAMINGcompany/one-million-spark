// Stub hook for room contract events - Solana migration
// Solana uses different event subscription mechanism

// Re-export stub address for backwards compatibility
export const ROOMMANAGER_V7_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

interface UseRoomContractEventsOptions {
  onRoomCreated?: (roomId: bigint, creator: string, isPrivate: boolean) => void;
  onRoomJoined?: (roomId: bigint, player?: string, playerCount?: number) => void;
  onRoomCancelled?: (roomId: bigint) => void;
  onGameStarted?: (roomId: bigint) => void;
}

export function useRoomContractEvents(options: UseRoomContractEventsOptions) {
  // TODO: Implement Solana event subscription
  // Solana uses WebSocket subscription to program account changes
  // For now, this is a no-op
}
