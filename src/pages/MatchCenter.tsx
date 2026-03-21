import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Trophy, MapPin, User, TrendingUp, Newspaper, ArrowUp, ArrowDown, BookOpen, Calendar, ExternalLink, Info } from "lucide-react";
import { detectSport, isOverSide, type SportType } from "@/lib/detectSport";
import { resolveOutcomeName, parseTeamsFromEvent } from "@/lib/resolveOutcomeName";

interface FightDetail {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  fighter_a_photo: string | null;
  fighter_b_photo: string | null;
  fighter_a_record: string | null;
  fighter_b_record: string | null;
  pool_a_usd: number;
  pool_b_usd: number;
  pool_a_lamports: number;
  pool_b_lamports: number;
  price_a: number | null;
  price_b: number | null;
  polymarket_volume_usd: number | null;
  status: string;
  winner: string | null;
  venue: string | null;
  referee: string | null;
  weight_class: string | null;
  fight_class: string | null;
  explainer_card: string | null;
  stats_json: any;
  source: string;
  event_name: string;
  home_logo: string | null;
  away_logo: string | null;
  polymarket_question: string | null;
  polymarket_end_date: string | null;
  polymarket_slug: string | null;
  polymarket_condition_id: string | null;
  created_at: string;
  trading_allowed: boolean;
  commission_bps: number;
}

interface FightUpdate {
  id: string;
  content: string;
  source: string;
  impact: string | null;
  created_at: string;
}

export default function MatchCenter() {
  const { fightId } = useParams<{ fightId: string }>();
  const navigate = useNavigate();
  const [fight, setFight] = useState<FightDetail | null>(null);
  const [updates, setUpdates] = useState<FightUpdate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!fightId) return;
    async function load() {
      setLoading(true);
      const [fightRes, updatesRes] = await Promise.all([
        supabase
          .from("prediction_fights")
          .select("*")
          .eq("id", fightId)
          .single(),
        supabase
          .from("prediction_fight_updates")
          .select("*")
          .eq("fight_id", fightId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (fightRes.data) setFight(fightRes.data as any);
      if (updatesRes.data) setUpdates(updatesRes.data as any);
      setLoading(false);
    }
    load();
  }, [fightId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!fight) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center">
        <p className="text-muted-foreground">Fight not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/predictions")}>
          Back to Predictions
        </Button>
      </div>
    );
  }

  const sport = detectSport(fight);
  const isSoccer = sport === "soccer";
  const isOverUnder = sport === "over_under";

  // Resolve display names
  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);

  // Parse teams from event name for soccer header
  const teams = parseTeamsFromEvent(fight.event_name);

  const poolA = (fight.pool_a_usd ?? 0) > 0 ? fight.pool_a_usd : fight.pool_a_lamports / 1e9;
  const poolB = (fight.pool_b_usd ?? 0) > 0 ? fight.pool_b_usd : fight.pool_b_lamports / 1e9;
  const probA = fight.price_a && fight.price_a > 0 ? Math.round(fight.price_a * 100) : null;
  const probB = fight.price_b && fight.price_b > 0 ? Math.round(fight.price_b * 100) : null;
  const volume = fight.polymarket_volume_usd ?? 0;
  const hasPool = poolA > 0 || poolB > 0;
  const stats = fight.stats_json || {};

  const statsTitle = isSoccer ? "Team Stats" : isOverUnder ? "Market Stats" : "Fighter Stats";

  const formatVol = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
    return `$${v.toFixed(0)}`;
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/predictions")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          {isSoccer && teams ? (
            <>
              <h1 className="text-xl font-bold text-foreground font-['Cinzel']">
                {teams.home} vs {teams.away}
              </h1>
              <p className="text-xs text-muted-foreground">
                Market: {fight.title} · {fight.event_name}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-foreground font-['Cinzel']">{fight.title}</h1>
              <p className="text-xs text-muted-foreground">{fight.event_name}</p>
            </>
          )}
        </div>
        <Button
          size="sm"
          className="bg-primary text-primary-foreground"
          onClick={() => navigate("/predictions")}
        >
          Predict
        </Button>
      </div>

      {/* Matchup card */}
      <Card className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6">
          <FighterProfile
            name={nameA}
            photo={isSoccer ? fight.home_logo : fight.fighter_a_photo}
            record={fight.fighter_a_record}
            pool={poolA}
            prob={probA}
            isWinner={fight.winner === "fighter_a"}
            stats={stats.fighter_a}
            sport={sport}
          />
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-bold text-muted-foreground">VS</span>
            {probA && probB && (
              <div className="w-24">
                <div className="h-3 rounded-full overflow-hidden flex bg-muted/30">
                  <div className="h-full bg-blue-500" style={{ width: `${probA}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${probB}%` }} />
                </div>
                <div className="flex justify-between text-[9px] font-bold mt-0.5">
                  <span className="text-blue-400">{probA}%</span>
                  <span className="text-red-400">{probB}%</span>
                </div>
              </div>
            )}
          </div>
          <FighterProfile
            name={nameB}
            photo={isSoccer ? fight.away_logo : fight.fighter_b_photo}
            record={fight.fighter_b_record}
            pool={poolB}
            prob={probB}
            isWinner={fight.winner === "fighter_b"}
            stats={stats.fighter_b}
            sport={sport}
          />
        </div>
      </Card>

      {/* Pool / Volume breakdown */}
      <Card className="p-4">
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" />
          {hasPool ? "Estimated Liquidity Per Side" : "Live Market Odds"}
        </h2>
        {hasPool ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{nameA}</p>
              <p className="text-2xl font-bold text-foreground">${poolA.toFixed(2)}</p>
            </div>
            <div className="text-center bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{nameB}</p>
              <p className="text-2xl font-bold text-foreground">${poolB.toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="text-center bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{nameA}</p>
              <p className="text-2xl font-bold text-foreground">
                {probA ? `${probA}¢` : "—"}
              </p>
              {probA && <p className="text-xs text-primary font-bold">{(1 / (fight.price_a || 1)).toFixed(2)}x</p>}
            </div>
            <div className="text-center bg-red-500/5 border border-red-500/20 rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{nameB}</p>
              <p className="text-2xl font-bold text-foreground">
                {probB ? `${probB}¢` : "—"}
              </p>
              {probB && <p className="text-xs text-primary font-bold">{(1 / (fight.price_b || 1)).toFixed(2)}x</p>}
            </div>
          </div>
        )}
        {volume > 0 && (
          <p className="text-center text-sm font-semibold text-primary/80 mt-3">
            {formatVol(volume)} Market Volume
          </p>
        )}
      </Card>

      {/* Match info */}
      {(fight.venue || fight.referee || fight.weight_class) && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-3">Match Info</h2>
          <div className="space-y-2 text-xs text-muted-foreground">
            {fight.venue && (
              <div className="flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" /> {fight.venue}
              </div>
            )}
            {fight.referee && (
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5" /> Referee: {fight.referee}
              </div>
            )}
            {fight.weight_class && (
              <div className="flex items-center gap-2">
                <span>⚖️</span> {fight.weight_class}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Explainer */}
      {fight.explainer_card && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-2">Analysis</h2>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{fight.explainer_card}</p>
        </Card>
      )}

      {/* News / Updates */}
      {updates.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" /> Why Odds Moved
          </h2>
          <div className="space-y-3">
            {updates.map((u) => (
              <div
                key={u.id}
                className={`border-l-2 pl-3 py-1 ${
                  u.impact === "positive_a" ? "border-blue-500" :
                  u.impact === "positive_b" ? "border-red-500" :
                  "border-muted-foreground/30"
                }`}
              >
                <p className="text-xs text-foreground">{u.content}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(u.created_at).toLocaleDateString()} · {u.source}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Stats from stats_json */}
      {Object.keys(stats).length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-3">{statsTitle}</h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {stats.fighter_a && <StatBlock name={nameA} data={stats.fighter_a} />}
            {stats.fighter_b && <StatBlock name={nameB} data={stats.fighter_b} />}
          </div>
        </Card>
      )}
    </div>
  );
}

