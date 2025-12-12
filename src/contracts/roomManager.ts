// src/contracts/roomManager.ts

export const ROOM_MANAGER_ADDRESS = "0xd3ACD6e228280BDdb470653eBd658648FBB84789" as const;

export const ROOM_MANAGER_ABI = [
  {
    type: "function",
    name: "createRoom",
    stateMutability: "payable",
    inputs: [
      { name: "entryFeeWei", type: "uint256" },
      { name: "maxPlayers", type: "uint8" },
      { name: "isPrivate", type: "bool" },
      { name: "gameType", type: "uint8" },
      { name: "turnTimeSeconds", type: "uint32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "joinRoom",
    stateMutability: "payable",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelRoom",
    stateMutability: "nonpayable",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getRoomView",
    stateMutability: "view",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [
      { name: "id", type: "uint256" },
      { name: "creator", type: "address" },
      { name: "entryFee", type: "uint256" },
      { name: "maxPlayers", type: "uint8" },
      { name: "isPrivate", type: "bool" },
      { name: "status", type: "uint8" },
      { name: "gameType", type: "uint8" },
      { name: "turnTimeSeconds", type: "uint32" },
      { name: "winner", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getPlayerCount",
    stateMutability: "view",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "nextRoomId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "playerActiveRoomId",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export enum RoomStatus {
  None = 0,
  Created = 1,
  Started = 2,
  Finished = 3,
  Cancelled = 4,
}

export const GAME_LABELS = [
  "Chess",
  "Dominos",
  "Backgammon",
  "Checkers",
  "Chinese Checkers",
  "Uno",
  "Yahtzee",
  "Poker",
];
