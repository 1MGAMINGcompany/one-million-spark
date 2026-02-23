import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Trophy, Gem, Star } from "lucide-react";
import { SoundToggle } from "@/components/SoundToggle";
import { useSound } from "@/contexts/SoundContext";
import { useTranslation } from "react-i18next";
import { useAIGameTracker } from "@/hooks/useAIGameTracker";
import AIWinShareCard from "@/components/AIWinShareCard";
import ProactiveGameTip from "@/components/ProactiveGameTip";
import { useActiveAIGame } from "@/hooks/useActiveAIGame";

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
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const difficulty = (searchParams.get("difficulty") as Difficulty) || "medium";
  const { recordWin, recordLoss, getDuration } = useAIGameTracker("checkers", difficulty);
  const { play } = useSound();
  
  const [board, setBoard] = useState<(Piece | null)[][]>(initializeBoard);
  const [selectedPiece, setSelectedPiece] = useState<Position | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player>("gold");
  const [validMoves, setValidMoves] = useState<Move[]>([]);
  const [gameOver, setGameOver] = useState<Player | "draw" | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [chainCapture, setChainCapture] = useState<Position | null>(null);
  const [aiChainPos, setAiChainPos] = useState<Position | null>(null); // For AI chain captures
  const [showShareCard, setShowShareCard] = useState(false);
  const [winDuration, setWinDuration] = useState(0);

  // Session continuity
  const { clearActiveGame } = useActiveAIGame(!!gameOver);
  
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
      
      // Add randomness based on difficulty - less randomness = smarter AI
      // Easy: high randomness makes AI pick suboptimal moves often
      // Medium: low randomness for competitive play
      // Hard: no randomness, always picks best move
      const randomness = difficulty === "easy" ? Math.random() * 2 : difficulty === "medium" ? Math.random() * 0.15 : 0;
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

  // Publish context for AI helper overlay (board-aware)
  useEffect(() => {
    let goldNormal = 0, goldKing = 0, obsNormal = 0, obsKing = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const p = board[r][c];
        if (!p) continue;
        if (p.player === 'gold') { p.type === 'king' ? goldKing++ : goldNormal++; }
        else { p.type === 'king' ? obsKing++ : obsNormal++; }
      }
    }
    const boardSummary = `You (gold): ${goldNormal} normal + ${goldKing} kings | AI (obsidian): ${obsNormal} normal + ${obsKing} kings | Turn: ${currentPlayer === 'gold' ? 'You' : 'AI'} | Difficulty: ${difficulty}`;
    (window as any).__AI_HELPER_CONTEXT__ = {
      gameType: "checkers",
      moveHistory: [],
      position: JSON.stringify(board.map(row => row.map(p => p ? `${p.player[0]}${p.type[0]}` : "."))),
      turn: currentPlayer,
      boardSummary,
    };
    return () => { delete (window as any).__AI_HELPER_CONTEXT__; };
  }, [board, currentPlayer, difficulty]);

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
          if (result === 'gold') {
            const dur = getDuration();
            recordWin();
            setWinDuration(dur);
            setShowShareCard(true);
          } else if (result === 'obsidian') {
            recordLoss();
          }
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
          if (result === 'gold') {
            const dur = getDuration();
            recordWin();
            setWinDuration(dur);
            setShowShareCard(true);
          } else if (result === 'obsidian') {
            recordLoss();
          }
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

  // AI makes initial move
  useEffect(() => {
    if (currentPlayer !== "obsidian" || gameOver || aiChainPos !== null) return;
    
    setIsAiThinking(true);
    const delay = difficulty === "easy" ? 400 : difficulty === "medium" ? 600 : 800;
    
    const timeout = setTimeout(() => {
      const currentBoard = boardRef.current;
      const move = getAiMove(currentBoard);
      
      if (!move) {
        setGameOver("gold");
        play('checkers_win');
        const dur2 = getDuration();
        recordWin();
        setWinDuration(dur2);
        setShowShareCard(true);
        setIsAiThinking(false);
        return;
      }
      
      if (move.captures && move.captures.length > 0) {
        play('checkers_capture');
      } else {
        play('checkers_slide');
      }
      
      const newBoard = applyMove(currentBoard, move);
      setBoard(newBoard);
      boardRef.current = newBoard;
      
      // Check for chain captures
      if (move.captures && move.captures.length > 0) {
        const moreCaptures = getCaptures(newBoard, move.to);
        if (moreCaptures.length > 0) {
          setAiChainPos(move.to);
          return; // Will continue in next effect
        }
      }
      
      // No chain, end turn
      const result = checkGameOver(newBoard);
      if (result) {
        setGameOver(result);
        play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
        if (result === 'gold') {
          const dur = getDuration();
          recordWin();
          setWinDuration(dur);
          setShowShareCard(true);
        } else if (result === 'obsidian') {
          recordLoss();
        }
      } else {
        setCurrentPlayer("gold");
      }
      setIsAiThinking(false);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [currentPlayer, gameOver, aiChainPos, difficulty, getAiMove, applyMove, checkGameOver, play, getCaptures]);

  // AI continues chain captures
  useEffect(() => {
    if (aiChainPos === null || gameOver) return;
    
    const delay = difficulty === "easy" ? 300 : difficulty === "medium" ? 500 : 600;
    
    const timeout = setTimeout(() => {
      const currentBoard = boardRef.current;
      const chainMoves = getCaptures(currentBoard, aiChainPos);
      
      if (chainMoves.length > 0) {
        const chainMove = chainMoves[0];
        play('checkers_capture');
        const newBoard = applyMove(currentBoard, chainMove);
        setBoard(newBoard);
        boardRef.current = newBoard;
        
        // Check for more captures
        const moreCaptures = getCaptures(newBoard, chainMove.to);
        if (moreCaptures.length > 0) {
          setAiChainPos(chainMove.to);
          return;
        }
      }
      
      // Chain complete, end turn
      setAiChainPos(null);
      const result = checkGameOver(boardRef.current);
      if (result) {
        setGameOver(result);
        play(result === 'gold' ? 'checkers_win' : 'checkers_lose');
        if (result === 'gold') {
          const dur = getDuration();
          recordWin();
          setWinDuration(dur);
          setShowShareCard(true);
        } else if (result === 'obsidian') {
          recordLoss();
        }
      } else {
        setCurrentPlayer("gold");
      }
      setIsAiThinking(false);
    }, delay);
    
    return () => clearTimeout(timeout);
  }, [aiChainPos, gameOver, difficulty, applyMove, checkGameOver, play, getCaptures]);

  const resetGame = () => {
    setBoard(initializeBoard());
    setSelectedPiece(null);
    setValidMoves([]);
    setCurrentPlayer("gold");
    setGameOver(null);
    setIsAiThinking(false);
    setChainCapture(null);
    setAiChainPos(null);
  };

  const isValidMoveTarget = (row: number, col: number) => {
    return validMoves.some(m => m.to.row === row && m.to.col === col);
  };

  return (
    <div className="min-h-screen bg-background pb-8">
      <ProactiveGameTip gameType="checkers" tip={t('tips.checkers')} />
      {/* Header */}
      <div className="relative py-8 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-midnight-light via-background to-background" />
        <div className="relative z-10 max-w-4xl mx-auto">
          <Button asChild variant="ghost" size="sm" className="mb-4 text-muted-foreground hover:text-primary">
            <Link to="/play-ai" className="flex items-center gap-2">
              <ArrowLeft size={18} />
              {t('gameAI.backToTemple')}
            </Link>
          </Button>
          
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-display font-bold bg-gradient-to-r from-primary via-gold-light to-accent bg-clip-text text-transparent">
                {t('gameAI.checkersTitle')}
              </h1>
              <p className="text-muted-foreground capitalize">{t('gameAI.difficulty')}: {difficulty}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <SoundToggle />
              <Button onClick={resetGame} variant="outline" className="border-primary/30">
                <RotateCcw size={18} />
                {t('gameAI.reset')}
              </Button>
            </div>
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
                {gameOver === "gold" ? t('gameAI.youWin') : gameOver === "obsidian" ? t('gameAI.youLose') : t('gameAI.draw')}
              </span>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {isAiThinking ? t('gameAI.aiThinking') : t('gameAI.yourTurn')}
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
        <span className="text-xs text-muted-foreground/60 uppercase tracking-wider">{t('games.checkersTagline')}</span>
        <Gem className="w-4 h-4 text-primary/40" />
        <Star className="w-3 h-3 text-primary/40 fill-primary/20" />
      </div>
      <AIWinShareCard
        open={showShareCard}
        onClose={() => setShowShareCard(false)}
        game="checkers"
        difficulty={difficulty}
        durationSeconds={winDuration}
      />
    </div>
  );
};

export default CheckersAI;