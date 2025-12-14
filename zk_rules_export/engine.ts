/**
 * ZK-Compatible Game Engine
 * Pure deterministic functions with no randomness, no Date.now, no floating point
 * All state is immutable and serializable
 * 
 * COMMIT-REVEAL SEED DESIGN:
 * Games with randomness (Backgammon, Ludo, Dominos) use a seed stored in state.
 * Dice rolls and shuffles consume the seed deterministically via LCG.
 * For real-money ZK verification:
 * 1. Both players commit to a secret value before game start: commit_A, commit_B
 * 2. After both commits are on-chain, both reveal their secrets: reveal_A, reveal_B
 * 3. Final seed = hash(reveal_A || reveal_B) - neither player can predict or manipulate
 * 4. All randomness (dice, shuffles) derived from this seed via deterministic LCG
 */

// ============================================================================
// TYPES
// ============================================================================

export type GameId = 1 | 2 | 3 | 4 | 5; // Chess, Dominos, Backgammon, Checkers, Ludo

export interface GameResult {
  ended: boolean;
  winnerIndex: number | null; // null = draw or ongoing, -1 = draw
}

// Chess Types
export interface ChessPiece {
  type: 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
  player: 0 | 1;
}

export interface ChessState {
  board: (ChessPiece | null)[][]; // 8x8
  turn: 0 | 1;
  castling: { 0: { k: boolean; q: boolean }; 1: { k: boolean; q: boolean } };
  enPassant: [number, number] | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  kings: { 0: [number, number]; 1: [number, number] };
}

export interface ChessMove {
  from: [number, number];
  to: [number, number];
  promotion?: 'q' | 'r' | 'b' | 'n';
}

// Checkers Types
export interface CheckersPiece {
  player: 0 | 1;
  isKing: boolean;
}

export interface CheckersState {
  board: (CheckersPiece | null)[][]; // 8x8
  turn: 0 | 1;
  mustContinueFrom: [number, number] | null; // Multi-jump
  moveCount: number;
}

export interface CheckersMove {
  from: [number, number];
  to: [number, number];
  captures: [number, number][]; // Positions of captured pieces
}

// Backgammon Types
export interface BackgammonState {
  points: number[][]; // 24 points, each has array of player indices
  bar: { 0: number; 1: number };
  bearOff: { 0: number; 1: number };
  turn: 0 | 1;
  dice: [number, number] | null;
  remainingDice: number[];
  moveCount: number;
  seed: number; // Deterministic seed for dice rolls
}

export interface BackgammonMove {
  from: number | 'bar';
  to: number | 'off';
  die: number;
}

// Ludo Types
export interface LudoToken {
  position: number; // -1 = base, 0-51 = main track, 52-57 = home column
  inHome: boolean;
}

export interface LudoState {
  tokens: LudoToken[][]; // [playerIndex][tokenIndex]
  turn: number;
  dice: number | null;
  consecutiveSixes: number;
  playerCount: number;
  eliminated: boolean[];
  moveCount: number;
  seed: number; // Deterministic seed for dice rolls
}

export interface LudoMove {
  tokenIndex: number;
  steps: number;
}

// Dominos Types
export type DominoTile = [number, number];

export interface DominosState {
  hands: DominoTile[][]; // [playerIndex][tileIndex]
  board: { tile: DominoTile; left: number; right: number }[];
  boneyard: DominoTile[];
  turn: number;
  leftEnd: number;
  rightEnd: number;
  passed: boolean[];
  playerCount: number;
  moveCount: number;
  seed: number; // Deterministic seed for draws
}

// Dominos move types: PLAY (tileIndex >= 0), DRAW (tileIndex = -1), PASS (tileIndex = -2)
export interface DominosMove {
  tileIndex: number; // -2 = PASS, -1 = DRAW, >= 0 = play tile
  end: 'left' | 'right';
  flip: boolean;
}

// Union types
export type GameState = ChessState | CheckersState | BackgammonState | LudoState | DominosState;
export type GameMove = ChessMove | CheckersMove | BackgammonMove | LudoMove | DominosMove;

// ============================================================================
// DETERMINISTIC RANDOM (LCG with seed)
// ============================================================================

function lcgNext(seed: number): [number, number] {
  // Linear Congruential Generator (integer-only, no floating point)
  // a = 1664525, c = 1013904223, m = 2^31
  const a = 1664525;
  const c = 1013904223;
  const m = 2147483648; // 2^31
  // Use bitwise operations to stay in 32-bit integer range
  const next = ((((a * (seed & 0xFFFF)) + (a * (seed >>> 16) << 16)) >>> 0) + c) >>> 0;
  const result = next % m;
  return [result, result];
}

