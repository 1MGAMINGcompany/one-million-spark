/**
 * Ludo Board Coordinates
 * 
 * Maps logical positions to visual grid coordinates for rendering.
 * The board is a 15x15 grid.
 * 
 * Main track: 52 cells shared by all players
 * Home path: 6 cells per player (color-specific)
 * Home base: 4 token positions per player (off-board)
 */

import { PlayerColor, TRACK_SIZE, START_POSITIONS } from './types';

/**
 * Main track coordinates (52 cells, clockwise)
 * MUST match the TRACK_COORDS in LudoBoard.tsx exactly!
 * 
 * Track positions start at Gold's start (position 0) and go clockwise.
 */
export const TRACK_COORDS: Record<number, [number, number]> = {
  // === GOLD'S SECTION (0-12): Start bottom-left, go UP then turn RIGHT ===
  0: [6, 1],   // Gold START (row 6, col 1) - safe square
  1: [5, 1],   // moving up
  2: [4, 1],
  3: [3, 1],
  4: [2, 1],
  5: [1, 1],
  6: [0, 1],   // top-left corner area
  7: [0, 2],   // moving right along top
  8: [0, 3],
  9: [0, 4],
  10: [0, 5],
  11: [0, 6],  // entering top arm
  12: [1, 6],  // moving down into ruby's area
  
  // === RUBY'S SECTION (13-25): Start top, go DOWN then turn RIGHT ===
  13: [2, 6],  // Ruby START (row 2, col 6) - safe square
  14: [3, 6],  // moving down
  15: [4, 6],
  16: [5, 6],
  17: [6, 6],  // center-left area
  18: [6, 7],  // moving right through center
  19: [6, 8],  
  20: [6, 9],  // entering right arm
  21: [6, 10],
  22: [6, 11],
  23: [6, 12],
  24: [6, 13],
  25: [7, 13], // turning down into sapphire's area
  
  // === SAPPHIRE'S SECTION (26-38): Start top-right, go DOWN then turn LEFT ===
  26: [8, 13], // Sapphire START (row 8, col 13) - safe square
  27: [8, 12], // moving left
  28: [8, 11],
  29: [8, 10],
  30: [8, 9],
  31: [8, 8],  // center-right area
  32: [9, 8],  // moving down
  33: [10, 8],
  34: [11, 8],
  35: [12, 8],
  36: [13, 8],
  37: [14, 8], // bottom-right corner area
  38: [14, 7], // turning left into emerald's area
  
  // === EMERALD'S SECTION (39-51): Start bottom, go UP then turn LEFT ===
  39: [14, 6], // Emerald START (row 14, col 6) - safe square
  40: [13, 6], // moving up
  41: [12, 6],
  42: [11, 6],
  43: [10, 6],
  44: [9, 6],
  45: [8, 6],  // center-bottom area
  46: [8, 5],  // moving left
  47: [8, 4],
  48: [8, 3],
  49: [8, 2],
  50: [8, 1],
  51: [7, 1],  // turning up to connect back to Gold's start area
};

// Home path coordinates (6 cells leading to center, per player)
// Position 0 is first cell after entering from track, position 5 is at center (7,7)
export const HOME_PATH_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]],     // enters from col 1, goes right
  ruby: [[2, 7], [3, 7], [4, 7], [5, 7], [6, 7], [7, 7]],     // enters from row 1, goes down  
  sapphire: [[7, 12], [7, 11], [7, 10], [7, 9], [7, 8], [7, 7]], // enters from col 13, goes left
  emerald: [[12, 7], [11, 7], [10, 7], [9, 7], [8, 7], [7, 7]], // enters from row 13, goes up
};

// Home base token positions (where tokens wait before entering track)
export const HOME_BASE_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[2, 2], [2, 4], [4, 2], [4, 4]],
  ruby: [[2, 10], [2, 12], [4, 10], [4, 12]],
  sapphire: [[10, 10], [10, 12], [12, 10], [12, 12]],
  emerald: [[10, 2], [10, 4], [12, 2], [12, 4]],
};

// Finished position (center of board)
export const FINISHED_COORD: [number, number] = [7, 7];

/**
 * Convert a player's track position to absolute track position
 * Each player starts at their START position and moves clockwise
 */
export function getAbsoluteTrackPosition(relativePosition: number, color: PlayerColor): number {
  const start = START_POSITIONS[color];
  return (start + relativePosition) % TRACK_SIZE;
}

/**
 * Get visual coordinates for a token based on its state and position
 */
export function getTokenCoords(
  state: 'BASE' | 'TRACK' | 'HOME_PATH' | 'FINISHED',
  position: number | null,
  color: PlayerColor,
  tokenId: number
): [number, number] {
  switch (state) {
    case 'BASE':
      return HOME_BASE_COORDS[color][tokenId];
    
    case 'TRACK':
      if (position === null) throw new Error('TRACK token must have position');
      return TRACK_COORDS[position];
    
    case 'HOME_PATH':
      if (position === null) throw new Error('HOME_PATH token must have position');
      return HOME_PATH_COORDS[color][position];
    
    case 'FINISHED':
      return FINISHED_COORD;
    
    default:
      throw new Error(`Unknown token state: ${state}`);
  }
}

/**
 * Check if a track position is a safe square
 */
export function isSafeSquare(trackPosition: number): boolean {
  return [0, 13, 26, 39].includes(trackPosition);
}
