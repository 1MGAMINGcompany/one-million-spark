import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import FightCard from "./FightCard";
import type { Fight } from "./FightCard";
import SoccerMatchCard from "./SoccerMatchCard";
import muayThaiImg from "@/assets/muay-thai.png";
import boxingGloveImg from "@/assets/boxinggloves-1mg.png";
import mmaGlovesImg from "@/assets/mmagloves-1mg.png";
import futbolImg from "@/assets/soccerball-1mg.png";
import bareKnuckleImg from "@/assets/bare-knuckle.png";
import { getSportItemLabel } from "@/lib/sportLabels";
import { formatEventDateTime, formatEventTime } from "@/lib/formatEventLocalDateTime";
import { isPropMarket } from "@/lib/detectSport";

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
  "BARE KNUCKLE": { image: bareKnuckleImg, color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  "NFL": { icon: "🏈", color: "text-amber-400", bgColor: "bg-amber-500/10", borderColor: "border-amber-500/30" },
  "NBA": { icon: "🏀", color: "text-orange-400", bgColor: "bg-orange-500/10", borderColor: "border-orange-500/30" },
  "NCAA": { icon: "🎓", color: "text-sky-400", bgColor: "bg-sky-500/10", borderColor: "border-sky-500/30" },
  "NHL": { icon: "🏒", color: "text-cyan-400", bgColor: "bg-cyan-500/10", borderColor: "border-cyan-500/30" },
  "MLB": { icon: "⚾", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  "TENNIS": { icon: "🎾", color: "text-lime-400", bgColor: "bg-lime-500/10", borderColor: "border-lime-500/30" },
  "GOLF": { icon: "⛳", color: "text-emerald-400", bgColor: "bg-emerald-500/10", borderColor: "border-emerald-500/30" },
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
  category?: string | null;
}

function formatCountdown(eventDate: string | null): string | null {
  if (!eventDate) return null;
  const diff = new Date(eventDate).getTime() - Date.now();
  if (diff <= 0) return null; // Event already started — hide countdown entirely
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const localTime = formatEventTime(eventDate);
  if (hours > 48) {
    const days = Math.floor(hours / 24);
    return `Starts in ${days}d • ${localTime}`;
  }
  return `Starts in ${hours}h ${mins}m • ${localTime}`;
}

const SOCCER_KEYWORDS = [
  "MLS", "SOCCER", "FUTBOL", "FÚTBOL", "PREMIER LEAGUE", "LA LIGA", "CHAMPIONS LEAGUE",
  "SERIE A", "BUNDESLIGA", "LIGUE 1", "EREDIVISIE", "LIGA MX", "EPL",
  "COPA", "EURO", "FIFA", "WORLD CUP",
];

const VALID_CATEGORIES = ["MMA", "BOXING", "MUAY THAI", "BARE KNUCKLE", "FUTBOL", "NFL", "NBA", "NCAA", "NHL", "MLB", "TENNIS", "GOLF", "BASKETBALL"];

function parseSport(eventName: string, sourceProvider?: string | null, category?: string | null): string {
  // Admin manual override takes priority
  if (category && VALID_CATEGORIES.includes(category.toUpperCase())) {
    return category.toUpperCase();
  }
  if (sourceProvider === "api-football") return "FUTBOL";
  const upper = eventName.toUpperCase();
  if (SOCCER_KEYWORDS.some(k => upper.includes(k))) return "FUTBOL";
  if (upper.includes("UFC") || upper.includes("MMA") || upper.includes("PFL") || upper.includes("BELLATOR") || upper.includes("ONE CHAMPIONSHIP")) return "MMA";
  if (upper.includes("BOXING") || upper.includes("MAYWEATHER")) return "BOXING";
  if (upper.includes("MUAY THAI")) return "MUAY THAI";
  if (upper.includes("BARE KNUCKLE") || upper.includes("BKFC")) return "BARE KNUCKLE";
  if (upper.includes("NFL") || upper.includes("SUPER BOWL")) return "NFL";
  if (upper.includes("NBA") || upper.includes("WNBA")) return "NBA";
  if (upper.includes("NCAA") || upper.includes("MARCH MADNESS") || upper.includes("COLLEGE FOOTBALL")) return "NCAA";
  if (upper.includes("NHL") || upper.includes("STANLEY CUP")) return "NHL";
  if (upper.includes("MLB") || upper.includes("WORLD SERIES")) return "MLB";
  if (upper.includes("ATP") || upper.includes("WTA") || upper.includes("TENNIS") || upper.includes("WIMBLEDON") || upper.includes("US OPEN TENNIS") || upper.includes("ROLAND GARROS") || upper.includes("AUSTRALIAN OPEN")) return "TENNIS";
  if (upper.includes("PGA") || upper.includes("GOLF") || upper.includes("MASTERS GOLF") || upper.includes("RYDER CUP")) return "GOLF";
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

function getFightSortPriority(label: string): number {
  if (label.startsWith('Main')) return 0;
  if (label.startsWith('Co-Main') || label.startsWith('Co Main')) return 1;
  if (label.startsWith('Featured')) return 2;
  // Numbered fights: extract number, higher numbers first (closer to main event)
  const num = parseInt(label.replace(/\D/g, '')) || 0;
  if (num > 0) return 1000 - num; // Fight 11 = 989, Fight 1 = 999
  return 500; // fallback for unknown labels
}

function sortFights(fights: Fight[]): Fight[] {
  return [...fights].sort((a, b) => {
    const labelA = a.title.split(' — ')[0];
    const labelB = b.title.split(' — ')[0];
    return getFightSortPriority(labelA) - getFightSortPriority(labelB);
  });
}

/** Get USD pool total — prefers new columns, falls back to legacy */
function getTotalPoolUsd(fights: Fight[]): number {
  const hasUsd = fights.some(f => (f.pool_a_usd ?? 0) > 0 || (f.pool_b_usd ?? 0) > 0);
  if (hasUsd) {
    return fights.reduce((sum, f) => sum + (f.pool_a_usd ?? 0) + (f.pool_b_usd ?? 0), 0);
  }
  return fights.reduce((sum, f) => sum + f.pool_a_lamports + f.pool_b_lamports, 0) / 1_000_000_000;
}

/** Group binary soccer fights into 3-way match cards */
function groupSoccerBinaryFights(fights: Fight[]): { grouped: { home: Fight; away: Fight; draw?: Fight }[]; ungrouped: Fight[] } {
  const binary = fights.filter(f => f.fighter_a_name === "Yes" && f.fighter_b_name === "No");
  const nonBinary = fights.filter(f => !(f.fighter_a_name === "Yes" && f.fighter_b_name === "No"));

  // Group binary fights by event_name
  const byEvent = new Map<string, Fight[]>();
  for (const f of binary) {
    const key = f.event_name;
    if (!byEvent.has(key)) byEvent.set(key, []);
    byEvent.get(key)!.push(f);
  }

  const grouped: { home: Fight; away: Fight; draw?: Fight }[] = [];
  const ungrouped: Fight[] = [...nonBinary];

  for (const [, siblings] of byEvent) {
    if (siblings.length < 2) {
      ungrouped.push(...siblings);
      continue;
    }
    const drawFight = siblings.find(f => f.title.toLowerCase().includes("draw"));
    const teamFights = siblings.filter(f => !f.title.toLowerCase().includes("draw"));
    if (teamFights.length >= 2) {
      grouped.push({ home: teamFights[0], away: teamFights[1], draw: drawFight });
      // Any extra beyond 2 teams go ungrouped
      ungrouped.push(...teamFights.slice(2));
    } else {
      ungrouped.push(...siblings);
    }
  }

  return { grouped, ungrouped };
}

function SoccerAwareGrid({ fights, sport, wallet, onPredict, userEntries, onClaim, claiming, hotFightIds, onWalletRequired, eventHasStarted, readOnly }: {
  fights: Fight[];
  sport: string;
  wallet: string | null;
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  userEntries: any[];
  onClaim: (fightId: string) => void;
  claiming: boolean;
  hotFightIds: Set<string>;
  onWalletRequired?: () => void;
  eventHasStarted?: boolean;
  readOnly?: boolean;
}) {
  // Filter out prop/secondary markets — keep only main "who wins"
  const mainFightsOnly = fights.filter(f => !isPropMarket(f));

  if (sport === "FUTBOL") {
    const { grouped, ungrouped } = groupSoccerBinaryFights(mainFightsOnly);
    return (
      <div className="space-y-3">
        {grouped.map(g => (
          <SoccerMatchCard
            key={g.home.id}
            homeFight={g.home}
            awayFight={g.away}
            drawFight={g.draw}
            wallet={wallet}
            onPredict={onPredict}
            userEntries={userEntries}
            onWalletRequired={onWalletRequired}
            eventHasStarted={eventHasStarted}
            readOnly={readOnly}
          />
        ))}
        {ungrouped.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {ungrouped.map(fight => (
              <FightCard
                key={fight.id}
                fight={fight}
                wallet={wallet}
                onPredict={onPredict}
                userEntries={userEntries.filter(e => e.fight_id === fight.id)}
                onClaim={onClaim}
                claiming={claiming}
                isHot={hotFightIds.has(fight.id)}
                onWalletRequired={onWalletRequired}
                isSoccerEvent
                eventHasStarted={eventHasStarted}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`grid gap-3 sm:grid-cols-2`}>
      {fights.map(fight => (
        <FightCard
          key={fight.id}
          fight={fight}
          wallet={wallet}
          onPredict={onPredict}
          userEntries={userEntries.filter(e => e.fight_id === fight.id)}
          onClaim={onClaim}
          claiming={claiming}
          isHot={hotFightIds.has(fight.id)}
          onWalletRequired={onWalletRequired}
          isSoccerEvent={sport === "FUTBOL"}
          eventHasStarted={eventHasStarted}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
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
  isStaleLive,
  readOnly,
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
  isStaleLive?: boolean;
  readOnly?: boolean;
}) {
  const isDatePast = event?.event_date ? new Date(event.event_date).getTime() <= Date.now() : false;
  const hasSiblingLocked = fights.some(f => f.status === "locked" || f.status === "live");
  const eventHasStarted = isDatePast || hasSiblingLocked;
  const hasOpen = fights.some(f => f.status === "open") && !eventHasStarted;
  const [expanded, setExpanded] = useState(false);
  const [leagueLogoError, setLeagueLogoError] = useState(false);

  const parsed = parseEventLabel(eventName);
  const sport = parseSport(eventName, event?.source_provider, event?.category);
  const config = SPORT_CONFIG[sport] || SPORT_CONFIG["MUAY THAI"];

  const totalPool = getTotalPoolUsd(fights);
  const allPolymarket = fights.every(f => f.source === "polymarket") && totalPool === 0;
  const hasLiveOdds = allPolymarket && fights.some(f => (f.price_a ?? 0) > 0 && (f.price_b ?? 0) > 0);
  const openCount = eventHasStarted ? 0 : fights.filter(f => f.status === "open").length;
  const lockedCount = fights.filter(f => f.status === "locked" || (eventHasStarted && f.status === "open")).length;
  const liveCount = fights.filter(f => f.status === "live").length;

  const mainFights = fights.filter(f => !f.event_name.includes("Road to Tulum"));
  const tournamentFights = fights.filter(f => f.event_name.includes("Road to Tulum"));

  const sortedMain = sortFights(mainFights);
  const sortedTournament = sortFights(tournamentFights);

  const displayDate = event?.event_date ? formatEventDateTime(event.event_date) : parsed.date;
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
            {liveCount > 0 && !isStaleLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                LIVE
              </span>
            )}
            {isStaleLive && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full">
                ⏳ Awaiting Result
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
            {lockedCount > 0 && <span className="text-yellow-400">{lockedCount} Locked</span>}
            <span className="text-primary font-bold">
              {allPolymarket
                ? (hasLiveOdds ? "📊 Live Odds via Polymarket" : "Polymarket Liquidity")
                : `$${totalPool.toFixed(2)} Pool`}
            </span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="p-3 sm:p-4 space-y-3 bg-background/50">
          {sortedMain.length > 0 && (
            <SoccerAwareGrid
              fights={sortedMain}
              sport={sport}
              wallet={wallet}
              onPredict={onPredict}
              userEntries={userEntries}
              onClaim={onClaim}
              claiming={claiming}
              hotFightIds={hotFightIds}
              onWalletRequired={onWalletRequired}
              eventHasStarted={eventHasStarted}
              readOnly={readOnly}
            />
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
                    eventHasStarted={eventHasStarted}
                    readOnly={readOnly}
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
