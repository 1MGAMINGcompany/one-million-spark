// src/contracts/roomManager.ts
export const ROOM_MANAGER_ADDRESS =
  (import.meta.env.VITE_ROOM_MANAGER_ADDRESS ||
    "0xd3ACD6e228280BDdb470653eBd658648FBB84789") as `0x${string}`;

// RoomManagerV2 ABI (minimal: write + read + events)
export const ROOM_MANAGER_ABI = [
  // createRoom(uint256,uint8,bool,uint16,uint32) payable
  {
    type: "function",
    name: "createRoom",
    stateMutability: "payable",
    inputs: [
      { name: "entryFeeWei", type: "uint256" },
      { name: "maxPlayers", type: "uint8" },
      { name: "isPrivate", type: "bool" },
      { name: "platformFeeBps", type: "uint16" },
      { name: "gameId", type: "uint32" },
    ],
    outputs: [{ name: "roomId", type: "uint256" }],
  },

  // joinRoom(uint256) payable
  {
    type: "function",
    name: "joinRoom",
    stateMutability: "payable",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [],
  },

  // cancelRoom(uint256)
  {
    type: "function",
    name: "cancelRoom",
    stateMutability: "nonpayable",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [],
  },

  // getRoom(uint256) view returns (...)
  {
    type: "function",
    name: "getRoom",
    stateMutability: "view",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "entryFeeWei", type: "uint256" },
      { name: "maxPlayers", type: "uint8" },
      { name: "isPrivate", type: "bool" },
      { name: "platformFeeBps", type: "uint16" },
      { name: "gameId", type: "uint32" },
      { name: "playerCount", type: "uint8" },
      { name: "isOpen", type: "bool" },
    ],
  },

  // getLatestRoomId() view returns (uint256)
  {
    type: "function",
    name: "getLatestRoomId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "roomId", type: "uint256" }],
  },

  // getOpenRoomIds(uint256,uint256) view returns (uint256[])
  {
    type: "function",
    name: "getOpenRoomIds",
    stateMutability: "view",
    inputs: [
      { name: "cursor", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "roomIds", type: "uint256[]" }],
  },

  // events
  {
    type: "event",
    name: "RoomCreated",
    inputs: [
      { indexed: true, name: "roomId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "entryFeeWei", type: "uint256" },
      { indexed: false, name: "maxPlayers", type: "uint8" },
      { indexed: false, name: "isPrivate", type: "bool" },
      { indexed: false, name: "platformFeeBps", type: "uint16" },
      { indexed: false, name: "gameId", type: "uint32" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoomJoined",
    inputs: [
      { indexed: true, name: "roomId", type: "uint256" },
      { indexed: true, name: "player", type: "address" },
      { indexed: false, name: "playerCount", type: "uint8" },
    ],
    anonymous: false,
  },
  {
    type: "event",
    name: "RoomCancelled",
    inputs: [{ indexed: true, name: "roomId", type: "uint256" }],
    anonymous: false,
  },
] as const;

export enum RoomStatus {
  None = 0,
  Created = 1,
  Started = 2,
  Finished = 3,
  Cancelled = 4,
}

export const GAME_CATALOG = [
  { id: 1, label: "Chess" },
  { id: 2, label: "Dominos" },
  { id: 3, label: "Backgammon" },
] as const;

export const TURN_TIMERS = [
  { label: "5 seconds", value: 5 },
  { label: "10 seconds", value: 10 },
  { label: "15 seconds", value: 15 },
  { label: "30 seconds", value: 30 },
  { label: "Unlimited", value: 0 },
] as const;
