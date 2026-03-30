import { useState, useEffect, useCallback, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
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
  Download, Globe, Calendar, Users, RefreshCw, ArrowLeft,
  BarChart3, TrendingUp, ChevronRight, ChevronDown, AlertTriangle, Copy,
  Search, FileDown, Activity, ChevronLeft,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

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

interface FightStats {
  entry_count: number;
  unique_predictors: number;
  total_amount_usd: number;
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

interface ActivityLogEntry {
  id: string;
  action: string;
  description: string;
  admin_wallet: string;
  created_at: string;
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
  f1: { label: "🏎️ F1", color: "bg-red-500/20 text-red-400" },
  cricket: { label: "🏏 Cricket", color: "bg-green-500/20 text-green-400" },
  rugby: { label: "🏉 Rugby", color: "bg-green-500/20 text-green-400" },
  over_under: { label: "📊 O/U", color: "bg-muted text-muted-foreground" },
};

const VIS_BADGE: Record<string, { label: string; color: string }> = {
  platform: { label: "1MG.live", color: "bg-blue-500/20 text-blue-400" },
  all: { label: "Both", color: "bg-green-500/20 text-green-400" },
  flagship: { label: "Flagship", color: "bg-yellow-500/20 text-yellow-400" },
};

const BROWSE_LEAGUES = [
  { key: "nfl", label: "NFL" },
  { key: "nhl", label: "NHL" },
  { key: "nba", label: "NBA" },
  { key: "wnba", label: "WNBA" },
  { key: "mlb", label: "MLB" },
  { key: "epl", label: "EPL" },
  { key: "ucl", label: "UCL" },
  { key: "la-liga", label: "La Liga" },
  { key: "bundesliga", label: "Bundesliga" },
  { key: "serie-a", label: "Serie A" },
  { key: "ligue-1", label: "Ligue 1" },
  { key: "mls", label: "MLS" },
  { key: "liga-mx", label: "Liga MX" },
  { key: "ufc", label: "UFC" },
  { key: "mma", label: "MMA" },
  { key: "boxing", label: "Boxing" },
  { key: "bkfc", label: "BKFC" },
  { key: "ncaab", label: "NCAAB" },
  { key: "cfb", label: "CFB" },
  { key: "atp", label: "ATP" },
  { key: "wta", label: "WTA" },
  { key: "tennis-atp", label: "Tennis ATP" },
  { key: "tennis-wta", label: "Tennis WTA" },
  { key: "tennis-grand-slam", label: "Grand Slams" },
  { key: "golf", label: "Golf" },
  { key: "f1", label: "F1" },
  { key: "cricket", label: "Cricket" },
  { key: "cricket-ipl", label: "IPL" },
  { key: "cricket-psl", label: "PSL" },
  { key: "cricket-intl", label: "Cricket Intl" },
  { key: "rugby", label: "Rugby" },
];

const DASHBOARD_SPORTS = ["soccer", "nfl", "nba", "nhl", "mlb", "ncaa", "combat", "tennis", "golf", "f1", "cricket", "rugby"];

// ── Helpers ──

function normalizeTeamName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(the |fc |afc |cf |as |ac |rc |cd |club |sc )/i, "")
    .replace(/ (fc|sc|cf|afc|city|united|rovers|wanderers|athletic)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function dedupKey(a: string, b: string, dateStr: string | null): string {
  const nA = normalizeTeamName(a);
  const nB = normalizeTeamName(b);
  const sorted = [nA, nB].sort().join("|");
  const d = dateStr ? new Date(dateStr).toISOString().slice(0, 10) : "nodate";
  return `${sorted}::${d}`;
}

function titleDedupKey(title: string): string {
  return title.toLowerCase().replace(/\s+/g, "");
}

interface DuplicateGroup {
  key: string;
  label: string;
  fights: PlatformFight[];
  keepId: string;
  deleteIds: string[];
}

function getDaysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function getEventRowColor(fight: PlatformFight): string {
  if (["settled", "draw", "cancelled"].includes(fight.status)) return "";
  const days = getDaysUntil(fight.event_date);
  if (days === null) return "";
  if (days < 0) return "border-l-2 border-l-red-500";
  if (days === 0) return "border-l-2 border-l-green-500";
  if (days <= 3) return "border-l-2 border-l-yellow-500";
  return "";
}

function downloadCSV(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const ACTION_ICONS: Record<string, string> = {
  import: "📥",
  settle: "⚖️",
  delete: "🗑️",
  lock: "🔒",
  create: "➕",
  default: "📋",
};

const PAGE_SIZE = 50;

// ══════════════════════════════════════════════════
// COMPONENT
// ══════════════════════════════════════════════════

export default function PlatformAdmin() {
  const { address } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fights, setFights] = useState<PlatformFight[]>([]);
  const [fightStatsMap, setFightStatsMap] = useState<Record<string, FightStats>>({});
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"active" | "settled" | "all">("active");
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"browser" | "dashboard" | "analytics" | "activity">("browser");

  // Pagination
  const [page, setPage] = useState(0);
  const [totalFightsCount, setTotalFightsCount] = useState(0);

  // Polymarket browser state
  const [browseLeague, setBrowseLeague] = useState("nfl");
  const [browseResults, setBrowseResults] = useState<PolymarketPreview[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseMessage, setBrowseMessage] = useState("");
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
  const [browseDebugStats, setBrowseDebugStats] = useState<{
    raw_fetched: number;
    after_prop_filter: number;
    after_date_filter: number;
    after_all_filters: number;
    rejection_breakdown: Record<string, number>;
  } | null>(null);

  // Bulk import state
  const [selectedEvents, setSelectedEvents] = useState<Set<string>>(new Set());
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [bulkTotal, setBulkTotal] = useState(0);
  const [failedBatchIds, setFailedBatchIds] = useState<string[]>([]);
  const [bulkSummary, setBulkSummary] = useState("");
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [dedupDialogOpen, setDedupDialogOpen] = useState(false);
  const [dedupGroups, setDedupGroups] = useState<DuplicateGroup[]>([]);
  const [dedupBusy, setDedupBusy] = useState(false);
  const [dedupProgress, setDedupProgress] = useState(0);

  // Bulk dashboard actions
  const [selectedDashboardIds, setSelectedDashboardIds] = useState<Set<string>>(new Set());

  // Settlement modal
  const [settleModal, setSettleModal] = useState<{ fight: PlatformFight; winner: "fighter_a" | "fighter_b" } | null>(null);

  // Activity log
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Unique users KPI
  const [uniqueUsers, setUniqueUsers] = useState<number | null>(null);

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

  // Helper to get sport
  const getSport = useCallback((f: PlatformFight): SportType =>
    detectSport({ event_name: f.event_name, fighter_a_name: f.fighter_a_name, fighter_b_name: f.fighter_b_name, source: f.source }), []);

  // ── Load fights with server-side pagination ──
  const loadFights = useCallback(async () => {
    // Build filter query
    const buildQuery = (base: any) => {
      let q = base.in("visibility", ["platform", "all"]).is("operator_id", null);
      if (filter === "active") q = q.in("status", ["open", "locked", "live", "result_selected", "confirmed"]);
      if (filter === "settled") q = q.in("status", ["settled", "draw", "refunds_complete", "cancelled"]);
      if (searchQuery.trim()) {
        const s = `%${searchQuery.trim()}%`;
        q = q.or(`title.ilike.${s},fighter_a_name.ilike.${s},fighter_b_name.ilike.${s}`);
      }
      return q;
    };

    // Count query
    const countQ = buildQuery(
      supabase.from("prediction_fights").select("id", { count: "exact", head: true })
    );
    const { count } = await countQ;
    setTotalFightsCount(count || 0);

    // Data query with pagination
    const dataQ = buildQuery(
      supabase.from("prediction_fights")
        .select("id, title, status, pool_a_usd, pool_b_usd, visibility, created_at, event_date, fighter_a_name, fighter_b_name, winner, event_name, source, polymarket_active, polymarket_condition_id, featured, trading_allowed, price_a, price_b")
    )
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data: fightsData } = await dataQ;
    if (fightsData) {
      setFights(fightsData as PlatformFight[]);
      const ids = new Set<string>();
      fightsData.forEach((f: any) => {
        if (f.polymarket_condition_id) ids.add(f.polymarket_condition_id);
      });
      setImportedIds(ids);
    }

    // Load fight stats via RPC
    const { data: statsData } = await supabase.rpc("get_platform_fight_stats");
    if (statsData) {
      const map: Record<string, FightStats> = {};
      (statsData as any[]).forEach((row: any) => {
        map[row.fight_id] = {
          entry_count: Number(row.entry_count) || 0,
          unique_predictors: Number(row.unique_predictors) || 0,
          total_amount_usd: Number(row.total_amount_usd) || 0,
        };
      });
      setFightStatsMap(map);
    }
  }, [filter, searchQuery, page]);

  useEffect(() => {
    if (isAdmin) loadFights();
  }, [isAdmin, loadFights]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [filter, sportFilter, searchQuery]);

  // Load unique users for analytics
  useEffect(() => {
    if (isAdmin && activeTab === "analytics") {
      supabase.rpc("get_platform_unique_users").then(({ data }) => {
        setUniqueUsers(data != null ? Number(data) : null);
      });
    }
  }, [isAdmin, activeTab]);

  // Load activity log
  useEffect(() => {
    if (isAdmin && activeTab === "activity") {
      setActivityLoading(true);
      supabase
        .from("admin_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100)
        .then(({ data }) => {
          setActivityLog((data as ActivityLogEntry[]) || []);
          setActivityLoading(false);
        });
    }
  }, [isAdmin, activeTab]);

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

  // Log admin activity
  const logActivity = async (activity_action: string, description: string) => {
    try {
      await supabase.functions.invoke("prediction-admin", {
        body: { action: "logActivity", wallet: address, activity_action, description },
      });
    } catch {}
  };

  // Polymarket browse
  const handleBrowse = async (league: string) => {
    setBrowseLeague(league);
    setBrowseLoading(true);
    setBrowseMessage("");
    setBrowseResults([]);
    setSelectedEvents(new Set());
    setBrowseDebugStats(null);
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
      if (data?.debug_stats) setBrowseDebugStats(data.debug_stats);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBrowseLoading(false);
    }
  };

  // Bulk import
  const handleBulkImport = async (retryIds?: string[]) => {
    const ids = retryIds || Array.from(selectedEvents);
    if (ids.length === 0) { toast.error("No events selected"); return; }
    const BATCH_SIZE = 10;
    const batches: string[][] = [];
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      batches.push(ids.slice(i, i + BATCH_SIZE));
    }
    setBulkImporting(true);
    setBulkTotal(batches.length);
    setBulkProgress(0);
    setBulkSummary("");
    setFailedBatchIds([]);
    let totalImported = 0;
    let totalFailed = 0;
    const failed: string[] = [];
    for (let i = 0; i < batches.length; i++) {
      try {
        const { data, error } = await supabase.functions.invoke("polymarket-sync", {
          body: {
            action: "import_bulk",
            wallet: address,
            event_ids: batches[i],
            import_source: "platform_admin_bulk",
            sport_type: browseLeague,
            visibility: "platform",
          },
        });
        if (error || data?.error) throw new Error(data?.error || error?.message);
        totalImported += data?.total_imported || 0;
      } catch (err: any) {
        totalFailed += batches[i].length;
        failed.push(...batches[i]);
        toast.error(`Batch ${i + 1} failed: ${err.message}`);
      }
      setBulkProgress(i + 1);
    }
    setFailedBatchIds(failed);
    setBulkSummary(`${totalImported} imported, ${totalFailed} failed`);
    if (totalImported > 0) {
      toast.success(`Imported ${totalImported} markets`);
      setSelectedEvents(new Set());
      logActivity("import", `Imported ${totalImported} ${browseLeague.toUpperCase()} events from Polymarket`);
      loadFights();
    }
    setBulkImporting(false);
  };

  // Cleanup junk events
  const JUNK_KEYWORDS = ["over", "under", "o/u", "cba", "mvp", "award", "champion", "will they", "how many", "total", "by dec"];
  const handleCleanup = async () => {
    const junkFights = fights.filter(f => {
      const title = f.title.toLowerCase();
      if (JUNK_KEYWORDS.some(kw => title.includes(kw))) return true;
      if (f.event_date) {
        const days = getDaysUntil(f.event_date);
        if (days !== null && days < -3 && (fightStatsMap[f.id]?.entry_count || 0) === 0) return true;
      }
      return false;
    });
    if (junkFights.length === 0) { toast.info("No junk events found"); return; }
    if (!confirm(`Found ${junkFights.length} junk events. Delete them all?`)) return;
    setCleanupBusy(true);
    let deleted = 0;
    for (const f of junkFights) {
      try {
        await supabase.functions.invoke("prediction-admin", {
          body: { action: "deleteFight", wallet: address, fight_id: f.id },
        });
        deleted++;
      } catch {}
    }
    toast.success(`Deleted ${deleted} junk events`);
    logActivity("delete", `Cleaned up ${deleted} junk events`);
    setCleanupBusy(false);
    loadFights();
  };

  // ── Deduplicate logic ──
  const duplicateSet = useMemo(() => {
    const ids = new Set<string>();
    const byMatchup = new Map<string, string[]>();
    const byTitle = new Map<string, string[]>();
    for (const f of fights) {
      const mk = dedupKey(f.fighter_a_name, f.fighter_b_name, f.event_date);
      const arr = byMatchup.get(mk) || [];
      arr.push(f.id);
      byMatchup.set(mk, arr);
      const tk = titleDedupKey(f.title);
      const tarr = byTitle.get(tk) || [];
      tarr.push(f.id);
      byTitle.set(tk, tarr);
    }
    for (const group of byMatchup.values()) {
      if (group.length > 1) group.forEach(id => ids.add(id));
    }
    for (const group of byTitle.values()) {
      if (group.length > 1) group.forEach(id => ids.add(id));
    }
    return ids;
  }, [fights]);

  const handleDeduplicate = () => {
    const groupMap = new Map<string, PlatformFight[]>();
    for (const f of fights) {
      const mk = dedupKey(f.fighter_a_name, f.fighter_b_name, f.event_date);
      const arr = groupMap.get(mk) || [];
      arr.push(f);
      groupMap.set(mk, arr);
    }
    const titleMap = new Map<string, PlatformFight[]>();
    for (const f of fights) {
      const tk = titleDedupKey(f.title);
      const arr = titleMap.get(tk) || [];
      arr.push(f);
      titleMap.set(tk, arr);
    }
    for (const [tk, titleFights] of titleMap) {
      if (titleFights.length <= 1) continue;
      const ids = new Set(titleFights.map(f => f.id));
      let alreadyCovered = false;
      for (const group of groupMap.values()) {
        if (group.length > 1 && group.some(f => ids.has(f.id))) {
          for (const f of titleFights) {
            if (!group.some(g => g.id === f.id)) group.push(f);
          }
          alreadyCovered = true;
          break;
        }
      }
      if (!alreadyCovered) {
        groupMap.set(`title::${tk}`, titleFights);
      }
    }

    const groups: DuplicateGroup[] = [];
    for (const [key, gFights] of groupMap) {
      if (gFights.length <= 1) continue;
      const sorted = [...gFights].sort((a, b) => {
        const ca = fightStatsMap[a.id]?.entry_count || 0;
        const cb = fightStatsMap[b.id]?.entry_count || 0;
        if (cb !== ca) return cb - ca;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      const keepId = sorted[0].id;
      groups.push({
        key,
        label: `${sorted[0].fighter_a_name} vs ${sorted[0].fighter_b_name}`,
        fights: sorted,
        keepId,
        deleteIds: sorted.slice(1).map(f => f.id),
      });
    }

    if (groups.length === 0) {
      toast.info("No duplicates found");
      return;
    }
    setDedupGroups(groups);
    setDedupDialogOpen(true);
  };

  const handleConfirmDedup = async () => {
    setDedupBusy(true);
    setDedupProgress(0);
    const allDeleteIds = dedupGroups.flatMap(g => g.deleteIds);
    let deleted = 0;
    for (let i = 0; i < allDeleteIds.length; i++) {
      try {
        await supabase.functions.invoke("prediction-admin", {
          body: { action: "deleteFight", wallet: address, fight_id: allDeleteIds[i] },
        });
        deleted++;
      } catch {}
      setDedupProgress(i + 1);
    }
    toast.success(`Deleted ${deleted} duplicate events`);
    logActivity("delete", `Deduplicated: removed ${deleted} duplicate events`);
    setDedupBusy(false);
    setDedupDialogOpen(false);
    setDedupGroups([]);
    loadFights();
  };

  // Toggle single event selection (browser)
  const toggleEventSelection = (id: string) => {
    setSelectedEvents(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const importableEvents = browseResults.filter(ev => !ev.markets?.some(m => importedIds.has(m.conditionId)));
  const allSelected = importableEvents.length > 0 && importableEvents.every(ev => selectedEvents.has(ev.id));

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedEvents(new Set());
    } else {
      setSelectedEvents(new Set(importableEvents.map(ev => ev.id)));
    }
  };

  // Filter fights (sport filter is client-side on current page)
  const filtered = fights.filter(f => {
    if (sportFilter !== "all" && getSport(f) !== sportFilter) return false;
    return true;
  });

  // ── Bulk dashboard actions ──
  const toggleDashboardSelection = (id: string) => {
    setSelectedDashboardIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkLock = async () => {
    const ids = Array.from(selectedDashboardIds).filter(id => {
      const f = fights.find(fi => fi.id === id);
      return f && f.status === "open";
    });
    if (ids.length === 0) { toast.info("No open events selected"); return; }
    setBusy(true);
    let locked = 0;
    for (const id of ids) {
      try {
        await supabase.functions.invoke("prediction-admin", {
          body: { action: "lockPredictions", wallet: address, fight_id: id },
        });
        locked++;
      } catch {}
    }
    toast.success(`Locked ${locked} events`);
    logActivity("lock", `Bulk locked ${locked} events`);
    setSelectedDashboardIds(new Set());
    setBusy(false);
    loadFights();
  };

  const handleBulkDelete = async () => {
    const deletable: string[] = [];
    let skipped = 0;
    for (const id of selectedDashboardIds) {
      if ((fightStatsMap[id]?.entry_count || 0) > 0) {
        skipped++;
      } else {
        deletable.push(id);
      }
    }
    if (deletable.length === 0) {
      toast.error(`All ${skipped} selected events have predictions and cannot be deleted`);
      return;
    }
    if (!confirm(`Delete ${deletable.length} events? ${skipped > 0 ? `(${skipped} skipped — have predictions)` : ""}`)) return;
    setBusy(true);
    let deleted = 0;
    for (const id of deletable) {
      try {
        await supabase.functions.invoke("prediction-admin", {
          body: { action: "deleteFight", wallet: address, fight_id: id },
        });
        deleted++;
      } catch {}
    }
    toast.success(`Deleted ${deleted} events${skipped > 0 ? `, ${skipped} skipped (have predictions)` : ""}`);
    logActivity("delete", `Bulk deleted ${deleted} events`);
    setSelectedDashboardIds(new Set());
    setBusy(false);
    loadFights();
  };

  // ── Settlement modal handler ──
  const handleSettleConfirm = async () => {
    if (!settleModal) return;
    const { fight, winner } = settleModal;
    setSettleModal(null);
    await callAdmin("selectResult", { fight_id: fight.id, winner });
    const winnerName = winner === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name;
    logActivity("settle", `Settled "${fight.fighter_a_name} vs ${fight.fighter_b_name}" — Winner: ${winnerName}`);
  };

  // ── CSV Export ──
  const handleExportCSV = () => {
    const rows = filtered.map(f => {
      const stats = fightStatsMap[f.id];
      const pool = (f.pool_a_usd || 0) + (f.pool_b_usd || 0);
      return [
        `"${f.title.replace(/"/g, '""')}"`,
        `"${f.fighter_a_name}"`,
        `"${f.fighter_b_name}"`,
        getSport(f),
        f.event_date || "",
        f.status,
        f.winner || "",
        stats?.entry_count || 0,
        pool.toFixed(2),
        f.created_at,
      ].join(",");
    });
    const csv = ["Title,Fighter A,Fighter B,Sport,Date,Status,Winner,Predictions,Pool USD,Created At", ...rows].join("\n");
    downloadCSV(`1mg-events-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("CSV exported");
  };

  // ── Analytics ──
  const analytics = useMemo(() => {
    const active = fights.filter(f => ["open", "locked", "live"].includes(f.status)).length;
    const settled = fights.filter(f => ["settled", "draw"].includes(f.status)).length;
    const pending = fights.filter(f => ["result_selected", "confirmed"].includes(f.status)).length;
    const totalPool = fights.reduce((sum, f) => sum + (f.pool_a_usd || 0) + (f.pool_b_usd || 0), 0);
    const totalPredictions = Object.values(fightStatsMap).reduce((s, c) => s + c.entry_count, 0);
    const uniqueEventsTotal = fights.length;
    const avgPool = uniqueEventsTotal > 0 ? totalPool / uniqueEventsTotal : 0;

    // Settlement rate: exclude events created in last 24h
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const eligibleForSettlement = fights.filter(f => f.created_at < cutoff).length;
    const settlementRate = eligibleForSettlement > 0 ? ((settled / eligibleForSettlement) * 100) : 0;

    const top5 = fights
      .map(f => ({ name: `${f.fighter_a_name} vs ${f.fighter_b_name}`, count: fightStatsMap[f.id]?.entry_count || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const perSport: Record<string, number> = {};
    fights.forEach(f => {
      const s = getSport(f);
      perSport[s] = (perSport[s] || 0) + (fightStatsMap[f.id]?.entry_count || 0);
    });

    return { active, settled, pending, totalPool, totalPredictions, avgPool, settlementRate, top5, perSport };
  }, [fights, fightStatsMap, getSport]);

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
  const totalPages = Math.ceil(totalFightsCount / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* ── Breadcrumb + Header ── */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link to="/predictions/admin" className="hover:text-foreground transition-colors">Admin</Link>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground">1MG.live Platform</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground font-['Cinzel'] flex items-center gap-2">
              <Globe className="w-5 h-5 sm:w-6 sm:h-6 text-blue-400" /> 1MG.live Admin
            </h1>
            <Link to="/predictions/admin">
              <Button variant="outline" size="sm" className="gap-1 h-7 text-[10px] sm:text-xs sm:h-8">
                <ArrowLeft className="w-3 h-3" /> Main Admin
              </Button>
            </Link>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full">
              {activePlatformCount} active
            </span>
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-1 rounded-full">
              ${analytics.totalPool.toFixed(0)} pool
            </span>
            <Button variant="outline" size="sm" onClick={() => loadFights()} className="gap-1 h-7 text-[10px] ml-auto">
              <RefreshCw className="w-3 h-3" /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Top-level tabs ── */}
        <div className="overflow-x-auto -mx-4 px-4">
          <div className="flex gap-1.5 min-w-max">
            {([
              { key: "browser", label: "Browser", fullLabel: "Polymarket Browser", icon: <Download className="w-3 h-3" /> },
              { key: "dashboard", label: "Dashboard", fullLabel: "Events Dashboard", icon: <Globe className="w-3 h-3" /> },
              { key: "analytics", label: "Analytics", fullLabel: "Analytics", icon: <BarChart3 className="w-3 h-3" /> },
              { key: "activity", label: "Activity", fullLabel: "Activity Log", icon: <Activity className="w-3 h-3" /> },
            ] as const).map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1 text-[11px] sm:text-xs px-3 sm:px-4 py-2 rounded-lg transition-colors whitespace-nowrap ${
                  activeTab === t.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.icon} <span className="sm:hidden">{t.label}</span><span className="hidden sm:inline">{t.fullLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ══════ TAB: Polymarket Browser ══════ */}
        {activeTab === "browser" && (
          <Card className="bg-card border-border/50 p-4">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Download className="w-4 h-4 text-blue-400" /> Polymarket Browser — Import to 1MG.live
            </h2>
            <p className="text-xs text-muted-foreground mb-3">
              Browse upcoming events by sport. Select multiple and bulk import with visibility <span className="text-blue-400 font-medium">Platform only</span>.
            </p>

            {/* Scrollable sport tabs */}
            <div className="overflow-x-auto pb-2 -mx-1">
              <div className="flex gap-1 px-1 min-w-max">
                {BROWSE_LEAGUES.map(l => (
                  <button
                    key={l.key}
                    onClick={() => handleBrowse(l.key)}
                    className={`text-xs px-3 py-1.5 rounded-md whitespace-nowrap transition-colors ${
                      browseLeague === l.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Debug stats panel */}
            {browseDebugStats && (
              <Collapsible className="mt-2">
                <CollapsibleTrigger className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                  <ChevronDown className="w-3 h-3" />
                  Debug: {browseDebugStats.raw_fetched} raw → {browseDebugStats.after_all_filters} shown
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-1 p-2 rounded-md bg-muted/30 border border-border/30 text-[10px] text-muted-foreground space-y-0.5">
                  <p>📥 Raw events fetched: <span className="text-foreground font-medium">{browseDebugStats.raw_fetched}</span></p>
                  <p>🔍 After prop filter: <span className="text-foreground font-medium">{browseDebugStats.after_prop_filter}</span></p>
                  <p>📅 After date filter: <span className="text-foreground font-medium">{browseDebugStats.after_date_filter}</span></p>
                  <p>✅ Final shown: <span className="text-foreground font-medium">{browseDebugStats.after_all_filters}</span></p>
                  {Object.keys(browseDebugStats.rejection_breakdown).length > 0 && (
                    <div className="pt-1 border-t border-border/30 mt-1">
                      <p className="font-medium text-foreground">Rejection reasons:</p>
                      {Object.entries(browseDebugStats.rejection_breakdown).map(([reason, count]) => (
                        <p key={reason}>  • {reason}: {count}</p>
                      ))}
                    </div>
                  )}
                </CollapsibleContent>
              </Collapsible>
            )}
            {selectedEvents.size > 0 && (
              <div className="flex items-center gap-3 mt-3 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-xs text-blue-400 font-medium">{selectedEvents.size} selected</span>
                <Button
                  size="sm"
                  className="h-7 text-[10px] px-4 gap-1"
                  onClick={() => handleBulkImport()}
                  disabled={bulkImporting}
                >
                  {bulkImporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
                  Import Selected to 1MG.live
                </Button>
                <button
                  onClick={() => setSelectedEvents(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                >
                  Clear
                </button>
              </div>
            )}

            {bulkImporting && (
              <div className="mt-2">
                <Progress value={bulkTotal > 0 ? (bulkProgress / bulkTotal) * 100 : 0} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">Importing batch {bulkProgress}/{bulkTotal}...</p>
              </div>
            )}

            {bulkSummary && !bulkImporting && (
              <div className="mt-2 flex items-center gap-2">
                <p className="text-[10px] text-muted-foreground">{bulkSummary}</p>
                {failedBatchIds.length > 0 && (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-3" onClick={() => handleBulkImport(failedBatchIds)}>
                    Retry {failedBatchIds.length} Failed
                  </Button>
                )}
              </div>
            )}

            {/* Results */}
            <div className="mt-3">
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
                <>
                  {importableEvents.length > 0 && (
                    <div className="flex items-center gap-2 mb-2 px-1">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleSelectAll}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        Select all ({importableEvents.length} importable)
                      </span>
                    </div>
                  )}
                  <div className="space-y-2 max-h-[500px] overflow-y-auto">
                    {browseResults.map(ev => {
                      const isImported = ev.markets?.some(m => importedIds.has(m.conditionId));
                      const isSelected = selectedEvents.has(ev.id);
                      return (
                        <div
                          key={ev.id}
                          className={`flex items-center gap-3 p-3 rounded-lg bg-muted/30 border transition-colors ${
                            isSelected ? "border-blue-500/50 bg-blue-500/5" : "border-border/30"
                          }`}
                        >
                          {!isImported && (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleEventSelection(ev.id)}
                              className="h-3.5 w-3.5 flex-shrink-0"
                            />
                          )}
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
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </Card>
        )}

        {/* ══════ TAB: Events Dashboard ══════ */}
        {activeTab === "dashboard" && (
          <Card className="bg-card border-border/50 p-4">
            <div className="space-y-2 mb-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                  <Globe className="w-4 h-4 text-blue-400" /> Events
                </h2>
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{totalFightsCount} total</span>
                <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">${analytics.totalPool.toFixed(0)} pool</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1 h-7 text-[10px]">
                  <FileDown className="w-3 h-3" /> CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleDeduplicate} className="gap-1 h-7 text-[10px] text-yellow-400">
                  <Copy className="w-3 h-3" /> Dedup {duplicateSet.size > 0 ? `(${duplicateSet.size})` : ""}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCleanup} disabled={cleanupBusy} className="gap-1 h-7 text-[10px] text-red-400">
                  <Trash2 className="w-3 h-3" /> {cleanupBusy ? "..." : "Junk"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => loadFights()} className="gap-1 h-7 text-[10px]">
                  <RefreshCw className="w-3 h-3" />
                </Button>
              </div>
            </div>

            {/* Filter row + Search */}
            <div className="space-y-2 mb-3">
              <div className="flex gap-1.5 flex-wrap">
                {(["active", "settled", "all"] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`text-[11px] px-2.5 py-1 rounded-full transition-colors ${
                      filter === f ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>
              <div className="overflow-x-auto -mx-4 px-4">
                <div className="flex gap-1 min-w-max">
                  <button
                    onClick={() => setSportFilter("all")}
                    className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${sportFilter === "all" ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                  >
                    All
                  </button>
                  {DASHBOARD_SPORTS.map(s => (
                    <button
                      key={s}
                      onClick={() => setSportFilter(s)}
                      className={`text-[11px] px-2 py-1 rounded-full whitespace-nowrap ${sportFilter === s ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}
                    >
                      {SPORT_BADGE[s]?.label || s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Search bar */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Search events by team name or title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 text-xs pl-8"
              />
            </div>

            {/* Bulk actions toolbar */}
            {selectedDashboardIds.size > 0 && (
              <div className="flex items-center gap-3 mb-3 p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-xs text-blue-400 font-medium">{selectedDashboardIds.size} selected</span>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={handleBulkLock} disabled={busy}>
                  <Lock className="w-3 h-3" /> Lock Selected
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1 text-destructive" onClick={handleBulkDelete} disabled={busy}>
                  <Trash2 className="w-3 h-3" /> Delete Selected
                </Button>
                <button
                  onClick={() => setSelectedDashboardIds(new Set())}
                  className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                >
                  Clear
                </button>
              </div>
            )}

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
                  const stats = fightStatsMap[f.id];
                  const entries = stats?.entry_count || 0;
                  const daysUntil = getDaysUntil(f.event_date);
                  const rowColor = getEventRowColor(f);
                  const isChecked = selectedDashboardIds.has(f.id);

                  return (
                    <Collapsible key={f.id}>
                      <div className={`p-3 rounded-lg bg-muted/30 border border-border/30 ${rowColor} ${isChecked ? "ring-1 ring-blue-500/40" : ""}`}>
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-2">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <Checkbox
                              checked={isChecked}
                              onCheckedChange={() => toggleDashboardSelection(f.id)}
                              className="h-3.5 w-3.5 mt-1 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-sm font-medium text-foreground truncate">{f.fighter_a_name} vs {f.fighter_b_name}</p>
                                <CollapsibleTrigger className="text-muted-foreground hover:text-foreground">
                                  <ChevronDown className="w-3 h-3" />
                                </CollapsibleTrigger>
                              </div>
                              <p className="text-[10px] text-muted-foreground truncate">{f.event_name}</p>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.color}`}>{badge.label}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || "bg-muted text-muted-foreground"}`}>
                                  {f.status}
                                  {f.status === "settled" && f.winner && ` — ${f.winner === "fighter_a" ? f.fighter_a_name : f.fighter_b_name} won`}
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${vis.color}`}>{vis.label}</span>
                                {f.polymarket_condition_id && (
                                  <span className="text-[10px] text-purple-400/70">PM ✓</span>
                                )}
                                {duplicateSet.has(f.id) && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-yellow-500/20 text-yellow-400 flex items-center gap-0.5">
                                    <AlertTriangle className="w-2.5 h-2.5" /> Duplicate
                                  </span>
                                )}
                                {f.event_date && (
                                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                    <Calendar className="w-2.5 h-2.5" />
                                    {formatEventDateTime(f.event_date)}
                                  </span>
                                )}
                                {daysUntil !== null && (
                                  <span className={`text-[10px] font-medium ${
                                    daysUntil < 0 ? "text-red-400" : daysUntil === 0 ? "text-green-400" : daysUntil <= 3 ? "text-yellow-400" : "text-muted-foreground"
                                  }`}>
                                    {daysUntil < 0 ? `${Math.abs(daysUntil)}d ago` : daysUntil === 0 ? "Today" : `in ${daysUntil}d`}
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
                          </div>

                          {/* Action buttons */}
                          <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end mt-1 sm:mt-0">
                            {f.status === "open" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                                  onClick={() => callAdmin("lockPredictions", { fight_id: f.id })} title="Lock">
                                  <Lock className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-destructive" disabled={busy}
                                  onClick={async () => {
                                    if (entries > 0) { toast.error(`"${f.title}" has ${entries} prediction(s) and CANNOT be deleted.`); return; }
                                    if (!confirm(`Delete "${f.title}"? This cannot be undone.`)) return;
                                    await callAdmin("deleteFight", { fight_id: f.id });
                                    logActivity("delete", `Deleted "${f.fighter_a_name} vs ${f.fighter_b_name}"`);
                                  }} title="Delete">
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </>
                            )}
                            {f.status === "locked" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                                  onClick={() => callAdmin("markLive", { fight_id: f.id })} title="Mark Live">
                                  <Play className="w-3 h-3" />
                                </Button>
                                {entries === 0 && (
                                  <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-destructive" disabled={busy}
                                    onClick={async () => {
                                      if (!confirm(`Delete locked event "${f.title}"? This cannot be undone.`)) return;
                                      await callAdmin("deleteFight", { fight_id: f.id });
                                      logActivity("delete", `Deleted locked event "${f.fighter_a_name} vs ${f.fighter_b_name}"`);
                                    }} title="Delete">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                )}
                              </>
                            )}
                            {f.status === "live" && (
                              <>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                                  onClick={() => setSettleModal({ fight: f, winner: "fighter_a" })}>
                                  A
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                                  onClick={() => setSettleModal({ fight: f, winner: "fighter_b" })}>
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

                        {/* Expandable detail row */}
                        <CollapsibleContent className="mt-2 pt-2 border-t border-border/30 text-[10px] text-muted-foreground space-y-1">
                          <div className="flex items-center gap-4 flex-wrap">
                            <span>ID: <button onClick={() => { navigator.clipboard.writeText(f.id); toast.success("Copied ID"); }} className="text-foreground hover:underline">{f.id.slice(0, 8)}…</button></span>
                            <span>Source: {f.source}</span>
                            <span>Visibility: {f.visibility}</span>
                            <span>Created: {new Date(f.created_at).toLocaleString()}</span>
                            {f.polymarket_condition_id && <span>PM Condition: {f.polymarket_condition_id.slice(0, 12)}…</span>}
                            {stats && <span>Unique predictors: {stats.unique_predictors}</span>}
                            {stats && <span>Total USD: ${stats.total_amount_usd.toFixed(2)}</span>}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/30">
                <span className="text-[10px] text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalFightsCount)} of {totalFightsCount} events
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 gap-1"
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="w-3 h-3" /> Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] px-2 gap-1"
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Next <ChevronRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ══════ TAB: Analytics ══════ */}
        {activeTab === "analytics" && (
          <div className="space-y-4">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Active Events", value: analytics.active, color: "text-green-400" },
                { label: "Settled", value: analytics.settled, color: "text-blue-400" },
                { label: "Pending", value: analytics.pending, color: "text-yellow-400" },
                { label: "Total Pool", value: `$${analytics.totalPool.toFixed(0)}`, color: "text-primary" },
                { label: "Total Predictions", value: analytics.totalPredictions, color: "text-foreground" },
                { label: "Unique Users", value: uniqueUsers ?? "—", color: "text-purple-400" },
                { label: "Avg Pool/Event", value: `$${analytics.avgPool.toFixed(2)}`, color: "text-muted-foreground" },
                { label: "Settlement Rate", value: `${analytics.settlementRate.toFixed(0)}%`, color: "text-blue-400" },
              ].map((kpi, i) => (
                <Card key={i} className="bg-card border-border/50 p-3">
                  <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                  <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
                </Card>
              ))}
            </div>

            {/* Top 5 Most Predicted */}
            <Card className="bg-card border-border/50 p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" /> Top 5 Most Predicted Events
              </h3>
              <div className="space-y-2">
                {analytics.top5.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-primary w-5">#{i + 1}</span>
                      <span className="text-xs text-foreground truncate max-w-[250px]">{ev.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{ev.count} predictions</span>
                  </div>
                ))}
                {analytics.top5.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No predictions yet</p>
                )}
              </div>
            </Card>

            {/* Predictions per Sport */}
            <Card className="bg-card border-border/50 p-4">
              <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" /> Predictions per Sport
              </h3>
              <div className="space-y-2">
                {Object.entries(analytics.perSport)
                  .sort((a, b) => b[1] - a[1])
                  .map(([sport, count]) => {
                    const maxCount = Math.max(...Object.values(analytics.perSport), 1);
                    const sbadge = SPORT_BADGE[sport] || { label: sport, color: "bg-muted text-muted-foreground" };
                    return (
                      <div key={sport} className="flex items-center gap-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium w-24 text-center ${sbadge.color}`}>{sbadge.label}</span>
                        <div className="flex-1 bg-muted/30 rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-primary/40 h-full rounded-full transition-all"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-muted-foreground w-10 text-right">{count}</span>
                      </div>
                    );
                  })}
                {Object.keys(analytics.perSport).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No data yet</p>
                )}
              </div>
            </Card>
          </div>
        )}

        {/* ══════ TAB: Activity Log ══════ */}
        {activeTab === "activity" && (
          <Card className="bg-card border-border/50 p-4">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" /> Activity Log
              <span className="text-[10px] text-muted-foreground ml-1">Last 100 actions</span>
            </h2>
            {activityLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
            ) : activityLog.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">No activity yet</p>
            ) : (
              <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
                {activityLog.map(entry => {
                  const icon = ACTION_ICONS[entry.action] || ACTION_ICONS.default;
                  return (
                    <div key={entry.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 border border-border/30">
                      <span className="text-sm mt-0.5">{icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-foreground">{entry.description}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(entry.created_at).toLocaleString()} · {entry.admin_wallet.slice(0, 6)}…{entry.admin_wallet.slice(-4)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        )}

        {/* ═══ Promo Codes + Manual Creator (dashboard tab only) ═══ */}
        {activeTab === "dashboard" && (
          <>
            <PromoCodeManager wallet={address!} />
            <Card className="bg-card border-border/50 p-4">
              <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                🥊 Manual Fight Creator
              </h2>
              <p className="text-xs text-muted-foreground mb-3">
                For Muay Thai, BKFC, bare knuckle, and other combat sports not on Polymarket. Defaults to <span className="text-blue-400 font-medium">1MG.live only</span>.
              </p>
              <PlatformEventCreator wallet={address!} defaultVisibility="platform" />
            </Card>
          </>
        )}

        {/* ═══ Settlement Confirmation Modal ═══ */}
        <Dialog open={!!settleModal} onOpenChange={(open) => { if (!open) setSettleModal(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-primary" /> Settle Event
              </DialogTitle>
              <DialogDescription>
                {settleModal && (
                  <>
                    Settle <strong>{settleModal.fight.fighter_a_name} vs {settleModal.fight.fighter_b_name}</strong>?
                    <br /><br />
                    Winner: <strong className="text-primary">{settleModal.winner === "fighter_a" ? settleModal.fight.fighter_a_name : settleModal.fight.fighter_b_name}</strong>
                    <br /><br />
                    This will distribute the pool. <span className="text-destructive font-medium">Cannot be undone.</span>
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setSettleModal(null)}>Cancel</Button>
              <Button size="sm" onClick={handleSettleConfirm} className="gap-1">
                <Trophy className="w-3 h-3" /> Confirm Settlement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ═══ Deduplicate Dialog ═══ */}
        <Dialog open={dedupDialogOpen} onOpenChange={setDedupDialogOpen}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" /> Deduplicate Events
              </DialogTitle>
              <DialogDescription>
                Found {dedupGroups.length} duplicate groups ({dedupGroups.reduce((s, g) => s + g.deleteIds.length, 0)} events to delete).
                Review below — the event with the most predictions (or earliest) will be kept.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 mt-2">
              {dedupGroups.map(group => (
                <div key={group.key} className="p-3 rounded-lg bg-muted/30 border border-border/30">
                  <p className="text-sm font-medium text-foreground mb-2">{group.label}</p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-[10px] h-8">Title</TableHead>
                        <TableHead className="text-[10px] h-8">Date</TableHead>
                        <TableHead className="text-[10px] h-8">Predictions</TableHead>
                        <TableHead className="text-[10px] h-8">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.fights.map(f => (
                        <TableRow key={f.id}>
                          <TableCell className="text-[10px] py-1.5 max-w-[200px] truncate">{f.title}</TableCell>
                          <TableCell className="text-[10px] py-1.5">
                            {f.event_date ? formatEventDateTime(f.event_date) : "—"}
                          </TableCell>
                          <TableCell className="text-[10px] py-1.5">{fightStatsMap[f.id]?.entry_count || 0}</TableCell>
                          <TableCell className="text-[10px] py-1.5">
                            {f.id === group.keepId ? (
                              <span className="text-green-400 font-medium">✓ Keep</span>
                            ) : (
                              <span className="text-red-400">🗑 Delete</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>

            {dedupBusy && (
              <div className="mt-3">
                <Progress value={dedupGroups.reduce((s, g) => s + g.deleteIds.length, 0) > 0 ? (dedupProgress / dedupGroups.reduce((s, g) => s + g.deleteIds.length, 0)) * 100 : 0} className="h-1.5" />
                <p className="text-[10px] text-muted-foreground mt-1">Deleting {dedupProgress}/{dedupGroups.reduce((s, g) => s + g.deleteIds.length, 0)}...</p>
              </div>
            )}

            <DialogFooter className="mt-4">
              <Button variant="outline" size="sm" onClick={() => setDedupDialogOpen(false)} disabled={dedupBusy}>
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={handleConfirmDedup}
                disabled={dedupBusy}
                className="gap-1"
              >
                {dedupBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                Delete {dedupGroups.reduce((s, g) => s + g.deleteIds.length, 0)} Duplicates
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
