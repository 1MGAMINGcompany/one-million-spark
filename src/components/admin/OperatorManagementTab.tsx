import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { toast } from "sonner";
import {
  Globe, ExternalLink, Search, Copy, Download, Check,
  ChevronDown, ChevronUp, Lock, Trophy, Pause, Play,
  Wallet, Mail, Calendar, Plus, QrCode, AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import OperatorQRCode from "@/components/operator/OperatorQRCode";

const SPORT_OPTIONS = ["Soccer", "MMA", "Boxing", "NFL", "NBA", "NHL", "MLB", "NCAA", "Tennis", "Cricket", "F1", "Golf"];

interface OperatorRow {
  id: string;
  brand_name: string;
  subdomain: string;
  status: string;
  fee_percent: number;
  logo_url: string | null;
  payout_wallet: string | null;
  support_email: string | null;
  brand_color: string | null;
  user_id: string;
  created_at: string;
  agreement_accepted_at: string | null;
  operator_settings: any;
}

async function callOperatorManage(token: string, body: Record<string, unknown>) {
  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-privy-token": token },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Request failed");
  return data;
}

export default function OperatorManagementTab() {
  const { getAccessToken } = usePrivySafe();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load all operators
  const { data: operators, isLoading } = useQuery({
    queryKey: ["admin_all_operators"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operators")
        .select("*, operator_settings(*)")
        .order("created_at", { ascending: false });
      return (data || []) as OperatorRow[];
    },
  });

  const q = search.toLowerCase().trim();
  const filtered = q
    ? (operators || []).filter(
        (op) =>
          op.brand_name.toLowerCase().includes(q) ||
          op.subdomain.toLowerCase().includes(q) ||
          op.status.toLowerCase().includes(q) ||
          (op.support_email || "").toLowerCase().includes(q)
      )
    : operators || [];

  if (isLoading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">Loading operators...</div>;
  }

  return (
    <Card className="bg-card border-border/50 p-4 space-y-4">
      <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
        <Globe className="w-4 h-4 text-primary" />
        Operator Management ({operators?.length || 0})
      </h2>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search brand, subdomain, email..."
          className="pl-9 bg-card border-border"
        />
      </div>

      <div className="text-xs text-muted-foreground">
        {filtered.length} operator{filtered.length !== 1 ? "s" : ""}
      </div>

      <div className="space-y-2">
        {filtered.map((op) => (
          <OperatorCard
            key={op.id}
            op={op}
            expanded={expandedId === op.id}
            onToggle={() => setExpandedId(expandedId === op.id ? null : op.id)}
            getAccessToken={getAccessToken}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["admin_all_operators"] })}
          />
        ))}
      </div>
    </Card>
  );
}

// ═══════════════════════════════════════
// Operator card with expandable details
// ═══════════════════════════════════════

