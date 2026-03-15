/**
 * buildCinematicEvent – converts a completed chess move into a cinematic animation payload.
 * Pure function, no side effects. Safe to call on every move.
 */

import type { Chess, Square, PieceSymbol, Color } from "chess.js";

export interface BoardPiece {
  square: Square;
  piece: string;
  color: "white" | "black";
}

export interface CinematicEvent {
  from: Square;
  to: Square;
  piece: string;
  color: "white" | "black";
  isCapture: boolean;
  isCheck: boolean;
  isMate: boolean;
  isPromotion: boolean;
  san: string;
  /** Full board state AFTER the move (used to render all pieces in 3D) */
  boardPieces: BoardPiece[];
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  k: "king",
  q: "queen",
  r: "rook",
  b: "bishop",
  n: "knight",
  p: "pawn",
};

/**
 * Extract all pieces from the board after the move.
 */
function extractBoardPieces(game: Chess): BoardPiece[] {
  const pieces: BoardPiece[] = [];
  const board = game.board();
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const cell = board[rank][file];
      if (cell) {
        const square = (String.fromCharCode(97 + file) + String(8 - rank)) as Square;
        pieces.push({
          square,
          piece: PIECE_NAMES[cell.type] ?? "pawn",
          color: cell.color === "w" ? "white" : "black",
        });
      }
    }
  }
  return pieces;
}

/**
 * Build a cinematic event from a completed move.
 * Call AFTER the move has been applied to the Chess instance.
 */
export function buildCinematicEvent(
  from: Square,
  to: Square,
  pieceType: PieceSymbol,
  pieceColor: Color,
  wasCapture: boolean,
  san: string,
  gameAfterMove: Chess,
): CinematicEvent {
  return {
    from,
    to,
    piece: PIECE_NAMES[pieceType] ?? "pawn",
    color: pieceColor === "w" ? "white" : "black",
    isCapture: wasCapture,
    isCheck: gameAfterMove.isCheck(),
    isMate: gameAfterMove.isCheckmate(),
    isPromotion: san.includes("="),
    san,
    boardPieces: extractBoardPieces(gameAfterMove),
  };
}
