import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { Settings, Calendar, BarChart3, ExternalLink, Plus, DollarSign, TrendingUp, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const [revenue, setRevenue] = useState<{ total: number; count: number }>({ total: 0, count: 0 });

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTeamA, setNewTeamA] = useState("");
  const [newTeamB, setNewTeamB] = useState("");
  const [newSport, setNewSport] = useState("Soccer");
  const [newDate, setNewDate] = useState("");
  const [newFeatured, setNewFeatured] = useState(false);
  const [creating, setCreating] = useState(false);

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
        fetchRevenue(data.operator.id);
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
        console.error("Create event error:", data.error);
      }
      setShowNewEvent(false);
      setNewTeamA("");
      setNewTeamB("");
      setNewDate("");
      setNewFeatured(false);
      if (operator) {
        fetchEvents(operator.id);
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">Login Required</h2>
          <Button onClick={login} className="bg-blue-600 hover:bg-blue-500 border-0">Connect Wallet</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center"><div className="text-white/50">Loading...</div></div>;
  }

  if (!operator) return null;

  const activeEvents = events.filter(e => e.status === "open");
  const draftEvents = events.filter(e => e.status === "draft");

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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 text-white/40 mb-2 text-sm">
              <DollarSign size={16} /> Revenue
            </div>
            <div className="text-2xl font-bold text-green-400">${revenue.total.toFixed(2)}</div>
            <div className="text-xs text-white/30 mt-1">Total earned</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 text-white/40 mb-2 text-sm">
              <TrendingUp size={16} /> Predictions
            </div>
            <div className="text-2xl font-bold">{revenue.count}</div>
            <div className="text-xs text-white/30 mt-1">Total placed</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 text-white/40 mb-2 text-sm">
              <Calendar size={16} /> Active Events
            </div>
            <div className="text-2xl font-bold">{activeEvents.length}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
            <div className="flex items-center gap-2 text-white/40 mb-2 text-sm">
              <BarChart3 size={16} /> Your Fee
            </div>
            <div className="text-2xl font-bold">{operator.fee_percent}%</div>
            <div className="text-xs text-white/30 mt-1">+ 1% platform fee</div>
          </div>
        </div>

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
            <div className="space-y-2">
              {events.map((ev: any) => (
                <div key={ev.id} className="bg-white/[0.03] border border-white/5 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{ev.title}</div>
                    <div className="text-sm text-white/40">
                      {ev.sport} • {ev.event_date ? new Date(ev.event_date).toLocaleDateString() : "No date"}
                      {ev.is_featured && <span className="ml-2 text-yellow-400 text-xs">⭐ Featured</span>}
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    ev.status === "open" ? "bg-green-500/10 text-green-400" :
                    ev.status === "draft" ? "bg-yellow-500/10 text-yellow-400" :
                    "bg-white/5 text-white/40"
                  }`}>
                    {ev.status}
                  </span>
                </div>
              ))}
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
