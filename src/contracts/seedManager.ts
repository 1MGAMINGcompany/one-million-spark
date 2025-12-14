// Seed Manager Contract ABI for Commit-Reveal Fair Randomness
// Note: This assumes contract methods exist on RoomManagerV5 or a separate SeedManager contract
// Adjust address if separate contract is deployed

export const SEED_MANAGER_ADDRESS = "0xf083B15c86F68C5dFe49b6dF93FE543051f46ba8" as const; // Same as RoomManagerV5 for now

// Games that require seed: Dominos (2), Backgammon (3), Ludo (5)
export const GAMES_REQUIRING_SEED = [2, 3, 5] as const;

export function gameRequiresSeed(gameId: number): boolean {
  return GAMES_REQUIRING_SEED.includes(gameId as 2 | 3 | 5);
}

// ABI for seed-related functions (to be added to RoomManagerV5)
export const SEED_MANAGER_ABI = [
  // Commit seed hash
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "bytes32", name: "commitment", type: "bytes32" },
    ],
    name: "commitSeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Reveal seed
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "bytes32", name: "secret", type: "bytes32" },
    ],
    name: "revealSeed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Refund if seed not revealed within timeout
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "refundIfSeedNotRevealed",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  // Get seed state for a room
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getSeedState",
    outputs: [
      { internalType: "uint8", name: "phase", type: "uint8" }, // 0=None, 1=Committing, 2=Revealing, 3=Finalized, 4=Refunded
      { internalType: "bytes32", name: "finalSeedHash", type: "bytes32" },
      { internalType: "uint256", name: "commitDeadline", type: "uint256" },
      { internalType: "uint256", name: "revealDeadline", type: "uint256" },
      { internalType: "address[]", name: "committedPlayers", type: "address[]" },
      { internalType: "address[]", name: "revealedPlayers", type: "address[]" },
    ],
    stateMutability: "view",
    type: "function",
  },
  // Check if player has committed
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "address", name: "player", type: "address" },
    ],
    name: "hasCommitted",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Check if player has revealed
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "address", name: "player", type: "address" },
    ],
    name: "hasRevealed",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
    type: "function",
  },
  // Events
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: true, internalType: "address", name: "player", type: "address" },
    ],
    name: "SeedCommitted",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: true, internalType: "address", name: "player", type: "address" },
    ],
    name: "SeedRevealed",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: false, internalType: "bytes32", name: "finalSeedHash", type: "bytes32" },
    ],
    name: "SeedFinalized",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
    ],
    name: "SeedRefunded",
    type: "event",
  },
] as const;

// Seed phase enum
export enum SeedPhase {
  None = 0,
  Committing = 1,
  Revealing = 2,
  Finalized = 3,
  Refunded = 4,
}

// Type for seed state
export interface SeedState {
  phase: SeedPhase;
  finalSeedHash: `0x${string}`;
  commitDeadline: bigint;
  revealDeadline: bigint;
  committedPlayers: `0x${string}`[];
  revealedPlayers: `0x${string}`[];
}

// Timeout constants (in seconds)
export const COMMIT_WINDOW_SEC = 120;
export const REVEAL_WINDOW_SEC = 120;
