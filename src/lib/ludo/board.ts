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
 * 
 * CRITICAL: Each step must be orthogonally adjacent (no diagonal jumps)!
 * 
 * Total: 56 cells (including all corner cells for smooth movement)
 */

import { PlayerColor, TRACK_SIZE, START_POSITIONS } from './types';

/**
 * 15x15 Ludo Grid - 56 cell clockwise track
 * 
 * Each transition changes ONLY row OR column by exactly 1 (orthogonal moves only).
 */
export const TRACK_COORDS: Record<number, [number, number]> = {
  // === GOLD SECTION (positions 0-13): Left arm row 6 → corner → Top arm col 6 → top edge ===
  0: [6, 1],   // Gold START - safe square
  1: [6, 2],
  2: [6, 3],
  3: [6, 4],
  4: [6, 5],
  5: [6, 6],   // Corner cell (row 6, col 6)
  6: [5, 6],   // Going UP col 6
  7: [4, 6],
  8: [3, 6],
  9: [2, 6],
  10: [1, 6],
  11: [0, 6],  // Top-left
  12: [0, 7],  // Top center
  13: [0, 8],  // Top-right
  
  // === RUBY SECTION (positions 14-27): Top arm col 8 → corner → Right arm row 6 → right edge ===
  14: [1, 8],  // Ruby START - safe square
  15: [2, 8],
  16: [3, 8],
  17: [4, 8],
  18: [5, 8],
  19: [6, 8],  // Corner cell (row 6, col 8)
  20: [6, 9],  // Going RIGHT row 6
  21: [6, 10],
  22: [6, 11],
  23: [6, 12],
  24: [6, 13],
  25: [6, 14], // Right-top
  26: [7, 14], // Right center
  27: [8, 14], // Right-bottom
  
  // === SAPPHIRE SECTION (positions 28-41): Right arm row 8 → corner → Bottom arm col 8 → bottom edge ===
  28: [8, 13], // Sapphire START - safe square
  29: [8, 12],
  30: [8, 11],
  31: [8, 10],
  32: [8, 9],
  33: [8, 8],  // Corner cell (row 8, col 8)
  34: [9, 8],  // Going DOWN col 8
  35: [10, 8],
  36: [11, 8],
  37: [12, 8],
  38: [13, 8],
  39: [14, 8], // Bottom-right edge (row 14)
  40: [14, 7], // Bottom center
  41: [14, 6], // Bottom-left edge (row 14)
  
  // === EMERALD SECTION (positions 42-55): Bottom arm col 6 → corner → Left arm row 8 → left edge ===
  42: [13, 6], // Emerald START - safe square
  43: [12, 6], // Going UP col 6
  44: [11, 6],
  45: [10, 6],
  46: [9, 6],
  47: [8, 6],  // Corner cell (row 8, col 6)
  48: [8, 5],  // Going LEFT row 8
  49: [8, 4],
  50: [8, 3],
  51: [8, 2],
  52: [8, 1],
  53: [8, 0],  // Left-bottom
  54: [7, 0],  // Left center
  55: [6, 0],  // Left-top - next would be position 0 at [6, 1]
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
  // Safe squares are the starting positions for each color
  return [0, 14, 28, 42].includes(trackPosition);
}
