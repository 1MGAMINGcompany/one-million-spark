import { Card } from "@/components/ui/card";
import { Bell } from "lucide-react";
import boxingGlove from "@/assets/boxinggloves-1mg.png";
import mmaGloves from "@/assets/mmagloves-1mg.png";
import futbolBall from "@/assets/soccerball-1mg.png";
import muayThai from "@/assets/muay-thai.png";
import bareKnuckle from "@/assets/bare-knuckle.png";

const SPORT_TEASERS: Record<string, { icon?: string; image?: string; color: string; bgColor: string; description: string }> = {
  "MUAY THAI": {
    image: muayThai,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    description: "Muay Thai fight predictions coming soon.",
  },
  BOXING: {
    image: boxingGlove,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    description: "Championship boxing predictions coming soon.",
  },
  MMA: {
    image: mmaGloves,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    description: "MMA fight predictions dropping soon.",
  },
  "BARE KNUCKLE": {
    image: bareKnuckle,
    color: "text-orange-400",
    bgColor: "bg-orange-500/10",
    description: "Bare knuckle fight predictions coming soon.",
  },
  FUTBOL: {
    image: futbolBall,
    color: "text-yellow-300",
    bgColor: "bg-yellow-500/10",
    description: "Futbol match predictions coming soon.",
  },
};

export default function ComingSoonCard({ sport }: { sport: string }) {
  const config = SPORT_TEASERS[sport];
  if (!config) return null;

  return (
    <Card className={`${config.bgColor} border-border/30 p-5 flex items-center gap-4`}>
      {config.image ? (
        <img src={config.image} alt={sport} className="w-10 h-10 object-contain" />
      ) : (
        <span className="text-3xl">{config.icon}</span>
      )}
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-bold ${config.color} uppercase tracking-wider`}>{sport}</h3>
          <span className="text-[10px] font-bold bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
            COMING SOON
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Bell className="w-4 h-4" />
      </div>
    </Card>
  );
}