function shuffleWithSeed<T>(arr: T[], seed: number): [T[], number] {
  const result = [...arr];
  let currentSeed = seed;
  for (let i = result.length - 1; i > 0; i--) {
    const [nextSeed, rand] = lcgNext(currentSeed);
    currentSeed = nextSeed;
    const j = rand % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return [result, currentSeed];
}

function rollDiceWithSeed(seed: number, count: number): [number[], number] {
  const dice: number[] = [];
  let currentSeed = seed;
  for (let i = 0; i < count; i++) {
    const [nextSeed, rand] = lcgNext(currentSeed);
    currentSeed = nextSeed;
    dice.push((rand % 6) + 1);
  }
  return [dice, currentSeed];
}

// ============================================================================
// CHESS ENGINE
// ============================================================================

function initChess(): ChessState {
  const board: (ChessPiece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // Place pieces
  const backRow: ChessPiece['type'][] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  for (let x = 0; x < 8; x++) {
    board[x][0] = { type: backRow[x], player: 0 };
    board[x][1] = { type: 'p', player: 0 };
    board[x][6] = { type: 'p', player: 1 };
    board[x][7] = { type: backRow[x], player: 1 };
  }
  
  return {
    board,
    turn: 0,
    castling: { 0: { k: true, q: true }, 1: { k: true, q: true } },
    enPassant: null,
    halfMoveClock: 0,
    fullMoveNumber: 1,
    kings: { 0: [4, 0], 1: [4, 7] }
  };
}

function isInBounds(x: number, y: number): boolean {
  return x >= 0 && x < 8 && y >= 0 && y < 8;
}

function getPieceAt(state: ChessState, x: number, y: number): ChessPiece | null {
  if (!isInBounds(x, y)) return null;
  return state.board[x][y];
}

function isSquareAttacked(state: ChessState, x: number, y: number, byPlayer: 0 | 1): boolean {
  // Check all opponent pieces for attacks on this square
  for (let px = 0; px < 8; px++) {
    for (let py = 0; py < 8; py++) {
      const piece = state.board[px][py];
      if (!piece || piece.player !== byPlayer) continue;
      
      const dx = x - px;
      const dy = y - py;
      const adx = dx < 0 ? -dx : dx; // Math.abs without floating point
      const ady = dy < 0 ? -dy : dy;
      
      switch (piece.type) {
        case 'p': {
          const dir = byPlayer === 0 ? 1 : -1;
          if (dy === dir && adx === 1) return true;
          break;
        }
        case 'n':
          if ((adx === 2 && ady === 1) || (adx === 1 && ady === 2)) return true;
          break;
        case 'b':
          if (adx === ady && adx > 0) {
            const stepX = dx > 0 ? 1 : -1;
            const stepY = dy > 0 ? 1 : -1;
            let blocked = false;
            for (let i = 1; i < adx; i++) {
              if (state.board[px + i * stepX][py + i * stepY]) blocked = true;
            }
            if (!blocked) return true;
          }
          break;
        case 'r':
          if ((dx === 0 || dy === 0) && (adx + ady > 0)) {
            const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
            const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
            let blocked = false;
            const steps = adx > ady ? adx : ady;
            for (let i = 1; i < steps; i++) {
              if (state.board[px + i * stepX][py + i * stepY]) blocked = true;
            }
            if (!blocked) return true;
          }
          break;
        case 'q':
          if ((dx === 0 || dy === 0 || adx === ady) && (adx + ady > 0)) {
            const stepX = dx === 0 ? 0 : dx > 0 ? 1 : -1;
            const stepY = dy === 0 ? 0 : dy > 0 ? 1 : -1;
            let blocked = false;
            const steps = adx > ady ? adx : ady;
            for (let i = 1; i < steps; i++) {
              if (state.board[px + i * stepX][py + i * stepY]) blocked = true;
            }
            if (!blocked) return true;
          }
          break;
        case 'k':
          if (adx <= 1 && ady <= 1 && (adx + ady > 0)) return true;
          break;
      }
    }
  }
  return false;
}

function isKingInCheck(state: ChessState, player: 0 | 1): boolean {
  const [kx, ky] = state.kings[player];
  const opponent = player === 0 ? 1 : 0;
  return isSquareAttacked(state, kx, ky, opponent);
}

function generateChessMoves(state: ChessState): ChessMove[] {
  const moves: ChessMove[] = [];
  const player = state.turn;
  const dir = player === 0 ? 1 : -1;
  
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const piece = state.board[x][y];
      if (!piece || piece.player !== player) continue;
      
      const addMove = (tx: number, ty: number, promo?: ChessMove['promotion']) => {
        if (!isInBounds(tx, ty)) return;
        const target = state.board[tx][ty];
        if (target && target.player === player) return;
        moves.push({ from: [x, y], to: [tx, ty], promotion: promo });
      };
      
      switch (piece.type) {
        case 'p': {
          const promoteY = player === 0 ? 7 : 0;
          const startY = player === 0 ? 1 : 6;
          
          // Forward
          if (!state.board[x][y + dir]) {
            if (y + dir === promoteY) {
              ['q', 'r', 'b', 'n'].forEach(p => addMove(x, y + dir, p as ChessMove['promotion']));
            } else {
              addMove(x, y + dir);
            }
            // Double move
            if (y === startY && !state.board[x][y + 2 * dir]) {
              addMove(x, y + 2 * dir);
            }
          }
          // Captures
          for (const ddx of [-1, 1]) {
            const tx = x + ddx;
            const ty = y + dir;
            if (!isInBounds(tx, ty)) continue;
            const target = state.board[tx][ty];
            const isEnPassant = state.enPassant && state.enPassant[0] === tx && state.enPassant[1] === ty;
            if ((target && target.player !== player) || isEnPassant) {
              if (ty === promoteY) {
                ['q', 'r', 'b', 'n'].forEach(p => addMove(tx, ty, p as ChessMove['promotion']));
              } else {
                addMove(tx, ty);
              }
            }
          }
          break;
        }
        case 'n':
          for (const [ddx, ddy] of [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]]) {
            addMove(x + ddx, y + ddy);
          }
          break;
        case 'b':
          for (const [ddx, ddy] of [[1,1],[1,-1],[-1,1],[-1,-1]]) {
            for (let i = 1; i < 8; i++) {
              const tx = x + i * ddx;
              const ty = y + i * ddy;
              if (!isInBounds(tx, ty)) break;
              addMove(tx, ty);
              if (state.board[tx][ty]) break;
            }
          }
          break;
        case 'r':
          for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            for (let i = 1; i < 8; i++) {
              const tx = x + i * ddx;
              const ty = y + i * ddy;
              if (!isInBounds(tx, ty)) break;
              addMove(tx, ty);
              if (state.board[tx][ty]) break;
            }
          }
          break;
        case 'q':
          for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
            for (let i = 1; i < 8; i++) {
              const tx = x + i * ddx;
              const ty = y + i * ddy;
              if (!isInBounds(tx, ty)) break;
              addMove(tx, ty);
              if (state.board[tx][ty]) break;
            }
          }
          break;
        case 'k':
          for (const [ddx, ddy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
            addMove(x + ddx, y + ddy);
          }
          // Castling
          const row = player === 0 ? 0 : 7;
          const opponent = player === 0 ? 1 : 0;
          if (x === 4 && y === row && !isKingInCheck(state, player)) {
            if (state.castling[player].k &&
                !state.board[5][row] && !state.board[6][row] &&
                !isSquareAttacked(state, 5, row, opponent) &&
                !isSquareAttacked(state, 6, row, opponent)) {
              moves.push({ from: [4, row], to: [6, row] });
            }
            if (state.castling[player].q &&
                !state.board[3][row] && !state.board[2][row] && !state.board[1][row] &&
                !isSquareAttacked(state, 3, row, opponent) &&
                !isSquareAttacked(state, 2, row, opponent)) {
              moves.push({ from: [4, row], to: [2, row] });
            }
          }
          break;
      }
    }
  }
  
  // Filter out moves that leave king in check
  return moves.filter(move => {
    const newState = applyChessMove(state, move);
    return !isKingInCheck(newState, player);
  });
}

