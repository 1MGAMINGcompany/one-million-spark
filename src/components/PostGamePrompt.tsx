import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Users, Wallet, Zap } from "lucide-react";

interface PostGamePromptProps {
  gameType: string;
}

/**
 * Shown after an AI game ends to funnel players into PvP.
 * No login required to see this — login triggers on PvP action.
 */
export function PostGamePrompt({ gameType }: PostGamePromptProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-6 bg-card border border-primary/30 rounded-xl p-5 space-y-4">
      <div className="text-center space-y-1">
        <p className="text-lg font-display font-semibold text-foreground">
          {t("postGame.title", "Enjoyed the game?")}
        </p>
        <p className="text-sm text-muted-foreground">
          {t("postGame.subtitle", "Challenge real players next!")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <Button asChild variant="gold" className="w-full gap-2 h-12 text-base">
          <Link to={`/quick-match?game=${gameType}`}>
            <Users className="w-5 h-5" />
            {t("postGame.playFreeHuman", "Play Free vs Human")}
          </Link>
        </Button>

        <Button asChild variant="outline" className="w-full gap-2 h-12 border-primary/30">
          <Link to={`/create-room?game=${gameType}`}>
            <Wallet className="w-5 h-5 text-primary" />
            {t("postGame.playForSol", "Play for SOL")}
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {t("postGame.noWalletNeeded", "Free matches require no wallet or funds")}
      </p>
    </div>
  );
}
