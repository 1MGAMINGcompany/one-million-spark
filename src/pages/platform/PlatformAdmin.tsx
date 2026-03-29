import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";
import { detectSport, type SportType } from "@/lib/detectSport";
import { formatEventDateTime } from "@/lib/formatEventLocalDateTime";
import PlatformEventCreator from "@/components/admin/PlatformEventCreator";
import PromoCodeManager from "@/components/admin/PromoCodeManager";
import { Link } from "react-router-dom";
import {
  Shield, Loader2, Trash2, Lock, Play, CheckCircle, Trophy,
  Download, Globe, Calendar, Users, RefreshCw, Search, ArrowLeft,
} from "lucide-react";

// ── Types ──

interface PlatformFight {
  id: string;
  title: string;
  status: string;
  pool_a_usd: number;
  pool_b_usd: number;
  visibility: string;
  created_at: string;
  event_date: string | null;
  fighter_a_name: string;
  fighter_b_name: string;
  winner: string | null;
  event_name: string;
  source: string;
  polymarket_active: boolean | null;
  polymarket_condition_id: string | null;
  featured: boolean;
  trading_allowed: boolean;
  price_a: number | null;
  price_b: number | null;
}

interface PolymarketPreview {
  id: string;
  title: string;
  slug: string;
  chosen_display_time: string | null;
  markets: {
    id: string;
    question: string;
    conditionId: string;
    outcomes: string[];
    outcomePrices: string[];
    active: boolean;
    closed: boolean;
  }[];
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/20 text-green-400",
  locked: "bg-yellow-500/20 text-yellow-400",
  live: "bg-red-500/20 text-red-400 animate-pulse",
  result_selected: "bg-orange-500/20 text-orange-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  settled: "bg-primary/20 text-primary",
  draw: "bg-muted text-muted-foreground",
};

const SPORT_BADGE: Record<string, { label: string; color: string }> = {
  soccer: { label: "⚽ Soccer", color: "bg-green-500/20 text-green-400" },
  nfl: { label: "🏈 NFL", color: "bg-orange-500/20 text-orange-400" },
  nba: { label: "🏀 NBA", color: "bg-purple-500/20 text-purple-400" },
  nhl: { label: "🏒 NHL", color: "bg-cyan-500/20 text-cyan-400" },
  mlb: { label: "⚾ MLB", color: "bg-red-500/20 text-red-400" },
  ncaa: { label: "🎓 NCAA", color: "bg-yellow-500/20 text-yellow-400" },
  combat: { label: "🥊 Combat", color: "bg-red-500/20 text-red-400" },
  tennis: { label: "🎾 Tennis", color: "bg-lime-500/20 text-lime-400" },
  golf: { label: "⛳ Golf", color: "bg-emerald-500/20 text-emerald-400" },
  over_under: { label: "📊 O/U", color: "bg-muted text-muted-foreground" },
};

const VIS_BADGE: Record<string, { label: string; color: string }> = {
  platform: { label: "1MG.live", color: "bg-blue-500/20 text-blue-400" },
  all: { label: "Both", color: "bg-green-500/20 text-green-400" },
  flagship: { label: "Flagship", color: "bg-yellow-500/20 text-yellow-400" },
};

// Polymarket sport tabs for browsing
const BROWSE_LEAGUES = [
  { key: "nfl", label: "NFL" },
  { key: "nhl", label: "NHL" },
  { key: "nba", label: "NBA" },
  { key: "mlb", label: "MLB" },
  { key: "epl", label: "Soccer" },
  { key: "ufc", label: "MMA" },
  { key: "golf", label: "Golf" },
];

