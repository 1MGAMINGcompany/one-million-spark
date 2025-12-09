import { useState } from "react";
import { Chess, Square, PieceSymbol, Color } from "chess.js";

interface ChessBoardProps {
  game: Chess;
  onMove: (from: Square, to: Square) => boolean;
  disabled?: boolean;
}

const pieceUnicode: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const ranks = ["8", "7", "6", "5", "4", "3", "2", "1"];

export function ChessBoard({ game, onMove, disabled = false }: ChessBoardProps) {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [legalMoves, setLegalMoves] = useState<Square[]>([]);

  const handleSquareClick = (square: Square) => {
    if (disabled) return;

    const piece = game.get(square);

    // If a square is already selected
    if (selectedSquare) {
      // Try to make the move
      const moveSuccessful = onMove(selectedSquare, square);
      
      if (moveSuccessful) {
        setSelectedSquare(null);
        setLegalMoves([]);
        return;
      }

      // If clicking on own piece, select it instead
      if (piece && piece.color === "w") {
        setSelectedSquare(square);
        const moves = game.moves({ square, verbose: true });
        setLegalMoves(moves.map((m) => m.to as Square));
        return;
      }

      // Otherwise, deselect
      setSelectedSquare(null);
      setLegalMoves([]);
      return;
    }

    // Select the piece if it's white (player's piece)
    if (piece && piece.color === "w") {
      setSelectedSquare(square);
      const moves = game.moves({ square, verbose: true });
      setLegalMoves(moves.map((m) => m.to as Square));
    }
  };

  const isLightSquare = (file: number, rank: number) => {
    return (file + rank) % 2 === 0;
  };

  return (
    <div className="aspect-square w-full max-w-[600px] mx-auto">
      <div className="grid grid-cols-8 border-2 border-border rounded-lg overflow-hidden">
        {ranks.map((rank, rankIndex) =>
          files.map((file, fileIndex) => {
            const square = `${file}${rank}` as Square;
            const piece = game.get(square);
            const isLight = isLightSquare(fileIndex, rankIndex);
            const isSelected = selectedSquare === square;
            const isLegalMove = legalMoves.includes(square);
            const isCheck = game.isCheck() && piece?.type === "k" && piece?.color === game.turn();

            return (
              <button
                key={square}
                onClick={() => handleSquareClick(square)}
                disabled={disabled}
                className={`
                  aspect-square flex items-center justify-center text-3xl sm:text-4xl md:text-5xl
                  transition-colors cursor-pointer relative
                  ${isLight ? "bg-amber-100" : "bg-amber-700"}
                  ${isSelected ? "ring-4 ring-inset ring-blue-500" : ""}
                  ${isCheck ? "ring-4 ring-inset ring-red-500" : ""}
                  ${disabled ? "cursor-not-allowed" : "hover:brightness-110"}
                `}
              >
                {/* Legal move indicator */}
                {isLegalMove && !piece && (
                  <div className="absolute w-3 h-3 rounded-full bg-black/20" />
                )}
                {isLegalMove && piece && (
                  <div className="absolute inset-0 ring-4 ring-inset ring-black/20 rounded-sm" />
                )}
                
                {/* Piece */}
                {piece && (
                  <span className={piece.color === "w" ? "text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]" : "text-gray-900"}>
                    {pieceUnicode[piece.color][piece.type]}
                  </span>
                )}

                {/* Square notation (corner squares only) */}
                {fileIndex === 0 && (
                  <span className={`absolute top-0.5 left-1 text-xs font-medium ${isLight ? "text-amber-700" : "text-amber-100"}`}>
                    {rank}
                  </span>
                )}
                {rankIndex === 7 && (
                  <span className={`absolute bottom-0.5 right-1 text-xs font-medium ${isLight ? "text-amber-700" : "text-amber-100"}`}>
                    {file}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