function applyChessMove(state: ChessState, move: ChessMove): ChessState {
  const newBoard = state.board.map(row => [...row]);
  const piece = newBoard[move.from[0]][move.from[1]]!;
  const player = piece.player;
  const opponent: 0 | 1 = player === 0 ? 1 : 0;
  
  // Handle en passant capture
  const isEnPassant = piece.type === 'p' && 
    state.enPassant && 
    move.to[0] === state.enPassant[0] && 
    move.to[1] === state.enPassant[1];
  
  if (isEnPassant) {
    const capturedY = player === 0 ? move.to[1] - 1 : move.to[1] + 1;
    newBoard[move.to[0]][capturedY] = null;
  }
  
  // Handle castling
  const isCastling = piece.type === 'k' && (move.to[0] - move.from[0] === 2 || move.to[0] - move.from[0] === -2);
  if (isCastling) {
    const row = move.from[1];
    if (move.to[0] === 6) { // Kingside
      newBoard[5][row] = newBoard[7][row];
      newBoard[7][row] = null;
    } else { // Queenside
      newBoard[3][row] = newBoard[0][row];
      newBoard[0][row] = null;
    }
  }
  
  // Move piece
  newBoard[move.from[0]][move.from[1]] = null;
  newBoard[move.to[0]][move.to[1]] = move.promotion 
    ? { type: move.promotion, player }
    : piece;
  
  // Update king position
  const newKings = { 0: [...state.kings[0]] as [number, number], 1: [...state.kings[1]] as [number, number] };
  if (piece.type === 'k') {
    newKings[player] = move.to;
  }
  
  // Update castling rights
  const newCastling = {
    0: { ...state.castling[0] },
    1: { ...state.castling[1] }
  };
  if (piece.type === 'k') {
    newCastling[player].k = false;
    newCastling[player].q = false;
  }
  if (piece.type === 'r') {
    if (move.from[0] === 0) newCastling[player].q = false;
    if (move.from[0] === 7) newCastling[player].k = false;
  }
  // If rook captured
  if (move.to[0] === 0 && move.to[1] === 0) newCastling[0].q = false;
  if (move.to[0] === 7 && move.to[1] === 0) newCastling[0].k = false;
  if (move.to[0] === 0 && move.to[1] === 7) newCastling[1].q = false;
  if (move.to[0] === 7 && move.to[1] === 7) newCastling[1].k = false;
  
  // En passant square
  let newEnPassant: [number, number] | null = null;
  if (piece.type === 'p' && (move.to[1] - move.from[1] === 2 || move.to[1] - move.from[1] === -2)) {
    newEnPassant = [move.to[0], (move.from[1] + move.to[1]) >> 1]; // Integer division
  }
  
  // Half move clock
  const isCapture = state.board[move.to[0]][move.to[1]] !== null || isEnPassant;
  const isPawnMove = piece.type === 'p';
  const newHalfMoveClock = (isCapture || isPawnMove) ? 0 : state.halfMoveClock + 1;
  
  return {
    board: newBoard,
    turn: opponent,
    castling: newCastling,
    enPassant: newEnPassant,
    halfMoveClock: newHalfMoveClock,
    fullMoveNumber: player === 1 ? state.fullMoveNumber + 1 : state.fullMoveNumber,
    kings: newKings
  };
}

function isChessTerminal(state: ChessState): GameResult {
  const moves = generateChessMoves(state);
  
  if (moves.length === 0) {
    if (isKingInCheck(state, state.turn)) {
      // Checkmate
      return { ended: true, winnerIndex: state.turn === 0 ? 1 : 0 };
    }
    // Stalemate
    return { ended: true, winnerIndex: -1 };
  }
  
  // Fifty move rule (100 half-moves = 50 full moves)
  if (state.halfMoveClock >= 100) {
    return { ended: true, winnerIndex: -1 };
  }
  
  // NOTE: Threefold repetition and insufficient material are NOT implemented
  // as they require position history tracking (complex for ZK).
  // Players can claim draw manually via agreement in these cases.
  
  return { ended: false, winnerIndex: null };
}

function validateChessMove(state: ChessState, move: ChessMove, playerIndex: number): boolean {
  if (state.turn !== playerIndex) return false;
  const legalMoves = generateChessMoves(state);
  return legalMoves.some(m => 
    m.from[0] === move.from[0] && m.from[1] === move.from[1] &&
    m.to[0] === move.to[0] && m.to[1] === move.to[1] &&
    m.promotion === move.promotion
  );
}

// ============================================================================
// CHECKERS ENGINE
// ============================================================================

function initCheckers(): CheckersState {
  const board: (CheckersPiece | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
  
  // Place pieces on dark squares
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) {
        board[x][y] = { player: 0, isKing: false };
      }
    }
  }
  for (let y = 5; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if ((x + y) % 2 === 1) {
        board[x][y] = { player: 1, isKing: false };
      }
    }
  }
  
  return { board, turn: 0, mustContinueFrom: null, moveCount: 0 };
}