export default function PlatformAdmin() {
  const { address } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fights, setFights] = useState<PlatformFight[]>([]);
  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"active" | "settled" | "all">("active");
  const [sportFilter, setSportFilter] = useState<string>("all");

  // Polymarket browser state
  const [browseLeague, setBrowseLeague] = useState("nfl");
  const [browseResults, setBrowseResults] = useState<PolymarketPreview[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseMessage, setBrowseMessage] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  // Check admin
  useEffect(() => {
    if (!address) { setIsAdmin(false); setLoading(false); return; }
    (async () => {
      const { data } = await supabase
        .from("prediction_admins")
        .select("wallet")
        .eq("wallet", address)
        .maybeSingle();
      setIsAdmin(!!data);
      setLoading(false);
    })();
  }, [address]);

  const loadFights = useCallback(async () => {
    const [fightsRes, entriesRes] = await Promise.all([
      supabase
        .from("prediction_fights")
        .select("id, title, status, pool_a_usd, pool_b_usd, visibility, created_at, event_date, fighter_a_name, fighter_b_name, winner, event_name, source, polymarket_active, polymarket_condition_id, featured, trading_allowed, price_a, price_b")
        .in("visibility", ["platform", "all"])
        .is("operator_id", null)
        .order("created_at", { ascending: false }),
      supabase.from("prediction_entries").select("fight_id"),
    ]);

    if (fightsRes.data) setFights(fightsRes.data as PlatformFight[]);
    if (entriesRes.data) {
      const counts: Record<string, number> = {};
      entriesRes.data.forEach((e: any) => { counts[e.fight_id] = (counts[e.fight_id] || 0) + 1; });
      setEntryCounts(counts);
    }

    // Track which polymarket IDs are already imported
    if (fightsRes.data) {
      const ids = new Set<string>();
      fightsRes.data.forEach((f: any) => {
        if (f.polymarket_condition_id) ids.add(f.polymarket_condition_id);
      });
      setImportedIds(ids);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) loadFights();
  }, [isAdmin, loadFights]);

  // Admin action helper
  const callAdmin = async (action: string, extra: Record<string, any>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action, wallet: address, ...extra },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`${action} completed`);
      loadFights();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Polymarket browse
  const handleBrowse = async (league: string) => {
    setBrowseLeague(league);
    setBrowseLoading(true);
    setBrowseMessage("");
    setBrowseResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-sync", {
        body: { action: "browse_league", wallet: address, league_key: league },
      });
      if (error) throw error;
      const events = data?.results || [];
      if (events.length === 0) {
        const leagueLabel = BROWSE_LEAGUES.find(l => l.key === league)?.label || league;
        setBrowseMessage(`No active Polymarket markets for ${leagueLabel} right now. Season may be in offseason.`);
      }
      setBrowseResults(events);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBrowseLoading(false);
    }
  };

  // Import a single event to platform
  const handleImport = async (eventId: string) => {
    setImportingId(eventId);
    try {
      const { data, error } = await supabase.functions.invoke("polymarket-sync", {
        body: {
          action: "import_single",
          wallet: address,
          polymarket_event_id: eventId,
          import_source: "platform_admin",
          sport_type: browseLeague,
          visibility: "platform",
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Imported! (${data?.imported || 0} markets)`);
      loadFights();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImportingId(null);
    }
  };

  // Filter fights
  const getSport = (f: PlatformFight): SportType =>
    detectSport({ event_name: f.event_name, fighter_a_name: f.fighter_a_name, fighter_b_name: f.fighter_b_name, source: f.source });

  const filtered = fights.filter(f => {
    // Status filter
    if (filter === "active" && !["open", "locked", "live", "result_selected", "confirmed"].includes(f.status)) return false;
    if (filter === "settled" && !["settled", "draw", "refunds_complete", "cancelled"].includes(f.status)) return false;
    // Sport filter
    if (sportFilter !== "all" && getSport(f) !== sportFilter) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-16">
        <div className="text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
        </div>
      </div>
    );
  }

  const activePlatformCount = fights.filter(f => ["open", "locked", "live"].includes(f.status)).length;

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-8">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground font-['Cinzel'] flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-400" /> 1MG.live Admin
          </h1>
          <div className="flex items-center gap-2">
            <Link to="/predictions/admin">
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                <ArrowLeft className="w-3 h-3" /> Main Admin
              </Button>
            </Link>
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
              {activePlatformCount} active
            </span>
            <Button variant="outline" size="sm" onClick={() => loadFights()} className="gap-1">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        </div>

        {/* ═══ Section A: Polymarket Browser ═══ */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-400" /> Polymarket Browser — Import to 1MG.live
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Browse upcoming events by sport. One-click import sets visibility to <span className="text-blue-400 font-medium">Platform only</span>.
          </p>

          {/* Sport tabs */}
          <Tabs value={browseLeague} onValueChange={(v) => handleBrowse(v)}>
            <TabsList className="w-full flex-wrap h-auto gap-1">
              {BROWSE_LEAGUES.map(l => (
                <TabsTrigger key={l.key} value={l.key} className="text-xs px-3 py-1.5">
                  {l.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {BROWSE_LEAGUES.map(l => (
              <TabsContent key={l.key} value={l.key}>
                {browseLoading ? (
                  <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : browseMessage ? (
                  <div className="text-center py-8">
                    <p className="text-sm text-muted-foreground">{browseMessage}</p>
                    <p className="text-xs text-muted-foreground/60 mt-2">Use the manual creator below for events Polymarket doesn't cover.</p>
                  </div>
                ) : browseResults.length === 0 ? (
                  <div className="text-center py-6">
                    <p className="text-xs text-muted-foreground">Click a sport tab to browse</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[500px] overflow-y-auto mt-2">
                    {browseResults.map(ev => {
                      const isImported = ev.markets?.some(m => importedIds.has(m.conditionId));
                      return (
                        <div key={ev.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/30">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{ev.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {ev.chosen_display_time && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {formatEventDateTime(ev.chosen_display_time)}
                                </span>
                              )}
                              {ev.markets?.[0] && (
                                <span className="text-[10px] text-muted-foreground">
                                  {(parseFloat(ev.markets[0].outcomePrices?.[0] || "0") * 100).toFixed(0)}% / {(parseFloat(ev.markets[0].outcomePrices?.[1] || "0") * 100).toFixed(0)}%
                                </span>
                              )}
                              {isImported && (
                                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full">Already imported</span>
                              )}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant={isImported ? "ghost" : "outline"}
                            className="h-7 text-[10px] px-3 ml-2"
                            disabled={!!importingId || isImported}
                            onClick={() => handleImport(ev.id)}
                          >
                            {importingId === ev.id ? <Loader2 className="w-3 h-3 animate-spin" /> : isImported ? "✓" : "Import"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </Card>

        {/* ═══ Section B: Events Dashboard ═══ */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" /> 1MG.live Events
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full ml-1">{fights.length} total</span>
          </h2>

          {/* Filter row */}
          <div className="flex gap-2 mb-3 flex-wrap">
            {(["active", "settled", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
            <div className="border-l border-border/50 mx-1" />
            <button
              onClick={() => setSportFilter("all")}
              className={`text-xs px-2 py-1 rounded-full ${sportFilter === "all" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
            >
              All Sports
            </button>
            {["soccer", "nfl", "nba", "nhl", "mlb", "combat"].map(s => (
              <button
                key={s}
                onClick={() => setSportFilter(s)}
                className={`text-xs px-2 py-1 rounded-full ${sportFilter === s ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
              >
                {SPORT_BADGE[s]?.label || s}
              </button>
            ))}
          </div>

          {/* Events list */}
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">No events match filters</p>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {filtered.map(f => {
                const sport = getSport(f);
                const badge = SPORT_BADGE[sport] || { label: sport, color: "bg-muted text-muted-foreground" };
                const vis = VIS_BADGE[f.visibility] || VIS_BADGE.all;
                const pool = (f.pool_a_usd || 0) + (f.pool_b_usd || 0);
                const entries = entryCounts[f.id] || 0;

                return (
                  <div key={f.id} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{f.fighter_a_name} vs {f.fighter_b_name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{f.event_name}</p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || "bg-muted text-muted-foreground"}`}>{f.status}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${vis.color}`}>{vis.label}</span>
                          {f.polymarket_condition_id && (
                            <span className="text-[10px] text-purple-400/70">PM ✓</span>
                          )}
                          {f.event_date && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Calendar className="w-2.5 h-2.5" />
                              {formatEventDateTime(f.event_date)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] text-muted-foreground">
                            <Users className="w-2.5 h-2.5 inline mr-0.5" />{entries} predictions
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            Pool: ${pool.toFixed(2)}
                          </span>
                          {f.price_a != null && f.price_b != null && (f.price_a > 0 || f.price_b > 0) && (
                            <span className="text-[10px] text-muted-foreground">
                              {(f.price_a * 100).toFixed(0)}% / {(f.price_b * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                        {f.status === "open" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                              onClick={() => callAdmin("lockPredictions", { fight_id: f.id })} title="Lock">
                              <Lock className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-destructive" disabled={busy}
                              onClick={() => callAdmin("deleteFight", { fight_id: f.id })} title="Delete">
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {f.status === "locked" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                            onClick={() => callAdmin("markLive", { fight_id: f.id })} title="Mark Live">
                            <Play className="w-3 h-3" />
                          </Button>
                        )}
                        {f.status === "live" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                              onClick={() => callAdmin("selectResult", { fight_id: f.id, winner: "fighter_a" })}>
                              A
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                              onClick={() => callAdmin("selectResult", { fight_id: f.id, winner: "fighter_b" })}>
                              B
                            </Button>
                          </>
                        )}
                        {f.status === "result_selected" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                            onClick={() => callAdmin("confirmResult", { fight_id: f.id })} title="Confirm">
                            <CheckCircle className="w-3 h-3" />
                          </Button>
                        )}
                        {f.status === "confirmed" && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                            onClick={() => callAdmin("settleEvent", { fight_id: f.id })} title="Settle">
                            <Trophy className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ═══ Section C: Manual Fight Creator ═══ */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            🥊 Manual Fight Creator
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            For Muay Thai, BKFC, bare knuckle, and other combat sports not on Polymarket. Defaults to <span className="text-blue-400 font-medium">1MG.live only</span>.
          </p>
          <PlatformEventCreator wallet={address!} defaultVisibility="platform" />
        </Card>
      </div>
    </div>
  );
}
