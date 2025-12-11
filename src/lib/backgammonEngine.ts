// Backgammon game engine with proper bar re-entry logic

export type Player = "player" | "ai";

export interface GameState {
  points: number[]; // Positive = player checkers, negative = AI checkers
  bar: { player: number; ai: number };
  bearOff: { player: number; ai: number };
}

export interface Move {
  from: number; // -1 = bar, 0-23 = point, 24 = bear off
  to: number;   // -2 = player bear off, 25 = ai bear off, 0-23 = point
  dieValue: number;
}

// Initial backgammon setup
export const getInitialBoard = (): number[] => {
  const points = Array(24).fill(0);
  // Player pieces (positive) - moves from 24->1 (high to low index)
  points[23] = 2;  // Point 24
  points[12] = 5;  // Point 13
  points[7] = 3;   // Point 8
  points[5] = 5;   // Point 6
  // AI pieces (negative) - moves from 1->24 (low to high index)
  points[0] = -2;  // Point 1
  points[11] = -5; // Point 12
  points[16] = -3; // Point 17
  points[18] = -5; // Point 19
  return points;
};

// Check if a player can bear off (all checkers in home board)
export const canBearOff = (state: GameState, player: Player): boolean => {
  if (player === "player") {
    if (state.bar.player > 0) return false;
    // Player home board is points 0-5 (indices 0-5)
    for (let i = 6; i < 24; i++) {
      if (state.points[i] > 0) return false;
    }
    return true;
  } else {
    if (state.bar.ai > 0) return false;
    // AI home board is points 19-24 (indices 18-23)
    for (let i = 0; i < 18; i++) {
      if (state.points[i] < 0) return false;
    }
    return true;
  }
};

// Check if a point is blocked for a player (has 2+ opponent checkers)
export const isPointBlocked = (state: GameState, pointIndex: number, player: Player): boolean => {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = state.points[pointIndex];
  if (player === "player") {
    return value <= -2; // 2 or more AI checkers
  } else {
    return value >= 2; // 2 or more player checkers
  }
};

// Check if a point can be landed on (empty, own checkers, or single opponent = blot)
export const canLandOn = (state: GameState, pointIndex: number, player: Player): boolean => {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = state.points[pointIndex];
  if (player === "player") {
    // Player can land if: empty (0), own checkers (>0), or single AI checker (-1)
    return value >= -1;
  } else {
    // AI can land if: empty (0), own checkers (<0), or single player checker (1)
    return value <= 1;
  }
};

// Get legal moves from the bar only
export const getLegalMovesFromBar = (state: GameState, moves: number[], player: Player): Move[] => {
  const legalMoves: Move[] = [];
  const barCount = player === "player" ? state.bar.player : state.bar.ai;
  
  if (barCount === 0) return legalMoves;
  
  // Use a set to track which die values we've already added moves for
  // This prevents duplicates when dice are the same
  const usedDice = new Set<number>();
  
  for (const die of moves) {
    // Skip if we already have a move for this die value at this target
    // (for doubles, we want multiple entries but not duplicates for same die)
    let targetIndex: number;
    
    if (player === "player") {
      // Player enters from opponent's home board (points 19-24 = indices 18-23)
      // Die value determines entry point: die 1 = index 23, die 6 = index 18
      targetIndex = 24 - die; // die 1 -> 23, die 6 -> 18
    } else {
      // AI enters from player's home board (points 1-6 = indices 0-5)
      // Die value determines entry point: die 1 = index 0, die 6 = index 5
      targetIndex = die - 1; // die 1 -> 0, die 6 -> 5
    }
    
    // Check if target is valid (not blocked by 2+ opponent checkers)
    if (canLandOn(state, targetIndex, player)) {
      legalMoves.push({ from: -1, to: targetIndex, dieValue: die });
    }
  }
  
  return legalMoves;
};

