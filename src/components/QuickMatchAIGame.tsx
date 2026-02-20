/**
 * QuickMatchAIGame — inline router that renders the correct AI game
 * inside the QuickMatch full-screen overlay without any page navigation.
 */

import ChessAI from "@/pages/ChessAI";
import DominosAI from "@/pages/DominosAI";
import BackgammonAI from "@/pages/BackgammonAI";
import CheckersAI from "@/pages/CheckersAI";
import LudoAI from "@/pages/LudoAI";

export type QuickMatchGameKey = "chess" | "dominos" | "backgammon" | "checkers" | "ludo";

interface QuickMatchAIGameProps {
  gameKey: QuickMatchGameKey;
}

export default function QuickMatchAIGame({ gameKey }: QuickMatchAIGameProps) {
  switch (gameKey) {
    case "chess":
      return <ChessAI />;
    case "dominos":
      return <DominosAI />;
    case "backgammon":
      return <BackgammonAI />;
    case "checkers":
      return <CheckersAI />;
    case "ludo":
      return <LudoAI />;
    default:
      return <ChessAI />;
  }
}
