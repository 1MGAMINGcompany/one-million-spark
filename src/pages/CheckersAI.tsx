import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Trophy, Gem, Star } from "lucide-react";
import { useSound } from "@/contexts/SoundContext";

type Difficulty = "easy" | "medium" | "hard";
type Player = "gold" | "obsidian";
type PieceType = "normal" | "king";

interface Piece {
  player: Player;
  type: PieceType;
}

interface Position {
  row: number;
  col: number;
}

interface Move {
  from: Position;
  to: Position;
  captures?: Position[];
}

const BOARD_SIZE = 8;

const initializeBoard = (): (Piece | null)[][] => {
  const board: (Piece | null)[][] = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null));
  
  // Place obsidian pieces (AI) on top 3 rows
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "obsidian", type: "normal" };
      }
    }
  }
  
  // Place gold pieces (player) on bottom 3 rows
  for (let row = BOARD_SIZE - 3; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if ((row + col) % 2 === 1) {
        board[row][col] = { player: "gold", type: "normal" };
      }
    }
  }
  
  return board;
};

const CheckersAI = () => {
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { play } = useSound();
  
  const [board, setBoard] = useState<(Piece | null)[][]>(initializeBoard);
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("gold");
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [gameOver, setGameOver] = useState<Player | "draw" | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chainCapture, setChainCapture] = useState<Position | null>(null); // Track multi-jump
  
  // Use ref to always have access to latest board state
  const boardRef = useRef(board);
  boardRef.current = board;

  // Get capture moves for a piece (single jumps only)
  const getCaptures = useCallback((board: (Piece | null)[][], pos: Position): Move[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];
    
    const captures: Move[] = [];
    const directions = piece.type === "king" 
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.player === "gold" 
        ? [[-1, -1], [-1, 1]]
        : [[1, -1], [1, 1]];
    
    for (const [dr, dc] of directions) {
      const jumpRow = pos.row + dr * 2;
      const jumpCol = pos.col + dc * 2;
      const midRow = pos.row + dr;
      const midCol = pos.col + dc;
      
      if (jumpRow >= 0 && jumpRow < BOARD_SIZE && jumpCol >= 0 && jumpCol < BOARD_SIZE) {
        const midPiece = board[midRow][midCol];
        const jumpSquare = board[jumpRow][jumpCol];
        
        if (midPiece && midPiece.player !== piece.player && !jumpSquare) {
          captures.push({
            from: pos,
            to: { row: jumpRow, col: jumpCol },
            captures: [{ row: midRow, col: midCol }]
          });
        }
      }
    }
    
    return captures;
  }, []);

  // Get simple moves for a piece (non-capturing)
  const getSimpleMoves = useCallback((board: (Piece | null)[][], pos: Position): Move[] => {
    const piece = board[pos.row][pos.col];
    if (!piece) return [];
    
    const moves: Move[] = [];
    const directions = piece.type === "king" 
      ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
      : piece.player === "gold" 
        ? [[-1, -1], [-1, 1]]
        : [[1, -1], [1, 1]];
    
    for (const [dr, dc] of directions) {
      const newRow = pos.row + dr;
      const newCol = pos.col + dc;
      
      if (newRow >= 0 && newRow < BOARD_SIZE && newCol >= 0 && newCol < BOARD_SIZE) {
        if (!board[newRow][newCol]) {
          moves.push({ from: pos, to: { row: newRow, col: newCol } });
        }
      }
    }
    
    return moves;
  }, []);

  // Get all valid moves for a piece (captures take priority)
  const getValidMoves = useCallback((board: (Piece | null)[][], pos: Position): Move[] => {
    const captures = getCaptures(board, pos);
    if (captures.length > 0) return captures;
    return getSimpleMoves(board, pos);
  }, [getCaptures, getSimpleMoves]);

  // Check if a player has any captures available
  const playerHasCaptures = useCallback((board: (Piece | null)[][], player: Player): boolean => {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.player === player) {
          if (getCaptures(board, { row, col }).length > 0) {
            return true;
          }
        }
      }
    }
    return false;
  }, [getCaptures]);

  // Get all moves for a player (captures are mandatory)
  const getAllMoves = useCallback((board: (Piece | null)[][], player: Player): Move[] => {
    const allCaptures: Move[] = [];
    const allSimple: Move[] = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece && piece.player === player) {
          const captures = getCaptures(board, { row, col });
          allCaptures.push(...captures);
          
          if (captures.length === 0) {
            allSimple.push(...getSimpleMoves(board, { row, col }));
          }
        }
      }
    }
    
    // Must capture if possible
    return allCaptures.length > 0 ? allCaptures : allSimple;
  }, [getCaptures, getSimpleMoves]);

  // Apply a move and handle king promotion
  const applyMove = useCallback((board: (Piece | null)[][], move: Move): (Piece | null)[][] => {
    const newBoard = board.map(row => [...row]);
    const piece = newBoard[move.from.row][move.from.col];
    if (!piece) return newBoard;
    
    // Move piece
    newBoard[move.to.row][move.to.col] = { ...piece };
    newBoard[move.from.row][move.from.col] = null;
    
    // Remove captured pieces
    if (move.captures) {
      for (const cap of move.captures) {
        newBoard[cap.row][cap.col] = null;
      }
    }
    
    // Check for king promotion
    if (piece.player === "gold" && move.to.row === 0) {
      newBoard[move.to.row][move.to.col]!.type = "king";
    } else if (piece.player === "obsidian" && move.to.row === BOARD_SIZE - 1) {
      newBoard[move.to.row][move.to.col]!.type = "king";
    }
    
    return newBoard;
  }, []);

  // Evaluate board for AI
  const evaluateBoard = useCallback((board: (Piece | null)[][]): number => {
    let score = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece) {
          const value = piece.type === "king" ? 3 : 1;
          // Add positional bonus for advancement
          const posBonus = piece.player === "obsidian" ? row * 0.1 : (7 - row) * 0.1;
          score += piece.player === "obsidian" ? (value + posBonus) : -(value + posBonus);
        }
      }
    }
    return score;
  }, []);

  // AI move selection
  const getAiMove = useCallback((board: (Piece | null)[][]): Move | null => {
    const moves = getAllMoves(board, "obsidian");
    if (moves.length === 0) return null;
    
    let bestMove = moves[0];
    let bestScore = -Infinity;
    
    for (const move of moves) {
      const newBoard = applyMove(board, move);
      let score = evaluateBoard(newBoard);
      
      // Bonus for captures
      if (move.captures && move.captures.length > 0) {
        score += move.captures.length * 0.5;
      }
      
      // Check for chain captures
      const postMoveCaptures = getCaptures(newBoard, move.to);
      if (postMoveCaptures.length > 0) {
        score += 0.3;
      }
      
      // Add randomness based on difficulty
      const randomness = difficulty === "easy" ? Math.random() * 3 : difficulty === "medium" ? Math.random() * 0.8 : 0;
      const adjustedScore = score + randomness;
      
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestMove = move;
      }
    }
    
    return bestMove;
  }, [difficulty, getAllMoves, applyMove, evaluateBoard, getCaptures]);

  // Check for game over
  const checkGameOver = useCallback((board: (Piece | null)[][]): Player | "draw" | null => {
    const goldMoves = getAllMoves(board, "gold");
    const obsidianMoves = getAllMoves(board, "obsidian");
    
    let goldPieces = 0;
    let obsidianPieces = 0;
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const piece = board[row][col];
        if (piece?.player === "gold") goldPieces++;
        if (piece?.player === "obsidian") obsidianPieces++;
      }
    }
    
    if (goldPieces === 0) return "obsidian";
    if (obsidianPieces === 0) return "gold";
    if (goldMoves.length === 0) return "obsidian";
    if (obsidianMoves.length === 0) return "gold";
    
    return null;
  }, [getAllMoves]);

  // Handle piece selection and moves
  const handleSquareClick = (row: number, col: number) => {
    if (gameOver || isAiThinking || currentPlayer !== "gold") return;
    
    const clickedPiece = board[row][col];
    
    // If we're in a chain capture, only allow continuing the chain
    if (chainCapture) {
      const move = validMoves.find(m => m.to.row === row && m.to.col === col);
      if (move) {
        play('checkers_capture');
        const newBoard = applyMove(board, move);
        setBoard(newBoard);
        
        // Check if there are more captures available from the new position
        const moreCaptures = getCaptures(newBoard, move.to);
        if (moreCaptures.length > 0) {
          // Continue chain capture
          setChainCapture(move.to);
          setSelectedPiece(move.to);
          setValidMoves(moreCaptures);
        } else {
          // End of chain, switch turns
          setChainCapture(null);
          setSelectedPiece(null);
          setValidMoves([]);
          
          const result = checkGameOver(newBoard);
          if (result) {
            setGameOver(result);
            play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
          } else {
            setCurrentPlayer("obsidian");
          }
        }
      }
      return;
    }
    
    // Check if clicking on a valid move destination
    if (selectedPiece) {
      const move = validMoves.find(m => m.to.row === row && m.to.col === col);
      if (move) {
        // Play sound effect
        if (move.captures && move.captures.length > 0) {
          play('checkers_capture');
        } else {
          play('checkers_slide');
        }
        
        const newBoard = applyMove(board, move);
        setBoard(newBoard);
        
        // If this was a capture, check for chain captures
        if (move.captures && move.captures.length > 0) {
          const moreCaptures = getCaptures(newBoard, move.to);
          if (moreCaptures.length > 0) {
            // Start chain capture
            setChainCapture(move.to);
            setSelectedPiece(move.to);
            setValidMoves(moreCaptures);
            return;
          }
        }
        
        setSelectedPiece(null);
        setValidMoves([]);
        
        const result = checkGameOver(newBoard);
        if (result) {
          setGameOver(result);
          play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
        } else {
          setCurrentPlayer("obsidian");
        }
        return;
      }
    }
    
    // Select a piece
    if (clickedPiece && clickedPiece.player === "gold") {
      const captures = getCaptures(board, { row, col });
      const simpleMoves = getSimpleMoves(board, { row, col });
      const hasAnyCaptures = playerHasCaptures(board, "gold");
      
      // If any piece can capture, must select a piece that can capture
      if (hasAnyCaptures) {
        if (captures.length === 0) {
          // Can't select this piece, must select one that can capture
          return;
        }
        setSelectedPiece({ row, col });
        setValidMoves(captures);
      } else {
        // No captures required, show simple moves
        setSelectedPiece({ row, col });
        setValidMoves(simpleMoves);
      }
    } else {
      setSelectedPiece(null);
      setValidMoves([]);
    }
  };

  // AI turn - only trigger when it becomes AI's turn
  useEffect(() => {
    if (currentPlayer !== "obsidian" || gameOver) return;
    
    setIsAiThinking(true);
    
    const executeAiMove = (currentBoard: (Piece | null)[][], lastPos?: Position) => {
      const delay = difficulty === "easy" ? 300 : difficulty === "medium" ? 500 : 700;
      
      setTimeout(() => {
        // If we have a lastPos, check for chain captures first
        if (lastPos) {
          const chainMoves = getCaptures(currentBoard, lastPos);
          if (chainMoves.length > 0) {
            // Continue chain capture
            const chainMove = chainMoves[Math.floor(Math.random() * chainMoves.length)];
            play('checkers_capture');
            const newBoard = applyMove(currentBoard, chainMove);
            setBoard(newBoard);
            boardRef.current = newBoard;
            
            // Check for more captures
            executeAiMove(newBoard, chainMove.to);
            return;
          }
        }
        
        // No chain capture, make a normal move if this is the start
        if (!lastPos) {
          const move = getAiMove(currentBoard);
          
          if (!move) {
            setGameOver("gold");
            play('checkers_win');
            setIsAiThinking(false);
            return;
          }
          
          // Play sound
          if (move.captures && move.captures.length > 0) {
            play('checkers_capture');
          } else {
            play('checkers_slide');
          }
          
          const newBoard = applyMove(currentBoard, move);
          setBoard(newBoard);
          boardRef.current = newBoard;
          
          // If this was a capture, check for chain
          if (move.captures && move.captures.length > 0) {
            executeAiMove(newBoard, move.to);
            return;
          }
        }
        
        // End AI turn
        const finalBoard = boardRef.current;
        const result = checkGameOver(finalBoard);
        if (result) {
          setGameOver(result);
          play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
        } else {
          setCurrentPlayer("gold");
        }
        
        setIsAiThinking(false);
      }, delay);
    };
    
    executeAiMove(boardRef.current);
    
  }, [currentPlayer, gameOver, difficulty, getAiMove, applyMove, checkGameOver, play, getCaptures]);

  const resetGame = () => {
    setBoard(initializeBoard());
    setSelectedPiece(null);
    setValidMoves([]);
    setCurrentPlayer("gold");
    setGameOver(null);
    setIsAiThinking(false);
    setChainCapture(null);
  };

  const isValidMoveTarget = (row: number, col: number) => {
    return validMoves.some(m => m.to.row === row && m.to.col === col);
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <div className="relative py-8 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-primary">
            <Link to="/play-ai" className="flex items-center gap-2">
              <ArrowLeft size={18} />
              Back to Lobby
            </Link>
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                Checkers vs AI
              </h1>
              <p className="text-muted-foreground capitalize">Difficulty: {difficulty}</p>
            </div>
            
            <Button onClick={resetGame} variant="outline" className="border-primary/30">
              <RotateCcw size={18} />
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Game Board */}
      <div className="max-w-lg mx-auto px-4">
        {/* Status */}
        <div className="text-center mb-4">
          {gameOver ? (
            <div className="flex items-center justify-center gap-2 text-xl font-display">
              <Trophy className="w-6 h-6 text-primary" />
              <span className="text-primary">
                {gameOver === "gold" ? "You Win!" : gameOver === "obsidian" ? "AI Wins!" : "Draw!"}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {isAiThinking ? "AI is thinking..." : "Your turn (Gold)"}
            </p>
          )}
        </div>

        {/* Board */}
        <div className="aspect-square border-4 border-primary/40 rounded-lg overflow-hidden shadow-[0_0_40px_-10px_hsl(45_93%_54%_/_0.3)]">
          <div className="grid grid-cols-8 grid-rows-8 h-full w-full">
            {board.map((row, rowIndex) =>
              row.map((piece, colIndex) => {
                const isDark = (rowIndex + colIndex) % 2 === 1;
                const isSelected = selectedPiece?.row === rowIndex && selectedPiece?.col === colIndex;
                const isValidTarget = isValidMoveTarget(rowIndex, colIndex);
                
                return (
                  <div
                    key={`${rowIndex}-${colIndex}`}
                    onClick={() => handleSquareClick(rowIndex, colIndex)}
                    className={`
                      relative flex items-center justify-center cursor-pointer overflow-hidden
                      ${isDark 
                        ? "bg-gradient-to-br from-amber-900/80 to-amber-950" 
                        : "bg-gradient-to-br from-amber-200 to-amber-300"
                      }
                      ${isSelected ? "ring-2 ring-primary ring-inset" : ""}
                      ${isValidTarget ? "ring-2 ring-green-400 ring-inset" : ""}
                    `}
                  >
                    {piece && (
                      <div
                        className={`
                          w-[75%] h-[75%] rounded-full border-2 flex-shrink-0
                          ${piece.player === "gold"
                            ? "bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-700 border-yellow-200 shadow-[0_0_15px_-3px_hsl(45_93%_54%_/_0.6)]"
                            : "bg-gradient-to-br from-gray-600 via-gray-800 to-gray-900 border-primary/50 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
                          }
                          ${isSelected ? "ring-2 ring-white/50" : ""}
                        `}
                      >
                        {piece.type === "king" && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-lg">👑</span>
                          </div>
                        )}
                      </div>
                    )}
                    
                    {isValidTarget && !piece && (
                      <div className="w-3 h-3 rounded-full bg-green-400/60 flex-shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-8 flex items-center justify-center gap-3">
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
        <Gem className="w-4 h-4 text-primary/40" />
        <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">Conquer the Pharaoh's Grid</span>
        <Gem className="w-4 h-4 text-primary/40" />
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
      </div>
    </div>
  );
};

export default CheckersAI;