function OperatorCard({
  op,
  expanded,
  onToggle,
  getAccessToken,
  onRefresh,
}: {
  op: OperatorRow;
  expanded: boolean;
  onToggle: () => void;
  getAccessToken: () => Promise<string | null>;
  onRefresh: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div
        className="p-3 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 min-w-0">
          {op.logo_url && (
            <img
              src={op.logo_url}
              alt=""
              className="w-7 h-7 rounded-lg object-contain bg-muted p-0.5"
            />
          )}
          <div className="min-w-0">
            <div className="font-bold text-sm text-foreground truncate">{op.brand_name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              1mg.live/{op.subdomain}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!op.payout_wallet && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive flex items-center gap-0.5">
              <AlertTriangle className="w-3 h-3" /> No wallet
            </span>
          )}
          <span
            className={`text-xs px-2 py-1 rounded-full ${
              op.status === "active"
                ? "bg-green-500/10 text-green-400"
                : op.status === "paused"
                ? "bg-orange-500/10 text-orange-400"
                : op.status === "pending"
                ? "bg-yellow-500/10 text-yellow-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {op.status}
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <OperatorExpandedPanel op={op} getAccessToken={getAccessToken} onRefresh={onRefresh} />
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// Expanded panel with QR, events, actions
// ═══════════════════════════════════════

function OperatorExpandedPanel({
  op,
  getAccessToken,
  onRefresh,
}: {
  op: OperatorRow;
  getAccessToken: () => Promise<string | null>;
  onRefresh: () => void;
}) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [busy, setBusy] = useState(false);

  const url = `https://1mg.live/${op.subdomain}`;

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    toast.success("Link copied!");
    setTimeout(() => setLinkCopied(false), 2000);
  }, [url]);

  // Load operator events
  const { data: eventsData } = useQuery({
    queryKey: ["admin_operator_events", op.id],
    queryFn: async () => {
      const { data: events } = await (supabase as any)
        .from("operator_events")
        .select("*")
        .eq("operator_id", op.id)
        .order("created_at", { ascending: false });
      const { data: fights } = await (supabase as any)
        .from("prediction_fights")
        .select("id, operator_event_id, status, winner, pool_a_usd, pool_b_usd, shares_a, shares_b, settled_at, trading_allowed")
        .eq("operator_id", op.id);
      return { events: events || [], fights: fights || [] };
    },
  });

  const events = eventsData?.events || [];
  const fights = eventsData?.fights || [];
  const fightMap = Object.fromEntries(fights.map((f: any) => [f.operator_event_id, f]));

  // Revenue
  const { data: revenue } = useQuery({
    queryKey: ["admin_op_revenue", op.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operator_revenue")
        .select("operator_fee_usdc, platform_fee_usdc")
        .eq("operator_id", op.id);
      let opTotal = 0, platformTotal = 0;
      (data || []).forEach((r: any) => {
        opTotal += Number(r.operator_fee_usdc || 0);
        platformTotal += Number(r.platform_fee_usdc || 0);
      });
      return { opTotal, platformTotal };
    },
  });

  const queryClient = useQueryClient();

  const adminAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await callOperatorManage(token, { action, operator_id: op.id, ...extra });
      toast.success(`${action.replace(/_/g, " ")} completed`);
      queryClient.invalidateQueries({ queryKey: ["admin_operator_events", op.id] });
      onRefresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const settings = op.operator_settings?.[0] || op.operator_settings;
  const onboardingComplete = !!op.agreement_accepted_at && op.status !== "pending";

  return (
    <div className="px-3 pb-4 border-t border-border pt-3 space-y-4">
      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground">Fee</span>
          <div className="font-bold text-foreground">{op.fee_percent}%</div>
        </div>
        <div>
          <span className="text-muted-foreground">Events</span>
          <div className="font-bold text-foreground">{events.length}</div>
        </div>
        <div>
          <span className="text-muted-foreground">Op Revenue</span>
          <div className="font-bold text-green-400">${(revenue?.opTotal || 0).toFixed(2)}</div>
        </div>
        <div>
          <span className="text-muted-foreground">1MG Revenue</span>
          <div className="font-bold text-primary">${(revenue?.platformTotal || 0).toFixed(2)}</div>
        </div>
      </div>

      {/* Status details */}
      <div className="space-y-1 text-xs">
        <div className="flex items-center gap-2">
          <Wallet className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Payout:</span>
          {op.payout_wallet ? (
            <span className="font-mono text-foreground/70 text-[10px]">
              {op.payout_wallet.slice(0, 8)}…{op.payout_wallet.slice(-6)}
            </span>
          ) : (
            <span className="text-destructive font-medium">Not set</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Mail className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Support:</span>
          <span className="text-foreground/70">{op.support_email || "Not set"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Created:</span>
          <span className="text-foreground/70">{new Date(op.created_at).toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <Check className="w-3 h-3 text-muted-foreground" />
          <span className="text-muted-foreground">Onboarding:</span>
          <span className={onboardingComplete ? "text-green-400" : "text-yellow-400"}>
            {onboardingComplete ? "Complete" : "Incomplete"}
          </span>
        </div>
        {settings?.allowed_sports && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-muted-foreground">Sports:</span>
            {(settings.allowed_sports || []).map((s: string) => (
              <span key={s} className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full">
                {s}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-[10px]">User ID:</span>
          <span className="font-mono text-[10px] text-foreground/50">{op.user_id.slice(0, 24)}…</span>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1 h-7"
          onClick={() => window.open(url, "_blank")}
        >
          <ExternalLink className="w-3 h-3" /> Open App
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1 h-7"
          onClick={copyLink}
        >
          {linkCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {linkCopied ? "Copied" : "Copy URL"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs gap-1 h-7"
          onClick={() => setShowQR(!showQR)}
        >
          <QrCode className="w-3 h-3" /> {showQR ? "Hide QR" : "QR Code"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={`text-xs gap-1 h-7 ${
            op.status === "active"
              ? "border-orange-500/30 text-orange-400 hover:bg-orange-500/10"
              : "border-green-500/30 text-green-400 hover:bg-green-500/10"
          }`}
          disabled={busy}
          onClick={() =>
            adminAction("admin_toggle_operator_status", {
              new_status: op.status === "active" ? "paused" : "active",
            })
          }
        >
          {op.status === "active" ? (
            <>
              <Pause className="w-3 h-3" /> Pause
            </>
          ) : (
            <>
              <Play className="w-3 h-3" /> Activate
            </>
          )}
        </Button>
      </div>

      {/* QR Code */}
      {showQR && (
        <div className="flex justify-center py-2">
          <OperatorQRCode subdomain={op.subdomain} size={160} />
        </div>
      )}

      {/* Events section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold text-foreground">Events ({events.length})</h3>
          <Button
            size="sm"
            variant="outline"
            className="text-xs gap-1 h-6"
            onClick={() => setShowCreateEvent(!showCreateEvent)}
          >
            <Plus className="w-3 h-3" /> Create Event
          </Button>
        </div>

        {showCreateEvent && (
          <AdminCreateEventForm
            operatorId={op.id}
            getAccessToken={getAccessToken}
            onCreated={() => {
              setShowCreateEvent(false);
              queryClient.invalidateQueries({ queryKey: ["admin_operator_events", op.id] });
            }}
          />
        )}

        {events.length === 0 && (
          <div className="text-xs text-muted-foreground py-2">No custom events yet.</div>
        )}

        {events.map((ev: any) => {
          const fight = fightMap[ev.id];
          return (
            <AdminEventRow
              key={ev.id}
              event={ev}
              fight={fight}
              operatorId={op.id}
              getAccessToken={getAccessToken}
              onAction={() => queryClient.invalidateQueries({ queryKey: ["admin_operator_events", op.id] })}
            />
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Create event form for admin
// ═══════════════════════════════════════

function AdminCreateEventForm({
  operatorId,
  getAccessToken,
  onCreated,
}: {
  operatorId: string;
  getAccessToken: () => Promise<string | null>;
  onCreated: () => void;
}) {
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [sport, setSport] = useState("Soccer");
  const [date, setDate] = useState("");
  const [featured, setFeatured] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!teamA.trim() || !teamB.trim()) {
      toast.error("Both team names required");
      return;
    }
    if (!date) {
      toast.error("Event date required");
      return;
    }
    setCreating(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await callOperatorManage(token, {
        action: "admin_create_event",
        operator_id: operatorId,
        team_a: teamA.trim(),
        team_b: teamB.trim(),
        title: `${teamA.trim()} vs ${teamB.trim()}`,
        sport,
        event_date: new Date(date).toISOString(),
        is_featured: featured,
      });
      toast.success("Event created");
      onCreated();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-muted/30 border border-border rounded-lg p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={teamA}
          onChange={(e) => setTeamA(e.target.value)}
          placeholder="Team A"
          className="text-xs h-8"
        />
        <Input
          value={teamB}
          onChange={(e) => setTeamB(e.target.value)}
          placeholder="Team B"
          className="text-xs h-8"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <select
          value={sport}
          onChange={(e) => setSport(e.target.value)}
          className="text-xs h-8 rounded-md border border-border bg-card px-2"
        >
          {SPORT_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Input
          type="datetime-local"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="text-xs h-8"
        />
      </div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
            className="rounded"
          />
          Featured
        </label>
        <Button size="sm" className="h-7 text-xs gap-1" disabled={creating} onClick={handleCreate}>
          {creating ? "Creating..." : "Create Event"}
        </Button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Individual event row with admin actions
// ═══════════════════════════════════════

function AdminEventRow({
  event,
  fight,
  operatorId,
  getAccessToken,
  onAction,
}: {
  event: any;
  fight: any;
  operatorId: string;
  getAccessToken: () => Promise<string | null>;
  onAction: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedWinner, setSelectedWinner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const fightStatus = fight?.status || "unknown";
  const isOpen = fightStatus === "open";
  const isLocked = fightStatus === "locked";
  const isSettled = fightStatus === "settled" || fightStatus === "confirmed";
  const hasWinner = !!fight?.winner;
  const poolTotal = Number(fight?.pool_a_usd || 0) + Number(fight?.pool_b_usd || 0);

  const doAction = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("Not authenticated");
      await callOperatorManage(token, { action, operator_id: operatorId, ...extra });
      toast.success("Done");
      onAction();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-muted/20 border border-border/50 rounded-lg overflow-hidden">
      <div
        className="p-2 flex items-center justify-between cursor-pointer hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{event.title}</div>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1.5 flex-wrap">
            <span>{event.sport}</span>
            <span>•</span>
            <span>{event.event_date ? new Date(event.event_date).toLocaleDateString() : "No date"}</span>
            {event.is_featured && <span className="text-yellow-400">⭐</span>}
            {poolTotal > 0 && <span className="text-green-400">${poolTotal.toFixed(2)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              isSettled
                ? "bg-primary/10 text-primary"
                : isLocked
                ? "bg-orange-500/10 text-orange-400"
                : isOpen
                ? "bg-green-500/10 text-green-400"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isSettled ? (hasWinner ? "Settled" : "Confirmed") : isLocked ? "Locked" : isOpen ? "Live" : fightStatus}
          </span>
          {expanded ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
        </div>
      </div>

      {expanded && (
        <div className="px-2 pb-2 border-t border-border/50 pt-2 space-y-2">
          {/* Pool info */}
          {fight && (
            <div className="grid grid-cols-2 gap-1.5 text-[10px]">
              <div className="bg-muted/30 rounded p-1.5 text-center">
                <div className="text-muted-foreground">{event.team_a}</div>
                <div className="font-bold">${Number(fight.pool_a_usd || 0).toFixed(2)}</div>
              </div>
              <div className="bg-muted/30 rounded p-1.5 text-center">
                <div className="text-muted-foreground">{event.team_b}</div>
                <div className="font-bold">${Number(fight.pool_b_usd || 0).toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-1.5">
            {isOpen && (
              <Button
                size="sm"
                variant="outline"
                className="text-[10px] h-6 gap-1 border-orange-500/30 text-orange-400"
                disabled={busy}
                onClick={() =>
                  doAction("admin_close_event", { event_id: event.id, fight_id: fight?.id })
                }
              >
                <Lock className="w-3 h-3" /> Close
              </Button>
            )}

            {(isLocked || isOpen) && !isSettled && fight && (
              <div className="w-full space-y-1.5 mt-1">
                <div className="text-[10px] text-muted-foreground font-medium">Set Winner:</div>
                <div className="flex gap-1.5">
                  {["fighter_a", "fighter_b", "draw"].map((w) => (
                    <Button
                      key={w}
                      size="sm"
                      variant={selectedWinner === w ? "default" : "outline"}
                      className="text-[10px] h-6"
                      onClick={() => setSelectedWinner(w)}
                    >
                      {w === "fighter_a" ? event.team_a : w === "fighter_b" ? event.team_b : "Draw"}
                    </Button>
                  ))}
                </div>
                {selectedWinner && (
                  <Button
                    size="sm"
                    className="h-6 text-[10px] gap-1 w-full bg-primary"
                    disabled={busy}
                    onClick={() =>
                      doAction("admin_settle_event", {
                        fight_id: fight.id,
                        event_id: event.id,
                        winner: selectedWinner,
                      })
                    }
                  >
                    <Trophy className="w-3 h-3" /> {busy ? "Settling..." : "Confirm & Settle"}
                  </Button>
                )}
              </div>
            )}

            {isSettled && hasWinner && (
              <div className="text-[10px] text-primary">
                Winner:{" "}
                <span className="font-bold">
                  {fight.winner === "fighter_a"
                    ? event.team_a
                    : fight.winner === "fighter_b"
                    ? event.team_b
                    : "Draw"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
