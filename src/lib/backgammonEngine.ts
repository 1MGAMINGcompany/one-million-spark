// Backgammon game engine with FULL production rules
// Deterministic, server-style validation

export type Player = "player" | "ai";

export interface GameState {
  points: number[]; // Positive = player checkers, negative = AI checkers (24 points, indices 0-23)
  bar: { player: number; ai: number };
  bearOff: { player: number; ai: number };
}

export interface Move {
  from: number; // -1 = bar, 0-23 = point
  to: number;   // -2 = player bear off, 25 = ai bear off, 0-23 = point
  dieValue: number;
}

export type GameResultType = "single" | "gammon" | "backgammon";

export interface GameResult {
  winner: Player | null;
  resultType: GameResultType | null;
  multiplier: number; // 1 for single, 2 for gammon, 3 for backgammon
}

// ============= BOARD SETUP (STANDARD) =============
// Player (positive): moves from point 24 → 1 (high index to low)
//   Home board = points 1-6 (indices 0-5)
// AI (negative): moves from point 1 → 24 (low index to high)
//   Home board = points 19-24 (indices 18-23)

export const getInitialBoard = (): number[] => {
  const points = Array(24).fill(0);
  // Player pieces (positive) - standard setup
  // 2 on point 24 (index 23)
  points[23] = 2;
  // 5 on point 13 (index 12)
  points[12] = 5;
  // 3 on point 8 (index 7)
  points[7] = 3;
  // 5 on point 6 (index 5)
  points[5] = 5;
  
  // AI pieces (negative) - standard setup (mirror)
  // 2 on point 1 (index 0)
  points[0] = -2;
  // 5 on point 12 (index 11)
  points[11] = -5;
  // 3 on point 17 (index 16)
  points[16] = -3;
  // 5 on point 19 (index 18)
  points[18] = -5;
  
  return points;
};

// ============= VALIDATION HELPERS =============

// Check if a player can bear off (all 15 checkers in home board)
export const canBearOff = (state: GameState, player: Player): boolean => {
  if (player === "player") {
    // Player must have no checkers on bar
    if (state.bar.player > 0) return false;
    // Player home board is indices 0-5 (points 1-6)
    // No checkers allowed outside home (indices 6-23)
    for (let i = 6; i < 24; i++) {
      if (state.points[i] > 0) return false;
    }
    return true;
  } else {
    // AI must have no checkers on bar
    if (state.bar.ai > 0) return false;
    // AI home board is indices 18-23 (points 19-24)
    // No checkers allowed outside home (indices 0-17)
    for (let i = 0; i < 18; i++) {
      if (state.points[i] < 0) return false;
    }
    return true;
  }
};

// Check if a point is blocked (2+ opponent checkers)
export const isPointBlocked = (state: GameState, pointIndex: number, player: Player): boolean => {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = state.points[pointIndex];
  if (player === "player") {
    return value <= -2; // 2+ AI checkers = blocked
  } else {
    return value >= 2; // 2+ player checkers = blocked
  }
};

// Check if a point can be landed on (empty, own, or single opponent = blot)
export const canLandOn = (state: GameState, pointIndex: number, player: Player): boolean => {
  if (pointIndex < 0 || pointIndex > 23) return false;
  const value = state.points[pointIndex];
  if (player === "player") {
    // Can land if: empty (0), own checkers (>0), or single AI (-1)
    return value >= -1;
  } else {
    // Can land if: empty (0), own checkers (<0), or single player (1)
    return value <= 1;
  }
};

// Get furthest checker in home board for bear-off overshoot rule
const getFurthestCheckerInHome = (state: GameState, player: Player): number => {
  if (player === "player") {
    // Player home is indices 0-5, furthest from bear-off is highest index
    for (let i = 5; i >= 0; i--) {
      if (state.points[i] > 0) return i;
    }
    return -1;
  } else {
    // AI home is indices 18-23, furthest from bear-off is lowest index
    for (let i = 18; i <= 23; i++) {
      if (state.points[i] < 0) return i;
    }
    return -1;
  }
};

// ============= BAR ENTRY =============
// Player enters from AI's home board (points 19-24 = indices 18-23)
//   die=1 → index 23 (point 24), die=6 → index 18 (point 19)
// AI enters from Player's home board (points 1-6 = indices 0-5)
//   die=1 → index 0 (point 1), die=6 → index 5 (point 6)