// Helper to deep-copy checkers board (immutable)
function copyCheckersBoard(board: (CheckersPiece | null)[][]): (CheckersPiece | null)[][] {
  return board.map(row => row.map(cell => cell ? { ...cell } : null));
}

function generateCheckersMoves(state: CheckersState): CheckersMove[] {
  const moves: CheckersMove[] = [];
  const player = state.turn;
  const dir = player === 0 ? 1 : -1;
  
  // FIXED: No mutation - use immutable board copies for recursive capture search
  const findCaptures = (
    board: (CheckersPiece | null)[][],
    x: number,
    y: number,
    piece: CheckersPiece,
    captures: [number, number][],
    visited: Set<string>
  ): void => {
    const directions = piece.isKing ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,dir],[-1,dir]];
    
    for (const [ddx, ddy] of directions) {
      const mx = x + ddx;
      const my = y + ddy;
      const tx = x + 2 * ddx;
      const ty = y + 2 * ddy;
      
      if (!isInBounds(tx, ty)) continue;
      const key = `${mx},${my}`;
      if (visited.has(key)) continue;
      
      const middle = board[mx][my];
      const target = board[tx][ty];
      
      if (middle && middle.player !== player && !target) {
        const newCaptures: [number, number][] = [...captures, [mx, my]];
        const newVisited = new Set(visited);
        newVisited.add(key);
        
        // Create immutable copy of board with move applied
        const newBoard = copyCheckersBoard(board);
        newBoard[x][y] = null;
        newBoard[mx][my] = null;
        newBoard[tx][ty] = piece;
        
        // Add this capture as a valid move
        moves.push({ from: [captures.length === 0 ? x : (moves[moves.length-1]?.from[0] ?? x), captures.length === 0 ? y : (moves[moves.length-1]?.from[1] ?? y)], to: [tx, ty], captures: newCaptures });
        
        // Continue searching for more captures
        findCaptures(newBoard, tx, ty, piece, newCaptures, newVisited);
      }
    }
  };
  
  const addCaptures = (x: number, y: number, piece: CheckersPiece): void => {
    findCaptures(state.board, x, y, piece, [], new Set());
  };
  
  const addSimpleMoves = (x: number, y: number, piece: CheckersPiece): void => {
    const directions = piece.isKing ? [[1,1],[1,-1],[-1,1],[-1,-1]] : [[1,dir],[-1,dir]];
    
    for (const [ddx, ddy] of directions) {
      const tx = x + ddx;
      const ty = y + ddy;
      if (isInBounds(tx, ty) && !state.board[tx][ty]) {
        moves.push({ from: [x, y], to: [tx, ty], captures: [] });
      }
    }
  };
  
  // If must continue multi-jump
  if (state.mustContinueFrom) {
    const [x, y] = state.mustContinueFrom;
    const piece = state.board[x][y];
    if (piece) {
      addCaptures(x, y, piece);
    }
    return moves;
  }
  
  // Generate all captures first
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const piece = state.board[x][y];
      if (piece && piece.player === player) {
        addCaptures(x, y, piece);
      }
    }
  }
  
  // If captures available, must capture (mandatory capture rule)
  if (moves.length > 0) return moves;
  
  // Generate simple moves
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const piece = state.board[x][y];
      if (piece && piece.player === player) {
        addSimpleMoves(x, y, piece);
      }
    }
  }
  
  return moves;
}

function applyCheckersMove(state: CheckersState, move: CheckersMove): CheckersState {
  const newBoard = copyCheckersBoard(state.board);
  const piece = newBoard[move.from[0]][move.from[1]]!;
  
  // Remove captured pieces
  for (const [cx, cy] of move.captures) {
    newBoard[cx][cy] = null;
  }
  
  // Move piece
  newBoard[move.from[0]][move.from[1]] = null;
  
  // Check for promotion
  const promoteRow = piece.player === 0 ? 7 : 0;
  const isKing = piece.isKing || move.to[1] === promoteRow;
  newBoard[move.to[0]][move.to[1]] = { player: piece.player, isKing };
  
  // Check for multi-jump continuation
  let mustContinueFrom: [number, number] | null = null;
  if (move.captures.length > 0) {
    const tempState: CheckersState = {
      board: newBoard,
      turn: state.turn,
      mustContinueFrom: move.to,
      moveCount: state.moveCount
    };
    const continueMoves = generateCheckersMoves(tempState);
    if (continueMoves.some(m => m.captures.length > 0)) {
      mustContinueFrom = move.to;
    }
  }
  
  return {
    board: newBoard,
    turn: mustContinueFrom ? state.turn : (state.turn === 0 ? 1 : 0),
    mustContinueFrom,
    moveCount: state.moveCount + 1
  };
}

function isCheckersTerminal(state: CheckersState): GameResult {
  // FIXED: Count pieces correctly first (before checking moves)
  let p0 = 0;
  let p1 = 0;
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 8; y++) {
      const piece = state.board[x][y];
      if (piece) {
        if (piece.player === 0) p0++;
        else p1++;
      }
    }
  }
  
  // If a player has no pieces, they lose
  if (p0 === 0) return { ended: true, winnerIndex: 1 };
  if (p1 === 0) return { ended: true, winnerIndex: 0 };
  
  // If current player has no moves, they lose
  const moves = generateCheckersMoves(state);
  if (moves.length === 0) {
    return { ended: true, winnerIndex: state.turn === 0 ? 1 : 0 };
  }
  
  return { ended: false, winnerIndex: null };
}

function validateCheckersMove(state: CheckersState, move: CheckersMove, playerIndex: number): boolean {
  if (state.turn !== playerIndex) return false;
  const legalMoves = generateCheckersMoves(state);
  return legalMoves.some(m =>
    m.from[0] === move.from[0] && m.from[1] === move.from[1] &&
    m.to[0] === move.to[0] && m.to[1] === move.to[1]
  );
}

// ============================================================================
// BACKGAMMON ENGINE
// ============================================================================

