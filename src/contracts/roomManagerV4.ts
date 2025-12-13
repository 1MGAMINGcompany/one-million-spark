// RoomManagerV4 Contract on Polygon Mainnet (USDT + TurnTime)
export const ROOM_MANAGER_V4_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

export const ROOM_MANAGER_V4_ABI = [
  {
    inputs: [{ internalType: "address", name: "_usdt", type: "address" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [{ indexed: true, internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "RoomCancelled",
    type: "event",
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
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "cancelRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
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
    name: "getRoom",
    outputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "uint8", name: "", type: "uint8" },
      { internalType: "bool", name: "", type: "bool" },
      { internalType: "uint16", name: "", type: "uint16" },
      { internalType: "uint32", name: "", type: "uint32" },
      { internalType: "uint16", name: "", type: "uint16" },
      { internalType: "uint8", name: "", type: "uint8" },
      { internalType: "bool", name: "", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "", type: "uint256" },
      { internalType: "address", name: "", type: "address" },
    ],
    name: "hasJoined",
    outputs: [{ internalType: "bool", name: "", type: "bool" }],
    stateMutability: "view",
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
    inputs: [],
    name: "latestRoomId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "rooms",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint16", name: "platformFeeBps", type: "uint16" },
      { internalType: "uint32", name: "gameId", type: "uint32" },
      { internalType: "uint16", name: "turnTimeSec", type: "uint16" },
      { internalType: "uint8", name: "playerCount", type: "uint8" },
      { internalType: "bool", name: "isOpen", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "usdt",
    outputs: [{ internalType: "contract IERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Room interface for V4
export interface ContractRoomV4 {
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
}

// Format raw contract data into ContractRoomV4 object
export function formatRoomV4(
  data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, number, boolean]
): ContractRoomV4 {
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
