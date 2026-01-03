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
 * Standard Ludo 15x15 Grid Layout:
 * 
 * Track forms the OUTER EDGE of the cross shape, going clockwise.
 * Each player starts at their safe square and moves clockwise.
 */
export const TRACK_COORDS: Record<number, [number, number]> = {
  // === GOLD START: Left arm, middle row going RIGHT ===
  0: [6, 0],   // Gold START - safe square (left edge, row 6)
  1: [6, 1],
  2: [6, 2],
  3: [6, 3],
  4: [6, 4],
  5: [6, 5],   // End of left arm outer edge
  
  // === Turn UP into top arm ===
  6: [5, 6],   // Turn corner
  7: [4, 6],
  8: [3, 6],
  9: [2, 6],
  10: [1, 6],
  11: [0, 6],  // Top-left of top arm
  12: [0, 7],  // Top edge of top arm
  
  // === RUBY START: Top arm going DOWN ===
  13: [0, 8],  // Ruby START - safe square (top edge, col 8)
  14: [1, 8],
  15: [2, 8],
  16: [3, 8],
  17: [4, 8],
  18: [5, 8],  // End of top arm outer edge
  
  // === Turn RIGHT into right arm ===
  19: [6, 9],  // Turn corner
  20: [6, 10],
  21: [6, 11],
  22: [6, 12],
  23: [6, 13],
  24: [6, 14], // Right edge of right arm
  25: [7, 14], // Middle of right edge
  
  // === SAPPHIRE START: Right arm going LEFT ===
  26: [8, 14], // Sapphire START - safe square (right edge, row 8)
  27: [8, 13],
  28: [8, 12],
  29: [8, 11],
  30: [8, 10],
  31: [8, 9],  // End of right arm outer edge
  
  // === Turn DOWN into bottom arm ===
  32: [9, 8],  // Turn corner
  33: [10, 8],
  34: [11, 8],
  35: [12, 8],
  36: [13, 8],
  37: [14, 8], // Bottom-right of bottom arm
  38: [14, 7], // Bottom edge of bottom arm
  
  // === EMERALD START: Bottom arm going UP ===
  39: [14, 6], // Emerald START - safe square (bottom edge, col 6)
  40: [13, 6],
  41: [12, 6],
  42: [11, 6],
  43: [10, 6],
  44: [9, 6],  // End of bottom arm outer edge
  
  // === Turn LEFT back to Gold's area ===
  45: [8, 5],  // Turn corner
  46: [8, 4],
  47: [8, 3],
  48: [8, 2],
  49: [8, 1],
  50: [8, 0],  // Left edge bottom
  51: [7, 0],  // Complete the circuit back toward Gold's start
};

// Home path coordinates (6 cells leading to center, per player)
// Position 0 is first cell after entering from track, position 5 is last before center
export const HOME_PATH_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],     // enters from left, goes right toward center
  ruby: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],     // enters from top, goes down toward center
  sapphire: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]], // enters from right, goes left toward center
  emerald: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]], // enters from bottom, goes up toward center
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