function initBackgammon(seed: number): BackgammonState {
  // Standard starting position
  const points: number[][] = Array(24).fill(null).map(() => []);
  
  // Player 0 checkers (moving from 24 to 1)
  points[23] = [0, 0]; // Point 24
  points[12] = [0, 0, 0, 0, 0]; // Point 13
  points[7] = [0, 0, 0]; // Point 8
  points[5] = [0, 0, 0, 0, 0]; // Point 6
  
  // Player 1 checkers (moving from 1 to 24)
  points[0] = [1, 1]; // Point 1
  points[11] = [1, 1, 1, 1, 1]; // Point 12
  points[16] = [1, 1, 1]; // Point 17
  points[18] = [1, 1, 1, 1, 1]; // Point 19
  
  // Roll to determine first player
  const [dice, newSeed] = rollDiceWithSeed(seed, 2);
  const firstPlayer: 0 | 1 = dice[0] > dice[1] ? 0 : dice[1] > dice[0] ? 1 : 0;
  
  return {
    points,
    bar: { 0: 0, 1: 0 },
    bearOff: { 0: 0, 1: 0 },
    turn: firstPlayer,
    dice: null,
    remainingDice: [],
    moveCount: 0,
    seed: newSeed
  };
}

function generateBackgammonMoves(state: BackgammonState): BackgammonMove[] {
  if (state.remainingDice.length === 0) return [];
  
  const moves: BackgammonMove[] = [];
  const player = state.turn;
  const dir = player === 0 ? -1 : 1;
  const homeStart = player === 0 ? 0 : 18;
  const homeEnd = player === 0 ? 5 : 23;
  
  // Check if all checkers are in home board
  const canBearOff = (): boolean => {
    if (state.bar[player] > 0) return false;
    for (let i = 0; i < 24; i++) {
      if (i >= homeStart && i <= homeEnd) continue;
      if (state.points[i].some(p => p === player)) return false;
    }
    return true;
  };
  
  const canLandOn = (point: number): boolean => {
    const occupants = state.points[point].filter(p => p !== player);
    return occupants.length <= 1;
  };
  
  // Must enter from bar first
  if (state.bar[player] > 0) {
    const uniqueDice = [...new Set(state.remainingDice)];
    for (const die of uniqueDice) {
      const entry = player === 0 ? 24 - die : die - 1;
      if (canLandOn(entry)) {
        moves.push({ from: 'bar', to: entry, die });
      }
    }
    return moves;
  }
  
  // Regular moves
  for (let from = 0; from < 24; from++) {
    if (!state.points[from].includes(player)) continue;
    
    const uniqueDice = [...new Set(state.remainingDice)];
    for (const die of uniqueDice) {
      const to = from + die * dir;
      
      if (to >= 0 && to < 24 && canLandOn(to)) {
        moves.push({ from, to, die });
      }
      
      // Bear off
      if (canBearOff()) {
        if (player === 0 && from < 6 && from - die < 0) {
          // Exact or higher
          const isHighest = !state.points.slice(from + 1, 6).some(p => p.includes(player));
          if (from - die === -1 || (from - die < 0 && isHighest)) {
            moves.push({ from, to: 'off', die });
          }
        }
        if (player === 1 && from >= 18 && from + die >= 24) {
          const isHighest = !state.points.slice(18, from).some(p => p.includes(player));
          if (from + die === 24 || (from + die > 24 && isHighest)) {
            moves.push({ from, to: 'off', die });
          }
        }
      }
    }
  }
  
  return moves;
}

function applyBackgammonMove(state: BackgammonState, move: BackgammonMove): BackgammonState {
  const newPoints = state.points.map(p => [...p]);
  const newBar = { ...state.bar };
  const newBearOff = { ...state.bearOff };
  const player = state.turn;
  const opponent: 0 | 1 = player === 0 ? 1 : 0;
  
  // Remove from source
  if (move.from === 'bar') {
    newBar[player]--;
  } else {
    const idx = newPoints[move.from].indexOf(player);
    newPoints[move.from].splice(idx, 1);
  }
  
  // Add to destination
  if (move.to === 'off') {
    newBearOff[player]++;
  } else {
    // Hit blot
    if (newPoints[move.to].length === 1 && newPoints[move.to][0] === opponent) {
      newBar[opponent]++;
      newPoints[move.to] = [];
    }
    newPoints[move.to].push(player);
  }
  
  // Consume die
  const newRemaining = [...state.remainingDice];
  const dieIdx = newRemaining.indexOf(move.die);
  newRemaining.splice(dieIdx, 1);
  
  // Check turn end
  const movesLeft = newRemaining.length > 0;
  const hasLegalMoves = movesLeft && generateBackgammonMoves({
    ...state,
    points: newPoints,
    bar: newBar,
    bearOff: newBearOff,
    remainingDice: newRemaining
  }).length > 0;
  
  return {
    points: newPoints,
    bar: newBar,
    bearOff: newBearOff,
    turn: hasLegalMoves ? player : opponent,
    dice: hasLegalMoves ? state.dice : null,
    remainingDice: hasLegalMoves ? newRemaining : [],
    moveCount: state.moveCount + 1,
    seed: state.seed
  };
}

function isBackgammonTerminal(state: BackgammonState): GameResult {
  if (state.bearOff[0] === 15) return { ended: true, winnerIndex: 0 };
  if (state.bearOff[1] === 15) return { ended: true, winnerIndex: 1 };
  return { ended: false, winnerIndex: null };
}

function validateBackgammonMove(state: BackgammonState, move: BackgammonMove, playerIndex: number): boolean {
  if (state.turn !== playerIndex) return false;
  const legalMoves = generateBackgammonMoves(state);
  return legalMoves.some(m =>
    m.from === move.from && m.to === move.to && m.die === move.die
  );
}

// ============================================================================
// LUDO ENGINE
// ============================================================================

