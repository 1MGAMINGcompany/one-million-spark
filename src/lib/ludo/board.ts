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
  // Track has 56 cells (0-55), forming a continuous clockwise path
  
  // === GOLD START: Left arm, row 6 going RIGHT (positions 0-5) ===
  0: [6, 0],   // Gold START - safe square
  1: [6, 1],
  2: [6, 2],
  3: [6, 3],
  4: [6, 4],
  5: [6, 5],   // Inside corner - turn up
  
  // === Going UP left column of top arm (positions 6-13) ===
  6: [5, 5],
  7: [4, 5],
  8: [3, 5],
  9: [2, 5],
  10: [1, 5],
  11: [0, 5],  // Top-left corner
  12: [0, 6],  // Top edge
  13: [0, 7],  // Top middle
  
  // === RUBY START: Top edge going right then down (positions 14-21) ===
  14: [0, 8],  // Ruby START - safe square  
  15: [0, 9],  // Top-right corner
  16: [1, 9],  // Going down right column
  17: [2, 9],
  18: [3, 9],
  19: [4, 9],
  20: [5, 9],
  21: [6, 9],  // Inside corner - turn right
  
  // === Going RIGHT along top row of right arm (positions 22-27) ===
  22: [6, 10],
  23: [6, 11],
  24: [6, 12],
  25: [6, 13],
  26: [6, 14], // Right edge top
  27: [7, 14], // Right edge middle
  
  // === SAPPHIRE START: Right edge going down then left (positions 28-33) ===
  28: [8, 14], // Sapphire START - safe square
  29: [8, 13],
  30: [8, 12],
  31: [8, 11],
  32: [8, 10],
  33: [8, 9],  // Inside corner - turn down
  
  // === Going DOWN right column of bottom arm (positions 34-41) ===
  34: [9, 9],
  35: [10, 9],
  36: [11, 9],
  37: [12, 9],
  38: [13, 9],
  39: [14, 9], // Bottom-right corner
  40: [14, 8], // Bottom edge
  41: [14, 7], // Bottom middle
  
  // === EMERALD START: Bottom edge going left then up (positions 42-49) ===
  42: [14, 6], // Emerald START - safe square
  43: [14, 5], // Bottom-left corner
  44: [13, 5], // Going up left column
  45: [12, 5],
  46: [11, 5],
  47: [10, 5],
  48: [9, 5],
  49: [8, 5],  // Inside corner - turn left
  
  // === Going LEFT along bottom row back to Gold area (positions 50-55) ===
  50: [8, 4],
  51: [8, 3],
  52: [8, 2],
  53: [8, 1],
  54: [8, 0],  // Left edge bottom
  55: [7, 0],  // Left edge middle - completes circuit before Gold start
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
  return [0, 14, 28, 42].includes(trackPosition);
}
