import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const GameRules = () => {
  const { t } = useTranslation();

  const games = [
    {
      id: "chess",
      name: "Chess",
      rules: [
        "Each player starts with 16 pieces: 1 king, 1 queen, 2 rooks, 2 bishops, 2 knights, and 8 pawns.",
        "White moves first, then players alternate turns.",
        "The objective is to checkmate the opponent's king.",
        "Special moves include castling, en passant, and pawn promotion.",
        "A game can end in checkmate, stalemate, resignation, or draw by agreement."
      ]
    },
    {
      id: "checkers",
      name: "Checkers",
      rules: [
        "Each player starts with 12 pieces on dark squares.",
        "Pieces move diagonally forward one square.",
        "Captures are mandatory when available.",
        "Multi-jump captures are allowed in a single turn.",
        "Pieces reaching the opposite end become kings and can move backward.",
        "Win by capturing all opponent pieces or blocking all their moves."
      ]
    },
    {
      id: "backgammon",
      name: "Backgammon",
      rules: [
        "Each player has 15 checkers to move around the board.",
        "Roll two dice to determine movement.",
        "Move checkers toward your home board.",
        "Land on opponent's single checker (blot) to send it to the bar.",
        "Checkers on the bar must re-enter before other moves.",
        "Bear off all your checkers first to win."
      ]
    },
    {
      id: "ludo",
      name: "Ludo",
      rules: [
        "Each player has 4 tokens starting in their home base.",
        "Roll a 6 to move a token from base to start.",
        "Move tokens clockwise around the board based on dice roll.",
        "Land on opponent's token to send it back to base.",
        "Rolling a 6 grants an extra turn.",
        "First player to move all 4 tokens to the finish wins."
      ]
    },
    {
      id: "dominos",
      name: "Dominos",
      rules: [
        "Each player draws 7 tiles from a shuffled set.",
        "Player with the highest double (e.g., [6|6]) goes first.",
        "If no player has a double, highest pip count tile determines first player.",
        "Match tile ends to play (e.g., 6 connects to 6).",
        "Draw from the boneyard if you can't play.",
        "First to play all tiles or lowest pip count when blocked wins."
      ]
    }
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            Game Rules
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {games.map((game) => (
              <AccordionItem key={game.id} value={game.id} className="border-primary/20">
                <AccordionTrigger className="text-lg font-semibold text-primary hover:text-primary/80">
                  {game.name}
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc pl-6 space-y-2 text-foreground/80">
                    {game.rules.map((rule, idx) => (
                      <li key={idx}>{rule}</li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};

export default GameRules;