function initLudo(playerCount: number, seed: number): LudoState {
  const tokens: LudoToken[][] = [];
  for (let p = 0; p < playerCount; p++) {
    tokens.push([
      { position: -1, inHome: false },
      { position: -1, inHome: false },
      { position: -1, inHome: false },
      { position: -1, inHome: false }
    ]);
  }
  
  return {
    tokens,
    turn: 0,
    dice: null,
    consecutiveSixes: 0,
    playerCount,
    eliminated: Array(playerCount).fill(false),
    moveCount: 0,
    seed
  };
}

const LUDO_START_POSITIONS = [0, 13, 26, 39];
const LUDO_SAFE_SQUARES = [0, 8, 13, 21, 26, 34, 39, 47];

function getLudoAbsolutePosition(player: number, relativePos: number): number {
  if (relativePos < 0) return -1; // In base
  if (relativePos >= 52) return 100 + player * 10 + (relativePos - 52); // In home column
  return (LUDO_START_POSITIONS[player] + relativePos) % 52;
}

function generateLudoMoves(state: LudoState): LudoMove[] {
  if (state.dice === null) return [];
  
  const moves: LudoMove[] = [];
  const player = state.turn;
  const dice = state.dice;
  
  for (let ti = 0; ti < 4; ti++) {
    const token = state.tokens[player][ti];
    
    if (token.inHome) continue;
    
    if (token.position === -1) {
      // In base - need 6 to exit
      if (dice === 6) {
        moves.push({ tokenIndex: ti, steps: 0 }); // Exit to start
      }
    } else {
      // On board
      const newPos = token.position + dice;
      
      // Check if entering home column (positions 52-57)
      if (newPos <= 57) {
        // Can't land on own token
        const targetAbsPos = getLudoAbsolutePosition(player, newPos);
        const blocked = state.tokens[player].some((t, i) => 
          i !== ti && !t.inHome && t.position >= 0 && 
          getLudoAbsolutePosition(player, t.position) === targetAbsPos
        );
        
        if (!blocked) {
          moves.push({ tokenIndex: ti, steps: dice });
        }
      }
    }
  }
  
  return moves;
}

function applyLudoMove(state: LudoState, move: LudoMove): LudoState {
  const newTokens = state.tokens.map(playerTokens => 
    playerTokens.map(t => ({ ...t }))
  );
  const player = state.turn;
  const token = newTokens[player][move.tokenIndex];
  
  let captured = false;
  
  if (token.position === -1 && move.steps === 0) {
    // Exit from base
    token.position = 0;
    
    // Check for capture at start position
    const startAbs = LUDO_START_POSITIONS[player];
    if (!LUDO_SAFE_SQUARES.includes(startAbs)) {
      for (let p = 0; p < state.playerCount; p++) {
        if (p === player) continue;
        for (const t of newTokens[p]) {
          if (!t.inHome && t.position >= 0) {
            const absPos = getLudoAbsolutePosition(p, t.position);
            if (absPos === startAbs) {
              t.position = -1; // Send to base
              captured = true;
            }
          }
        }
      }
    }
  } else {
    // Move on board
    token.position += move.steps;
    
    // Check for home entry
    if (token.position === 57) {
      token.inHome = true;
    } else if (token.position < 52) {
      // Check for capture
      const absPos = getLudoAbsolutePosition(player, token.position);
      if (!LUDO_SAFE_SQUARES.includes(absPos)) {
        for (let p = 0; p < state.playerCount; p++) {
          if (p === player) continue;
          for (const t of newTokens[p]) {
            if (!t.inHome && t.position >= 0) {
              const tAbsPos = getLudoAbsolutePosition(p, t.position);
              if (tAbsPos === absPos) {
                t.position = -1;
                captured = true;
              }
            }
          }
        }
      }
    }
  }
  
  // Determine next turn
  const gotSix = state.dice === 6;
  const newConsecutiveSixes = gotSix ? state.consecutiveSixes + 1 : 0;
  
  // Penalty for 3 consecutive sixes
  if (newConsecutiveSixes >= 3) {
    // Return last moved token to base
    token.position = -1;
    token.inHome = false;
  }
  
  // Extra turn for 6 or capture (unless 3 sixes)
  const extraTurn = (gotSix || captured) && newConsecutiveSixes < 3;
  
  // Find next player
  let nextTurn = extraTurn ? player : (player + 1) % state.playerCount;
  
  // Skip eliminated players
  const newEliminated = [...state.eliminated];
  for (let p = 0; p < state.playerCount; p++) {
    newEliminated[p] = newTokens[p].every(t => t.inHome);
  }
  
  while (newEliminated[nextTurn] && !newEliminated.every(e => e)) {
    nextTurn = (nextTurn + 1) % state.playerCount;
    if (nextTurn === player) break;
  }
  
  return {
    tokens: newTokens,
    turn: nextTurn,
    dice: null,
    consecutiveSixes: extraTurn ? newConsecutiveSixes : 0,
    playerCount: state.playerCount,
    eliminated: newEliminated,
    moveCount: state.moveCount + 1,
    seed: state.seed
  };
}

function isLudoTerminal(state: LudoState): GameResult {
  // Check if any player has all tokens home
  for (let p = 0; p < state.playerCount; p++) {
    if (state.tokens[p].every(t => t.inHome)) {
      return { ended: true, winnerIndex: p };
    }
  }
  return { ended: false, winnerIndex: null };
}

function validateLudoMove(state: LudoState, move: LudoMove, playerIndex: number): boolean {
  if (state.turn !== playerIndex) return false;
  const legalMoves = generateLudoMoves(state);
  return legalMoves.some(m => m.tokenIndex === move.tokenIndex && m.steps === move.steps);
}

// ============================================================================
// DOMINOS ENGINE
// ============================================================================

