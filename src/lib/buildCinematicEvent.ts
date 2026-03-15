/**
 * buildCinematicEvent – converts a completed chess move into a cinematic animation payload.
 * Pure function, no side effects. Safe to call on every move.
 */

import type { Chess, Square, PieceSymbol, Color } from "chess.js";

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
  };
}
