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
export const TRACK_SIZE = 56;           // Main track has 56 cells (0-55)
export const HOME_PATH_SIZE = 6;        // Each player's home path has 6 cells
export const TOKENS_PER_PLAYER = 4;
export const PLAYER_COLORS: PlayerColor[] = ['gold', 'ruby', 'sapphire', 'emerald'];

// Starting positions on main track (where tokens enter from BASE)
export const START_POSITIONS: Record<PlayerColor, number> = {
  gold: 0,
  ruby: 14,
  sapphire: 28,
  emerald: 42,
};

// Track position where player's tokens exit to HOME_PATH
// Each player travels 55 cells on track before entering home path
// (one cell before their start position in the circuit)
export const HOME_ENTRY_POSITIONS: Record<PlayerColor, number> = {
  gold: 54,      // After position 54, gold enters home path (55 is before 0)
  ruby: 12,      // After position 12, ruby enters home path
  sapphire: 26,  // After position 26, sapphire enters home path  
  emerald: 40,   // After position 40, emerald enters home path
};

// Safe squares - cannot be captured here (starting positions)
export const SAFE_SQUARES: number[] = [0, 14, 28, 42];

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
