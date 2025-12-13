// RoomManagerV5 Contract on Polygon Mainnet (USDT + Payouts)
export const ROOM_MANAGER_V5_ADDRESS = "0xf083B15c86F68C5dFe49b6dF93FE543051f46ba8" as const;

export const ROOM_MANAGER_V5_ABI = [
  {
    inputs: [
      { internalType: "address", name: "_usdt", type: "address" },
      { internalType: "address", name: "_feeRecipient", type: "address" },
    ],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: true, internalType: "address", name: "creator", type: "address" },
      { indexed: false, internalType: "uint256", name: "entryFee", type: "uint256" },
      { indexed: false, internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { indexed: false, internalType: "bool", name: "isPrivate", type: "bool" },
      { indexed: false, internalType: "uint16", name: "platformFeeBps", type: "uint16" },
      { indexed: false, internalType: "uint32", name: "gameId", type: "uint32" },
      { indexed: false, internalType: "uint16", name: "turnTimeSec", type: "uint16" },
    ],
    name: "RoomCreated",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: true, internalType: "address", name: "player", type: "address" },
      { indexed: false, internalType: "uint8", name: "playerCount", type: "uint8" },
    ],
    name: "RoomJoined",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "roomId", type: "uint256" },
      { indexed: true, internalType: "address", name: "winner", type: "address" },
      { indexed: false, internalType: "uint256", name: "totalPot", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "feeAmount", type: "uint256" },
      { indexed: false, internalType: "uint256", name: "winnerAmount", type: "uint256" },
    ],
    name: "GameFinished",
    type: "event",
  },
  {
    inputs: [
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint16", name: "platformFeeBps", type: "uint16" },
      { internalType: "uint32", name: "gameId", type: "uint32" },
      { internalType: "uint16", name: "turnTimeSec", type: "uint16" },
    ],
    name: "createRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "joinRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    name: "finishGame",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getRoom",
    outputs: [
      { internalType: "uint256", type: "uint256" },
      { internalType: "address", type: "address" },
      { internalType: "uint256", type: "uint256" },
      { internalType: "uint8", type: "uint8" },
      { internalType: "bool", type: "bool" },
      { internalType: "uint16", type: "uint16" },
      { internalType: "uint32", type: "uint32" },
      { internalType: "uint16", type: "uint16" },
      { internalType: "uint8", type: "uint8" },
      { internalType: "bool", type: "bool" },
      { internalType: "bool", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getPlayers",
    outputs: [{ internalType: "address[]", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "latestRoomId",
    outputs: [{ internalType: "uint256", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Room interface for V5 (includes isFinished field)
export interface ContractRoomV5 {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  platformFeeBps: number;
  gameId: number;
  turnTimeSec: number;
  playerCount: number;
  isOpen: boolean;
  isFinished: boolean;
}

// Format raw contract data into ContractRoomV5 object
export function formatRoomV5(
  data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, number, boolean, boolean]
): ContractRoomV5 {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    platformFeeBps: data[5],
    gameId: data[6],
    turnTimeSec: data[7],
    playerCount: data[8],
    isOpen: data[9],
    isFinished: data[10],
  };
}

// Format entry fee from wei (6 decimals for USDT) to display string
export function formatEntryFeeUsdt(weiAmount: bigint): string {
  const usdt = Number(weiAmount) / 1_000_000;
  return `${usdt.toFixed(2)} USDT`;
}

// Format turn time for display
export function formatTurnTime(turnTimeSec: number): string {
  if (turnTimeSec === 0) return "Unlimited";
  return `${turnTimeSec} sec`;
}

// Game ID to name mapping
export const GAME_NAMES: Record<number, string> = {
  1: "Chess",
  2: "Dominos",
  3: "Backgammon",
  4: "Checkers",
  5: "Ludo",
};

// Get game name from ID
export function getGameName(gameId: number): string {
  return GAME_NAMES[gameId] || `Game ${gameId}`;
}

// Game options for dropdown
export const GAME_OPTIONS = [
  { value: 1, label: "Chess" },
  { value: 2, label: "Dominos" },
  { value: 3, label: "Backgammon" },
  { value: 4, label: "Checkers" },
  { value: 5, label: "Ludo" },
];
