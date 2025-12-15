export type Difficulty = "easy" | "medium" | "hard";
export type PlayerColor = "gold" | "ruby" | "emerald" | "sapphire";

export interface Token {
  position: number; // -1 = home, 0-56 = on board path, 57 = finished
  color: PlayerColor;
  id: number;
}

export interface Player {
  color: PlayerColor;
  tokens: Token[];
  isAI: boolean;
  startPosition: number; // Position on main track where player enters (0, 13, 26, 39)
  homeColumn: number; // Home column entry point
}

// Classic Ludo board is 15x15 grid
// Main track has 52 positions (0-51)
// Each player has 6 home column positions (52-57 relative to their path)

// Board cell coordinates for the 15x15 grid
// Standard Ludo 52-position track on 15x15 grid
// Note: Corners have diagonal transitions - this is normal for Ludo on a square grid
// 1 position = 1 dice step, even when moving diagonally at corners
export const MAIN_TRACK_COORDS: Record<number, [number, number]> = {
  // Gold section (0-12)
  0: [6, 1], 1: [6, 2], 2: [6, 3], 3: [6, 4], 4: [6, 5],
  5: [5, 6], 6: [4, 6], 7: [3, 6], 8: [2, 6], 9: [1, 6], 10: [0, 6],
  11: [0, 7], 12: [0, 8],
  // Ruby section (13-25)
  13: [1, 8], 14: [2, 8], 15: [3, 8], 16: [4, 8], 17: [5, 8],
  18: [6, 9], 19: [6, 10], 20: [6, 11], 21: [6, 12], 22: [6, 13], 23: [6, 14],
  24: [7, 14], 25: [8, 14],
  // Sapphire section (26-38)
  26: [8, 13], 27: [8, 12], 28: [8, 11], 29: [8, 10], 30: [8, 9],
  31: [9, 8], 32: [10, 8], 33: [11, 8], 34: [12, 8], 35: [13, 8], 36: [14, 8],
  37: [14, 7], 38: [14, 6],
  // Emerald section (39-51)
  39: [13, 6], 40: [12, 6], 41: [11, 6], 42: [10, 6], 43: [9, 6],
  44: [8, 5], 45: [8, 4], 46: [8, 3], 47: [8, 2], 48: [8, 1], 49: [8, 0],
  50: [7, 0], 51: [6, 0],
};

// Home column coordinates for each player (6 cells leading to center)
export const HOME_COLUMN_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]], // Row 7, cols 1-6
  ruby: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]], // Rows 1-6, col 7
  sapphire: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // Row 7, cols 13-8
  emerald: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // Rows 13-8, col 7
};

// Home base token positions (where tokens wait before entering the track)
export const HOME_BASE_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[2, 2], [2, 4], [4, 2], [4, 4]],
  ruby: [[2, 10], [2, 12], [4, 10], [4, 12]],
  sapphire: [[10, 10], [10, 12], [12, 10], [12, 12]],
  emerald: [[10, 2], [10, 4], [12, 2], [12, 4]],
};

// Start positions on main track for each player
export const PLAYER_START_POSITIONS: Record<PlayerColor, number> = {
  gold: 0,
  ruby: 13,
  sapphire: 26,
  emerald: 39,
};

// Safe squares (cannot be captured here)
export const SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

// Get absolute track position from player-relative position
export const getAbsolutePosition = (relativePos: number, color: PlayerColor): number => {
  if (relativePos < 0 || relativePos >= 52) return relativePos;
  const start = PLAYER_START_POSITIONS[color];
  return (start + relativePos) % 52;
};

// Get board coordinates for a token
export const getTokenCoords = (
  position: number, 
  color: PlayerColor, 
  tokenId: number
): [number, number] | null => {
  if (position === -1) {
    // In home base
    return HOME_BASE_COORDS[color][tokenId];
  }
  if (position === 57) {
    // Finished - center area
    return [7, 7];
  }
  if (position >= 52 && position <= 56) {
    // In home column (positions 52-56 = indices 0-4)
    return HOME_COLUMN_COORDS[color][position - 52];
  }
  if (position >= 0 && position < 52) {
    // On main track - convert relative to absolute
    const absolutePos = getAbsolutePosition(position, color);
    return MAIN_TRACK_COORDS[absolutePos];
  }
  return null;
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
    homeColumn: 51, // After position 51, gold enters home column
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
    homeColumn: 12,
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
    startPosition: 26,
    homeColumn: 25,
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
    startPosition: 39,
    homeColumn: 38,
  },
];
