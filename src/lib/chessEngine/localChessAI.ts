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

const KING_MIDDLE_TABLE = [
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -30,-40,-40,-50,-50,-40,-40,-30,
  -20,-30,-30,-40,-40,-30,-30,-20,
  -10,-20,-20,-20,-20,-20,-20,-10,
  20, 20,  0,  0,  0,  0, 20, 20,
  20, 30, 10,  0,  0, 10, 30, 20
];

const KING_END_TABLE = [
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
  k: KING_MIDDLE_TABLE,
};

// Convert square to index (0-63)
function squareToIndex(square: Square): number {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = 8 - parseInt(square[1]);
  return rank * 8 + file;
}

// Get piece-square table value
function getPieceSquareValue(piece: PieceSymbol, square: Square, color: Color, isEndgame: boolean): number {
  let index = squareToIndex(square);
  
  // Flip for black pieces
  if (color === 'b') {
    index = 63 - index;
  }
  
  // Use endgame king table if in endgame
  if (piece === 'k' && isEndgame) {
    return KING_END_TABLE[index];
  }
  
  return PIECE_TABLES[piece][index];
}

// Check if position is endgame
function isEndgame(game: Chess): boolean {
  const board = game.board();
  let queens = 0;
  let minorPieces = 0;
  
  for (const row of board) {
    for (const square of row) {
      if (square) {
        if (square.type === 'q') queens++;
        if (square.type === 'n' || square.type === 'b') minorPieces++;
      }
    }
  }
  
  return queens === 0 || (queens === 2 && minorPieces <= 2);
}

// Evaluate board position
function evaluate(game: Chess): number {
  if (game.isCheckmate()) {
    return game.turn() === 'w' ? -99999 : 99999;
  }
  
  if (game.isDraw() || game.isStalemate()) {
    return 0;
  }
  
  const board = game.board();
  const endgame = isEndgame(game);
  let score = 0;
  
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file];
      if (piece) {
        const square = (String.fromCharCode('a'.charCodeAt(0) + file) + (8 - rank)) as Square;
        const pieceValue = PIECE_VALUES[piece.type];
        const positionValue = getPieceSquareValue(piece.type, square, piece.color, endgame);
        const totalValue = pieceValue + positionValue;
        
        if (piece.color === 'w') {
          score += totalValue;
        } else {
          score -= totalValue;
        }
      }
    }
  }
  
  // Mobility bonus
  const currentTurn = game.turn();
  const mobility = game.moves().length;
  score += (currentTurn === 'w' ? mobility : -mobility) * 2;
  
  // Check bonus
  if (game.isCheck()) {
    score += currentTurn === 'w' ? -30 : 30;
  }
  
  return score;
}

// Order moves for better alpha-beta pruning
function orderMoves(game: Chess, moves: Move[]): Move[] {
  return moves.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    
    // Captures are good - MVV-LVA (Most Valuable Victim - Least Valuable Attacker)
    if (a.captured) {
      scoreA += PIECE_VALUES[a.captured as PieceSymbol] * 10 - PIECE_VALUES[a.piece as PieceSymbol];
    }
    if (b.captured) {
      scoreB += PIECE_VALUES[b.captured as PieceSymbol] * 10 - PIECE_VALUES[b.piece as PieceSymbol];
    }
    
    // Promotions are very good
    if (a.promotion) scoreA += PIECE_VALUES[a.promotion as PieceSymbol];
    if (b.promotion) scoreB += PIECE_VALUES[b.promotion as PieceSymbol];
    
    // Checks might be good
    const gameCopy1 = new Chess(game.fen());
    gameCopy1.move(a);
    if (gameCopy1.isCheck()) scoreA += 50;
    
    const gameCopy2 = new Chess(game.fen());
    gameCopy2.move(b);
    if (gameCopy2.isCheck()) scoreB += 50;
    
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
  
  const moves = game.moves({ verbose: true }) as Move[];
  const orderedMoves = orderMoves(game, moves);
  
  if (maximizingPlayer) {
    let maxEval = -Infinity;
    for (const move of orderedMoves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, false);
      game.undo();
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break; // Beta cutoff
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const move of orderedMoves) {
      game.move(move);
      const evalScore = minimax(game, depth - 1, alpha, beta, true);
      game.undo();
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break; // Alpha cutoff
    }
    return minEval;
  }
}

// Difficulty configurations
interface DifficultyConfig {
  depth: number;
  randomnessFactor: number; // 0-1, how much to randomize among top moves
}

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    depth: 2,
    randomnessFactor: 0.4, // Often picks suboptimal moves
  },
  medium: {
    depth: 4,
    randomnessFactor: 0.05, // Rarely makes mistakes
  },
  hard: {
    depth: 5,
    randomnessFactor: 0, // Always plays best move
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
      const game = new Chess(fen);
      const config = DIFFICULTY_CONFIG[difficulty];
      const moves = game.moves({ verbose: true }) as Move[];
      
      if (moves.length === 0) {
        throw new Error("No legal moves");
      }
      
      // Evaluate all moves
      const moveScores: { move: Move; score: number }[] = [];
      const isMaximizing = game.turn() === 'w';
      
      for (const move of moves) {
        game.move(move);
        const score = minimax(game, config.depth - 1, -Infinity, Infinity, !isMaximizing);
        game.undo();
        moveScores.push({ move, score });
      }
      
      // Sort moves by score
      moveScores.sort((a, b) => {
        return isMaximizing ? b.score - a.score : a.score - b.score;
      });
      
      // Apply randomness for easier difficulties
      let selectedMove: Move;
      
      if (config.randomnessFactor > 0 && Math.random() < config.randomnessFactor) {
        // Pick from top 3-5 moves randomly
        const topMoves = moveScores.slice(0, Math.min(5, moveScores.length));
        selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)].move;
      } else {
        selectedMove = moveScores[0].move;
      }
      
      // Convert to UCI format
      return selectedMove.from + selectedMove.to + (selectedMove.promotion || '');
    },
    
    terminate: () => {
      // Nothing to clean up for local engine
    },
    
    isReady: () => true,
  };
}
