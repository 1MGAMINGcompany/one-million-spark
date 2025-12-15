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

const KING_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];

const PIECE_TABLES: Record<PieceSymbol, number[]> = {
  p: PAWN_TABLE,
  n: KNIGHT_TABLE,
  b: BISHOP_TABLE,
  r: ROOK_TABLE,
  q: QUEEN_TABLE,
  k: KING_TABLE,
};

// Convert square to index (0-63)
function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(square[1]);
  return rank * 8 + file;
}

// Get piece-square table value
function getPieceSquareValue(piece: PieceSymbol, square: Square, color: Color): number {
  let index = squareToIndex(square);
  if (color === 'b') {
    index = 63 - index;
  }
  return PIECE_TABLES[piece][index];
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
  let score = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const square = (String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank)) as Square;
        const pieceValue = PIECE_VALUES[piece.type];
        const positionValue = getPieceSquareValue(piece.type, square, piece.color);
        const totalValue = pieceValue + positionValue;
        
        if (piece.color === 'w') {
          score += totalValue;
        } else {
          score -= totalValue;
        }
      }
    }
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

// Minimax with alpha-beta pruning
function minimax(
  game: Chess,
  depth: number,
  alpha: number,
  beta: number,
  maximizingPlayer: boolean
): number {
  if (depth === 0 || game.isGameOver()) {
    return evaluate(game);
  }
  
  const moves = orderMoves(game.moves({ verbose: true }) as Move[]);
  
  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of moves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, false);
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
      const evalScore = minimax(game, depth - 1, alpha, beta, true);
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
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    depth: 2,
    randomnessFactor: 0.3,
  },
  medium: {
    depth: 3,
    randomnessFactor: 0.05,
  },
  hard: {
    depth: 4,
    randomnessFactor: 0,
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
        const score = minimax(game, config.depth - 1, -Infinity, Infinity, !isMaximizing);
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
