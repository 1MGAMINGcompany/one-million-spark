import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import FightCard from "./FightCard";
import type { Fight } from "./FightCard";
import muayThaiImg from "@/assets/muay-thai.png";
import boxingGloveImg from "@/assets/boxing-glove.png";
import mmaGlovesImg from "@/assets/mma-gloves.png";
import futbolImg from "@/assets/futbol.png";
import { getSportItemLabel } from "@/lib/sportLabels";

const LAMPORTS = 1_000_000_000;

interface SportConfig {
  icon?: string;
  image?: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const SPORT_CONFIG: Record<string, SportConfig> = {
  "MUAY THAI": { image: muayThaiImg, color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  "BOXING": { image: boxingGloveImg, color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  "MMA": { image: mmaGlovesImg, color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  "FUTBOL": { image: futbolImg, color: "text-yellow-400", bgColor: "bg-yellow-500/10", borderColor: "border-yellow-500/30" },
};

interface PredictionEvent {
  id: string;
  event_name: string;
  organization: string | null;
  event_date: string | null;
  location: string | null;
  status: string;
  is_test: boolean;
  source_provider?: string | null;
  league_logo?: string | null;
}

function formatCountdown(eventDate: string | null): string | null {
  if (!eventDate) return null;
  const diff = new Date(eventDate).getTime() - Date.now();
  if (diff <= 0) return "Started";
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return `Starts in ${days}d`;
  }
  return `Starts in ${hours}h ${mins}m`;
}

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "PREMIER LEAGUE", "LA LIGA", "CHAMPIONS LEAGUE",
  "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE", "LIGA MX", "EPL",
  "COPA", "EURO", "FIFA", "WORLD CUP",
];

function parseSport(eventName: string, sourceProvider?: string | null): string {
  if (sourceProvider === "api-football") return "FUTBOL";
  const upper = eventName.toUpperCase();
  if (SOCCER_KEYWORDS.some(k => upper.includes(k))) return "FUTBOL";
  if (upper.includes("UFC") || upper.includes("MMA") || upper.includes("PFL") || upper.includes("BELLATOR") || upper.includes("ONE CHAMPIONSHIP")) return "MMA";
  if (upper.includes("BOXING")) return "BOXING";
  if (upper.includes("MUAY THAI")) return "MUAY THAI";
  const parts = eventName.split(' — ');
  return parts[0] || "OTHER";
}

function parseEventLabel(eventName: string): { sport: string; name: string; subEvent?: string; date?: string } {
  const parts = eventName.split(' — ');
  if (parts.length >= 4) return { sport: parts[0], name: parts[1], subEvent: parts[2], date: parts[3] };
  if (parts.length === 3) return { sport: parts[0], name: parts[1], date: parts[2] };
  if (parts.length === 2) return { sport: parts[0], name: parts[1] };
  return { sport: "OTHER", name: eventName };
}

function sortFights(fights: Fight[]): Fight[] {
  return [...fights].sort((a, b) => {
    const labelA = a.title.split(' — ')[0];
    const labelB = b.title.split(' — ')[0];
    if (labelA.startsWith('Main')) return -1;
    if (labelB.startsWith('Main')) return 1;
    if (labelA.startsWith('Semi') && !labelB.startsWith('Semi')) return 1;
    if (labelB.startsWith('Semi') && !labelA.startsWith('Semi')) return -1;
    const numA = parseInt(labelA.replace(/\D/g, '')) || 0;
    const numB = parseInt(labelB.replace(/\D/g, '')) || 0;
    return numB - numA;
  });
}

export default function EventSection({
  eventName,
  fights,
  wallet,
  userEntries,
  onPredict,
  onClaim,
  claiming,
  hotFightIds,
  onWalletRequired,
  event,
}: {
  eventName: string;
  fights: Fight[];
  wallet: string | null;
  userEntries: any[];
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  onClaim: (fightId: string) => void;
  claiming: boolean;
  hotFightIds: Set<string>;
  onWalletRequired?: () => void;
  event?: PredictionEvent;
}) {
  const hasOpen = fights.some(f => f.status === "open");
  const [expanded, setExpanded] = useState(false);
  const [leagueLogoError, setLeagueLogoError] = useState(false);

  const parsed = parseEventLabel(eventName);
  const sport = parseSport(eventName, event?.source_provider);
  const config = SPORT_CONFIG[sport] || SPORT_CONFIG["MUAY THAI"];

  const totalPool = fights.reduce((sum, f) => sum + f.pool_a_lamports + f.pool_b_lamports, 0) / LAMPORTS;
  const openCount = fights.filter(f => f.status === "open").length;
  const liveCount = fights.filter(f => f.status === "live").length;

  const mainFights = fights.filter(f => !f.event_name.includes("Road to Tulum"));
  const tournamentFights = fights.filter(f => f.event_name.includes("Road to Tulum"));

  const sortedMain = sortFights(mainFights);
  const sortedTournament = sortFights(tournamentFights);

  // Use event metadata if available
  const displayDate = event?.event_date ? new Date(event.event_date).toLocaleDateString() : parsed.date;
  const displayOrg = event?.organization;
  const displayLocation = event?.location;
  const countdown = formatCountdown(event?.event_date ?? null);
  const showLeagueLogo = event?.league_logo && !leagueLogoError;

  return (
    <div className={`rounded-xl border ${config.borderColor} overflow-hidden`}>
      <button
        className={`w-full ${config.bgColor} px-4 py-4 flex items-start sm:items-center justify-between gap-3 text-left`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
           {config.image ? (
              <img src={config.image} alt={sport} className="w-6 h-6 object-contain" />
            ) : (
              <span className="text-xl">{config.icon}</span>
            )}
            {showLeagueLogo && (
              <img
                src={event!.league_logo!}
                alt=""
                className="w-[18px] h-[18px] object-contain"
                onError={() => setLeagueLogoError(true)}
                loading="lazy"
              />
            )}
            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>{sport}</span>
            {event?.is_test && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">TEST</span>
            )}
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                LIVE
              </span>
            )}
            {hasOpen && liveCount === 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                OPEN
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-foreground font-['Cinzel'] mt-1 truncate">
            {parsed.name}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {countdown && (
              <span className={`font-bold ${countdown === "Started" ? "text-red-400" : "text-primary"}`}>
                ⏱ {countdown}
              </span>
            )}
            {displayDate && <span>📅 {displayDate}</span>}
            {displayOrg && <span>🏢 {displayOrg}</span>}
            {displayLocation && <span>📍 {displayLocation}</span>}
            <span>{fights.length} {getSportItemLabel(sport, fights.length)}</span>
            {openCount > 0 && <span className="text-green-400">{openCount} Open {getSportItemLabel(sport, openCount)}</span>}
            <span className="text-primary font-bold">{totalPool.toFixed(2)} SOL Pool</span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 sm:p-4 space-y-3 bg-background/50">
          {sortedMain.length > 0 && (
            <div className={`grid gap-3 ${sport === "FUTBOL" && sortedMain.length === 1 ? "grid-cols-1 max-w-2xl mx-auto" : "sm:grid-cols-2"}`}>
              {sortedMain.map((fight) => (
                <FightCard
                  key={fight.id}
                  fight={fight}
                  wallet={wallet}
                  onPredict={onPredict}
                  userEntries={userEntries.filter((e) => e.fight_id === fight.id)}
                  onClaim={onClaim}
                  claiming={claiming}
                  isHot={hotFightIds.has(fight.id)}
                  onWalletRequired={onWalletRequired}
                  isSoccerEvent={sport === "FUTBOL"}
                />
              ))}
            </div>
          )}
          {sortedTournament.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 mt-2">
                <span className="text-sm">🏆</span>
                <h3 className="text-sm font-bold text-foreground font-['Cinzel']">Road to Tulum — Tournament</h3>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {sortedTournament.map((fight) => (
                  <FightCard
                    key={fight.id}
                    fight={fight}
                    wallet={wallet}
                    onPredict={onPredict}
                    userEntries={userEntries.filter((e) => e.fight_id === fight.id)}
                    onClaim={onClaim}
                    claiming={claiming}
                    isHot={hotFightIds.has(fight.id)}
                    onWalletRequired={onWalletRequired}
                    isSoccerEvent={sport === "FUTBOL"}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { parseSport };
