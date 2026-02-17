import { useTranslation } from "react-i18next";
import { CheckCircle } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

const wallets = ["Phantom", "Solflare", "Backpack"];
const games = [
  { name: "Chess", live: true },
  { name: "Backgammon", live: true },
  { name: "Checkers", live: true },
  { name: "Dominos", live: true },
  { name: "Ludo", live: true },
];

const PlatformStatus = () => {
  const { t } = useTranslation();
  
  return (
    <Card className="mt-12">
      <CardHeader>
        <CardTitle className="text-lg">{t("platformStatus.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground/80 mb-2">{t("platformStatus.supportedWallets")}</p>
          <div className="flex flex-wrap gap-3">
            {wallets.map((w) => (
              <span key={w} className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                <CheckCircle className="w-4 h-4 text-green-500" /> {w}
              </span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-foreground/80 mb-2">{t("platformStatus.liveGames")}</p>
          <div className="flex flex-wrap gap-3">
            {games.map((g) => (
              <span key={g.name} className="inline-flex items-center gap-1.5 text-sm text-foreground/70">
                <CheckCircle className={`w-4 h-4 ${g.live ? "text-green-500" : "text-muted-foreground"}`} />
                {g.name}
              </span>
            ))}
          </div>
        </div>
        <p className="text-xs text-foreground/50">
          {t("platformStatus.disclaimer")}
        </p>
      </CardContent>
    </Card>
  );
};

export default PlatformStatus;
