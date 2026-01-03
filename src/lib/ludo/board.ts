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

// Main track coordinates (52 cells, clockwise from gold's perspective)
// Position 0 is gold's start, position 13 is ruby's start, etc.
export const TRACK_COORDS: Record<number, [number, number]> = {
  // Gold section (0-12): bottom-left, going up then right
  0: [6, 1],   // Gold START (safe square)
  1: [6, 2],
  2: [6, 3],
  3: [6, 4],
  4: [6, 5],
  5: [5, 6],
  6: [4, 6],
  7: [3, 6],
  8: [2, 6],
  9: [1, 6],
  10: [0, 6],
  11: [0, 7],
  12: [0, 8],
  
  // Ruby section (13-25): top-left, going right then down
  13: [1, 8],  // Ruby START (safe square)
  14: [2, 8],
  15: [3, 8],
  16: [4, 8],
  17: [5, 8],
  18: [6, 9],
  19: [6, 10],
  20: [6, 11],
  21: [6, 12],
  22: [6, 13],
  23: [6, 14],
  24: [7, 14],
  25: [8, 14],
  
  // Sapphire section (26-38): top-right, going down then left
  26: [8, 13], // Sapphire START (safe square)
  27: [8, 12],
  28: [8, 11],
  29: [8, 10],
  30: [8, 9],
  31: [9, 8],
  32: [10, 8],
  33: [11, 8],
  34: [12, 8],
  35: [13, 8],
  36: [14, 8],
  37: [14, 7],
  38: [14, 6],
  
  // Emerald section (39-51): bottom-right, going left then up
  39: [13, 6], // Emerald START (safe square)
  40: [12, 6],
  41: [11, 6],
  42: [10, 6],
  43: [9, 6],
  44: [8, 5],
  45: [8, 4],
  46: [8, 3],
  47: [8, 2],
  48: [8, 1],
  49: [8, 0],
  50: [7, 0],
  51: [6, 0],
};

// Home path coordinates (6 cells leading to center, per player)
export const HOME_PATH_COORDS: Record<PlayerColor, [number, number][]> = {
  gold: [
    [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6],
  ],
  ruby: [
    [1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7],
  ],
  sapphire: [
    [7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8],
  ],
  emerald: [
    [13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7],
  ],
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
