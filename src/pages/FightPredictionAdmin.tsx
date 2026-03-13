import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  ArrowDown, Trash2, Eye, AlertTriangle, RefreshCw,
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

  const loadData = useCallback(async () => {
    const [eventsRes, fightsRes, entriesRes] = await Promise.all([
      supabase.from("prediction_events").select("*").order("created_at", { ascending: false }),
      supabase.from("prediction_fights").select("*").order("created_at", { ascending: false }),
      supabase.from("prediction_entries").select("fight_id"),
    ]);
    if (eventsRes.data) setEvents(eventsRes.data as any);
    if (fightsRes.data) setFights(fightsRes.data as any);
    if (entriesRes.data) {
      const counts: Record<string, number> = {};
      entriesRes.data.forEach((e: any) => { counts[e.fight_id] = (counts[e.fight_id] || 0) + 1; });
      setEntryCounts(counts);
    }
  }, []);

  useEffect(() => { if (isAdmin) loadData(); }, [isAdmin, loadData]);

  const callAdmin = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action, wallet: address, ...extra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
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
      return data;
    } finally {
      setBusy(false);
    }
  };

  const withConfirm = (title: string, description: string, onConfirm: () => void, destructive = true) => {
    setConfirmAction({ title, description, onConfirm, destructive });
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

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-foreground font-['Cinzel'] flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Prediction Admin
        </h1>

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

        {/* ── Events List ── */}
        <h2 className="text-lg font-bold text-foreground font-['Cinzel']">Events</h2>
        {events.map(event => (
          <Card key={event.id} className={`bg-card border-border/50 p-4 ${event.is_test ? 'border-yellow-500/30' : ''}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  {event.is_test && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">TEST</span>}
                  <h3 className="font-bold text-foreground text-sm">{event.event_name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {[event.organization, event.location, event.event_date?.split('T')[0]].filter(Boolean).join(' · ')}
                </p>
                <p className="text-xs text-muted-foreground">{eventFights(event.id).length} fights</p>
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                event.status === 'draft' ? 'bg-muted text-muted-foreground' :
                event.status === 'approved' ? 'bg-green-500/20 text-green-400' :
                'bg-red-500/20 text-red-400'
              }`}>{event.status.toUpperCase()}</span>
            </div>

            <div className="flex gap-2 mt-3 flex-wrap">
              {event.status === "draft" && (
                <>
                  <Button size="sm" onClick={async () => { try { await callAdmin("approveEvent", { event_id: event.id }); toast.success("Approved"); loadData(); } catch(e:any){toast.error(e.message);} }} disabled={busy}
                    className="bg-green-500/20 text-green-400 hover:bg-green-500/30">
                    <Eye className="w-3 h-3 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={async () => { try { await callAdmin("rejectEvent", { event_id: event.id }); toast.success("Rejected"); loadData(); } catch(e:any){toast.error(e.message);} }} disabled={busy}
                    className="border-red-500/50 text-red-400 hover:bg-red-500/10">
                    <Ban className="w-3 h-3 mr-1" /> Reject
                  </Button>
                </>
              )}
              {event.is_test && (
                <Button size="sm" variant="outline" disabled={busy}
                  className="border-destructive/50 text-destructive hover:bg-destructive/10"
                  onClick={() => withConfirm(
                    "Delete Test Event",
                    `Delete "${event.event_name}" and all its fights? This cannot be undone.`,
                    async () => { try { await callAdmin("deleteTestEvent", { event_id: event.id }); toast.success("Deleted"); loadData(); } catch(e:any){toast.error(e.message);} }
                  )}>
                  <Trash2 className="w-3 h-3 mr-1" /> Delete
                </Button>
              )}
            </div>

            {/* Fights under this event */}
            {eventFights(event.id).length > 0 && (
              <div className="mt-4 space-y-3">
                {eventFights(event.id).map(fight => (
                  <AdminFightCard
                    key={fight.id}
                    fight={fight}
                    busy={busy}
                    entryCount={entryCounts[fight.id] || 0}
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
            )}
          </Card>
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

// ── Per-Fight Admin Card ──
function AdminFightCard({
  fight, busy, entryCount, onAction, onConfirm, onRefund,
}: {
  fight: Fight;
  busy: boolean;
  entryCount: number;
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

  // Auto-settle when timer expires
  useEffect(() => {
    if (s === "confirmed" && timerExpired && !autoSettleRef.current && !busy) {
      autoSettleRef.current = true;
      console.log("[AutoSettle] Timer expired for fight", fight.id, "— auto-settling");
      onAction("settleEvent", { fight_id: fight.id }).then(() => {
        setAutoSettled(true);
      }).catch((err) => {
        console.error("[AutoSettle] Failed:", err);
        autoSettleRef.current = false; // allow retry
      });
    }
  }, [s, timerExpired, busy, fight.id, onAction]);
  const totalPoolSol = ((fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS).toFixed(4);

  return (
    <div className={`bg-background/80 border border-border/30 rounded-lg p-4 ${fight.review_required ? 'ring-2 ring-yellow-500/40' : ''}`}>
      {fight.review_required && (
        <div className="flex items-center gap-2 mb-2 text-yellow-400">
          <AlertTriangle className="w-4 h-4" />
          <span className="text-xs font-bold">REVIEW REQUIRED</span>
          {fight.review_reason && <span className="text-xs text-muted-foreground">— {fight.review_reason}</span>}
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
      {s === "confirmed" && countdown && (
        <div className="mb-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2 text-center">
          <p className="text-xs text-yellow-400 font-bold">⏱ Claims open in {countdown}</p>
        </div>
      )}
      {s === "confirmed" && !countdown && claimsOpen && (
        <div className="mb-3 bg-green-500/10 border border-green-500/30 rounded-lg p-2 text-center">
          <p className="text-xs text-green-400 font-bold">✅ Claims are now open</p>
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
        {s === "settled" && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-primary">✅ Event settled — financially closed</p>
          </div>
        )}
        {s === "refunds_complete" && (
          <div className="bg-muted/30 border border-border/30 rounded-lg p-3 text-center">
            <p className="text-xs font-bold text-muted-foreground">✅ All refunds complete</p>
          </div>
        )}
      </div>
    </div>
  );
}
