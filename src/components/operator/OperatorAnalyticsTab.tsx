import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";
import { Loader2, TrendingUp, Users, DollarSign, Trophy, BarChart3 } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from "recharts";

interface Props {
  operatorId: string;
  feePercent: number;
}

export default function OperatorAnalyticsTab({ operatorId, feePercent }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<any[]>([]);
  const [fights, setFights] = useState<any[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, [operatorId]);

  async function loadAnalytics() {
    setLoading(true);
    try {
      const [entriesRes, fightsRes] = await Promise.all([
        (supabase as any)
          .from("prediction_entries")
          .select("id, amount_usd, created_at, fighter_pick, fight_id, wallet")
          .eq("source_operator_id", operatorId)
          .order("created_at", { ascending: false })
          .limit(500),
        (supabase as any)
          .from("prediction_fights")
          .select("id, title, event_name, pool_a_usd, pool_b_usd, shares_a, shares_b, status, sport")
          .eq("operator_id", operatorId)
          .order("created_at", { ascending: false }),
      ]);
      setEntries(entriesRes.data || []);
      setFights(fightsRes.data || []);
    } catch (e) {
      console.error("[analytics]", e);
    } finally {
      setLoading(false);
    }
  }

  const stats = useMemo(() => {
    const totalPredictions = entries.length;
    const totalVolume = entries.reduce((s: number, e: any) => s + (e.amount_usd || 0), 0);
    const commission = totalVolume * (feePercent / 100);
    const uniqueUsers = new Set(entries.map((e: any) => e.wallet)).size;
    // Most popular fight
    const fightCounts: Record<string, number> = {};
    entries.forEach((e: any) => { fightCounts[e.fight_id] = (fightCounts[e.fight_id] || 0) + 1; });
    const topFightId = Object.entries(fightCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    const topFight = fights.find((f: any) => f.id === topFightId);
    return { totalPredictions, totalVolume, commission, uniqueUsers, topFight };
  }, [entries, fights, feePercent]);

  const dailyChart = useMemo(() => {
    const now = new Date();
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    entries.forEach((e: any) => {
      const key = e.created_at?.slice(0, 10);
      if (days[key] !== undefined) days[key]++;
    });
    return Object.entries(days).map(([date, count]) => ({ date: date.slice(5), count }));
  }, [entries]);

  const revenueChart = useMemo(() => {
    const now = new Date();
    const days: Record<string, number> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      days[d.toISOString().slice(0, 10)] = 0;
    }
    entries.forEach((e: any) => {
      const key = e.created_at?.slice(0, 10);
      if (days[key] !== undefined) days[key] += (e.amount_usd || 0) * (feePercent / 100);
    });
    return Object.entries(days).map(([date, rev]) => ({ date: date.slice(5), revenue: +rev.toFixed(2) }));
  }, [entries, feePercent]);

  const sportChart = useMemo(() => {
    const sportCounts: Record<string, number> = {};
    entries.forEach((e: any) => {
      const fight = fights.find((f: any) => f.id === e.fight_id);
      const sport = fight?.sport || "Other";
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    });
    return Object.entries(sportCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([sport, count]) => ({ sport, count }));
  }, [entries, fights]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={<TrendingUp size={14} />} label={t("operator.analytics.totalPredictions")} value={stats.totalPredictions} />
        <StatCard icon={<DollarSign size={14} />} label={t("operator.analytics.usdcVolume")} value={`$${stats.totalVolume.toFixed(0)}`} />
        <StatCard icon={<DollarSign size={14} />} label={t("operator.analytics.commission")} value={`$${stats.commission.toFixed(2)}`} accent />
        <StatCard icon={<Users size={14} />} label={t("operator.analytics.uniqueUsers")} value={stats.uniqueUsers} />
      </div>

      {stats.topFight && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <div className="flex items-center gap-2 text-white/40 mb-1 text-xs">
            <Trophy size={14} /> {t("operator.analytics.mostPopularEvent")}
          </div>
          <div className="text-sm font-bold text-white">{stats.topFight.title || stats.topFight.event_name}</div>
          <div className="text-xs text-white/40 mt-0.5">
            ${((stats.topFight.pool_a_usd || 0) + (stats.topFight.pool_b_usd || 0)).toFixed(0)} pool •{" "}
            {(stats.topFight.shares_a || 0) + (stats.topFight.shares_b || 0)} predictions
          </div>
        </div>
      )}

      {/* Daily predictions chart */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">{t("operator.analytics.dailyPredictions")}</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dailyChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Revenue chart */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">{t("operator.analytics.dailyCommission")}</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Sport breakdown */}
      {sportChart.length > 0 && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <h3 className="text-sm font-bold text-white mb-3">{t("operator.analytics.predictionsBySport")}</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sportChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="sport" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
                <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Bar dataKey="count" fill="#d4a017" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
        <h3 className="text-sm font-bold text-white mb-3">{t("operator.analytics.recentPredictions")}</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {entries.slice(0, 20).map((e: any) => {
            const fight = fights.find((f: any) => f.id === e.fight_id);
            return (
              <div key={e.id} className="flex items-center justify-between text-xs py-2 border-b border-white/5">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white truncate">{fight?.title || fight?.event_name || "—"}</div>
                  <div className="text-white/30">{e.wallet?.slice(0, 6)}…{e.wallet?.slice(-4)} • {e.fighter_pick}</div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="font-bold text-white">${(e.amount_usd || 0).toFixed(2)}</div>
                  <div className="text-white/30 text-[10px]">
                    {new Date(e.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            );
          })}
          {entries.length === 0 && <p className="text-xs text-white/30">{t("operator.analytics.noPredictionsYet")}</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
      <div className="flex items-center gap-2 text-white/40 mb-1 text-xs">{icon} {label}</div>
      <div className={`text-xl font-bold ${accent ? "text-emerald-400" : "text-white"}`}>{value}</div>
    </div>
  );
}
