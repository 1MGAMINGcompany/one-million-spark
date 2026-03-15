import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Shield, Plus, Lock, Trophy, Loader2, Play, CheckCircle, Ban,
  ArrowDown, Trash2, Eye, AlertTriangle, RefreshCw, Power, Download,
  Archive, EyeOff, Filter, ChevronUp, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";

interface PredictionEvent {
  id: string;
  event_name: string;
  organization: string | null;
  event_date: string | null;
  location: string | null;
  status: string;
  is_test: boolean;
  auto_resolve: boolean;
  created_at: string;
  source: string;
  source_provider: string | null;
  source_event_id: string | null;
  automation_paused: boolean;
  requires_admin_approval: boolean;
  automation_status: string;
  scheduled_lock_at: string | null;
  scheduled_live_at: string | null;
  last_automation_check_at: string | null;
}

interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
  shares_a: number;
  shares_b: number;
  status: string;
  winner: string | null;
  event_name: string;
  event_id: string | null;
  method: string | null;
  refund_status: string | null;
  review_required: boolean;
  review_reason: string | null;
  claims_open_at: string | null;
  confirmed_at: string | null;
  settled_at: string | null;
}

const LAMPORTS = 1_000_000_000;

const METHODS = ["KO", "TKO", "Decision", "Submission", "DQ", "Split Decision", "Unanimous Decision"];

