import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar, BarChart3, ExternalLink, Plus, DollarSign,
  TrendingUp, Edit3, Lock, Trophy, ChevronDown, Wallet,
  Copy, Mail, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import OperatorEventActions from "./OperatorEventActions";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";

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
  const { t } = useTranslation();
  const { authenticated, login, getAccessToken, user } = usePrivy();
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
  const [linkCopied, setLinkCopied] = useState(false);

  const contactEmail = user?.email?.address || user?.google?.email || null;

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
        toast.error(t("operator.dashboard.eventCreateFailed"), { description: data.error });
      } else {
        toast.success(t("operator.dashboard.eventCreated"));
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
        toast.error(t("operator.dashboard.actionFailed"), { description: data.error });
      } else {
        toast.success(
          action === "close_event" ? t("operator.dashboard.predictionsClosed") :
          action === "settle_event" ? t("operator.dashboard.eventSettled") :
          t("operator.dashboard.updated")
        );
      }
      if (operator) {
        fetchEvents(operator.id);
        fetchFights(operator.id);
        fetchRevenue(operator.id);
      }
    } catch (err: any) {
      toast.error(t("operator.dashboard.actionFailed"), { description: err.message });
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
        toast.error(t("operator.dashboard.withdrawalFailed"), { description: data.error });
      } else {
        toast.success(t("operator.dashboard.withdrawalRequested", { amount: data.amount?.toFixed(2) || "0.00" }));
        fetchPayouts(operator.id);
        fetchRevenue(operator.id);
      }
    } catch {
    } finally {
      setWithdrawing(false);
    }
  };

  const copyAppLink = () => {
    if (!operator) return;
    navigator.clipboard.writeText(`https://${operator.subdomain}.1mg.live`);
    setLinkCopied(true);
    toast.success(t("operator.dashboard.linkCopied"));
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">{t("operator.dashboard.loginRequired")}</h2>
          <Button onClick={login} className="bg-primary hover:bg-primary/90 border-0">{t("operator.dashboard.connectWallet")}</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="text-muted-foreground">{t("operator.dashboard.loading")}</div></div>;
  }

  if (!operator) return null;

  const availableBalance = Math.max(0, revenue.total - payouts.total_withdrawn - payouts.pending);

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <nav className="border-b border-white/5 bg-[#06080f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-bold text-lg">{operator.brand_name}</h1>
          <div className="flex items-center gap-3">
            <PlatformLanguageSwitcher />
            <a
              href={`https://${operator.subdomain}.1mg.live`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 flex items-center gap-1 hover:text-blue-300"
            >
              {operator.subdomain}.1mg.live <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Your App Details card */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mb-8">
          <h3 className="text-sm font-semibold text-white/60 mb-3">{t("operator.dashboard.appDetails")}</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
            <div>
              <div className="text-white/40 text-xs">{t("operator.dashboard.brandName")}</div>
              <div className="font-semibold">{operator.brand_name}</div>
            </div>
            <div>
              <div className="text-white/40 text-xs">{t("operator.dashboard.subdomain")}</div>
              <div className="font-semibold">{operator.subdomain}.1mg.live</div>
            </div>
            <div>
              <div className="text-white/40 text-xs">{t("operator.dashboard.status")}</div>
              <div className={`font-semibold ${operator.status === "active" ? "text-green-400" : "text-yellow-400"}`}>
                {operator.status}
              </div>
            </div>
            <div>
              <div className="text-white/40 text-xs">{t("operator.dashboard.fee")}</div>
              <div className="font-semibold">{operator.fee_percent}%</div>
            </div>
          </div>
          {contactEmail && (
            <div className="text-xs text-white/40 mb-3">
              <Mail size={12} className="inline mr-1" /> {contactEmail}
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={copyAppLink} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 text-xs gap-1.5">
              {linkCopied ? <Check size={12} /> : <Copy size={12} />}
              {t("operator.dashboard.copyLink")}
            </Button>
          </div>
          <div className="mt-3 text-[10px] text-white/20 flex items-center gap-1">
            <Mail size={10} /> {t("operator.dashboard.support")}: <a href="mailto:1mgaming@proton.me" className="text-blue-400/60 hover:text-blue-400">1mgaming@proton.me</a>
          </div>
        </div>

        {/* Revenue Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><DollarSign size={14} /> {t("operator.dashboard.totalEarned")}</div>
            <div className="text-xl font-bold text-green-400">${revenue.total.toFixed(2)}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Wallet size={14} /> {t("operator.dashboard.available")}</div>
            <div className="text-xl font-bold text-emerald-400">${availableBalance.toFixed(2)}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><TrendingUp size={14} /> {t("operator.dashboard.predictions")}</div>
            <div className="text-xl font-bold">{revenue.count}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Calendar size={14} /> {t("operator.dashboard.events")}</div>
            <div className="text-xl font-bold">{events.length}</div>
          </div>
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><BarChart3 size={14} /> {t("operator.dashboard.yourFee")}</div>
            <div className="text-xl font-bold">{operator.fee_percent}%</div>
            <div className="text-[10px] text-white/30">{t("operator.dashboard.plusPlatform")}</div>
          </div>
        </div>

        {/* Withdraw */}
        {availableBalance > 0.01 && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 mb-8 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-emerald-400">{t("operator.dashboard.availableForWithdrawal")}</div>
              <div className="text-2xl font-bold text-emerald-300">${availableBalance.toFixed(2)}</div>
            </div>
            <Button
              onClick={handleWithdraw}
              disabled={withdrawing}
              className="bg-emerald-600 hover:bg-emerald-500 border-0"
            >
              {withdrawing ? t("operator.dashboard.processing") : t("operator.dashboard.requestWithdrawal")}
            </Button>
          </div>
        )}

        {/* Events section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">{t("operator.dashboard.yourEvents")}</h2>
            <Button onClick={() => setShowNewEvent(true)} size="sm" className="bg-blue-600 hover:bg-blue-500 border-0">
              <Plus size={16} /> {t("operator.dashboard.newEvent")}
            </Button>
          </div>

          {showNewEvent && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 mb-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input value={newTeamA} onChange={(e) => setNewTeamA(e.target.value)} placeholder={t("operator.dashboard.teamFighterA")} className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                <Input value={newTeamB} onChange={(e) => setNewTeamB(e.target.value)} placeholder={t("operator.dashboard.teamFighterB")} className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <select value={newSport} onChange={(e) => setNewSport(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-md h-10 px-3 text-sm">
                  {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
              </div>
              <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                <input type="checkbox" checked={newFeatured} onChange={e => setNewFeatured(e.target.checked)} className="rounded" />
                {t("operator.dashboard.featuredEvent")}
              </label>
              <div className="flex gap-2">
                <Button onClick={createEvent} disabled={!newTeamA || !newTeamB || creating} className="bg-blue-600 hover:bg-blue-500 border-0">
                  {creating ? t("operator.dashboard.creating") : t("operator.dashboard.createGoLive")}
                </Button>
                <Button onClick={() => setShowNewEvent(false)} variant="outline" className="border-white/10 text-white hover:bg-white/5">{t("operator.dashboard.cancel")}</Button>
              </div>
              <p className="text-[10px] text-white/20">{t("operator.dashboard.eventsGoLive")}</p>
            </div>
          )}

          {events.length === 0 ? (
            <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-12 text-center text-white/30">
              {t("operator.dashboard.noEventsYet")}
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
          <p>{t("operator.dashboard.feeDisclosure1")}</p>
          <p>{t("operator.dashboard.feeDisclosure2")}</p>
        </div>
      </div>
    </div>
  );
}