function initDominos(playerCount: number, seed: number): DominosState {
  const allTiles: DominoTile[] = [];
  for (let i = 0; i <= 6; i++) {
    for (let j = i; j <= 6; j++) {
      allTiles.push([i, j]);
    }
  }
  
  const [shuffled, newSeed] = shuffleWithSeed(allTiles, seed);
  
  const tilesPerPlayer = 7;
  const hands: DominoTile[][] = [];
  for (let p = 0; p < playerCount; p++) {
    hands.push(shuffled.slice(p * tilesPerPlayer, (p + 1) * tilesPerPlayer));
  }
  
  const boneyard = shuffled.slice(playerCount * tilesPerPlayer);
  
  // Find player with highest double
  let firstPlayer = 0;
  let highestDouble = -1;
  for (let p = 0; p < playerCount; p++) {
    for (const tile of hands[p]) {
      if (tile[0] === tile[1] && tile[0] > highestDouble) {
        highestDouble = tile[0];
        firstPlayer = p;
      }
    }
  }
  
  return {
    hands,
    board: [],
    boneyard,
    turn: firstPlayer,
    leftEnd: -1,
    rightEnd: -1,
    passed: Array(playerCount).fill(false),
    playerCount,
    moveCount: 0,
    seed: newSeed
  };
}

// Move type constants
const DOMINO_MOVE_PASS = -2;
const DOMINO_MOVE_DRAW = -1;

function generateDominosMoves(state: DominosState): DominosMove[] {
  const moves: DominosMove[] = [];
  const hand = state.hands[state.turn];
  
  // First move
  if (state.board.length === 0) {
    for (let i = 0; i < hand.length; i++) {
      moves.push({ tileIndex: i, end: 'left', flip: false });
    }
    return moves;
  }
  
  // Check for playable tiles
  for (let i = 0; i < hand.length; i++) {
    const tile = hand[i];
    
    // Left end
    if (tile[0] === state.leftEnd) {
      moves.push({ tileIndex: i, end: 'left', flip: true });
    }
    if (tile[1] === state.leftEnd) {
      moves.push({ tileIndex: i, end: 'left', flip: false });
    }
    
    // Right end
    if (tile[0] === state.rightEnd) {
      moves.push({ tileIndex: i, end: 'right', flip: false });
    }
    if (tile[1] === state.rightEnd) {
      moves.push({ tileIndex: i, end: 'right', flip: true });
    }
  }
  
  // If no playable tiles...
  if (moves.length === 0) {
    if (state.boneyard.length > 0) {
      // Must DRAW from boneyard
      moves.push({ tileIndex: DOMINO_MOVE_DRAW, end: 'left', flip: false });
    } else {
      // Boneyard empty, must PASS
      moves.push({ tileIndex: DOMINO_MOVE_PASS, end: 'left', flip: false });
    }
  }
  
  return moves;
}

function applyDominosMove(state: DominosState, move: DominosMove): DominosState {
  const newHands = state.hands.map(h => [...h]);
  const newPassed = [...state.passed];
  let newBoneyard = [...state.boneyard];
  let newBoard = [...state.board];
  let newLeftEnd = state.leftEnd;
  let newRightEnd = state.rightEnd;
  let newSeed = state.seed;
  
  const currentPlayer = state.turn;
  
  // Handle PASS move
  if (move.tileIndex === DOMINO_MOVE_PASS) {
    newPassed[currentPlayer] = true;
    const nextTurn = (currentPlayer + 1) % state.playerCount;
    return {
      hands: newHands,
      board: newBoard,
      boneyard: newBoneyard,
      turn: nextTurn,
      leftEnd: newLeftEnd,
      rightEnd: newRightEnd,
      passed: newPassed,
      playerCount: state.playerCount,
      moveCount: state.moveCount + 1,
      seed: newSeed
    };
  }
  
  // Handle DRAW move
  if (move.tileIndex === DOMINO_MOVE_DRAW) {
    if (newBoneyard.length > 0) {
      // Draw deterministically (first tile from shuffled boneyard)
      const drawnTile = newBoneyard[0];
      newBoneyard = newBoneyard.slice(1);
      newHands[currentPlayer].push(drawnTile);
      
      // After drawing, player stays on same turn to play or draw again
      // (The rules say draw until playable or empty)
      return {
        hands: newHands,
        board: newBoard,
        boneyard: newBoneyard,
        turn: currentPlayer, // Stay on same turn
        leftEnd: newLeftEnd,
        rightEnd: newRightEnd,
        passed: Array(state.playerCount).fill(false), // Reset passes on draw
        playerCount: state.playerCount,
        moveCount: state.moveCount + 1,
        seed: newSeed
      };
    }
  }
  
  // Handle PLAY move (tileIndex >= 0)
  if (move.tileIndex >= 0) {
    const tile = newHands[currentPlayer][move.tileIndex];
    newHands[currentPlayer].splice(move.tileIndex, 1);
    
    const orderedTile: DominoTile = move.flip ? [tile[1], tile[0]] : tile;
    
    if (state.board.length === 0) {
      newBoard.push({ tile: orderedTile, left: orderedTile[0], right: orderedTile[1] });
      newLeftEnd = orderedTile[0];
      newRightEnd = orderedTile[1];
    } else if (move.end === 'left') {
      newBoard.unshift({ tile: orderedTile, left: orderedTile[0], right: orderedTile[1] });
      newLeftEnd = orderedTile[0];
    } else {
      newBoard.push({ tile: orderedTile, left: orderedTile[0], right: orderedTile[1] });
      newRightEnd = orderedTile[1];
    }
  }
  
  const nextTurn = (currentPlayer + 1) % state.playerCount;
  
  return {
    hands: newHands,
    board: newBoard,
    boneyard: newBoneyard,
    turn: nextTurn,
    leftEnd: newLeftEnd,
    rightEnd: newRightEnd,
    passed: Array(state.playerCount).fill(false), // Reset passes on play
    playerCount: state.playerCount,
    moveCount: state.moveCount + 1,
    seed: newSeed
  };
}

