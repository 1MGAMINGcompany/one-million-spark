/**
 * Ludo Game Types - Explicit State Machine
 * 
 * Token States:
 * - BASE: Token is at home base (not on board)
 * - TRACK: Token is on main track (52 cells, shared)
 * - HOME_PATH: Token is in final stretch (6 cells, player-specific)
 * - FINISHED: Token reached home (done)
 */

export type TokenState = 'BASE' | 'TRACK' | 'HOME_PATH' | 'FINISHED';

export type PlayerColor = 'gold' | 'ruby' | 'sapphire' | 'emerald';

export type GamePhase = 
  | 'WAITING_ROLL'   // Current player must roll dice
  | 'ROLLED'         // Dice rolled, awaiting move selection (or auto-advance if no moves)
  | 'ANIMATING'      // Move animation in progress
  | 'GAME_OVER';     // Winner determined

export interface Token {
  id: number;           // 0-3 for each player
  state: TokenState;
  position: number | null;  // null when BASE/FINISHED, 0-51 for TRACK, 0-5 for HOME_PATH
}

export interface Player {
  color: PlayerColor;
  wallet: string;       // For multiplayer identification
  tokens: Token[];
  isAI: boolean;
}

export interface Move {
  tokenIndex: number;      // Which token to move (0-3)
  fromState: TokenState;
  fromPosition: number | null;
  toState: TokenState;
  toPosition: number | null;
  isCapture: boolean;
  capturedToken?: { playerIndex: number; tokenIndex: number };
}

export interface MoveResult {
  newState: GameState;
  move: Move;
  captured: { playerIndex: number; tokenIndex: number } | null;
  finished: boolean;       // Did this token just finish?
  bonusTurn: boolean;      // Does player get another turn?
  gameWon: boolean;        // Did this player win?
}

export interface GameState {
  players: Player[];
  currentPlayerIndex: number;
  diceValue: number | null;
  consecutiveSixes: number;
  winner: PlayerColor | null;
  phase: GamePhase;
  legalMoves: Move[];      // Computed after dice roll
}

// Constants
export const TRACK_SIZE = 52;           // Main track has 52 cells (0-51)
export const HOME_PATH_SIZE = 6;        // Each player's home path has 6 cells
export const TOKENS_PER_PLAYER = 4;
export const PLAYER_COLORS: PlayerColor[] = ['gold', 'ruby', 'sapphire', 'emerald'];

// Starting positions on main track (where tokens enter from BASE)
// These match the START squares in TRACK_COORDS
export const START_POSITIONS: Record<PlayerColor, number> = {
  gold: 0,       // Position 0: [6, 1]
  ruby: 13,      // Position 13: [1, 8]
  sapphire: 26,  // Position 26: [8, 13]
  emerald: 39,   // Position 39: [13, 6]
};

// Track position where player's tokens exit to HOME_PATH
// Each player must travel 51 cells on track before entering home path
// (this is the last track position before their start, where they turn into home path)
export const HOME_ENTRY_POSITIONS: Record<PlayerColor, number> = {
  gold: 51,      // After position 51, gold enters home path (position 51 is [6,0], home entry from left)
  ruby: 12,      // After position 12, ruby enters home path (position 12 is [0,8], home entry from top)  
  sapphire: 25,  // After position 25, sapphire enters home path (position 25 is [8,14], home entry from right)
  emerald: 38,   // After position 38, emerald enters home path (position 38 is [14,6], home entry from bottom)
};

// Safe squares - cannot be captured here (starting positions)
export const SAFE_SQUARES: number[] = [0, 13, 26, 39];

// Create initial player state
export function createPlayer(color: PlayerColor, wallet: string, isAI: boolean): Player {
  return {
    color,
    wallet,
    tokens: [
      { id: 0, state: 'BASE', position: null },
      { id: 1, state: 'BASE', position: null },
      { id: 2, state: 'BASE', position: null },
      { id: 3, state: 'BASE', position: null },
    ],
    isAI,
  };
}

// Create initial game state
export function createInitialState(playerCount: number = 4, humanPlayerIndex: number = 0): GameState {
  const players: Player[] = [];
  
  for (let i = 0; i < playerCount; i++) {
    const color = PLAYER_COLORS[i];
    const isAI = i !== humanPlayerIndex;
    players.push(createPlayer(color, isAI ? `ai_${color}` : 'human', isAI));
  }
  
  return {
    players,
    currentPlayerIndex: 0,
    diceValue: null,
    consecutiveSixes: 0,
    winner: null,
    phase: 'WAITING_ROLL',
    legalMoves: [],
  };
}
