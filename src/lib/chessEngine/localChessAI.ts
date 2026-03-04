import { Chess, Square, Move, PieceSymbol, Color } from "chess.js";

export type Difficulty = "easy" | "medium" | "hard";

// Piece values in centipawns
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 330,
  r: 500,
  q: 900,
  k: 20000,
};

// Piece-square tables for positional evaluation (from white's perspective)
const PAWN_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5,  5, 10, 25, 25, 10,  5,  5,
  0,  0,  0, 20, 20,  0,  0,  0,
  5, -5,-10,  0,  0,-10, -5,  5,
  5, 10, 10,-20,-20, 10, 10,  5,
  0,  0,  0,  0,  0,  0,  0,  0
];

const KNIGHT_TABLE = [
  -50,-40,-30,-30,-30,-30,-40,-50,
  -40,-20,  0,  0,  0,  0,-20,-40,
  -30,  0, 10, 15, 15, 10,  0,-30,
  -30,  5, 15, 20, 20, 15,  5,-30,
  -30,  0, 15, 20, 20, 15,  0,-30,
  -30,  5, 10, 15, 15, 10,  5,-30,
  -40,-20,  0,  5,  5,  0,-20,-40,
  -50,-40,-30,-30,-30,-30,-40,-50
];

const BISHOP_TABLE = [
  -20,-10,-10,-10,-10,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5, 10, 10,  5,  0,-10,
  -10,  5,  5, 10, 10,  5,  5,-10,
  -10,  0, 10, 10, 10, 10,  0,-10,
  -10, 10, 10, 10, 10, 10, 10,-10,
  -10,  5,  0,  0,  0,  0,  5,-10,
  -20,-10,-10,-10,-10,-10,-10,-20
];

const ROOK_TABLE = [
  0,  0,  0,  0,  0,  0,  0,  0,
  5, 10, 10, 10, 10, 10, 10,  5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  -5,  0,  0,  0,  0,  0,  0, -5,
  0,  0,  0,  5,  5,  0,  0,  0
];

const QUEEN_TABLE = [
  -20,-10,-10, -5, -5,-10,-10,-20,
  -10,  0,  0,  0,  0,  0,  0,-10,
  -10,  0,  5,  5,  5,  5,  0,-10,
  -5,  0,  5,  5,  5,  5,  0, -5,
  0,  0,  5,  5,  5,  5,  0, -5,
  -10,  5,  5,  5,  5,  5,  0,-10,
  -10,  0,  5,  0,  0,  0,  0,-10,
  -20,-10,-10, -5, -5,-10,-10,-20
];

const KING_MIDDLEGAME_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];

// Endgame king table - king should be active and centralized
const KING_ENDGAME_TABLE = [
  -50,-40,-30,-20,-20,-30,-40,-50,
  -30,-20,-10,  0,  0,-10,-20,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 20, 30, 30, 20,-10,-30,
  -30,-30,  0,  0,  0,  0,-30,-30,
  -50,-30,-30,-30,-30,-30,-30,-50
];

const PIECE_TABLES: Record<PieceSymbol, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_MIDDLEGAME_TABLE,
};

// Convert square to index (0-63)
function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(square[1]);
  return rank * 8 + file;
}

// Count total material (excluding kings) to detect endgame
function countMaterial(game: Chess): number {
  const board = game.board();
  let material = 0;
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece && piece.type !== 'k') {
        material += PIECE_VALUES[piece.type];
      }
    }
  }
  return material;
}

// Get piece-square table value with endgame detection for king
function getPieceSquareValue(piece: PieceSymbol, square: Square, color: Color, isEndgame: boolean): number {
  let index = squareToIndex(square);
  if (color === 'b') {
    index = 63 - index;
  }
  if (piece === 'k' && isEndgame) {
    return KING_ENDGAME_TABLE[index];
  }
  return PIECE_TABLES[piece][index];
}

// King safety evaluation
function evaluateKingSafety(game: Chess, color: Color): number {
  let score = 0;
  const board = game.board();
  
  // Find king position
  let kingRank = -1, kingFile = -1;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.type === 'k' && p.color === color) {
        kingRank = r;
        kingFile = f;
        break;
      }
    }
    if (kingRank >= 0) break;
  }
  
  if (kingRank < 0) return 0;
  
  // Pawn shield bonus (for castled king positions)
  const pawnDir = color === 'w' ? -1 : 1;
  const shieldRank = kingRank + pawnDir;
  if (shieldRank >= 0 && shieldRank < 8) {
    for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
      const p = board[shieldRank][f];
      if (p && p.type === 'p' && p.color === color) {
        score += 15; // Pawn shield bonus
      }
    }
  }
  
  // Penalty for open files near king
  for (let f = Math.max(0, kingFile - 1); f <= Math.min(7, kingFile + 1); f++) {
    let hasFriendlyPawn = false;
    for (let r = 0; r < 8; r++) {
      const p = board[r][f];
      if (p && p.type === 'p' && p.color === color) {
        hasFriendlyPawn = true;
        break;
      }
    }
    if (!hasFriendlyPawn) {
      score -= 20; // Open file near king penalty
    }
  }
  
  return score;
}

