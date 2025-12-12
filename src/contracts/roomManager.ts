// src/contracts/roomManager.ts

// Deployed RoomManagerV2 on Polygon mainnet
export const ROOM_MANAGER_ADDRESS = "0xd3ACD6e228280BDdb470653eBd658648FBB84789" as const;

// IMPORTANT: statuses MUST match the contract enum order
export enum RoomStatus {
  Created = 4,
  Started = 5,
  Finished = 6,
  Cancelled = 7,
}

// Game catalog for UI labels
export const GAME_CATALOG: Record<number, { label: string }> = {
  1: { label: "Chess" },
  2: { label: "Dominos" },
  3: { label: "Backgammon" },
};

export const ROOM_MANAGER_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "entryFeeWei", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint16", name: "gameId", type: "uint16" },
      { internalType: "uint32", name: "turnTimeSeconds", type: "uint32" },
    ],
    name: "createRoom",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "joinRoom",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "startRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
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
      { internalType: "uint256", name: "roomId", type: "uint256" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    name: "finishRoom",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getRoomView",
    outputs: [
      { internalType: "uint256", name: "id", type: "uint256" },
      { internalType: "address", name: "creator", type: "address" },
      { internalType: "uint256", name: "entryFee", type: "uint256" },
      { internalType: "uint8", name: "maxPlayers", type: "uint8" },
      { internalType: "bool", name: "isPrivate", type: "bool" },
      { internalType: "uint8", name: "status", type: "uint8" },
      { internalType: "uint16", name: "gameId", type: "uint16" },
      { internalType: "uint32", name: "turnTimeSeconds", type: "uint32" },
      { internalType: "address", name: "winner", type: "address" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getPlayers",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "uint256", name: "roomId", type: "uint256" }],
    name: "getPlayerCount",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "creator", type: "address" }],
    name: "creatorActiveRoomId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "nextRoomId",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// Frontend view type
export type ContractRoomView = readonly [
  bigint, // id
  `0x${string}`, // creator
  bigint, // entryFee
  number, // maxPlayers
  boolean, // isPrivate
  number, // status
  number, // gameId
  number, // turnTimeSeconds
  `0x${string}`, // winner
];
