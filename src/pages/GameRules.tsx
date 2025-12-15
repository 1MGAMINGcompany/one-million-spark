import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const GameRules = () => {
  const { t } = useTranslation();

  const games = [
    { id: "chess", nameKey: "gameRules.chess", rulesKey: "gameRules.chessRules" },
    { id: "checkers", nameKey: "gameRules.checkers", rulesKey: "gameRules.checkersRules" },
    { id: "backgammon", nameKey: "gameRules.backgammon", rulesKey: "gameRules.backgammonRules" },
    { id: "ludo", nameKey: "gameRules.ludo", rulesKey: "gameRules.ludoRules" },
    { id: "dominos", nameKey: "gameRules.dominos", rulesKey: "gameRules.dominosRules" },
  ];

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Card className="bg-background/80 border-primary/20">
        <CardHeader>
          <CardTitle className="text-3xl font-cinzel text-primary text-center">
            {t("gameRules.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            {games.map((game) => (
              <AccordionItem key={game.id} value={game.id} className="border-primary/20">
                <AccordionTrigger className="text-lg font-semibold text-primary hover:text-primary/80">
                  {t(game.nameKey)}
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="list-disc pl-6 space-y-2 text-foreground/80">
                    {(t(game.rulesKey, { returnObjects: true }) as string[]).map((rule, idx) => (
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