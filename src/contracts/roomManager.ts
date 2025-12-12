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
      { name: "gameId", type: "uint16" },
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
    name: "finishRoom",
    stateMutability: "nonpayable",
    inputs: [
      { name: "roomId", type: "uint256" },
      { name: "winner", type: "address" },
    ],
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
      { name: "gameId", type: "uint16" },
      { name: "turnTimeSeconds", type: "uint32" },
      { name: "winner", type: "address" },
    ],
  },
  {
    type: "function",
    name: "getPlayerCount",
    stateMutability: "view",
    inputs: [{ name: "roomId", type: "uint256" }],
    outputs: [{ name: "count", type: "uint256" }],
  },
  {
    type: "function",
    name: "nextRoomId",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "next", type: "uint256" }],
  },
] as const;

// IMPORTANT: Update these numbers ONLY if your Solidity enum differs.
// Most common pattern in your contract: None=0, Created=1, Started=2, Finished=3, Cancelled=4
export enum RoomStatus {
  None = 0,
  Created = 1,
  Started = 2,
  Finished = 3,
  Cancelled = 4,
}

export type ContractRoomView = {
  id: bigint;
  creator: `0x${string}`;
  entryFee: bigint;
  maxPlayers: number;
  isPrivate: boolean;
  status: RoomStatus;
  gameId: number;
  turnTimeSeconds: number;
  winner: `0x${string}`;
};
