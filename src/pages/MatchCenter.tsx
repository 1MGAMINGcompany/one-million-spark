import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft, Trophy, MapPin, User, TrendingUp, Newspaper,
  ArrowUp, ArrowDown, BookOpen, Calendar, ExternalLink, Info,
  BarChart3, Users, Swords, Droplets, Activity, Gauge,
} from "lucide-react";
import { detectSport, isOverSide, type SportType } from "@/lib/detectSport";
import { resolveOutcomeName, parseTeamsFromEvent } from "@/lib/resolveOutcomeName";

// ── Types ──

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
  polymarket_liquidity: number | null;
  polymarket_volume_24h: number | null;
  polymarket_start_date: string | null;
  polymarket_competitive: number | null;
  polymarket_fee: string | null;
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
  event_id: string | null;
  method: string | null;
  enrichment_notes: string | null;
  event_banner_url: string | null;
}

interface SiblingMarket {
  id: string;
  title: string;
  price_a: number | null;
  price_b: number | null;
  polymarket_volume_usd: number | null;
  fighter_a_name: string;
  fighter_b_name: string;
  status: string;
  winner: string | null;
}

interface FightUpdate {
  id: string;
  content: string;
  source: string;
  impact: string | null;
  created_at: string;
}

// ── Helpers ──

const formatVol = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

function marketAgeDays(startDate: string | null, createdAt: string): number {
  const d = startDate || createdAt;
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}

// ── Main Component ──