function isDominosTerminal(state: DominosState): GameResult {
  // Player emptied hand
  for (let p = 0; p < state.playerCount; p++) {
    if (state.hands[p].length === 0) {
      return { ended: true, winnerIndex: p };
    }
  }
  
  // Check if blocked (no one can play and boneyard empty)
  let allBlocked = true;
  for (let p = 0; p < state.playerCount; p++) {
    const tempState = { ...state, turn: p };
    const moves = generateDominosMoves(tempState);
    // If any player has a non-PASS move, not blocked
    if (moves.some(m => m.tileIndex !== DOMINO_MOVE_PASS)) {
      allBlocked = false;
      break;
    }
  }
  
  if (allBlocked && state.boneyard.length === 0) {
    // Lowest pip count wins
    let lowestPips = Infinity;
    let winner = 0;
    for (let p = 0; p < state.playerCount; p++) {
      const pips = state.hands[p].reduce((sum, t) => sum + t[0] + t[1], 0);
      if (pips < lowestPips) {
        lowestPips = pips;
        winner = p;
      }
    }
    return { ended: true, winnerIndex: winner };
  }
  
  return { ended: false, winnerIndex: null };
}

function validateDominosMove(state: DominosState, move: DominosMove, playerIndex: number): boolean {
  if (state.turn !== playerIndex) return false;
  const legalMoves = generateDominosMoves(state);
  
  // For PASS and DRAW moves, just check tileIndex
  if (move.tileIndex < 0) {
    return legalMoves.some(m => m.tileIndex === move.tileIndex);
  }
  
  return legalMoves.some(m => 
    m.tileIndex === move.tileIndex && 
    m.end === move.end && 
    m.flip === move.flip
  );
}

// ============================================================================
// UNIFIED API
// ============================================================================

export function initGame(gameId: GameId, playerCount: number, seed?: number): GameState {
  // Games that use randomness (Dominos=2, Backgammon=3, Ludo=5) REQUIRE seed
  // for real-money ZK correctness. Seed must come from commit-reveal finalSeed.
  const requiresSeed = gameId === 2 || gameId === 3 || gameId === 5;
  
  if (requiresSeed && seed === undefined) {
    throw new Error(
      `Game ID ${gameId} requires a seed for fair randomness. ` +
      `Seed must be derived from commit-reveal finalSeed = keccak256(roomId || secretsInJoinOrder).`
    );
  }
  
  switch (gameId) {
    case 1: return initChess(); // No randomness, seed ignored
    case 2: return initDominos(playerCount, seed!); // Seed required
    case 3: return initBackgammon(seed!); // Seed required
    case 4: return initCheckers(); // No randomness, seed ignored
    case 5: return initLudo(playerCount, seed!); // Seed required
    default: throw new Error(`Unknown game ID: ${gameId}`);
  }
}

export function applyMove(gameId: GameId, state: GameState, move: GameMove): GameState {
  switch (gameId) {
    case 1: return applyChessMove(state as ChessState, move as ChessMove);
    case 2: return applyDominosMove(state as DominosState, move as DominosMove);
    case 3: return applyBackgammonMove(state as BackgammonState, move as BackgammonMove);
    case 4: return applyCheckersMove(state as CheckersState, move as CheckersMove);
    case 5: return applyLudoMove(state as LudoState, move as LudoMove);
    default: throw new Error(`Unknown game ID: ${gameId}`);
  }
}

export function isTerminal(gameId: GameId, state: GameState): GameResult {
  switch (gameId) {
    case 1: return isChessTerminal(state as ChessState);
    case 2: return isDominosTerminal(state as DominosState);
    case 3: return isBackgammonTerminal(state as BackgammonState);
    case 4: return isCheckersTerminal(state as CheckersState);
    case 5: return isLudoTerminal(state as LudoState);
    default: throw new Error(`Unknown game ID: ${gameId}`);
  }
}

export function validateMove(gameId: GameId, state: GameState, move: GameMove, playerIndex: number): boolean {
  switch (gameId) {
    case 1: return validateChessMove(state as ChessState, move as ChessMove, playerIndex);
    case 2: return validateDominosMove(state as DominosState, move as DominosMove, playerIndex);
    case 3: return validateBackgammonMove(state as BackgammonState, move as BackgammonMove, playerIndex);
    case 4: return validateCheckersMove(state as CheckersState, move as CheckersMove, playerIndex);
    case 5: return validateLudoMove(state as LudoState, move as LudoMove, playerIndex);
    default: throw new Error(`Unknown game ID: ${gameId}`);
  }
}

// ============================================================================
// DICE FUNCTIONS (Deterministic with seed consumption)
// ============================================================================

export function rollDice(gameId: GameId, state: GameState): [number[], GameState] {
  switch (gameId) {
    case 3: { // Backgammon - 2d6
      const bgState = state as BackgammonState;
      const [dice, newSeed] = rollDiceWithSeed(bgState.seed, 2);
      return [dice, { ...bgState, seed: newSeed }];
    }
    case 5: { // Ludo - 1d6
      const ludoState = state as LudoState;
      const [dice, newSeed] = rollDiceWithSeed(ludoState.seed, 1);
      return [dice, { ...ludoState, seed: newSeed }];
    }
    default:
      return [[], state];
  }
}

export function setDice(gameId: GameId, state: GameState, dice: number[]): GameState {
  switch (gameId) {
    case 3: {
      const bgState = state as BackgammonState;
      const remaining = dice[0] === dice[1] ? [...dice, ...dice] : [...dice];
      return { ...bgState, dice: [dice[0], dice[1]] as [number, number], remainingDice: remaining };
    }
    case 5: {
      const ludoState = state as LudoState;
      return { ...ludoState, dice: dice[0] };
    }
    default:
      return state;
  }
}

// ============================================================================
// MOVE TYPE CONSTANTS (exported for external use)
// ============================================================================

export const DOMINOS_MOVE_TYPES = {
  PASS: DOMINO_MOVE_PASS,
  DRAW: DOMINO_MOVE_DRAW
} as const;
