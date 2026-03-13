import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import FightCard from "./FightCard";
import type { Fight } from "./FightCard";

const LAMPORTS = 1_000_000_000;

interface SportConfig {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
}

const SPORT_CONFIG: Record<string, SportConfig> = {
  "MUAY THAI": { icon: "🥊", color: "text-red-400", bgColor: "bg-red-500/10", borderColor: "border-red-500/30" },
  "BOXING": { icon: "🥊", color: "text-blue-400", bgColor: "bg-blue-500/10", borderColor: "border-blue-500/30" },
  "MMA": { icon: "🤼", color: "text-green-400", bgColor: "bg-green-500/10", borderColor: "border-green-500/30" },
  "UFC": { icon: "🏟️", color: "text-purple-400", bgColor: "bg-purple-500/10", borderColor: "border-purple-500/30" },
};

function parseSport(eventName: string): string {
  const parts = eventName.split(' — ');
  return parts[0] || "OTHER";
}

function parseEventLabel(eventName: string): { sport: string; name: string; subEvent?: string; date?: string } {
  const parts = eventName.split(' — ');
  if (parts.length >= 4) {
    return { sport: parts[0], name: parts[1], subEvent: parts[2], date: parts[3] };
  } else if (parts.length === 3) {
    return { sport: parts[0], name: parts[1], date: parts[2] };
  } else if (parts.length === 2) {
    return { sport: parts[0], name: parts[1] };
  }
  return { sport: "OTHER", name: eventName };
}

function sortFights(fights: Fight[]): Fight[] {
  return [...fights].sort((a, b) => {
    const labelA = a.title.split(' — ')[0];
    const labelB = b.title.split(' — ')[0];
    // Main Event first
    if (labelA.startsWith('Main')) return -1;
    if (labelB.startsWith('Main')) return 1;
    // Semi-finals last
    if (labelA.startsWith('Semi') && !labelB.startsWith('Semi')) return 1;
    if (labelB.startsWith('Semi') && !labelA.startsWith('Semi')) return -1;
    // Fight numbers descending
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
}: {
  eventName: string;
  fights: Fight[];
  wallet: string | null;
  userEntries: any[];
  onPredict: (fight: Fight, pick: "fighter_a" | "fighter_b") => void;
  onClaim: (fightId: string) => void;
  claiming: boolean;
  hotFightIds: Set<string>;
}) {
  const hasOpen = fights.some(f => f.status === "open");
  const [expanded, setExpanded] = useState(hasOpen);

  const parsed = parseEventLabel(eventName);
  const sport = parsed.sport;
  const config = SPORT_CONFIG[sport] || SPORT_CONFIG["MUAY THAI"];

  const totalPool = fights.reduce(
    (sum, f) => sum + f.pool_a_lamports + f.pool_b_lamports, 0
  ) / LAMPORTS;

  const openCount = fights.filter(f => f.status === "open").length;

  // Group: main fights vs tournament (sub-event)
  const mainFights = fights.filter(f => !f.event_name.includes("Road to Tulum"));
  const tournamentFights = fights.filter(f => f.event_name.includes("Road to Tulum"));

  const sortedMain = sortFights(mainFights);
  const sortedTournament = sortFights(tournamentFights);

  return (
    <div className={`rounded-xl border ${config.borderColor} overflow-hidden`}>
      {/* Event Header */}
      <button
        className={`w-full ${config.bgColor} px-4 py-4 flex items-start sm:items-center justify-between gap-3 text-left`}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xl">{config.icon}</span>
            <span className={`text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
              {sport}
            </span>
            {hasOpen && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-bold text-foreground font-['Cinzel'] mt-1 truncate">
            {parsed.name}
          </h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {parsed.date && <span>📅 {parsed.date}</span>}
            <span>{fights.length} Fights</span>
            {openCount > 0 && <span className="text-green-400">{openCount} Open</span>}
            <span className="text-primary font-bold">{totalPool.toFixed(2)} SOL Pool</span>
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Fight Cards */}
      {expanded && (
        <div className="p-4 space-y-4 bg-background/50">
          {/* Main fights */}
          {sortedMain.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
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
                />
              ))}
            </div>
          )}

          {/* Tournament section */}
          {sortedTournament.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3 mt-2">
                <span className="text-sm">🏆</span>
                <h3 className="text-sm font-bold text-foreground font-['Cinzel']">
                  Road to Tulum — Tournament
                </h3>
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
