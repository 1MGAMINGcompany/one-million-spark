import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar, BarChart3, ExternalLink, Plus, DollarSign,
  TrendingUp, Edit3, Lock, Trophy, ChevronDown, Wallet,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OperatorEventActions from "./OperatorEventActions";

interface OperatorData {
  id: string;
  brand_name: string;
  subdomain: string;
  logo_url: string | null;
  theme: string;
  fee_percent: number;
  status: string;
}

const SPORT_OPTIONS = ["Soccer", "MMA", "Boxing", "NFL", "NBA", "NHL", "MLB", "NCAA", "Tennis"];

export default function OperatorDashboard() {
  const { authenticated, login, getAccessToken } = usePrivy();
  const navigate = useNavigate();
  const [operator, setOperator] = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [fights, setFights] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<{ total: number; count: number }>({ total: 0, count: 0 });
  const [payouts, setPayouts] = useState<{ total_withdrawn: number; pending: number }>({ total_withdrawn: 0, pending: 0 });

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTeamA, setNewTeamA] = useState("");
  const [newTeamB, setNewTeamB] = useState("");
  const [newSport, setNewSport] = useState("Soccer");
  const [newDate, setNewDate] = useState("");
  const [newFeatured, setNewFeatured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  useEffect(() => {
    if (!authenticated) return;
    fetchOperator();
  }, [authenticated]);

  const fetchOperator = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "get_my_operator" }),
        }
      );
      const data = await res.json();
      if (data.operator) {
        setOperator(data.operator);
        fetchEvents(data.operator.id);
        fetchFights(data.operator.id);
        fetchRevenue(data.operator.id);
        fetchPayouts(data.operator.id);
      } else {
        navigate("/onboarding");
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("operator_events")
      .select("*")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false });
    setEvents(data || []);
  };

  const fetchFights = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("prediction_fights")
      .select("id, title, status, winner, operator_event_id, pool_a_usd, pool_b_usd, shares_a, shares_b")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false });
    setFights(data || []);
  };

  const fetchRevenue = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("operator_revenue")
      .select("operator_fee_usdc, entry_amount_usdc")
      .eq("operator_id", operatorId);
    if (data) {
      const total = data.reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      setRevenue({ total, count: data.length });
    }
  };

  const fetchPayouts = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("operator_payouts")
      .select("amount_usdc, status")
      .eq("operator_id", operatorId);
    if (data) {
      const totalWithdrawn = data
        .filter((p: any) => p.status === "paid")
        .reduce((s: number, r: any) => s + Number(r.amount_usdc || 0), 0);
      const pending = data
        .filter((p: any) => p.status === "pending")
        .reduce((s: number, r: any) => s + Number(r.amount_usdc || 0), 0);
      setPayouts({ total_withdrawn: totalWithdrawn, pending });
    }
  };

  const createEvent = async () => {
    setCreating(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({
            action: "create_event",
            title: `${newTeamA} vs ${newTeamB}`,
            team_a: newTeamA,
            team_b: newTeamB,
            sport: newSport,
            event_date: newDate || null,
            is_featured: newFeatured,
          }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error("Failed to create event", { description: data.error });
      } else {
        toast.success("Event created and live!");
      }
      setShowNewEvent(false);
      setNewTeamA("");
      setNewTeamB("");
      setNewDate("");
      setNewFeatured(false);
      if (operator) {
        fetchEvents(operator.id);
        fetchFights(operator.id);
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleEventAction = async (action: string, eventId: string, extra?: any) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action, event_id: eventId, ...extra }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error("Action failed", { description: data.error });
      } else {
        toast.success(
          action === "close_event" ? "Predictions closed" :
          action === "settle_event" ? "Event settled — payouts queued" :
          "Updated"
        );
      }
      if (operator) {
        fetchEvents(operator.id);
        fetchFights(operator.id);
        fetchRevenue(operator.id);
      }
    } catch (err: any) {
      toast.error("Action failed", { description: err.message });
    }
  };

  const handleWithdraw = async () => {
    if (!operator) return;
    setWithdrawing(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "request_withdrawal" }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error("Withdrawal failed", { description: data.error });
      } else {
        toast.success(`Withdrawal of $${data.amount?.toFixed(2) || "0.00"} requested`);
        fetchPayouts(operator.id);
        fetchRevenue(operator.id);
      }
    } catch {
    } finally {
      setWithdrawing(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Login Required</h2>
          <Button onClick={login} className="bg-primary hover:bg-primary/90 border-0">Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="text-muted-foreground">Loading...</div></div>;
  }

  if (!operator) return null;

  const availableBalance = Math.max(0, revenue.total - payouts.total_withdrawn - payouts.pending);

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <nav className="border-b border-white/5 bg-[#06080f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-bold text-lg">{operator.brand_name}</h1>
          <a
            href={`https://${operator.subdomain}.1mg.live`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 flex items-center gap-1 hover:text-blue-300"
          >
            {operator.subdomain}.1mg.live <ExternalLink size={14} />
          </a>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Revenue Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><DollarSign size={14} /> Total Earned</div>
            <div className="text-xl font-bold text-green-400">${revenue.total.toFixed(2)}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Wallet size={14} /> Available</div>
            <div className="text-xl font-bold text-emerald-400">${availableBalance.toFixed(2)}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><TrendingUp size={14} /> Predictions</div>
            <div className="text-xl font-bold">{revenue.count}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Calendar size={14} /> Events</div>
            <div className="text-xl font-bold">{events.length}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><BarChart3 size={14} /> Your Fee</div>
            <div className="text-xl font-bold">{operator.fee_percent}%</div>
            <div className="text-[10px] text-white/30">+ 1% platform</div>
          </div>
        </div>

        {/* Withdraw */}
        {availableBalance > 0.01 && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-8 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-emerald-400">Available for withdrawal</div>
              <div className="text-2xl font-bold text-emerald-300">${availableBalance.toFixed(2)}</div>
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="bg-emerald-600 hover:bg-emerald-500 border-0"
            >
              {withdrawing ? "Processing..." : "Request Withdrawal"}
            </Button>
          </div>
        )}

        {/* Events section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Your Events</h2>
            <Button onClick={() => setShowNewEvent(true)} size="sm" className="bg-blue-600 hover:bg-blue-500 border-0">
              <Plus size={16} /> New Event
            </Button>
          </div>

          {showNewEvent && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input value={newTeamA} onChange={(e) => setNewTeamA(e.target.value)} placeholder="Team / Fighter A" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                <Input value={newTeamB} onChange={(e) => setNewTeamB(e.target.value)} placeholder="Team / Fighter B" className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select value={newSport} onChange={(e) => setNewSport(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-md h-10 px-3 text-sm">
                  {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" checked={newFeatured} onChange={e => setNewFeatured(e.target.checked)} className="rounded" />
                Featured event
              </label>
              <div className="flex gap-2">
                <Button onClick={createEvent} disabled={!newTeamA || !newTeamB || creating} className="bg-blue-600 hover:bg-blue-500 border-0">
                  {creating ? "Creating..." : "Create & Go Live"}
                </Button>
                <Button onClick={() => setShowNewEvent(false)} variant="outline" className="border-white/10 text-white hover:bg-white/5">Cancel</Button>
              </div>
              <p className="text-[10px] text-white/20">Events go live immediately. Users can start predicting right away.</p>
            </div>
          )}

          {events.length === 0 ? (
            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-12 text-center text-white/30">
              No events yet. Create your first event to get started.
            </div>
          ) : (
            <div className="space-y-3">
              {events.map((ev: any) => {
                const fight = fights.find((f: any) => f.operator_event_id === ev.id);
                return (
                  <OperatorEventActions
                    key={ev.id}
                    event={ev}
                    fight={fight}
                    onAction={handleEventAction}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Fee disclosure */}
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 text-xs text-white/30 space-y-1">
          <p>1MG platform fee: 1% on every prediction.</p>
          <p>For some events, additional market fees may apply where required.</p>
        </div>
      </div>
    </div>
  );
}
