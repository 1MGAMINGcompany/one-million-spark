import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { ChevronRight } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { Fight } from "./FightCard";
import PredictionInsightsPanel from "./PredictionInsightsPanel";

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  open: { label: "OPEN", className: "bg-green-500/20 text-green-400" },
  locked: { label: "LOCKED", className: "bg-yellow-500/20 text-yellow-400" },
  live: { label: "LIVE", className: "bg-red-500/20 text-red-400 animate-pulse" },
  settled: { label: "SETTLED", className: "bg-primary/20 text-primary" },
  draw: { label: "DRAW", className: "bg-muted text-muted-foreground" },
  cancelled: { label: "CANCELLED", className: "bg-muted text-muted-foreground" },
};

function formatPercent(price: number | null | undefined): string {
  if (!price || price <= 0) return "—";
  return `${Math.round(price * 100)}%`;
}

function formatVolume(usd: number): string {
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  if (usd > 0) return `$${usd.toFixed(0)}`;
  return "";
}

/** Extract team name from a fight title like "Will United States win ..." */
function extractTeamFromTitle(title: string): string {
  // "Will United States win ...?" → "United States"
  const willMatch = title.match(/^Will\s+(.+?)\s+win/i);
  if (willMatch) return willMatch[1].trim();
  // Fallback: first part before " — "
  const dash = title.split(" — ")[0];
  return dash || title;
}

interface SoccerMatchCardProps {
  homeFight: Fight;
  awayFight: Fight;
  drawFight?: Fight | null;
  wallet: string | null;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  userEntries: any[];
  onWalletRequired?: () => void;
  eventHasStarted?: boolean;
  readOnly?: boolean;
}

