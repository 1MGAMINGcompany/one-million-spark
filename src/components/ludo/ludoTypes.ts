export type Difficulty = "easy" | "medium" | "hard";
export type PlayerColor = "gold" | "ruby" | "emerald" | "sapphire";

export interface Token {
  position: number; // -1 = home, 0-51 = on board path (52 cells), 52-57 = home column, 58 = finished
  color: PlayerColor;
  id: number;
}

export interface Player {
  color: PlayerColor;
  tokens: Token[];
  isAI: boolean;
  startPosition: number; // Position on main track where player enters
  homeColumn: number; // Home column entry point (last position before home column)
}

// Classic Ludo board is 15x15 grid
// Main track has 56 positions (0-55) - 14 cells per player section
// Each player has 6 home column positions (56-61 relative to their path)
// Position 62 = finished

// TRACK SIZE - each player travels 56 cells on main track before entering home column
export const TRACK_SIZE = 56;

// Board cell coordinates for the 15x15 grid
// 56-position track (14 cells per player section x 4 players)
// Each section: 5 cells straight + corner cell + 6 cells to center row + 2 cells along edge = 14 cells
export const MAIN_TRACK_COORDS: Record<number, [number, number]> = {
  // Gold section (0-13): starts at row 6, col 1, goes right, corner at [6,6], then up
  0: [6, 1], 1: [6, 2], 2: [6, 3], 3: [6, 4], 4: [6, 5],
  5: [6, 6],  // Corner cell (inside corner)
  6: [5, 6], 7: [4, 6], 8: [3, 6], 9: [2, 6], 10: [1, 6], 11: [0, 6],
  12: [0, 7], 13: [0, 8],
  
  // Ruby section (14-27): starts at row 1, col 8, goes down, corner at [6,8], then right
  14: [1, 8], 15: [2, 8], 16: [3, 8], 17: [4, 8], 18: [5, 8],
  19: [6, 8],  // Corner cell (inside corner)
  20: [6, 9], 21: [6, 10], 22: [6, 11], 23: [6, 12], 24: [6, 13], 25: [6, 14],
  26: [7, 14], 27: [8, 14],
  
  // Sapphire section (28-41): starts at row 8, col 13, goes left, corner at [8,8], then down
  28: [8, 13], 29: [8, 12], 30: [8, 11], 31: [8, 10], 32: [8, 9],
  33: [8, 8],  // Corner cell (inside corner)
  34: [9, 8], 35: [10, 8], 36: [11, 8], 37: [12, 8], 38: [13, 8], 39: [14, 8],
  40: [14, 7], 41: [14, 6],
  
  // Emerald section (42-55): starts at row 13, col 6, goes up, corner at [8,6], then left
  42: [13, 6], 43: [12, 6], 44: [11, 6], 45: [10, 6], 46: [9, 6],
  47: [8, 6],  // Corner cell (inside corner)
  48: [8, 5], 49: [8, 4], 50: [8, 3], 51: [8, 2], 52: [8, 1], 53: [8, 0],
  54: [7, 0], 55: [6, 0],
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

// Start positions on main track for each player (56-cell track)
export const PLAYER_START_POSITIONS: Record<PlayerColor, number> = {
  gold: 0,
  ruby: 14,     // After gold's 14 cells (0-13)
  sapphire: 28, // After ruby's 14 cells (14-27)
  emerald: 42,  // After sapphire's 14 cells (28-41)
};

// Safe squares (cannot be captured here) - adjusted for 56-cell track
// Each player's start cell and a few cells after are safe
export const SAFE_SQUARES = [0, 8, 14, 22, 28, 36, 42, 50];

// Get absolute track position from player-relative position
export const getAbsolutePosition = (relativePos: number, color: PlayerColor): number => {
  if (relativePos < 0 || relativePos >= TRACK_SIZE) return relativePos;
  const start = PLAYER_START_POSITIONS[color];
  return (start + relativePos) % TRACK_SIZE;
};

// Get board coordinates for a token
export const getTokenCoords = (
  position: number, 
  color: PlayerColor, 
  tokenId: number
): [number, number] | null => {
  const FINISH_POS = 62;
  const HOME_COLUMN_START = 56;
  const HOME_COLUMN_END = 61;
  
  if (position === -1) {
    // In home base
    return HOME_BASE_COORDS[color][tokenId];
  }
  if (position === FINISH_POS) {
    // Finished - center area
    return [7, 7];
  }
  if (position >= HOME_COLUMN_START && position <= HOME_COLUMN_END) {
    // In home column (positions 56-61 = indices 0-5)
    return HOME_COLUMN_COORDS[color][position - HOME_COLUMN_START];
  }
  if (position >= 0 && position < TRACK_SIZE) {
    // On main track (0-55) - convert relative to absolute
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
    homeColumn: 55, // After position 55, gold enters home column
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
    startPosition: 14,
    homeColumn: 55, // All players enter home column after position 55 (relative)
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
    startPosition: 28,
    homeColumn: 55,
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
    startPosition: 42,
    homeColumn: 55,
  },
];
