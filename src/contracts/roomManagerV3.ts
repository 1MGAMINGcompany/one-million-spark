// RoomManagerV3 Contract on Polygon Mainnet (USDT-based)
export const ROOM_MANAGER_V3_ADDRESS = "0x546856C10E473DA5437CE2043E067265D6316a86" as const;

export const ROOM_MANAGER_V3_ABI = [
  {
    type: "constructor",
    stateMutability: "nonpayable",
    inputs: [{ name: "_usdt", type: "address", internalType: "address" }],
  },
  {
    type: "event",
    name: "RoomCreated",
    anonymous: false,
    inputs: [
      { indexed: true, name: "roomId", type: "uint256", internalType: "uint256" },
      { indexed: true, name: "creator", type: "address", internalType: "address" },
      { indexed: false, name: "entryFee", type: "uint256", internalType: "uint256" },
      { indexed: false, name: "maxPlayers", type: "uint8", internalType: "uint8" },
      { indexed: false, name: "isPrivate", type: "bool", internalType: "bool" },
      { indexed: false, name: "platformFeeBps", type: "uint16", internalType: "uint16" },
      { indexed: false, name: "gameId", type: "uint32", internalType: "uint32" },
    ],
  },
  {
    type: "event",
    name: "RoomJoined",
    anonymous: false,
    inputs: [
      { indexed: true, name: "roomId", type: "uint256", internalType: "uint256" },
      { indexed: true, name: "player", type: "address", internalType: "address" },
      { indexed: false, name: "playerCount", type: "uint8", internalType: "uint8" },
    ],
  },
  {
    type: "event",
    name: "RoomCancelled",
    anonymous: false,
    inputs: [
      { indexed: true, name: "roomId", type: "uint256", internalType: "uint256" },
    ],
  },
  {
    type: "function",
    name: "usdt",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address", internalType: "contract IERC20" }],
  },
  {
    type: "function",
    name: "latestRoomId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256", internalType: "uint256" }],
  },
  {
    type: "function",
    name: "createRoom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "entryFee", type: "uint256", internalType: "uint256" },
      { name: "maxPlayers", type: "uint8", internalType: "uint8" },
      { name: "isPrivate", type: "bool", internalType: "bool" },
      { name: "platformFeeBps", type: "uint16", internalType: "uint16" },
      { name: "gameId", type: "uint32", internalType: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "joinRoom",
    stateMutability: "nonpayable",
    inputs: [{ name: "roomId", type: "uint256", internalType: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelRoom",
    stateMutability: "nonpayable",
    inputs: [{ name: "roomId", type: "uint256", internalType: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getRoom",
    stateMutability: "view",
    inputs: [{ name: "roomId", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "address", internalType: "address" },
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "uint8", internalType: "uint8" },
      { name: "", type: "bool", internalType: "bool" },
      { name: "", type: "uint16", internalType: "uint16" },
      { name: "", type: "uint32", internalType: "uint32" },
      { name: "", type: "uint8", internalType: "uint8" },
      { name: "", type: "bool", internalType: "bool" },
    ],
  },
  {
    type: "function",
    name: "rooms",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256", internalType: "uint256" }],
    outputs: [
      { name: "id", type: "uint256", internalType: "uint256" },
      { name: "creator", type: "address", internalType: "address" },
      { name: "entryFee", type: "uint256", internalType: "uint256" },
      { name: "maxPlayers", type: "uint8", internalType: "uint8" },
      { name: "isPrivate", type: "bool", internalType: "bool" },
      { name: "platformFeeBps", type: "uint16", internalType: "uint16" },
      { name: "gameId", type: "uint32", internalType: "uint32" },
      { name: "playerCount", type: "uint8", internalType: "uint8" },
      { name: "isOpen", type: "bool", internalType: "bool" },
    ],
  },
  {
    type: "function",
    name: "hasJoined",
    stateMutability: "view",
    inputs: [
      { name: "", type: "uint256", internalType: "uint256" },
      { name: "", type: "address", internalType: "address" },
    ],
    outputs: [{ name: "", type: "bool", internalType: "bool" }],
  },
] as const;

// Room status helper (V3 uses isOpen boolean instead of status enum)
export interface ContractRoomV3 {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  platformFeeBps: number;
  gameId: number;
  playerCount: number;
  isOpen: boolean;
}

// Format raw contract data into ContractRoomV3 object
export function formatRoomV3(
  data: readonly [bigint, `0x${string}`, bigint, number, boolean, number, number, number, boolean]
): ContractRoomV3 {
  return {
    id: data[0],
    creator: data[1],
    entryFee: data[2],
    maxPlayers: data[3],
    isPrivate: data[4],
    platformFeeBps: data[5],
    gameId: data[6],
    playerCount: data[7],
    isOpen: data[8],
  };
}

// Format entry fee from wei (6 decimals for USDT) to display string
export function formatEntryFeeUsdt(weiAmount: bigint): string {
  const usdt = Number(weiAmount) / 1_000_000;
  return `${usdt.toFixed(2)} USDT`;
}