export default function SoccerMatchCard({
  homeFight,
  awayFight,
  drawFight,
  wallet,
  onPredict,
  userEntries,
  onWalletRequired,
  eventHasStarted,
  readOnly,
}: SoccerMatchCardProps) {
  const navigate = useNavigate();
  const [predicting, setPredicting] = useState<string | null>(null);

  // Derive status from the group (use most "active" status)
  const allFights = [homeFight, awayFight, drawFight].filter(Boolean) as Fight[];
  const groupStatus = allFights.some(f => f.status === "live") ? "live"
    : allFights.some(f => f.status === "open") ? "open"
    : allFights.some(f => f.status === "locked") ? "locked"
    : allFights[0]?.status || "open";

  const effectiveStatus = eventHasStarted && groupStatus === "open" ? "locked" : groupStatus;
  const isOpen = effectiveStatus === "open";
  const badge = STATUS_BADGE[effectiveStatus] || STATUS_BADGE.open;

  // Team names
  const homeTeam = extractTeamFromTitle(homeFight.title);
  const awayTeam = extractTeamFromTitle(awayFight.title);

  // Prices (probability in decimal, e.g. 0.39)
  const homePrice = homeFight.price_a;
  const awayPrice = awayFight.price_a;
  const drawPrice = drawFight?.price_a;

  // Logos — all sibling fights share the same home_logo/away_logo (event-level).
  // Determine which fight represents the "home" team from the event name (e.g. "Mexico vs. Belgium")
  const eventName = homeFight.event_name || awayFight.event_name;
  const [eventHome] = eventName.split(/\s+vs\.?\s+/i);
  const homeIsEventHome = homeFight.title.toLowerCase().includes((eventHome || "").toLowerCase().trim());
  const anyFight = allFights[0]; // all share same logos
  const homeLogo = homeIsEventHome ? anyFight.home_logo : anyFight.away_logo;
  const awayLogo = homeIsEventHome ? anyFight.away_logo : anyFight.home_logo;

  // Volume
  const totalVolume = allFights.reduce((sum, f) => sum + (f.polymarket_volume_usd ?? 0), 0);

  // User has entries?
  const allFightIds = new Set(allFights.map(f => f.id));
  const myEntries = userEntries.filter(e => allFightIds.has(e.fight_id));
  const hasBet = myEntries.length > 0;

  // Match date from polymarket question
  const matchTitle = homeFight.event_name || `${homeTeam} vs ${awayTeam}`;

  const handlePredict = (fight: Fight) => {
    if (readOnly) return;
    if (!wallet) {
      onWalletRequired?.();
      return;
    }
    if (!isOpen) return;
    setPredicting(fight.id);
    onPredict(fight, "fighter_a"); // Betting "Yes" on this outcome
    setTimeout(() => setPredicting(null), 2000);
  };

  return (
    <Card className="overflow-hidden border-border/50 hover:border-primary/30 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-base">⚽</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Match Prediction
          </span>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Match title */}
      <div className="px-4 pb-2">
        <h3 className="text-sm font-bold text-foreground truncate">{matchTitle}</h3>
      </div>

      {/* 3-way outcome row */}
      <div className="px-4 pb-3">
        <div className="grid grid-cols-3 gap-2">
          {/* Home */}
          <OutcomeButton
            logo={homeLogo}
            teamName={homeTeam}
            price={homePrice}
            colorClass="border-blue-500/40 hover:border-blue-400 hover:bg-blue-500/10"
            priceColor="text-blue-400"
            disabled={!isOpen || readOnly}
            loading={predicting === homeFight.id}
            hasBet={myEntries.some(e => e.fight_id === homeFight.id)}
            onClick={() => handlePredict(homeFight)}
          />

          {/* Draw */}
          {drawFight && (
            <OutcomeButton
              emoji="🤝"
              teamName="Draw"
              price={drawPrice}
              colorClass="border-muted-foreground/30 hover:border-muted-foreground/60 hover:bg-muted/30"
              priceColor="text-muted-foreground"
              disabled={!isOpen || readOnly}
              loading={predicting === drawFight.id}
              hasBet={myEntries.some(e => e.fight_id === drawFight.id)}
              onClick={() => handlePredict(drawFight)}
            />
          )}

          {/* Away */}
          <OutcomeButton
            logo={awayLogo}
            teamName={awayTeam}
            price={awayPrice}
            colorClass="border-red-500/40 hover:border-red-400 hover:bg-red-500/10"
            priceColor="text-red-400"
            disabled={!isOpen || readOnly}
            loading={predicting === awayFight.id}
            hasBet={myEntries.some(e => e.fight_id === awayFight.id)}
            onClick={() => handlePredict(awayFight)}
          />
        </div>
      </div>

      {/* Footer: volume + detail link */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-background/30">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {totalVolume > 0 && (
            <span className="font-bold text-primary">{formatVolume(totalVolume)} Vol.</span>
          )}
          {hasBet && (
            <span className="text-green-400 font-bold">✓ You predicted</span>
          )}
        </div>
        <button
          onClick={() => navigate(`/predictions/${homeFight.id}`)}
          className="flex items-center gap-1 text-[10px] text-primary hover:underline font-medium"
        >
          View Odds & Details <ChevronRight className="w-3 h-3" />
        </button>
      </div>
    </Card>
  );
}

function OutcomeButton({
  logo,
  emoji,
  teamName,
  price,
  colorClass,
  priceColor,
  disabled,
  loading,
  hasBet,
  onClick,
}: {
  logo?: string | null;
  emoji?: string;
  teamName: string;
  price: number | null | undefined;
  colorClass: string;
  priceColor: string;
  disabled?: boolean;
  loading?: boolean;
  hasBet?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-all ${colorClass} ${
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
      } ${hasBet ? "ring-2 ring-primary/50" : ""}`}
    >
      {logo ? (
        <img src={logo} alt={teamName} className="w-8 h-8 object-contain rounded-sm" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
      ) : emoji ? (
        <span className="text-2xl">{emoji}</span>
      ) : (
        <span className="text-2xl">⚽</span>
      )}
      <span className="text-[11px] font-semibold text-foreground text-center leading-tight line-clamp-2">
        {teamName}
      </span>
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`text-sm font-bold ${priceColor}`}>
              {loading ? "..." : formatPercent(price)}
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">
            Represents current market probability
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </button>
  );
}