// Get legal moves from a specific board point
export const getLegalMovesFromPoint = (
  state: GameState, 
  fromIndex: number, 
  moves: number[], 
  player: Player
): Move[] => {
  const legalMoves: Move[] = [];
  
  // Check if the point has the player's checkers
  const value = state.points[fromIndex];
  if (player === "player" && value <= 0) return legalMoves;
  if (player === "ai" && value >= 0) return legalMoves;
  
  for (const die of moves) {
    let targetIndex: number;
    
    if (player === "player") {
      targetIndex = fromIndex - die; // Player moves toward index 0
    } else {
      targetIndex = fromIndex + die; // AI moves toward index 23
    }
    
    // Handle bearing off
    if (player === "player" && targetIndex < 0) {
      if (canBearOff(state, "player")) {
        // Exact bear off (targetIndex === -1) OR
        // Bearing off with larger die if this is the furthest checker
        const furthestCheckerIndex = Math.max(
          ...state.points.map((p, i) => (p > 0 ? i : -1))
        );
        if (targetIndex === -1 || fromIndex === furthestCheckerIndex) {
          legalMoves.push({ from: fromIndex, to: -2, dieValue: die });
        }
      }
      continue;
    }
    
    if (player === "ai" && targetIndex > 23) {
      if (canBearOff(state, "ai")) {
        // Exact bear off (targetIndex === 24) OR
        // Bearing off with larger die if this is the furthest checker
        const furthestCheckerIndex = Math.min(
          ...state.points.map((p, i) => (p < 0 ? i : 99))
        );
        if (targetIndex === 24 || fromIndex === furthestCheckerIndex) {
          legalMoves.push({ from: fromIndex, to: 25, dieValue: die });
        }
      }
      continue;
    }
    
    // Regular move - check if target is valid
    if (targetIndex >= 0 && targetIndex <= 23 && canLandOn(state, targetIndex, player)) {
      legalMoves.push({ from: fromIndex, to: targetIndex, dieValue: die });
    }
  }
  
  return legalMoves;
};

// Get all legal moves for a player
// IMPORTANT: If player has checkers on bar, ONLY bar moves are returned
export const getAllLegalMoves = (state: GameState, moves: number[], player: Player): Move[] => {
  const barCount = player === "player" ? state.bar.player : state.bar.ai;
  
  // If player has checkers on bar, they MUST move from bar first
  if (barCount > 0) {
    return getLegalMovesFromBar(state, moves, player);
  }
  
  // Otherwise, collect all legal moves from board points
  const allMoves: Move[] = [];
  for (let i = 0; i < 24; i++) {
    allMoves.push(...getLegalMovesFromPoint(state, i, moves, player));
  }
  
  return allMoves;
};

// Check if player has any legal moves
export const hasLegalMoves = (state: GameState, moves: number[], player: Player): boolean => {
  return getAllLegalMoves(state, moves, player).length > 0;
};

// Apply a move and return new state
export const applyMove = (state: GameState, move: Move, player: Player): GameState => {
  const newState: GameState = {
    points: [...state.points],
    bar: { ...state.bar },
    bearOff: { ...state.bearOff },
  };
  
  // Remove checker from source
  if (move.from === -1) {
    // Moving from bar
    if (player === "player") newState.bar.player--;
    else newState.bar.ai--;
  } else {
    // Moving from board point
    if (player === "player") newState.points[move.from]--;
    else newState.points[move.from]++;
  }
  
  // Place checker at destination
  if (move.to === -2 || move.to === 25) {
    // Bearing off
    if (player === "player") newState.bearOff.player++;
    else newState.bearOff.ai++;
  } else {
    // Landing on board point - check for hit
    if (player === "player" && newState.points[move.to] === -1) {
      // Hit AI's blot
      newState.points[move.to] = 0;
      newState.bar.ai++;
    } else if (player === "ai" && newState.points[move.to] === 1) {
      // Hit player's blot
      newState.points[move.to] = 0;
      newState.bar.player++;
    }
    
    // Add checker to destination
    if (player === "player") newState.points[move.to]++;
    else newState.points[move.to]--;
  }
  
  return newState;
};

// Remove a used die from remaining moves
export const consumeDie = (remainingMoves: number[], dieValue: number): number[] => {
  const newRemaining = [...remainingMoves];
  const idx = newRemaining.indexOf(dieValue);
  if (idx > -1) newRemaining.splice(idx, 1);
  return newRemaining;
};

// Check if game is won
export const checkWinner = (state: GameState): Player | null => {
  if (state.bearOff.player === 15) return "player";
  if (state.bearOff.ai === 15) return "ai";
  return null;
};