function FighterProfile({
  name, photo, record, pool, prob, isWinner, stats, sport,
}: {
  name: string; photo: string | null; record: string | null;
  pool: number; prob: number | null; isWinner: boolean;
  stats?: any; sport: SportType;
}) {
  const [imgError, setImgError] = useState(false);
  const showImg = photo && !imgError;
  const isSoccer = sport === "soccer";
  const isOU = sport === "over_under";

  // Generate initials for team fallback
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <div className="text-center">
      {showImg ? (
        <img
          src={photo!}
          alt={name}
          className={`mx-auto mb-2 ${isSoccer ? 'w-16 h-16 object-contain' : 'w-20 h-20 rounded-full object-cover ring-2 ring-primary/30'}`}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-2 text-2xl">
          {isSoccer ? (
            <span className="text-sm font-bold text-foreground">{initials || "⚽"}</span>
          ) : isOU ? (
            isOverSide(name) ? <ArrowUp className="w-8 h-8 text-green-400" /> : <ArrowDown className="w-8 h-8 text-red-400" />
          ) : "🥊"}
        </div>
      )}
      <p className="font-bold text-foreground text-base">{name}</p>
      {record && <p className="text-[11px] text-muted-foreground">{record}</p>}
      <p className="text-xs text-muted-foreground mt-1">
        {pool > 0 ? `$${pool.toFixed(2)} USDC` : prob ? `${prob}%` : "Market-backed"}
      </p>
      {isWinner && (
        <div className="mt-1 flex items-center justify-center gap-1 text-primary">
          <Trophy className="w-4 h-4" />
          <span className="text-xs font-bold">WINNER</span>
        </div>
      )}
    </div>
  );
}

function StatBlock({ name, data }: { name: string; data: Record<string, any> }) {
  return (
    <div>
      <p className="font-bold text-foreground mb-1">{name}</p>
      {Object.entries(data).map(([key, val]) => (
        <div key={key} className="flex justify-between text-muted-foreground py-0.5 border-b border-border/20">
          <span className="capitalize">{key.replace(/_/g, " ")}</span>
          <span className="font-medium text-foreground">{String(val)}</span>
        </div>
      ))}
    </div>
  );
}
