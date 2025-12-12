export const ROOM_MANAGER_ADDRESS =
  "0xd3ACD6e228280BDdb470653eBd658648FBB84789" as const;

export const ROOM_MANAGER_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "entryFeeWei", "type": "uint256" },
      { "internalType": "uint8", "name": "maxPlayers", "type": "uint8" },
      { "internalType": "bool", "name": "isPrivate", "type": "bool" }
    ],
    "name": "createRoom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "roomId", "type": "uint256" }],
    "name": "joinRoom",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "roomId", "type": "uint256" }],
    "name": "cancelRoom",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "roomId", "type": "uint256" }],
    "name": "playersOf",
    "outputs": [{ "internalType": "address[]", "type": "address[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "roomId", "type": "uint256" }],
    "name": "getRoom",
    "outputs": [
      { "type": "uint256" },
      { "type": "address" },
      { "type": "uint256" },
      { "type": "uint8" },
      { "type": "bool" },
      { "type": "uint8" },
      { "type": "uint8" },
      { "type": "uint32" },
      { "type": "address" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextRoomId",
    "outputs": [{ "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export enum RoomStatus {
  None = 0,
  Created = 1,
  Started = 2,
  Finished = 3,
  Cancelled = 4,
}

export const GAME_CATALOG: Record<number, { label: string }> = {
  0: { label: "Chess" },
  1: { label: "Dominos" },
  2: { label: "Backgammon" },
};