export const getLegalMovesFromBar = (state: GameState, moves: number[], player: Player): Move[] => {
  const legalMoves: Move[] = [];
  const barCount = player === "player" ? state.bar.player : state.bar.ai;
  
  if (barCount === 0) return legalMoves;
  
  // Track unique moves to avoid duplicates on doubles
  const addedMoves = new Set<string>();
  
  for (const die of moves) {
    let targetIndex: number;
    
    if (player === "player") {
      // Player enters AI's home: die 1 → index 23, die 6 → index 18
      targetIndex = 24 - die;
    } else {
      // AI enters Player's home: die 1 → index 0, die 6 → index 5
      targetIndex = die - 1;
    }
    
    const moveKey = `${targetIndex}-${die}`;
    if (addedMoves.has(moveKey)) continue;
    
    if (canLandOn(state, targetIndex, player)) {
      legalMoves.push({ from: -1, to: targetIndex, dieValue: die });
      addedMoves.add(moveKey);
    }
  }
  
  return legalMoves;
};

// ============= BOARD MOVES (including bear-off) =============

export const getLegalMovesFromPoint = (
  state: GameState, 
  fromIndex: number, 
  moves: number[], 
  player: Player
): Move[] => {
  const legalMoves: Move[] = [];
  
  // Validate source has player's checkers
  const value = state.points[fromIndex];
  if (player === "player" && value <= 0) return legalMoves;
  if (player === "ai" && value >= 0) return legalMoves;
  
  const addedMoves = new Set<string>();
  
  for (const die of moves) {
    let targetIndex: number;
    
    if (player === "player") {
      targetIndex = fromIndex - die; // Player moves toward index 0 (and off at -1)
    } else {
      targetIndex = fromIndex + die; // AI moves toward index 23 (and off at 24)
    }
    
    const moveKey = `${fromIndex}-${targetIndex}-${die}`;
    if (addedMoves.has(moveKey)) continue;
    
    // ====== BEAR OFF LOGIC ======
    if (player === "player" && targetIndex < 0) {
      if (canBearOff(state, "player")) {
        // Exact bear-off: targetIndex === -1 means die exactly matched
        if (targetIndex === -1) {
          legalMoves.push({ from: fromIndex, to: -2, dieValue: die });
          addedMoves.add(moveKey);
        } else {
          // Overshoot rule: can bear off with larger die if this is furthest checker
          const furthest = getFurthestCheckerInHome(state, "player");
          if (fromIndex === furthest) {
            legalMoves.push({ from: fromIndex, to: -2, dieValue: die });
            addedMoves.add(moveKey);
          }
        }
      }
      continue;
    }
    
    if (player === "ai" && targetIndex > 23) {
      if (canBearOff(state, "ai")) {
        // Exact bear-off: targetIndex === 24 means die exactly matched
        if (targetIndex === 24) {
          legalMoves.push({ from: fromIndex, to: 25, dieValue: die });
          addedMoves.add(moveKey);
        } else {
          // Overshoot rule: can bear off with larger die if this is furthest checker
          const furthest = getFurthestCheckerInHome(state, "ai");
          if (fromIndex === furthest) {
            legalMoves.push({ from: fromIndex, to: 25, dieValue: die });
            addedMoves.add(moveKey);
          }
        }
      }
      continue;
    }
    
    // ====== REGULAR MOVE ======
    if (targetIndex >= 0 && targetIndex <= 23 && canLandOn(state, targetIndex, player)) {
      legalMoves.push({ from: fromIndex, to: targetIndex, dieValue: die });
      addedMoves.add(moveKey);
    }
  }
  
  return legalMoves;
};

// ============= ALL LEGAL MOVES =============
// CRITICAL: If player has checkers on bar, ONLY bar moves are legal

export const getAllLegalMoves = (state: GameState, moves: number[], player: Player): Move[] => {
  const barCount = player === "player" ? state.bar.player : state.bar.ai;
  
  // Bar rule: MUST move from bar first if any checkers there
  if (barCount > 0) {
    return getLegalMovesFromBar(state, moves, player);
  }
  
  // Normal moves from all board points
  const allMoves: Move[] = [];
  for (let i = 0; i < 24; i++) {
    allMoves.push(...getLegalMovesFromPoint(state, i, moves, player));
  }
  
  return allMoves;
};

export const hasLegalMoves = (state: GameState, moves: number[], player: Player): boolean => {
  return getAllLegalMoves(state, moves, player).length > 0;
};

// ============= MOVE APPLICATION =============

