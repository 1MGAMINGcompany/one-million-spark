// src/contracts/roomManager.ts
export const ROOM_MANAGER_ADDRESS = "0xd3ACD6e228280BDdb470653eBd658648FBB84789" as const;

// IMPORTANT: Status numbers MUST match your deployed contract.
// If your contract enum is: Created=1, Started=2, Finished=3, Cancelled=4 -> use below.
export enum RoomStatus {
  Created = 1,
  Started = 2,
  Finished = 3,
  Cancelled = 4,
}

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
    name: "getPlayerCount",
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

// Helpers for UI
export const GAME_CATALOG: Record<number, { label: string }> = {
  1: { label: "Chess" },
  2: { label: "Dominos" },
  3: { label: "Backgammon" },
  // reserved for later:
  10: { label: "Poker" },
  11: { label: "Yahtzee" },
  12: { label: "Chinese Checkers" },
  13: { label: "Checkers" },
  14: { label: "UNO" },
};
