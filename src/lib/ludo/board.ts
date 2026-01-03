/**
 * Ludo Board Coordinates
 * 
 * Maps logical positions to visual grid coordinates for rendering.
 * The board is a 15x15 grid.
 * 
 * Standard Ludo layout:
 * - 4 home bases in corners (6x6 each)
 * - Cross-shaped track in the middle
 * - Track goes around the OUTER EDGE of the cross
 * - Home paths go through the CENTER of each arm toward (7,7)
 */

import { PlayerColor, TRACK_SIZE, START_POSITIONS } from './types';

/**
 * 15x15 Ludo Grid:
 * 
 * Home bases: rows 0-5 cols 0-5 (gold), rows 0-5 cols 9-14 (ruby),
 *             rows 9-14 cols 9-14 (sapphire), rows 9-14 cols 0-5 (emerald)
 * 
 * Track (52 cells) forms a cross:
 * - Top arm: rows 0-5, cols 6-8 (only cols 6 and 8 are track, col 7 is home path)
 * - Right arm: rows 6-8, cols 9-14 (only rows 6 and 8 are track, row 7 is home path)  
 * - Bottom arm: rows 9-14, cols 6-8 (only cols 6 and 8 are track, col 7 is home path)
 * - Left arm: rows 6-8, cols 0-5 (only rows 6 and 8 are track, row 7 is home path)
 * - Center: rows 6-8, cols 6-8 (finish area)
 * 
 * Tokens move clockwise around the track.
 */
export const TRACK_COORDS: Record<number, [number, number]> = {
  // 52 cells total (positions 0-51), clockwise path
  
  // === GOLD START: Bottom of left arm, row 6, going LEFT to RIGHT (positions 0-5) ===
  0: [6, 1],   // Gold START - safe square
  1: [6, 2],
  2: [6, 3],
  3: [6, 4],
  4: [6, 5],
  
  // === Turn UP into top arm, left column (col 6), going UP (positions 5-10) ===
  5: [5, 6],
  6: [4, 6],
  7: [3, 6],
  8: [2, 6],
  9: [1, 6],
  10: [0, 6],  // Top-left of top arm
  
  // === Across top edge (positions 11-12) ===
  11: [0, 7],  // Top center
  12: [0, 8],  // Top-right of top arm
  
  // === RUBY START: Down right column of top arm (col 8), going DOWN (positions 13-18) ===
  13: [1, 8],  // Ruby START - safe square
  14: [2, 8],
  15: [3, 8],
  16: [4, 8],
  17: [5, 8],
  
  // === Turn RIGHT into right arm, top row (row 6), going RIGHT (positions 18-23) ===
  18: [6, 9],
  19: [6, 10],
  20: [6, 11],
  21: [6, 12],
  22: [6, 13],
  23: [6, 14], // Right edge top
  
  // === Down right edge (positions 24-25) ===
  24: [7, 14], // Right center
  25: [8, 14], // Right edge bottom
  
  // === SAPPHIRE START: Left along bottom row of right arm (row 8), going LEFT (positions 26-31) ===
  26: [8, 13], // Sapphire START - safe square
  27: [8, 12],
  28: [8, 11],
  29: [8, 10],
  30: [8, 9],
  
  // === Turn DOWN into bottom arm, right column (col 8), going DOWN (positions 31-36) ===
  31: [9, 8],
  32: [10, 8],
  33: [11, 8],
  34: [12, 8],
  35: [13, 8],
  36: [14, 8], // Bottom-right of bottom arm
  
  // === Across bottom edge (positions 37-38) ===
  37: [14, 7], // Bottom center
  38: [14, 6], // Bottom-left of bottom arm
  
  // === EMERALD START: Up left column of bottom arm (col 6), going UP (positions 39-44) ===
  39: [13, 6], // Emerald START - safe square
  40: [12, 6],
  41: [11, 6],
  42: [10, 6],
  43: [9, 6],
  
  // === Turn LEFT into left arm, bottom row (row 8), going LEFT (positions 44-49) ===
  44: [8, 5],
  45: [8, 4],
  46: [8, 3],
  47: [8, 2],
  48: [8, 1],
  49: [8, 0],  // Left edge bottom
  
  // === Up left edge (positions 50-51) ===
  50: [7, 0],  // Left center
  51: [6, 0],  // Left edge top - connects back to position 0
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