const STATUS_ORDER = ["open", "locked", "live", "result_selected", "confirmed", "settled", "draw", "refund_pending", "refunds_processing", "refunds_complete", "cancelled"];

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/20 text-green-400",
  locked: "bg-yellow-500/20 text-yellow-400",
  live: "bg-red-500/20 text-red-400 animate-pulse",
  result_selected: "bg-orange-500/20 text-orange-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  settled: "bg-primary/20 text-primary",
  draw: "bg-muted text-muted-foreground",
  refund_pending: "bg-yellow-500/20 text-yellow-400",
  refunds_processing: "bg-yellow-500/20 text-yellow-400",
  refunds_complete: "bg-muted text-muted-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export default function FightPredictionAdmin() {
  const { address } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [fights, setFights] = useState<Fight[]>([]);
  const [busy, setBusy] = useState(false);
  const [adminFilter, setAdminFilter] = useState<string>("active");

  // Kill switches
  const [killSwitches, setKillSwitches] = useState({
    predictions_enabled: true,
    claims_enabled: true,
    automation_enabled: true,
  });
  const [killSwitchLoading, setKillSwitchLoading] = useState(false);
  // Create event form
  const [eventName, setEventName] = useState("");
  const [eventOrg, setEventOrg] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventIsTest, setEventIsTest] = useState(false);

  // Create fight form
  const [fightTitle, setFightTitle] = useState("");
  const [fighterA, setFighterA] = useState("");
  const [fighterB, setFighterB] = useState("");
  const [fightEventId, setFightEventId] = useState("");
  const [fightEventName, setFightEventName] = useState("");
  const [fightWeightClass, setFightWeightClass] = useState("");
  const [fightClass, setFightClass] = useState("");

  // Confirmation dialog
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    onConfirm: () => void;
    destructive?: boolean;
  } | null>(null);

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

  const [entryCounts, setEntryCounts] = useState<Record<string, number>>({});
  const [botConfirmData, setBotConfirmData] = useState<Record<string, { confidence: number; provider: string; confirmed_at: string; claims_open_at: string }>>({});

  const loadData = useCallback(async () => {
    const [eventsRes, fightsRes, entriesRes, settingsRes, logsRes] = await Promise.all([
      supabase.from("prediction_events").select("*").order("created_at", { ascending: false }),
      supabase.from("prediction_fights").select("*").order("created_at", { ascending: false }),
      supabase.from("prediction_entries").select("fight_id"),
      supabase.functions.invoke("prediction-admin", { body: { action: "getSettings", wallet: address } }),
      supabase.from("automation_logs").select("fight_id, confidence, details, created_at").eq("action", "bot_auto_confirm").order("created_at", { ascending: false }),
    ]);
    if (eventsRes.data) setEvents(eventsRes.data as any);
    if (fightsRes.data) setFights(fightsRes.data as any);
    if (settingsRes.data?.settings) setKillSwitches(settingsRes.data.settings);
    if (entriesRes.data) {
      const counts: Record<string, number> = {};
      entriesRes.data.forEach((e: any) => { counts[e.fight_id] = (counts[e.fight_id] || 0) + 1; });
      setEntryCounts(counts);
    }
    if (logsRes.data) {
      const bcd: Record<string, any> = {};
      for (const log of logsRes.data as any[]) {
        if (log.fight_id && !bcd[log.fight_id]) {
          const d = log.details || {};
          bcd[log.fight_id] = {
            confidence: log.confidence ?? 0,
            provider: d.provider || "unknown",
            confirmed_at: d.claims_open_at ? new Date(new Date(d.claims_open_at).getTime() - 3 * 60 * 1000).toISOString() : log.created_at,
            claims_open_at: d.claims_open_at || null,
          };
        }
      }
      setBotConfirmData(bcd);
    }
  }, []);

  // Initial load + 5-second polling for admin freshness
  useEffect(() => {
    if (!isAdmin) return;
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isAdmin, loadData]);

  // Force immediate refresh helper
  const refreshNow = useCallback(() => { loadData(); }, [loadData]);

  const callAdmin = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action, wallet: address, ...extra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      // Force immediate data refresh after every admin action
      setTimeout(refreshNow, 300);
      return data;
    } finally {
      setBusy(false);
    }
  };

  const callRefundWorker = async (fight_id: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-refund-worker", {
        body: { fight_id, wallet: address },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTimeout(refreshNow, 300);
      return data;
    } finally {
      setBusy(false);
    }
  };

  const withConfirm = (title: string, description: string, onConfirm: () => void, destructive = true) => {
    setConfirmAction({ title, description, onConfirm, destructive });
  };

  const toggleKillSwitch = async (key: "predictions_enabled" | "claims_enabled" | "automation_enabled") => {
    setKillSwitchLoading(true);
    try {
      const newVal = !killSwitches[key];
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action: "updateSettings", wallet: address, [key]: newVal },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setKillSwitches(prev => ({ ...prev, [key]: newVal }));
      toast.success(`${key.replace(/_/g, " ")} → ${newVal ? "ON" : "OFF"}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setKillSwitchLoading(false);
    }
  };

  // ── Event actions ──
  const handleCreateEvent = async () => {
    if (!eventName) { toast.error("Event name required"); return; }
    try {
      await callAdmin("createEvent", {
        event_name: eventName, organization: eventOrg || null,
        event_date: eventDate || null, location: eventLocation || null,
        is_test: eventIsTest,
      });
      toast.success("Event created!");
      setEventName(""); setEventOrg(""); setEventDate(""); setEventLocation(""); setEventIsTest(false);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  // ── Fight actions ──
  const handleCreateFight = async () => {
    if (!fightTitle || !fighterA || !fighterB) { toast.error("Fill in all fields"); return; }
    try {
      await callAdmin("createFight", {
        title: fightTitle, fighter_a_name: fighterA, fighter_b_name: fighterB,
        event_name: fightEventName, event_id: fightEventId || null,
        weight_class: fightWeightClass || null, fight_class: fightClass || null,
      });
      toast.success("Fight created!");
      setFightTitle(""); setFighterA(""); setFighterB(""); setFightWeightClass(""); setFightClass("");
      loadData();
    } catch (err: any) { toast.error(err.message); }
  };

  const fightAction = async (action: string, fightId: string, extra: Record<string, any> = {}) => {
    try {
      await callAdmin(action, { fight_id: fightId, ...extra });
      toast.success(`Action "${action}" completed`);
      loadData();
    } catch (err: any) { toast.error(err.message); }
  };

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
          {address && <p className="text-xs text-muted-foreground/60 mt-1 font-mono">{address}</p>}
        </div>
      </div>
    );
  }

  const eventFights = (eventId: string) => fights.filter(f => f.event_id === eventId);

  // Compute entry counts per event for safe-delete checks
  const eventHasPredictions = (eventId: string) => {
    return eventFights(eventId).some(f => (entryCounts[f.id] || 0) > 0);
  };

  const eventIsFullySettled = (eventId: string) => {
    const ef = eventFights(eventId);
    return ef.length > 0 && ef.every(f => ["settled", "refunds_complete", "cancelled"].includes(f.status));
  };

  type AdminFilterType = "needs_action" | "active" | "pending" | "live" | "review" | "archived" | "dismissed";

  // Mutually exclusive filter assignment: each event belongs to exactly one bucket
  const getEventBucket = (e: PredictionEvent): AdminFilterType => {
    if (["dismissed", "rejected"].includes(e.status)) return "dismissed";
    if (e.status === "archived") return "archived";
    if (e.status === "draft") return "pending";
    // For approved events, check fight states
    const ef = eventFights(e.id);
    if (ef.some(f => f.status === "live")) return "live";
    if (ef.some(f => f.review_required)) return "review";
    // Needs action: confirmed fights waiting for settle, or result_selected needing confirm
    if (ef.some(f => ["result_selected", "confirmed", "refund_pending"].includes(f.status))) return "needs_action";
    return "active";
  };

  const bucketCounts: Record<AdminFilterType, number> = { needs_action: 0, active: 0, pending: 0, live: 0, review: 0, archived: 0, dismissed: 0 };
  events.forEach(e => { bucketCounts[getEventBucket(e)]++; });

  const FILTER_TABS: { key: AdminFilterType; label: string; count: number }[] = [
    { key: "needs_action", label: "⚡ Action", count: bucketCounts.needs_action },
    { key: "active", label: "Active", count: bucketCounts.active },
    { key: "pending", label: "Pending", count: bucketCounts.pending },
    { key: "live", label: "Live", count: bucketCounts.live },
    { key: "review", label: "Review", count: bucketCounts.review },
    { key: "archived", label: "Archived", count: bucketCounts.archived },
    { key: "dismissed", label: "Dismissed", count: bucketCounts.dismissed },
  ];

  const filteredEvents = events.filter(e => getEventBucket(e) === adminFilter);

  const handleDismissEvent = async (eventId: string, eventName: string) => {
    try {
      await callAdmin("dismissEvent", { event_id: eventId });
      toast.success(`"${eventName}" dismissed`);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleArchiveEvent = async (eventId: string, eventName: string) => {
    try {
      await callAdmin("archiveEvent", { event_id: eventId });
      toast.success(`"${eventName}" archived`);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleDeleteEvent = async (eventId: string, eventName: string) => {
    try {
      await callAdmin("deleteEvent", { event_id: eventId });
      toast.success(`"${eventName}" deleted`);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground font-['Cinzel'] flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" /> Prediction Admin
          </h1>
          <Button variant="outline" size="sm" onClick={() => window.location.href = '/referrals/admin'} className="gap-2">
            <Users className="w-4 h-4" /> Referrals
          </Button>
        </div>

        {/* ── Kill Switches ── */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Power className="w-4 h-4 text-destructive" /> Kill Switches
          </h2>
          <div className="space-y-3">
            {([
              { key: "predictions_enabled" as const, label: "Predictions", desc: "Allow new predictions to be submitted" },
              { key: "claims_enabled" as const, label: "Claims", desc: "Allow winners to claim rewards" },
              { key: "automation_enabled" as const, label: "Automation", desc: "Auto-settle confirmed fights via cron" },
            ]).map(({ key, label, desc }) => (
              <div key={key} className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
                <Switch
                  checked={killSwitches[key]}
                  onCheckedChange={() => toggleKillSwitch(key)}
                  disabled={killSwitchLoading}
                />
              </div>
            ))}
          </div>
        </Card>

        {/* ── Event Ingest ── */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Download className="w-4 h-4 text-primary" /> Event Ingest
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            Fetch upcoming events from configured providers. Soccer requires API_FOOTBALL_KEY. Events are stored as drafts — never auto-published.
          </p>
          <IngestPanel wallet={address!} busy={busy} onComplete={loadData} />
        </Card>

        {/* ── Create Event ── */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Create Event
          </h2>
          <div className="space-y-3">
            <Input placeholder="Event name" value={eventName} onChange={e => setEventName(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Organization" value={eventOrg} onChange={e => setEventOrg(e.target.value)} />
              <Input placeholder="Location" value={eventLocation} onChange={e => setEventLocation(e.target.value)} />
            </div>
            <Input type="date" placeholder="Event date" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={eventIsTest} onChange={e => setEventIsTest(e.target.checked)} />
              Test Event
            </label>
            <Button className="w-full bg-primary text-primary-foreground" onClick={handleCreateEvent} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Event
            </Button>
          </div>
        </Card>

        {/* ── Create Fight ── */}
        <Card className="bg-card border-border/50 p-4">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" /> Create Fight
          </h2>
          <div className="space-y-3">
            <Input placeholder="Fight title (e.g. Main Event — 165 lbs — A-Class)" value={fightTitle} onChange={e => setFightTitle(e.target.value)} />
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Fighter A" value={fighterA} onChange={e => setFighterA(e.target.value)} />
              <Input placeholder="Fighter B" value={fighterB} onChange={e => setFighterB(e.target.value)} />
            </div>
            <select
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
              value={fightEventId}
              onChange={e => {
                setFightEventId(e.target.value);
                const ev = events.find(ev => ev.id === e.target.value);
                if (ev) setFightEventName(ev.event_name);
              }}
            >
              <option value="">No event (standalone)</option>
              {events.filter(e => e.status !== "rejected").map(e => (
                <option key={e.id} value={e.id}>
                  {e.is_test ? "🧪 " : ""}{e.event_name}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Weight class" value={fightWeightClass} onChange={e => setFightWeightClass(e.target.value)} />
              <Input placeholder="Fight class (A/B/C)" value={fightClass} onChange={e => setFightClass(e.target.value)} />
            </div>
            <Button className="w-full bg-primary text-primary-foreground" onClick={handleCreateFight} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Fight
            </Button>
          </div>
        </Card>

        {/* ── Admin Filters ── */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground shrink-0" />
          {FILTER_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setAdminFilter(tab.key)}
              className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors ${
                adminFilter === tab.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`ml-1.5 ${adminFilter === tab.key ? "text-primary-foreground/70" : "text-muted-foreground/60"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Events List ── */}
        <h2 className="text-lg font-bold text-foreground font-['Cinzel']">
          Events
          <span className="text-sm font-normal text-muted-foreground ml-2">({filteredEvents.length})</span>
        </h2>

        {filteredEvents.length === 0 && (
          <Card className="bg-card border-border/50 p-6 text-center">
            <p className="text-sm text-muted-foreground">No events in this category.</p>
          </Card>
        )}

        {filteredEvents.map(event => (
          <AdminEventCard
            key={event.id}
            event={event}
            fights={eventFights(event.id)}
            entryCounts={entryCounts}
            botConfirmData={botConfirmData}
            busy={busy}
            onFightAction={fightAction}
            onConfirm={withConfirm}
            onRefund={async (fightId) => {
              try {
                const result = await callRefundWorker(fightId);
                toast.success(`Refunded ${result.refunded} entries`);
                loadData();
              } catch (e: any) { toast.error(e.message); }
            }}
            callAdmin={callAdmin}
            loadData={loadData}
            onDismiss={handleDismissEvent}
            onArchive={handleArchiveEvent}
            onDelete={handleDeleteEvent}
            eventHasPredictions={eventHasPredictions(event.id)}
            eventIsFullySettled={eventIsFullySettled(event.id)}
          />
        ))}

        {/* ── Ungrouped Fights ── */}
        {fights.filter(f => !f.event_id).length > 0 && (
          <>
            <h2 className="text-lg font-bold text-foreground font-['Cinzel']">Ungrouped Fights</h2>
            <div className="space-y-3">
              {fights.filter(f => !f.event_id).map(fight => (
                <AdminFightCard
                  key={fight.id}
                  fight={fight}
                  busy={busy}
                  entryCount={entryCounts[fight.id] || 0}
                  botConfirm={botConfirmData[fight.id] || null}
                  onAction={(action, extra) => fightAction(action, fight.id, extra)}
                  onConfirm={withConfirm}
                  onRefund={async () => {
                    try {
                      const result = await callRefundWorker(fight.id);
                      toast.success(`Refunded ${result.refunded} entries`);
                      loadData();
                    } catch (e: any) { toast.error(e.message); }
                  }}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <AlertDialogContent className="bg-card border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {confirmAction?.title}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              {confirmAction?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-border text-muted-foreground">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={confirmAction?.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground"}
              onClick={() => { confirmAction?.onConfirm(); setConfirmAction(null); }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Countdown Hook ── returns { text, seconds, expired }
function useCountdown(targetIso: string | null): { text: string | null; seconds: number | null; expired: boolean } {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetIso) { setRemaining(null); return; }
    const target = new Date(targetIso).getTime();

    const tick = () => {
      const diff = Math.max(0, Math.floor((target - Date.now()) / 1000));
      setRemaining(diff);
      if (diff <= 0 && intervalRef.current) clearInterval(intervalRef.current);
    };

    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [targetIso]);

  if (remaining === null) return { text: null, seconds: null, expired: false };
  if (remaining <= 0) return { text: null, seconds: 0, expired: true };
  const m = Math.floor(remaining / 60);
  const sec = remaining % 60;
  return { text: `${m}m ${sec.toString().padStart(2, "0")}s`, seconds: remaining, expired: false };
}

// ── Per-Event Admin Card (with expand/collapse) ──
function AdminEventCard({
  event, fights, entryCounts, botConfirmData, busy,
  onFightAction, onConfirm, onRefund, callAdmin, loadData,
  onDismiss, onArchive, onDelete, eventHasPredictions, eventIsFullySettled,
}: {
  event: PredictionEvent;
  fights: Fight[];
  entryCounts: Record<string, number>;
  botConfirmData: Record<string, { confidence: number; provider: string; confirmed_at: string; claims_open_at: string }>;
  busy: boolean;
  onFightAction: (action: string, fightId: string, extra?: Record<string, any>) => Promise<void>;
  onConfirm: (title: string, desc: string, onConfirm: () => void, destructive?: boolean) => void;
  onRefund: (fightId: string) => Promise<void>;
  callAdmin: (action: string, extra?: Record<string, any>) => Promise<any>;
  loadData: () => void;
  onDismiss: (eventId: string, eventName: string) => Promise<void>;
  onArchive: (eventId: string, eventName: string) => Promise<void>;
  onDelete: (eventId: string, eventName: string) => Promise<void>;
  eventHasPredictions: boolean;
  eventIsFullySettled: boolean;
}) {
  const hasActiveFights = fights.some(f => ["open", "locked", "live", "result_selected", "confirmed"].includes(f.status));
  const [expanded, setExpanded] = useState(hasActiveFights);
  const totalPool = fights.reduce((sum, f) => sum + f.pool_a_lamports + f.pool_b_lamports, 0) / LAMPORTS;
  const totalPredictions = fights.reduce((sum, f) => sum + (entryCounts[f.id] || 0), 0);
  const liveCount = fights.filter(f => f.status === "live").length;
  const openCount = fights.filter(f => f.status === "open").length;
  const settledCount = fights.filter(f => ["settled", "refunds_complete"].includes(f.status)).length;

  return (
    <Card className={`bg-card border-border/50 overflow-hidden ${event.is_test ? 'border-yellow-500/30' : ''}`}>
      {/* Collapsible Header */}
      <button
        className="w-full px-4 py-4 flex items-start sm:items-center justify-between gap-3 text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {event.is_test && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">TEST</span>}
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              event.status === 'draft' ? 'bg-muted text-muted-foreground' :
              event.status === 'approved' ? 'bg-green-500/20 text-green-400' :
              event.status === 'archived' ? 'bg-blue-500/20 text-blue-400' :
              event.status === 'dismissed' ? 'bg-orange-500/20 text-orange-400' :
              'bg-red-500/20 text-red-400'
            }`}>{event.status.toUpperCase()}</span>
            {event.source_provider && event.source_provider !== 'manual' && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/30 text-accent-foreground uppercase">
                {event.source_provider}
              </span>
            )}
            {event.organization && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted/60 text-muted-foreground">
                {event.organization}
              </span>
            )}
            {event.automation_paused && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⏸ PAUSED</span>
            )}
            {liveCount > 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-red-400 bg-red-500/15 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                {liveCount} LIVE
              </span>
            )}
            {openCount > 0 && liveCount === 0 && (
              <span className="flex items-center gap-1 text-[10px] font-bold text-green-400 bg-green-500/15 px-2 py-0.5 rounded-full">
                {openCount} OPEN
              </span>
            )}
          </div>
          <h3 className="font-bold text-foreground text-sm mt-1">{event.event_name}</h3>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            {event.event_date && <span>📅 {event.event_date.split('T')[0]}</span>}
            {event.location && <span>📍 {event.location}</span>}
          </div>
          {event.source_event_id && (
            <p className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{event.source_event_id}</p>
          )}
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
            <span className="font-bold text-foreground">{fights.length} fights</span>
            <span>{totalPredictions} predictions</span>
            <span className="text-primary font-bold">{totalPool.toFixed(4)} SOL</span>
            {settledCount > 0 && <span className="text-green-400">{settledCount} settled</span>}
          </div>
        </div>
        <div className="shrink-0 mt-1">
          {expanded ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* ── Automation Status Panel (approved events with fights) ── */}
          {event.status === "approved" && fights.length > 0 && (
            <AutomationStatusPanel event={event} fights={fights} busy={busy} callAdmin={callAdmin} loadData={loadData} />
          )}

          {/* Event actions */}
          <div className="flex gap-2 flex-wrap">
            {event.status === "draft" && (
              <>
                <Button size="sm" onClick={async () => { try { await callAdmin("approveEvent", { event_id: event.id }); toast.success("Approved"); loadData(); } catch(e:any){toast.error(e.message);} }} disabled={busy}
                  className="bg-green-500/20 text-green-400 hover:bg-green-500/30">
                  <Eye className="w-3 h-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => onConfirm(
                  "Dismiss Event",
                  `Dismiss "${event.event_name}"? It will be hidden from active view.`,
                  () => onDismiss(event.id, event.event_name),
                  false
                )} disabled={busy}
                  className="border-orange-500/50 text-orange-400 hover:bg-orange-500/10">
                  <EyeOff className="w-3 h-3 mr-1" /> Dismiss
                </Button>
              </>
            )}

            {/* Pause / Resume Automation */}
            {["approved"].includes(event.status) && !event.automation_paused && (
              <Button size="sm" variant="outline" onClick={async () => {
                try { await callAdmin("pauseAutomation", { event_id: event.id }); toast.success("Automation paused"); loadData(); } catch(e:any){toast.error(e.message);}
              }} disabled={busy}
                className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10">
                ⏸ Pause Auto
              </Button>
            )}
            {["approved"].includes(event.status) && event.automation_paused && (
              <Button size="sm" variant="outline" onClick={async () => {
                try { await callAdmin("resumeAutomation", { event_id: event.id }); toast.success("Automation resumed"); loadData(); } catch(e:any){toast.error(e.message);}
              }} disabled={busy}
                className="border-green-500/50 text-green-400 hover:bg-green-500/10">
                ▶ Resume Auto
              </Button>
            )}
            {["approved", "rejected"].includes(event.status) && eventIsFullySettled && (
              <Button size="sm" variant="outline" onClick={() => onConfirm(
                "Archive Event",
                `Archive "${event.event_name}"?`,
                () => onArchive(event.id, event.event_name),
                false
              )} disabled={busy}
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                <Archive className="w-3 h-3 mr-1" /> Archive
              </Button>
            )}

            {event.status === "approved" && fights.every(f => ["settled", "refunds_complete", "cancelled"].includes(f.status) || fights.length === 0) && (
              <Button size="sm" variant="outline" onClick={() => onConfirm(
                "Archive Event",
                `Archive "${event.event_name}"?`,
                () => onArchive(event.id, event.event_name),
                false
              )} disabled={busy}
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                <Archive className="w-3 h-3 mr-1" /> Archive
              </Button>
            )}

            {!eventHasPredictions && !["archived"].includes(event.status) && (
              <Button size="sm" variant="outline" onClick={() => onConfirm(
                "Delete Event",
                `Permanently delete "${event.event_name}" and its fights?`,
                () => onDelete(event.id, event.event_name)
              )} disabled={busy}
                className="border-destructive/50 text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            )}

            {["archived", "dismissed"].includes(event.status) && !eventHasPredictions && (
              <Button size="sm" variant="outline" onClick={() => onConfirm(
                "Delete Event",
                `Permanently delete "${event.event_name}"?`,
                () => onDelete(event.id, event.event_name)
              )} disabled={busy}
                className="border-destructive/50 text-destructive hover:bg-destructive/10">
                <Trash2 className="w-3 h-3 mr-1" /> Delete
              </Button>
            )}

            {["dismissed"].includes(event.status) && eventHasPredictions && (
              <Button size="sm" variant="outline" onClick={() => onConfirm(
                "Archive Event",
                `Cannot delete — has predictions. Archive instead?`,
                () => onArchive(event.id, event.event_name),
                false
              )} disabled={busy}
                className="border-blue-500/50 text-blue-400 hover:bg-blue-500/10">
                <Archive className="w-3 h-3 mr-1" /> Archive Instead
              </Button>
            )}

            {event.is_test && !["archived", "dismissed"].includes(event.status) && (
              <Button size="sm" variant="outline" disabled={busy}
                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                onClick={() => onConfirm(
                  "Delete Test Event",
                  `Delete "${event.event_name}" and all its fights?`,
                  async () => { try { await callAdmin("deleteTestEvent", { event_id: event.id }); toast.success("Deleted"); loadData(); } catch(e:any){toast.error(e.message);} }
                )}>
                <Trash2 className="w-3 h-3 mr-1" /> Delete Test
              </Button>
            )}
          </div>

          {/* Fight cards */}
          {fights.length > 0 && (
            <div className="space-y-3 border-t border-border/30 pt-3">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Fights ({fights.length})
              </p>
              {fights.map(fight => (
                <AdminFightCard
                  key={fight.id}
                  fight={fight}
                  busy={busy}
                  entryCount={entryCounts[fight.id] || 0}
                  botConfirm={botConfirmData[fight.id] || null}
                  onAction={(action, extra) => onFightAction(action, fight.id, extra)}
                  onConfirm={onConfirm}
                  onRefund={() => onRefund(fight.id)}
                />
              ))}
            </div>
          )}
          {fights.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3">No fights under this event.</p>
          )}
        </div>
      )}
    </Card>
  );
}

// ── Per-Fight Admin Card ──
function AdminFightCard({
  fight, busy, entryCount, botConfirm, onAction, onConfirm, onRefund,
}: {
  fight: Fight;
  busy: boolean;
  entryCount: number;
  botConfirm: { confidence: number; provider: string; confirmed_at: string; claims_open_at: string } | null;
  onAction: (action: string, extra?: Record<string, any>) => Promise<void>;
  onConfirm: (title: string, desc: string, onConfirm: () => void, destructive?: boolean) => void;
  onRefund: () => Promise<void>;
}) {
  const [methodOpen, setMethodOpen] = useState(false);
  const [autoSettled, setAutoSettled] = useState(false);
  const autoSettleRef = useRef(false);
  const s = fight.status;
  const { text: countdownText, expired: timerExpired } = useCountdown(s === "confirmed" ? fight.claims_open_at : null);
  const claimsOpen = fight.claims_open_at && new Date() >= new Date(fight.claims_open_at);
  const isBotConfirmed = !!botConfirm;

  // Auto-settle when timer expires
  useEffect(() => {
    if (s === "confirmed" && timerExpired && !autoSettleRef.current && !busy) {
      autoSettleRef.current = true;
      console.log("[AutoSettle] Timer expired for fight", fight.id, "— auto-settling");
      onAction("settleEvent").then(() => {
        setAutoSettled(true);
      }).catch((err) => {
        console.error("[AutoSettle] Failed:", err);
        autoSettleRef.current = false;
      });
    }
  }, [s, timerExpired, busy, fight.id, onAction]);
  const totalPoolSol = ((fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS).toFixed(4);

  return (
    <div className={`bg-background/80 border border-border/30 rounded-lg p-4 ${fight.review_required ? 'ring-2 ring-yellow-500/40' : isBotConfirmed ? 'ring-1 ring-blue-500/30' : ''}`}>
      {/* Review required banner */}
      {fight.review_required && (
        <div className="flex items-center gap-2 mb-2 text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs font-bold">NEEDS REVIEW</span>
          {fight.review_reason && <span className="text-xs text-muted-foreground">— {fight.review_reason}</span>}
        </div>
      )}

      {/* Bot confirmed banner */}
      {isBotConfirmed && !fight.review_required && (
        <div className="flex items-center gap-2 mb-2 text-blue-400">
          <CheckCircle className="w-4 h-4" />
          <span className="text-xs font-bold">BOT CONFIRMED</span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            {(botConfirm.confidence * 100).toFixed(0)}% • {botConfirm.provider}
          </span>
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <div>
          <h4 className="font-bold text-foreground text-sm">{fight.title}</h4>
          <p className="text-xs text-muted-foreground">{fight.fighter_a_name} vs {fight.fighter_b_name}</p>
        </div>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${STATUS_COLORS[s] || 'bg-muted text-muted-foreground'}`}>
          {s.toUpperCase().replace('_', ' ')}
        </span>
      </div>

      {/* Bot confirmation detail row */}
      {isBotConfirmed && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px] mb-3 bg-blue-500/5 border border-blue-500/10 rounded p-2">
          <div className="text-muted-foreground">Confidence</div>
          <div className={`font-medium ${botConfirm.confidence >= 0.85 ? 'text-green-400' : 'text-yellow-400'}`}>
            {(botConfirm.confidence * 100).toFixed(0)}%
          </div>
          <div className="text-muted-foreground">Provider</div>
          <div className="text-foreground font-medium uppercase">{botConfirm.provider}</div>
          <div className="text-muted-foreground">Confirmed At</div>
          <div className="text-foreground font-medium">
            {fight.confirmed_at ? new Date(fight.confirmed_at).toLocaleString() : "—"}
          </div>
          <div className="text-muted-foreground">Claims Open At</div>
          <div className="text-foreground font-medium">
            {fight.claims_open_at ? new Date(fight.claims_open_at).toLocaleString() : "—"}
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-2 mb-3 bg-muted/30 rounded-lg p-2">
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Pool</p>
          <p className="text-xs font-bold text-foreground">{totalPoolSol} SOL</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Predictions</p>
          <p className="text-xs font-bold text-foreground">{entryCount}</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] text-muted-foreground">Claims</p>
          <p className={`text-xs font-bold ${
            ["confirmed", "settled"].includes(s) && claimsOpen
              ? "text-green-400" : ["confirmed"].includes(s) && !claimsOpen
              ? "text-yellow-400" : "text-muted-foreground"
          }`}>
            {["confirmed", "settled"].includes(s) && claimsOpen ? "OPEN" :
             s === "confirmed" && !claimsOpen ? "BLOCKED" :
             s === "settled" ? "OPEN" : "—"}
          </p>
        </div>
      </div>

      {/* Countdown timer for confirmed fights */}
      {s === "confirmed" && countdownText && (
        <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 text-center">
          <p className="text-sm text-yellow-400 font-bold">⏱ Claims open in {countdownText}</p>
          <p className="text-[10px] text-muted-foreground mt-1">Auto-settle will trigger when timer reaches 0</p>
        </div>
      )}
      {s === "confirmed" && !countdownText && claimsOpen && (
        <div className="mb-3 bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-center">
          <p className="text-sm text-green-400 font-bold">✅ Claims are now open{autoSettled ? " — auto-settled!" : ""}</p>
        </div>
      )}

      {/* Sequential Action Buttons */}
      <div className="space-y-2">
        {/* 1. Lock Predictions */}
        {s === "open" && (
          <Button size="lg" className="w-full justify-start bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30"
            disabled={busy}
            onClick={() => onConfirm("Lock Predictions", "Users will no longer be able to submit predictions.", () => onAction("lockPredictions"))}>
            <Lock className="w-4 h-4 mr-3" /> Lock Predictions
          </Button>
        )}

        {/* 2. Mark Live */}
        {s === "locked" && (
          <Button size="lg" className="w-full justify-start bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30"
            disabled={busy}
            onClick={() => onAction("markLive")}>
            <Play className="w-4 h-4 mr-3" /> Mark Live
          </Button>
        )}

        {/* 3. Winner / Draw */}
        {s === "live" && (
          <div className="space-y-2">
            <Button size="lg" className="w-full justify-start bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
              disabled={busy}
              onClick={() => onAction("selectResult", { winner: "fighter_a" })}>
              <Trophy className="w-4 h-4 mr-3" /> {fight.fighter_a_name} Won
            </Button>
            <Button size="lg" className="w-full justify-start bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
              disabled={busy}
              onClick={() => onAction("selectResult", { winner: "fighter_b" })}>
              <Trophy className="w-4 h-4 mr-3" /> {fight.fighter_b_name} Won
            </Button>
            <Button size="lg" className="w-full justify-start bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
              disabled={busy}
              onClick={() => onConfirm("Declare Draw / No Contest", "This will mark the fight as a draw. Prediction pools will need to be refunded separately.", () => onAction("declareDraw"))}>
              <Ban className="w-4 h-4 mr-3" /> Draw / No Contest
            </Button>
          </div>
        )}

        {/* 4. Method + Confirm (result_selected) */}
        {s === "result_selected" && (
          <div className="space-y-2">
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Winner: </span>
              <span className="font-bold text-primary">
                {fight.winner === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name}
              </span>
              {fight.method && <span className="text-muted-foreground ml-2">({fight.method})</span>}
            </div>

            {/* Method selector */}
            {!methodOpen ? (
              <Button size="lg" variant="outline" className="w-full justify-start border-border text-foreground"
                disabled={busy}
                onClick={() => setMethodOpen(true)}>
                <ArrowDown className="w-4 h-4 mr-3" /> {fight.method ? `Method: ${fight.method}` : "Add Method"}
              </Button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {METHODS.map(m => (
                  <Button key={m} size="sm" variant="outline"
                    className={`text-xs ${fight.method === m ? 'bg-primary/20 border-primary text-primary' : 'border-border text-foreground'}`}
                    disabled={busy}
                    onClick={async () => { await onAction("setMethod", { method: m }); setMethodOpen(false); }}>
                    {m}
                  </Button>
                ))}
              </div>
            )}

            {/* Can also change winner or declare draw */}
            <Button size="lg" className="w-full justify-start bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
              disabled={busy}
              onClick={() => onConfirm("Declare Draw / No Contest", "This will override the selected winner and mark as draw.", () => onAction("declareDraw"))}>
              <Ban className="w-4 h-4 mr-3" /> Change to Draw
            </Button>

            <Button size="lg" className="w-full justify-start bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/30"
              disabled={busy}
              onClick={() => onConfirm("Confirm Result", "This will finalize the selected fight outcome. A 5-minute safety timer will begin before rewards can be claimed.", () => onAction("confirmResult"))}>
              <CheckCircle className="w-4 h-4 mr-3" /> Confirm Result
            </Button>
          </div>
        )}

        {/* 5. Settle (confirmed) */}
        {s === "confirmed" && (
          <div className="space-y-2">
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-sm">
              <span className="text-muted-foreground">Result confirmed. </span>
              <span className="text-blue-400 font-bold">
                {fight.winner === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name} wins
                {fight.method && ` via ${fight.method}`}
              </span>
            </div>
            <Button size="lg" className="w-full justify-start bg-primary/10 text-primary hover:bg-primary/20 border border-primary/30"
              disabled={busy}
              onClick={() => onConfirm("Settle Event", "This will enable reward settlement and cannot be undone. The event will be financially closed.", () => onAction("settleEvent"))}>
              <CheckCircle className="w-4 h-4 mr-3" /> Settle Event
            </Button>
          </div>
        )}

        {/* 6. Draw refund flow */}
        {s === "draw" && (
          <Button size="lg" className="w-full justify-start bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30"
            disabled={busy}
            onClick={() => onConfirm("Start Refunds", "This will begin processing refunds for all predictions. Platform fees are not refunded.", () => onAction("startRefunds"))}>
            <RefreshCw className="w-4 h-4 mr-3" /> Start Refunds
          </Button>
        )}

        {s === "refund_pending" && (
          <Button size="lg" className="w-full justify-start bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 border border-yellow-500/30"
            disabled={busy}
            onClick={() => onConfirm("Process Refunds Now", "This will send SOL back to each predictor. Make sure the payout wallet is funded.", async () => { await onRefund(); })}>
            <RefreshCw className="w-4 h-4 mr-3" /> Process Refunds
          </Button>
        )}

        {s === "refunds_processing" && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3 text-center">
            <Loader2 className="w-4 h-4 animate-spin text-yellow-400 mx-auto mb-1" />
            <p className="text-xs text-yellow-400 font-bold">Refunds processing...</p>
            {fight.refund_status === "failed" && (
              <p className="text-xs text-destructive mt-1">Some refunds failed. Check logs.</p>
            )}
          </div>
        )}

        {/* Terminal states */}
        {s === "settled" && (() => {
          const wasAutoSettled = autoSettled || (
            fight.settled_at && fight.claims_open_at &&
            Math.abs(new Date(fight.settled_at).getTime() - new Date(fight.claims_open_at).getTime()) < 90_000
          );
          const settledTime = fight.settled_at ? new Date(fight.settled_at).toLocaleTimeString() : null;
          return (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center space-y-1">
              <p className="text-xs font-bold text-primary">✅ Event settled — financially closed</p>
              {wasAutoSettled && (
                <p className="text-[10px] text-yellow-400 font-semibold">
                  ⚡ AUTO-SETTLED{settledTime ? ` at ${settledTime}` : ""}
                </p>
              )}
            </div>
          );
        })()}
        {s === "refunds_complete" && (
          <div className="bg-muted/30 border border-border/30 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-muted-foreground">✅ All refunds complete</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Automation Status Panel ──
function AutomationStatusPanel({
  event, fights, busy, callAdmin, loadData,
}: {
  event: PredictionEvent;
  fights: Fight[];
  busy: boolean;
  callAdmin: (action: string, extra?: Record<string, any>) => Promise<any>;
  loadData: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [forcingLive, setForcingLive] = useState(false);

  const statusCounts = {
    open: fights.filter(f => f.status === "open").length,
    locked: fights.filter(f => f.status === "locked").length,
    live: fights.filter(f => f.status === "live").length,
    result_selected: fights.filter(f => f.status === "result_selected").length,
    confirmed: fights.filter(f => f.status === "confirmed").length,
    settled: fights.filter(f => ["settled", "refunds_complete"].includes(f.status)).length,
    draw: fights.filter(f => f.status === "draw").length,
    cancelled: fights.filter(f => f.status === "cancelled").length,
  };

  const now = new Date();
  const lockAt = event.scheduled_lock_at ? new Date(event.scheduled_lock_at) : null;
  const liveAt = event.scheduled_live_at ? new Date(event.scheduled_live_at) : null;
  const eventAt = event.event_date ? new Date(event.event_date) : null;
  const lockPassed = lockAt ? lockAt <= now : false;
  const livePassed = liveAt ? liveAt <= now : false;

  const allSettled = fights.length > 0 && fights.every(f => ["settled", "refunds_complete", "cancelled", "draw"].includes(f.status));
  const hasResults = fights.some(f => ["result_selected", "confirmed", "settled"].includes(f.status));

  const runAutomationCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      // Invoke schedule worker and result worker in parallel
      const [schedRes, resultRes] = await Promise.all([
        supabase.functions.invoke("prediction-schedule-worker", { body: {} }),
        supabase.functions.invoke("prediction-result-worker", { body: {} }),
      ]);
      setCheckResult({
        schedule: schedRes.data,
        results: resultRes.data,
        scheduleError: schedRes.error?.message,
        resultsError: resultRes.error?.message,
      });
      toast.success("Automation check complete");
      setTimeout(loadData, 500);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="bg-muted/20 border border-border/40 rounded-lg p-3 space-y-3">
      <p className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-2">
        <RefreshCw className="w-3.5 h-3.5 text-primary" /> Automation Status
      </p>

      {/* Event metadata row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
        <div className="text-muted-foreground">Event Start</div>
        <div className="text-foreground font-medium">
          {eventAt ? eventAt.toLocaleString() : "—"}
        </div>

        <div className="text-muted-foreground">Lock Time</div>
        <div className={`font-medium ${lockPassed ? "text-yellow-400" : "text-foreground"}`}>
          {lockAt ? lockAt.toLocaleString() : "—"}
          {lockPassed && " ✓"}
        </div>

        <div className="text-muted-foreground">Live Time</div>
        <div className={`font-medium ${livePassed ? "text-red-400" : "text-foreground"}`}>
          {liveAt ? liveAt.toLocaleString() : "—"}
          {livePassed && " ✓"}
        </div>

        <div className="text-muted-foreground">Provider</div>
        <div className="text-foreground font-medium uppercase">
          {event.source_provider || "manual"}
        </div>

        <div className="text-muted-foreground">Automation</div>
        <div className={`font-medium ${
          event.automation_paused ? "text-yellow-400" : "text-green-400"
        }`}>
          {event.automation_paused ? "⏸ Paused" : event.automation_status === "manual" ? "Manual" : "Active"}
        </div>

        <div className="text-muted-foreground">Last Check</div>
        <div className="text-foreground font-medium">
          {event.last_automation_check_at
            ? new Date(event.last_automation_check_at).toLocaleString()
            : "—"}
        </div>
      </div>

      {/* Fight status summary */}
      <div className="flex flex-wrap gap-1.5">
        {([
          { key: "open", label: "Open", count: statusCounts.open, color: "bg-green-500/20 text-green-400" },
          { key: "locked", label: "Locked", count: statusCounts.locked, color: "bg-yellow-500/20 text-yellow-400" },
          { key: "live", label: "Live", count: statusCounts.live, color: "bg-red-500/20 text-red-400" },
          { key: "result_selected", label: "Result", count: statusCounts.result_selected, color: "bg-orange-500/20 text-orange-400" },
          { key: "confirmed", label: "Confirmed", count: statusCounts.confirmed, color: "bg-blue-500/20 text-blue-400" },
          { key: "settled", label: "Settled", count: statusCounts.settled, color: "bg-primary/20 text-primary" },
        ] as const).map(s => (
          <span key={s.key} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
            s.count > 0 ? s.color : "bg-muted/30 text-muted-foreground/40"
          }`}>
            {s.count} {s.label}
          </span>
        ))}
      </div>

      {/* Next automation step */}
      {(() => {
        const nextLock = lockAt && !lockPassed && statusCounts.open > 0;
        const nextLive = liveAt && !livePassed && (statusCounts.locked > 0 || (lockPassed && statusCounts.open === 0));
        const nextTime = nextLock ? lockAt : nextLive ? liveAt : null;
        const nextLabel = nextLock ? "Auto-Lock" : nextLive ? "Go Live" : null;
        if (nextTime && nextLabel) {
          const diffMs = nextTime.getTime() - now.getTime();
          const diffMin = Math.floor(diffMs / 60_000);
          const diffHrs = Math.floor(diffMin / 60);
          const remaining = diffHrs > 0
            ? `${diffHrs}h ${diffMin % 60}m`
            : diffMin > 0
              ? `${diffMin}m`
              : "< 1m";
          return (
            <div className="bg-primary/5 border border-primary/20 rounded px-2.5 py-1.5 text-[10px] flex items-center justify-between">
              <span className="text-muted-foreground">Next step:</span>
              <span className="text-primary font-bold">{nextLabel} in {remaining}</span>
            </div>
          );
        }
        return null;
      })()}

      {/* Readiness indicators */}
      <div className="text-[10px] space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${lockPassed || statusCounts.open === 0 ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">Auto-Lock</span>
          <span className="text-foreground font-medium ml-auto">
            {statusCounts.open === 0 ? "All locked ✓" : lockPassed ? "Lock triggered ✓" : lockAt ? `At ${lockAt.toLocaleString()}` : "No schedule"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${livePassed || statusCounts.live > 0 ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">Go Live</span>
          <span className="text-foreground font-medium ml-auto">
            {statusCounts.live > 0 || livePassed ? "Live ✓" : liveAt ? `At ${liveAt.toLocaleString()}` : "No schedule"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${hasResults ? "bg-green-400" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">Auto-Result</span>
          <span className="text-foreground font-medium ml-auto">
            {statusCounts.result_selected + statusCounts.confirmed + statusCounts.settled > 0
              ? `${statusCounts.result_selected + statusCounts.confirmed + statusCounts.settled}/${fights.length} resolved`
              : "Awaiting results"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${allSettled ? "bg-green-400" : statusCounts.settled > 0 ? "bg-yellow-400" : "bg-muted-foreground/30"}`} />
          <span className="text-muted-foreground">Settlement</span>
          <span className="text-foreground font-medium ml-auto">
            {allSettled ? "Complete ✓" : statusCounts.settled > 0 ? `${statusCounts.settled}/${fights.length} settled` : "Not started"}
          </span>
        </div>
      </div>

      {/* ⚠️ Warning: past scheduled_live_at but not live */}
      {livePassed && statusCounts.live === 0 && (statusCounts.open > 0 || statusCounts.locked > 0) && (
        <div className="bg-destructive/10 border border-destructive/30 rounded px-2.5 py-2 text-[10px] space-y-1.5">
          <div className="flex items-center gap-1.5 text-destructive font-bold">
            <AlertTriangle className="w-3.5 h-3.5" /> Event should be LIVE but fights are stuck
          </div>
          <p className="text-muted-foreground">
            Scheduled live time has passed but {statusCounts.open + statusCounts.locked} fight(s) are not live yet.
            The next automation run will attempt auto-recovery. You can also force it now.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="w-full border-destructive/40 text-destructive hover:bg-destructive/10"
            disabled={busy || forcingLive}
            onClick={async () => {
              setForcingLive(true);
              try {
                const res = await callAdmin("forceLiveEvent", { event_id: event.id });
                toast.success(`Forced ${res?.forced_live ?? 0} fight(s) live`);
                loadData();
              } catch (e: any) {
                toast.error(e.message);
              } finally {
                setForcingLive(false);
              }
            }}
          >
            {forcingLive ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <Play className="w-3.5 h-3.5 mr-2" />}
            Force Live Now
          </Button>
        </div>
      )}

      {/* Run Automation Check button */}
      <Button
        size="sm"
        variant="outline"
        className="w-full border-primary/40 text-primary hover:bg-primary/10"
        disabled={busy || checking}
        onClick={runAutomationCheck}
      >
        {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> : <RefreshCw className="w-3.5 h-3.5 mr-2" />}
        Run Automation Check Now
      </Button>

      {/* Check results */}
      {checkResult && (
        <div className="bg-background/60 border border-border/30 rounded p-2 text-[10px] space-y-1">
          <p className="text-foreground font-medium">📊 Check Results</p>
          {checkResult.scheduleError && <p className="text-destructive">Schedule: {checkResult.scheduleError}</p>}
          {checkResult.resultsError && <p className="text-destructive">Results: {checkResult.resultsError}</p>}
          {checkResult.schedule && (
            <p className="text-muted-foreground">Schedule: {checkResult.schedule.processed ?? 0} actions processed</p>
          )}
          {checkResult.results && (
            <p className="text-muted-foreground">Results: {checkResult.results.checked ?? checkResult.results.processed ?? 0} checked</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Ingest Panel ──
const BDL_LEAGUES = ["UFC", "Bellator", "PFL", "ONE"];
const TSDB_LEAGUES_LIST = ["Boxing", "Top Rank"];
const APIFB_LEAGUES_LIST = ["Premier League", "La Liga", "Champions League", "MLS"];
const PROVIDERS = [
  { key: "all", label: "All Providers" },
  { key: "balldontlie", label: "BALLDONTLIE (MMA)" },
  { key: "thesportsdb", label: "TheSportsDB (Boxing)" },
  { key: "api-football", label: "API-Football (Soccer)" },
];

function IngestPanel({ wallet, busy: parentBusy, onComplete }: { wallet: string; busy: boolean; onComplete: () => void }) {
  const [ingestBusy, setIngestBusy] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [selectedLeagues, setSelectedLeagues] = useState<string[]>([]);
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [lastResult, setLastResult] = useState<any>(null);

  const toggleLeague = (l: string) => {
    setSelectedLeagues(prev =>
      prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]
    );
  };

  const visibleLeagues = selectedProvider === "balldontlie" ? BDL_LEAGUES
    : selectedProvider === "thesportsdb" ? TSDB_LEAGUES_LIST
    : selectedProvider === "api-football" ? APIFB_LEAGUES_LIST
    : [...BDL_LEAGUES, ...TSDB_LEAGUES_LIST, ...APIFB_LEAGUES_LIST];

  const runIngest = async () => {
    setIngestBusy(true);
    setLastResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-ingest", {
        body: {
          wallet,
          leagues: selectedLeagues.length > 0 ? selectedLeagues : undefined,
          provider: selectedProvider !== "all" ? selectedProvider : undefined,
          dry_run: dryRun,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      if (!dryRun) {
        toast.success(`Ingested ${data.events_new} new, ${data.events_updated || 0} updated, ${data.fights_created} fights`);
        onComplete();
      } else {
        toast.info(`Dry run: ${data.events_new} new, ${data.events_updated || 0} would update`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIngestBusy(false);
    }
  };

  const importSingleEvent = async (sourceEventId: string, provider: string, eventName: string) => {
    setImportingId(sourceEventId);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-ingest", {
        body: {
          wallet,
          single_source_event_id: sourceEventId,
          provider: provider || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(`Imported "${eventName}" as draft — ${data.fights_created || 0} fights`);
      onComplete();
      // Update dry-run results to mark this event as imported
      setLastResult((prev: any) => {
        if (!prev?.details) return prev;
        return {
          ...prev,
          details: prev.details.map((d: any) =>
            d.source_event_id === sourceEventId ? { ...d, imported: true } : d
          ),
        };
      });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setImportingId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Provider selector */}
      <div className="flex flex-wrap gap-1.5">
        {PROVIDERS.map(p => (
          <button
            key={p.key}
            onClick={() => { setSelectedProvider(p.key); setSelectedLeagues([]); }}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selectedProvider === p.key
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-muted/30 text-muted-foreground border-border/30 hover:border-border"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* League chips */}
      <div className="flex flex-wrap gap-1.5">
        {visibleLeagues.map(l => (
          <button
            key={l}
            onClick={() => toggleLeague(l)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              selectedLeagues.includes(l)
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-muted/30 text-muted-foreground border-border/30 hover:border-border"
            }`}
          >
            {l}
            <span className="ml-1 text-[10px] text-muted-foreground/60">
            {BDL_LEAGUES.includes(l) ? "MMA" : TSDB_LEAGUES_LIST.includes(l) ? "BOX" : "⚽"}
            </span>
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {selectedLeagues.length === 0 ? "All leagues" : selectedLeagues.join(", ")}
      </p>

      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} />
          Dry run (preview only)
        </label>
      </div>

      <Button
        className="w-full bg-primary text-primary-foreground"
        onClick={runIngest}
        disabled={ingestBusy || parentBusy}
      >
        {ingestBusy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
        {dryRun ? "Preview Ingest" : "Run Ingest"}
      </Button>

      {lastResult && (
        <div className="bg-muted/30 border border-border/30 rounded-lg p-3 text-xs space-y-1">
          <p className="text-foreground font-medium">
            {dryRun ? "🔍 Dry Run" : "✅ Ingested"}
            {lastResult.providers_used?.length > 0 && (
              <span className="text-muted-foreground ml-1">({lastResult.providers_used.join(", ")})</span>
            )}
          </p>
          <p className="text-muted-foreground">
            Found: {lastResult.events_found} · New: {lastResult.events_new} · Updated: {lastResult.events_updated || 0}
            {(lastResult.events_filtered_past ?? 0) > 0 && (
              <span className="text-yellow-400 ml-1">· ⏳ {lastResult.events_filtered_past} past filtered</span>
            )}
          </p>
          {lastResult.fights_found > 0 && (
            <p className="text-muted-foreground">Fights found: {lastResult.fights_found} · Created: {lastResult.fights_created}</p>
          )}
          {lastResult.fights_created > 0 && lastResult.fights_found === 0 && (
            <p className="text-muted-foreground">Fights created: {lastResult.fights_created}</p>
          )}
          {lastResult.fights_endpoint_available === false && lastResult.events_found > 0 && (
            <p className="text-yellow-400 text-[10px]">⚠ Fights endpoint requires paid tier — only events imported</p>
          )}
          {lastResult.errors?.length > 0 && (
            <div className="mt-1">
              <p className="text-destructive font-medium">Errors:</p>
              {lastResult.errors.map((e: string, i: number) => (
                <p key={i} className="text-destructive/80">{e}</p>
              ))}
            </div>
          )}
          {lastResult.details?.length > 0 && (
            <details className="mt-2" open>
              <summary className="text-muted-foreground cursor-pointer hover:text-foreground font-medium">
                📋 {lastResult.details.length} event(s) details
              </summary>
              <div className="mt-1 space-y-2 max-h-80 overflow-y-auto">
                {lastResult.details.map((d: any, i: number) => (
                  <div key={i} className="text-[10px] text-muted-foreground border-t border-border/20 pt-1.5">
                    <p className="text-foreground font-medium">
                      {d.imported ? "✅ " : d.action === "updated" ? "🔄 " : "🆕 "}{d.event_name}
                    </p>
                    <div className="ml-2 space-y-0.5">
                      <p>
                        <span className="text-primary">{d.league}</span>
                        {d.sport && <span className="text-muted-foreground ml-1">({d.sport})</span>}
                        {d.provider && <span className="text-muted-foreground ml-1">· {d.provider}</span>}
                      </p>
                      {d.event_date && <p>📅 {new Date(d.event_date).toLocaleString()}</p>}
                      {d.location && <p>📍 {d.location}</p>}
                      <p>ID: {d.source_event_id}</p>
                      <p>Fights: <span className="text-primary font-medium">{d.fight_count ?? 0}</span></p>
                      {d.fights_error && <p className="text-yellow-400">⚠ {d.fights_error}</p>}
                      {d.fights?.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer hover:text-foreground">🥊 {d.fights.length} fight(s)</summary>
                          <div className="ml-2 mt-0.5 space-y-0.5">
                            {d.fights.map((f: any, fi: number) => (
                              <p key={fi}>
                                {f.is_main_event ? "⭐ " : ""}{f.fighter1} vs {f.fighter2}
                                {f.weight_class && <span className="text-muted-foreground"> ({f.weight_class})</span>}
                                {f.card_segment && <span className="text-muted-foreground ml-1">[{f.card_segment}]</span>}
                              </p>
                            ))}
                          </div>
                        </details>
                      )}
                      {/* Import single event button (dry-run only) */}
                      {d.dry_run && !d.imported && (
                        <button
                          onClick={() => importSingleEvent(d.source_event_id, d.provider, d.event_name)}
                          disabled={!!importingId || ingestBusy}
                          className="mt-1.5 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors disabled:opacity-50"
                        >
                          {importingId === d.source_event_id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Download className="w-3 h-3" />
                          )}
                          Import This Event
                        </button>
                      )}
                      {d.imported && (
                        <p className="mt-1 text-[10px] font-bold text-green-400">✅ Imported as draft</p>
                      )}

                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