// Fast evaluate board position
function evaluate(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -99999 : 99999;
  }
  if (game.isDraw() || game.isStalemate()) {
    return 0;
  }
  
  const board = game.board();
  const totalMaterial = countMaterial(game);
  const isEndgame = totalMaterial < 2600; // Roughly when queens are traded + some pieces
  let score = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const square = (String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank)) as Square;
        const pieceValue = PIECE_VALUES[piece.type];
        const positionValue = getPieceSquareValue(piece.type, square, piece.color, isEndgame);
        const totalValue = pieceValue + positionValue;
        
        if (piece.color === 'w') {
          score += totalValue;
        } else {
          score -= totalValue;
        }
      }
    }
  }
  
  // King safety (only in middlegame)
  if (!isEndgame) {
    score += evaluateKingSafety(game, 'w');
    score -= evaluateKingSafety(game, 'b');
  }
  
  return score;
}

// Simple move ordering - captures first (no expensive check detection)
function orderMoves(moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    
    // Captures - MVV-LVA
    if (a.captured) {
      scoreA += PIECE_VALUES[a.captured as PieceSymbol] * 10 - PIECE_VALUES[a.piece as PieceSymbol];
    }
    if (b.captured) {
      scoreB += PIECE_VALUES[b.captured as PieceSymbol] * 10 - PIECE_VALUES[b.piece as PieceSymbol];
    }
    
    // Promotions
    if (a.promotion) scoreA += 800;
    if (b.promotion) scoreB += 800;
    
    return scoreB - scoreA;
  });
}

// Quiescence search - extend search on captures to avoid horizon effect
function quiescence(
  game: Chess,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean
): number {
  const standPat = evaluate(game);
  
  if (maximizingPlayer) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }
  
  // Only search captures
  const captures = orderMoves(
    (game.moves({ verbose: true }) as Move[]).filter(m => m.captured || m.promotion)
  );
  
  if (maximizingPlayer) {
    for (const move of captures) {
      game.move(move);
      const score = quiescence(game, alpha, beta, false);
      game.undo();
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return alpha;
  } else {
    for (const move of captures) {
      game.move(move);
      const score = quiescence(game, alpha, beta, true);
      game.undo();
      if (score < beta) beta = score;
      if (alpha >= beta) break;
    }
    return beta;
  }
}

// Minimax with alpha-beta pruning + quiescence search
function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean,
  useQuiescence: boolean
): number {
  if (depth === 0 || game.isGameOver()) {
    if (useQuiescence && depth === 0 && !game.isGameOver()) {
      return quiescence(game, alpha, beta, maximizingPlayer);
    }
    return evaluate(game);
  }
  
  const moves = orderMoves(game.moves({ verbose: true }) as Move[]);
  
  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, false, useQuiescence);
      game.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of moves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, true, useQuiescence);
      game.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

// Difficulty configurations
interface DifficultyConfig {
  depth: number;
  randomnessFactor: number;
  useQuiescence: boolean;
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    depth: 2,
    randomnessFactor: 0.3,
    useQuiescence: false,
  },
  medium: {
    depth: 3,
    randomnessFactor: 0.05,
    useQuiescence: false,
  },
  hard: {
    depth: 5,
    randomnessFactor: 0,
    useQuiescence: true,
  },
};

export interface ChessAI {
  setDifficulty: (level: Difficulty) => void;
  getBestMove: (fen: string) => Promise<string>;
  terminate: () => void;
  isReady: () => boolean;
}

export function createChessAI(initialDifficulty: Difficulty): ChessAI {
  let difficulty = initialDifficulty;
  
  return {
    setDifficulty: (level: Difficulty) => {
      difficulty = level;
    },
    
    getBestMove: async (fen: string): Promise<string> => {
      // Use setTimeout to yield to the browser and prevent freezing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const game = new Chess(fen);
      const config = DIFFICULTY_CONFIG[difficulty];
      const moves = game.moves({ verbose: true }) as Move[];
      
      if (moves.length === 0) {
        throw new Error("No legal moves");
      }
      
      const moveScores: { move: Move; score: number }[] = [];
      const isMaximizing = game.turn() === 'w';
      
      // Evaluate moves in batches to prevent UI freeze
      for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        game.move(move);
        const score = minimax(game, config.depth - 1, -Infinity, Infinity, !isMaximizing, config.useQuiescence);
        game.undo();
        moveScores.push({ move, score });
        
        // Yield every 5 moves to keep UI responsive
        if (i % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // Sort by score
      moveScores.sort((a, b) => {
        return isMaximizing ? b.score - a.score : a.score - b.score;
      });
      
      // Apply randomness for easier difficulties
      let selectedMove: Move;
      if (config.randomnessFactor > 0 && Math.random() < config.randomnessFactor) {
        const topMoves = moveScores.slice(0, Math.min(4, moveScores.length));
        selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)].move;
      } else {
        selectedMove = moveScores[0].move;
      }
      
      return selectedMove.from + selectedMove.to + (selectedMove.promotion || '');
    },
    
    terminate: () => {},
    isReady: () => true,
  };
}