export default function MatchCenter() {
  const { fightId } = useParams<{ fightId: string }>();
  const navigate = useNavigate();
  const [fight, setFight] = useState<FightDetail | null>(null);
  const [updates, setUpdates] = useState<FightUpdate[]>([]);
  const [siblings, setSiblings] = useState<SiblingMarket[]>([]);
  const [eventBanner, setEventBanner] = useState<string | null>(null);
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
      if (fightRes.data) {
        const f = fightRes.data as any;
        setFight(f);
        // Fetch event banner
        if (f.event_id) {
          const { data: ev } = await supabase
            .from("prediction_events")
            .select("event_banner_url")
            .eq("id", f.event_id)
            .single();
          if (ev?.event_banner_url) setEventBanner(ev.event_banner_url);
        }
        // Fetch sibling markets from same event
        if (f.event_name) {
          const { data: sibs } = await supabase
            .from("prediction_fights")
            .select("id, title, price_a, price_b, polymarket_volume_usd, fighter_a_name, fighter_b_name, status, winner")
            .eq("event_name", f.event_name)
            .neq("id", fightId)
            .in("status", ["open", "locked", "live", "resolved"]);
          if (sibs) setSiblings(sibs as any);
        }
      }
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
        <p className="text-muted-foreground">Event not found.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/predictions")}>
          Back to Predictions
        </Button>
      </div>
    );
  }

  const sport = detectSport(fight);
  const isSoccer = sport === "soccer";
  const isOverUnder = sport === "over_under";

  const nameA = resolveOutcomeName(fight.fighter_a_name, "a", fight);
  const nameB = resolveOutcomeName(fight.fighter_b_name, "b", fight);
  const teams = parseTeamsFromEvent(fight.event_name);

  const poolA = (fight.pool_a_usd ?? 0) > 0 ? fight.pool_a_usd : fight.pool_a_lamports / 1e9;
  const poolB = (fight.pool_b_usd ?? 0) > 0 ? fight.pool_b_usd : fight.pool_b_lamports / 1e9;
  const probA = fight.price_a && fight.price_a > 0 ? Math.round(fight.price_a * 100) : null;
  const probB = fight.price_b && fight.price_b > 0 ? Math.round(fight.price_b * 100) : null;
  const volume = fight.polymarket_volume_usd ?? 0;
  const hasPool = poolA > 0 || poolB > 0;
  const stats = fight.stats_json || {};
  const liquidity = fight.polymarket_liquidity ?? 0;
  const vol24h = fight.polymarket_volume_24h ?? 0;
  const competitive = fight.polymarket_competitive;
  const ageDays = marketAgeDays(fight.polymarket_start_date, fight.created_at);

  const photoA = isSoccer ? (fight.home_logo || fight.fighter_a_photo) : fight.fighter_a_photo;
  const photoB = isSoccer ? (fight.away_logo || fight.fighter_b_photo) : fight.fighter_b_photo;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      {/* Event Banner */}
      {eventBanner && (
        <div className="w-full h-32 sm:h-44 rounded-xl overflow-hidden">
          <img src={eventBanner} alt={fight.event_name} className="w-full h-full object-cover" loading="lazy" />
        </div>
      )}

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

      {/* Matchup hero card */}
      <Card className="p-6">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-6">
          <ProfileCard
            name={nameA}
            photo={photoA}
            record={fight.fighter_a_record}
            prob={probA}
            isWinner={fight.winner === "fighter_a"}
            sport={sport}
            stats={stats.fighter_a}
            side="left"
          />
          <div className="flex flex-col items-center gap-2">
            <span className="text-sm font-bold text-muted-foreground">VS</span>
            {probA != null && probB != null && (
              <div className="w-20 sm:w-28">
                <div className="h-3 rounded-full overflow-hidden flex bg-muted/30">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${probA}%` }} />
                  <div className="h-full bg-red-500 transition-all" style={{ width: `${probB}%` }} />
                </div>
                <div className="flex justify-between text-[9px] font-bold mt-0.5">
                  <span className="text-blue-400">{probA}¢</span>
                  <span className="text-red-400">{probB}¢</span>
                </div>
              </div>
            )}
            {volume > 0 && (
              <span className="text-[10px] font-semibold text-primary/70 mt-1">
                {formatVol(volume)} Vol.
              </span>
            )}
          </div>
          <ProfileCard
            name={nameB}
            photo={photoB}
            record={fight.fighter_b_record}
            prob={probB}
            isWinner={fight.winner === "fighter_b"}
            sport={sport}
            stats={stats.fighter_b}
            side="right"
          />
        </div>
      </Card>

      {/* Sibling markets from same event */}
      {siblings.length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" /> Related Markets
          </h2>
          <div className="space-y-2">
            {siblings.map((s) => {
              const sNameA = resolveOutcomeName(s.fighter_a_name, "a", { ...s, event_name: fight.event_name });
              const sNameB = resolveOutcomeName(s.fighter_b_name, "b", { ...s, event_name: fight.event_name });
              const sPA = s.price_a && s.price_a > 0 ? Math.round(s.price_a * 100) : null;
              const sPB = s.price_b && s.price_b > 0 ? Math.round(s.price_b * 100) : null;
              const sVol = s.polymarket_volume_usd ?? 0;
              return (
                <button
                  key={s.id}
                  onClick={() => navigate(`/predictions/${s.id}`)}
                  className="w-full flex items-center justify-between bg-muted/20 hover:bg-muted/40 rounded-lg p-3 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground truncate">{s.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {sNameA} {sPA ? `${sPA}¢` : ""} vs {sNameB} {sPB ? `${sPB}¢` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    {sVol > 0 && <p className="text-[10px] text-primary/70 font-semibold">{formatVol(sVol)}</p>}
                    {s.winner && (
                      <span className="text-[9px] text-primary font-bold flex items-center gap-0.5">
                        <Trophy className="w-3 h-3" /> Settled
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* Tabbed info: About / Odds / News */}
      <Card className="p-4">
        <Tabs defaultValue="about">
          <TabsList className="w-full mb-3">
            <TabsTrigger value="about" className="flex-1 text-xs gap-1">
              <Info className="w-3 h-3" /> About
            </TabsTrigger>
            <TabsTrigger value="odds" className="flex-1 text-xs gap-1">
              <TrendingUp className="w-3 h-3" /> Odds
            </TabsTrigger>
            {updates.length > 0 && (
              <TabsTrigger value="news" className="flex-1 text-xs gap-1">
                <Newspaper className="w-3 h-3" /> News
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="about" className="space-y-3">
            {fight.polymarket_question && (
              <div>
                <h3 className="text-xs font-bold text-foreground mb-1 flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> Rules
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">
                  {fight.polymarket_question}
                </p>
              </div>
            )}
            <div className="space-y-1.5 text-xs text-muted-foreground">
              {(fight.polymarket_start_date || fight.created_at) && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Market Opened: {new Date(fight.polymarket_start_date || fight.created_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })} ({ageDays}d ago)</span>
                </div>
              )}
              {fight.polymarket_end_date && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>End Date: {new Date(fight.polymarket_end_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span>
                </div>
              )}
              {fight.venue && (
                <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {fight.venue}</div>
              )}
              {fight.referee && (
                <div className="flex items-center gap-2"><User className="w-3.5 h-3.5" /> Referee: {fight.referee}</div>
              )}
              {fight.weight_class && (
                <div className="flex items-center gap-2"><span>⚖️</span> {fight.weight_class}</div>
              )}
              {fight.fight_class && (
                <div className="flex items-center gap-2"><Swords className="w-3.5 h-3.5" /> {fight.fight_class}</div>
              )}
              {fight.method && (
                <div className="flex items-center gap-2"><span>🏆</span> Method: {fight.method}</div>
              )}
              {fight.source === "polymarket" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] bg-muted/50 px-2 py-0.5 rounded-full">Powered by Polymarket</span>
                  {fight.polymarket_slug && (
                    <a
                      href={`https://polymarket.com/event/${fight.polymarket_slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary/70 hover:text-primary flex items-center gap-0.5"
                    >
                      View on Polymarket <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <span>💰</span> Platform fee: {((fight.commission_bps ?? 200) / 100).toFixed(0)}%
              </div>
            </div>
          </TabsContent>

          <TabsContent value="odds" className="space-y-3">
            {probA != null && probB != null ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="text-center bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{nameA}</p>
                  <p className="text-2xl font-bold text-foreground">{probA}¢</p>
                  <p className="text-xs text-primary font-bold">{(1 / (fight.price_a || 1)).toFixed(2)}x payout</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{probA}% implied</p>
                </div>
                <div className="text-center bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                  <p className="text-xs text-muted-foreground mb-1">{nameB}</p>
                  <p className="text-2xl font-bold text-foreground">{probB}¢</p>
                  <p className="text-xs text-primary font-bold">{(1 / (fight.price_b || 1)).toFixed(2)}x payout</p>
                  <p className="text-[10px] text-muted-foreground mt-1">{probB}% implied</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">Odds data not yet available.</p>
            )}

            {/* Market Metrics */}
            <div className="border-t border-border/20 pt-3 space-y-2">
              {volume > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><BarChart3 className="w-3 h-3" /> Total Volume</span>
                  <span className="font-bold text-foreground">{formatVol(volume)}</span>
                </div>
              )}
              {vol24h > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Activity className="w-3 h-3" /> 24h Volume</span>
                  <span className="font-bold text-foreground">{formatVol(vol24h)}</span>
                </div>
              )}
              {liquidity > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3" /> Liquidity Depth</span>
                  <span className="font-bold text-foreground">{formatVol(liquidity)}</span>
                </div>
              )}
              {competitive != null && (
                <div className="flex justify-between text-xs items-center">
                  <span className="text-muted-foreground flex items-center gap-1"><Gauge className="w-3 h-3" /> Competitiveness</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-2 rounded-full bg-muted/30 overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, competitive * 100)}%` }}
                      />
                    </div>
                    <span className="font-bold text-foreground text-[10px]">
                      {competitive >= 0.8 ? "Very Close" : competitive >= 0.5 ? "Balanced" : "One-sided"}
                    </span>
                  </div>
                </div>
              )}
              {fight.polymarket_fee && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Exchange Fee</span>
                  <span className="font-medium text-foreground">{fight.polymarket_fee}</span>
                </div>
              )}
              {ageDays > 0 && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Market Age</span>
                  <span className="font-medium text-foreground">{ageDays} days</span>
                </div>
              )}
              {hasPool && (
                <>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{nameA} Liquidity</span>
                    <span className="font-medium text-foreground">${poolA.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{nameB} Liquidity</span>
                    <span className="font-medium text-foreground">${poolB.toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          {updates.length > 0 && (
            <TabsContent value="news" className="space-y-3">
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
            </TabsContent>
          )}
        </Tabs>
      </Card>

      {/* Analysis / Explainer */}
      {fight.explainer_card && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-2">Analysis</h2>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{fight.explainer_card}</p>
        </Card>
      )}

      {/* Detailed Stats */}
      {Object.keys(stats).length > 0 && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            {isSoccer ? "Team Stats" : isOverUnder ? "Market Stats" : "Fighter Stats"}
          </h2>
          <div className="grid grid-cols-2 gap-4 text-xs">
            {stats.fighter_a && <StatBlock name={nameA} data={stats.fighter_a} />}
            {stats.fighter_b && <StatBlock name={nameB} data={stats.fighter_b} />}
          </div>
        </Card>
      )}

      {/* Enrichment notes (admin-added context) */}
      {fight.enrichment_notes && (
        <Card className="p-4">
          <h2 className="text-sm font-bold text-foreground mb-2">Additional Context</h2>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{fight.enrichment_notes}</p>
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ──

function ProfileCard({
  name, photo, record, prob, isWinner, sport, stats, side,
}: {
  name: string; photo: string | null; record: string | null;
  prob: number | null; isWinner: boolean;
  sport: SportType; stats?: Record<string, any>; side: "left" | "right";
}) {
  const [imgError, setImgError] = useState(false);
  const showImg = photo && !imgError;
  const isSoccer = sport === "soccer";
  const isOU = sport === "over_under";

  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();

  const colorClass = side === "left" ? "ring-blue-500/30" : "ring-red-500/30";

  return (
    <div className="text-center space-y-1">
      {showImg ? (
        <img
          src={photo!}
          alt={name}
          className={`mx-auto mb-2 ${
            isSoccer
              ? "w-16 h-16 sm:w-20 sm:h-20 object-contain"
              : `w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover ring-2 ${colorClass}`
          }`}
          onError={() => setImgError(true)}
          loading="lazy"
        />
      ) : (
        <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-muted/40 flex items-center justify-center mx-auto mb-2 ring-2 ${colorClass}`}>
          {isSoccer ? (
            <span className="text-lg sm:text-xl font-bold text-foreground">{initials || "⚽"}</span>
          ) : isOU ? (
            isOverSide(name) ? <ArrowUp className="w-8 h-8 text-green-400" /> : <ArrowDown className="w-8 h-8 text-red-400" />
          ) : (
            <span className="text-2xl">🥊</span>
          )}
        </div>
      )}
      <p className="font-bold text-foreground text-sm sm:text-base leading-tight">{name}</p>
      {record && <p className="text-[11px] text-muted-foreground font-medium">{record}</p>}
      {prob != null && (
        <p className={`text-sm font-bold ${side === "left" ? "text-blue-400" : "text-red-400"}`}>
          {prob}¢
        </p>
      )}
      {isWinner && (
        <div className="flex items-center justify-center gap-1 text-primary">
          <Trophy className="w-4 h-4" />
          <span className="text-xs font-bold">WINNER</span>
        </div>
      )}
      {stats && Object.keys(stats).length > 0 && (
        <div className="mt-2 space-y-0.5">
          {Object.entries(stats).slice(0, 3).map(([key, val]) => (
            <div key={key} className="text-[10px] text-muted-foreground">
              <span className="capitalize">{key.replace(/_/g, " ")}</span>:{" "}
              <span className="text-foreground font-medium">{String(val)}</span>
            </div>
          ))}
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
