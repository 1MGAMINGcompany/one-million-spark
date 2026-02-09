import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Clock, AlertTriangle, Wifi, Shield, Timer, Trophy, CheckCircle } from "lucide-react";

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
    <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
      <h1 className="text-3xl font-cinzel text-primary text-center">
        {t("gameRulesDetailed.pageTitle")}
      </h1>

      <Card className="bg-background/80 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary flex items-center gap-2">
            <Clock className="h-5 w-5" />
            {t("gameRulesDetailed.generalTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="font-semibold text-foreground mb-1">{t("gameRulesDetailed.turnTimersTitle")}</h3>
            <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
              <li>{t("gameRulesDetailed.turnTimersDesc")}</li>
              <li>{t("gameRulesDetailed.turnTimersStart")}</li>
              <li>{t("gameRulesDetailed.turnTimersSkip")}</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("gameRulesDetailed.missedTurnsTitle")}
            </h3>
            <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
              <li>{t("gameRulesDetailed.missedTurnsStrike")}</li>
              <li className="font-medium text-destructive">{t("gameRulesDetailed.missedTurnsAutoLoss")}</li>
              <li>{t("gameRulesDetailed.missedTurnsAutomatic")}</li>
            </ul>
          </div>
          <div>
            <h3 className="font-semibold text-foreground mb-1 flex items-center gap-2">
              <Wifi className="h-4 w-4 text-blue-500" />
              {t("gameRulesDetailed.disconnectTitle")}
            </h3>
            <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
              <li>{t("gameRulesDetailed.disconnectNoPause")}</li>
              <li>{t("gameRulesDetailed.disconnectTimerRuns")}</li>
              <li>{t("gameRulesDetailed.disconnectFairFinish")}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background/80 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary">
            {t("gameRules.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="chess-checkers-dominos" className="border-primary/20">
              <AccordionTrigger className="text-lg font-semibold text-primary hover:text-primary/80">
                ♟️ {t("gameRulesDetailed.chessCheckersTitle")}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground italic">{t("gameRulesDetailed.chessCheckersSubtitle")}</p>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.chessCheckersTurnFlow")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.chessCheckersTurnFlowDesc")}</li>
                    <li>{t("gameRulesDetailed.chessCheckersTurnSwitch")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.chessCheckersTimerTitle")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.chessCheckersTimerPerMove")}</li>
                    <li>{t("gameRulesDetailed.chessCheckersTimerSkip")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1 text-destructive">{t("gameRulesDetailed.chessCheckersAutoForfeit")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.chessCheckersAutoForfeitDesc")}</li>
                    <li>{t("gameRulesDetailed.chessCheckersAutoForfeitSettle")}</li>
                  </ul>
                </div>
                <p className="text-xs text-emerald-500 mt-2">✅ {t("gameRulesDetailed.chessCheckersNote")}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="backgammon-detailed" className="border-primary/20">
              <AccordionTrigger className="text-lg font-semibold text-primary hover:text-primary/80">
                🎲 {t("gameRulesDetailed.backgammonTitle")}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground italic">{t("gameRulesDetailed.backgammonSubtitle")}</p>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.backgammonTurnFlow")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.backgammonTurnFlowStep1")}</li>
                    <li>{t("gameRulesDetailed.backgammonTurnFlowStep2")}</li>
                    <li>{t("gameRulesDetailed.backgammonTurnFlowStep3")}</li>
                    <li>{t("gameRulesDetailed.backgammonTurnFlowDoubles")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.backgammonTimerTitle")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.backgammonTimerPerTurn")}</li>
                    <li>{t("gameRulesDetailed.backgammonTimerNoReset")}</li>
                    <li>{t("gameRulesDetailed.backgammonTimerComplete")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.backgammonTimeout")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.backgammonTimeoutEnd")}</li>
                    <li>{t("gameRulesDetailed.backgammonTimeoutStrike")}</li>
                    <li>{t("gameRulesDetailed.backgammonTimeoutOpponent")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1 text-destructive">{t("gameRulesDetailed.backgammonAutoForfeit")}</h4>
                  <p className="text-sm text-foreground/80 pl-6">{t("gameRulesDetailed.backgammonAutoForfeitDesc")}</p>
                </div>
                <p className="text-xs text-emerald-500 mt-2">✅ {t("gameRulesDetailed.backgammonNote")}</p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ludo-detailed" className="border-primary/20">
              <AccordionTrigger className="text-lg font-semibold text-primary hover:text-primary/80">
                🎯 {t("gameRulesDetailed.ludoTitle")}
              </AccordionTrigger>
              <AccordionContent className="space-y-3">
                <p className="text-sm text-muted-foreground italic">{t("gameRulesDetailed.ludoSubtitle")}</p>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.ludoTurnFlow")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.ludoTurnFlowDesc")}</li>
                    <li>{t("gameRulesDetailed.ludoTurnFlowSteps")}</li>
                    <li>{t("gameRulesDetailed.ludoTurnFlowRotate")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1">{t("gameRulesDetailed.ludoTimerTitle")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.ludoTimerPerTurn")}</li>
                    <li>{t("gameRulesDetailed.ludoTimerStrike")}</li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-sm mb-1 text-destructive">{t("gameRulesDetailed.ludoEliminationTitle")}</h4>
                  <ul className="list-disc pl-6 space-y-1 text-foreground/80 text-sm">
                    <li>{t("gameRulesDetailed.ludoEliminationDesc")}</li>
                    <li>{t("gameRulesDetailed.ludoEliminationContinue")}</li>
                    <li>{t("gameRulesDetailed.ludoEliminationWin")}</li>
                  </ul>
                </div>
                <p className="text-xs text-emerald-500 mt-2">✅ {t("gameRulesDetailed.ludoNote")}</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="mt-4 pt-4 border-t border-primary/10">
            <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("gameRules.title")}</h3>
            <Accordion type="single" collapsible className="w-full">
              {games.map((game) => (
                <AccordionItem key={game.id} value={game.id} className="border-primary/20">
                  <AccordionTrigger className="text-base font-semibold text-primary hover:text-primary/80">
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
          </div>
        </CardContent>
      </Card>

      <Card className="bg-background/80 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary flex items-center gap-2">
            <Timer className="h-5 w-5" />
            {t("gameRulesDetailed.noShowTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 text-sm">
            <li>{t("gameRulesDetailed.noShowCancel")}</li>
            <li>{t("gameRulesDetailed.noShowFundsSafe")}</li>
            <li>{t("gameRulesDetailed.noShowRefund")}</li>
            <li>{t("gameRulesDetailed.noShowSign")}</li>
          </ul>
          <p className="mt-3 text-sm font-semibold text-emerald-500">{t("gameRulesDetailed.noShowPromise")}</p>
        </CardContent>
      </Card>

      <Card className="bg-background/80 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            {t("gameRulesDetailed.settlementTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 text-sm">
            <li>{t("gameRulesDetailed.settlementAuto")}</li>
            <li>{t("gameRulesDetailed.settlementInstant")}</li>
            <li>{t("gameRulesDetailed.settlementShare")}
              <ul className="list-disc pl-6 space-y-1 mt-1">
                <li>{t("gameRulesDetailed.settlementShareWin")}</li>
                <li>{t("gameRulesDetailed.settlementShareBrag")}</li>
                <li>{t("gameRulesDetailed.settlementShareInvite")}</li>
              </ul>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-background/80 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary flex items-center gap-2">
            <Shield className="h-5 w-5" />
            {t("gameRulesDetailed.fairPlayTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80 text-sm">
            <li>{t("gameRulesDetailed.fairPlayTimers")}</li>
            <li>{t("gameRulesDetailed.fairPlayNoFreeze")}</li>
            <li>{t("gameRulesDetailed.fairPlayNoSteal")}</li>
            <li>{t("gameRulesDetailed.fairPlayLeave")}</li>
          </ul>
        </CardContent>
      </Card>

      <Card className="bg-primary/5 border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl font-cinzel text-primary flex items-center gap-2">
            <CheckCircle className="h-5 w-5" />
            {t("gameRulesDetailed.summaryTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-foreground/80 text-sm">
            <li className="flex items-center gap-2">✅ {t("gameRulesDetailed.summaryFinish")}</li>
            <li className="flex items-center gap-2">✅ {t("gameRulesDetailed.summaryTimers")}</li>
            <li className="flex items-center gap-2">✅ {t("gameRulesDetailed.summaryMissed")}</li>
            <li className="flex items-center gap-2">✅ {t("gameRulesDetailed.summaryFunds")}</li>
            <li className="flex items-center gap-2">✅ {t("gameRulesDetailed.summaryWins")}</li>
          </ul>
          <p className="mt-4 text-sm font-semibold text-primary text-center">
            {t("gameRulesDetailed.summaryTagline")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default GameRules;