export const applyMove = (state: GameState, move: Move, player: Player): GameState => {
  // IMMUTABLE update
  const newState: GameState = {
    points: [...state.points],
    bar: { ...state.bar },
    bearOff: { ...state.bearOff },
  };
  
  // Remove checker from source
  if (move.from === -1) {
    // From bar
    if (player === "player") newState.bar.player--;
    else newState.bar.ai--;
  } else {
    // From board point
    if (player === "player") newState.points[move.from]--;
    else newState.points[move.from]++;
  }
  
  // Place checker at destination
  if (move.to === -2 || move.to === 25) {
    // Bear off
    if (player === "player") newState.bearOff.player++;
    else newState.bearOff.ai++;
  } else {
    // Board point - check for HIT (blot capture)
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

// Remove used die from remaining moves
export const consumeDie = (remainingMoves: number[], dieValue: number): number[] => {
  const newRemaining = [...remainingMoves];
  const idx = newRemaining.indexOf(dieValue);
  if (idx > -1) newRemaining.splice(idx, 1);
  return newRemaining;
};

// ============= WINNING CONDITIONS & SCORING =============

// Check if game is won and return basic winner
export const checkWinner = (state: GameState): Player | null => {
  if (state.bearOff.player === 15) return "player";
  if (state.bearOff.ai === 15) return "ai";
  return null;
};

// Get full game result with scoring type
export const getGameResult = (state: GameState): GameResult => {
  const winner = checkWinner(state);
  
  if (!winner) {
    return { winner: null, resultType: null, multiplier: 1 };
  }
  
  const loser: Player = winner === "player" ? "ai" : "player";
  const loserBorneOff = winner === "player" ? state.bearOff.ai : state.bearOff.player;
  const loserBar = winner === "player" ? state.bar.ai : state.bar.player;
  
  // Check if loser has any checkers in winner's home board
  let loserInWinnerHome = false;
  if (winner === "player") {
    // Player's home is indices 0-5; check if AI has any there
    for (let i = 0; i <= 5; i++) {
      if (state.points[i] < 0) {
        loserInWinnerHome = true;
        break;
      }
    }
  } else {
    // AI's home is indices 18-23; check if player has any there
    for (let i = 18; i <= 23; i++) {
      if (state.points[i] > 0) {
        loserInWinnerHome = true;
        break;
      }
    }
  }
  
  // Determine result type:
  // - SINGLE: Loser has borne off at least 1 checker
  // - GAMMON (2x): Loser has borne off 0 checkers
  // - BACKGAMMON (3x): Loser has borne off 0 AND has checker on bar or in winner's home
  
  if (loserBorneOff > 0) {
    return { winner, resultType: "single", multiplier: 1 };
  }
  
  if (loserBar > 0 || loserInWinnerHome) {
    return { winner, resultType: "backgammon", multiplier: 3 };
  }
  
  return { winner, resultType: "gammon", multiplier: 2 };
};

// ============= MOVE VALIDATION (for production/server-style) =============

export const validateMove = (
  state: GameState,
  move: Move,
  remainingDice: number[],
  player: Player
): { valid: boolean; reason?: string } => {
  // Check die value is available
  if (!remainingDice.includes(move.dieValue)) {
    return { valid: false, reason: "Die value not available" };
  }
  
  // Check bar rule
  const barCount = player === "player" ? state.bar.player : state.bar.ai;
  if (barCount > 0 && move.from !== -1) {
    return { valid: false, reason: "Must move from bar first" };
  }
  
  // Check source has checker
  if (move.from === -1) {
    if (barCount === 0) {
      return { valid: false, reason: "No checkers on bar" };
    }
  } else {
    const value = state.points[move.from];
    if (player === "player" && value <= 0) {
      return { valid: false, reason: "No player checker at source" };
    }
    if (player === "ai" && value >= 0) {
      return { valid: false, reason: "No AI checker at source" };
    }
  }
  
  // Calculate expected target
  let expectedTarget: number;
  if (move.from === -1) {
    // Bar entry
    if (player === "player") {
      expectedTarget = 24 - move.dieValue;
    } else {
      expectedTarget = move.dieValue - 1;
    }
  } else {
    if (player === "player") {
      expectedTarget = move.from - move.dieValue;
    } else {
      expectedTarget = move.from + move.dieValue;
    }
  }
  
  // Handle bear-off
  if (move.to === -2 || move.to === 25) {
    if (!canBearOff(state, player)) {
      return { valid: false, reason: "Cannot bear off yet" };
    }
    
    if (player === "player") {
      if (expectedTarget === -1) {
        return { valid: true };
      }
      if (expectedTarget < -1) {
        const furthest = getFurthestCheckerInHome(state, "player");
        if (move.from !== furthest) {
          return { valid: false, reason: "Must bear off furthest checker with overshoot" };
        }
      }
    } else {
      if (expectedTarget === 24) {
        return { valid: true };
      }
      if (expectedTarget > 24) {
        const furthest = getFurthestCheckerInHome(state, "ai");
        if (move.from !== furthest) {
          return { valid: false, reason: "Must bear off furthest checker with overshoot" };
        }
      }
    }
    return { valid: true };
  }
  
  // Regular move - check target matches
  if (move.to !== expectedTarget) {
    return { valid: false, reason: "Target does not match die value" };
  }
  
  // Check can land on target
  if (!canLandOn(state, move.to, player)) {
    return { valid: false, reason: "Cannot land on blocked point" };
  }
  
  return { valid: true };
};
