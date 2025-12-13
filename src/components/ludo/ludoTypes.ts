export type Difficulty = "easy" | "medium" | "hard";
export type PlayerColor = "gold" | "ruby" | "emerald" | "sapphire";

export interface Token {
  position: number; // -1 = home, 0-56 = on board, 57 = finished
  color: PlayerColor;
  id: number;
}

export interface Player {
  color: PlayerColor;
  tokens: Token[];
  isAI: boolean;
  startPosition: number;
  finishStart: number;
}

// Board position mapping for visual placement
export const BOARD_POSITIONS: Record<number, { x: number; y: number }> = {};

// Initialize board positions (classic Ludo path)
for (let i = 0; i < 52; i++) {
  // This would map each position to x,y coordinates on the board
  // Simplified for now
  BOARD_POSITIONS[i] = { x: 0, y: 0 };
}

export const PLAYER_START_POSITIONS: Record<PlayerColor, number> = {
  gold: 0,
  ruby: 13,
  emerald: 26,
  sapphire: 39,
};

export const initializePlayers = (): Player[] => [
  {
    color: "gold",
    tokens: [
      { position: -1, color: "gold", id: 0 },
      { position: -1, color: "gold", id: 1 },
      { position: -1, color: "gold", id: 2 },
      { position: -1, color: "gold", id: 3 },
    ],
    isAI: false,
    startPosition: 0,
    finishStart: 52,
  },
  {
    color: "ruby",
    tokens: [
      { position: -1, color: "ruby", id: 0 },
      { position: -1, color: "ruby", id: 1 },
      { position: -1, color: "ruby", id: 2 },
      { position: -1, color: "ruby", id: 3 },
    ],
    isAI: true,
    startPosition: 13,
    finishStart: 13,
  },
  {
    color: "emerald",
    tokens: [
      { position: -1, color: "emerald", id: 0 },
      { position: -1, color: "emerald", id: 1 },
      { position: -1, color: "emerald", id: 2 },
      { position: -1, color: "emerald", id: 3 },
    ],
    isAI: true,
    startPosition: 26,
    finishStart: 26,
  },
  {
    color: "sapphire",
    tokens: [
      { position: -1, color: "sapphire", id: 0 },
      { position: -1, color: "sapphire", id: 1 },
      { position: -1, color: "sapphire", id: 2 },
      { position: -1, color: "sapphire", id: 3 },
    ],
    isAI: true,
    startPosition: 39,
    finishStart: 39,
  },
];
