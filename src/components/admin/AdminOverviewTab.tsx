import { useState, useEffect, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { parseSport } from "@/components/predictions/EventSection";

interface OverviewStats {
  flagshipEvents: number;
  platformEvents: number;
  flagshipPredictions: number;
  platformPredictions: number;
  flagshipVolume: number;
  platformVolume: number;
  activeOperators: number;
  settledToday: number;
  totalCommission: number;
  predictionsToday: number;
  predictionsWeek: number;
  predictionsAll: number;
  cronLastRun: string | null;
}

interface Operator {
  id: string;
  brand_name: string;
  subdomain: string;
  status: string;
  volume: number;
  predictions: number;
  commission: number;
  last_active: string | null;
}

export default function AdminOverviewTab() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [operators, setOperators] = useState<Operator[]>([]);
  const [topEvents, setTopEvents] = useState<{ event_name: string; pool: number }[]>([]);
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [volumeChart, setVolumeChart] = useState<any[]>([]);
  const [sportChart, setSportChart] = useState<any[]>([]);

  useEffect(() => {
    loadOverview();
  }, []);

  async function loadOverview() {
    setLoading(true);
    try {
      const [
        eventsRes,
        fightsRes,
        entriesRes,
        operatorsRes,
        revenueRes,
        logsRes,
      ] = await Promise.all([
        supabase.from("prediction_events").select("id, status, source").not("status", "in", '("archived","dismissed","rejected")'),
        supabase.from("prediction_fights").select("id, event_name, status, pool_a_usd, pool_b_usd, visibility, operator_id, source, created_at").not("status", "in", '("cancelled")'),
        supabase.from("prediction_entries").select("id, amount_usd, created_at, source_operator_id, fight_id").limit(1000),
        (supabase as any).from("operators").select("id, brand_name, subdomain, status, created_at"),
        (supabase as any).from("operator_revenue").select("operator_id, operator_fee_usdc, platform_fee_usdc, total_fee_usdc, created_at"),
        supabase.from("admin_activity_log").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      const events = eventsRes.data || [];
      const fights = (fightsRes.data || []) as any[];
      const entries = (entriesRes.data || []) as any[];
      const ops = (operatorsRes.data || []) as any[];
      const revenue = (revenueRes.data || []) as any[];
      const logs = (logsRes.data || []) as any[];

      // Stats
      const flagshipFights = fights.filter((f: any) => !f.operator_id && (f.visibility === "flagship" || f.visibility === "all"));
      const platformFights = fights.filter((f: any) => f.operator_id || f.visibility === "platform" || f.visibility === "all");

      const flagshipEntries = entries.filter((e: any) => !e.source_operator_id);
      const platformEntries = entries.filter((e: any) => e.source_operator_id);

      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now.getTime() - 7 * 86400000);

      const cronLog = logs.find((l: any) => l.action?.includes("daily_import") || l.action?.includes("cron"));

      setStats({
        flagshipEvents: new Set(flagshipFights.map((f: any) => f.event_name)).size,
        platformEvents: new Set(platformFights.map((f: any) => f.event_name)).size,
        flagshipPredictions: flagshipEntries.length,
        platformPredictions: platformEntries.length,
        flagshipVolume: flagshipEntries.reduce((s: number, e: any) => s + (e.amount_usd || 0), 0),
        platformVolume: platformEntries.reduce((s: number, e: any) => s + (e.amount_usd || 0), 0),
        activeOperators: ops.filter((o: any) => o.status === "active").length,
        settledToday: fights.filter((f: any) => f.status === "settled" && new Date(f.created_at) >= todayStart).length,
        totalCommission: revenue.reduce((s: number, r: any) => s + (r.total_fee_usdc || 0), 0),
        predictionsToday: entries.filter((e: any) => new Date(e.created_at) >= todayStart).length,
        predictionsWeek: entries.filter((e: any) => new Date(e.created_at) >= weekStart).length,
        predictionsAll: entries.length,
        cronLastRun: cronLog?.created_at || null,
      });

      // Operators enriched
      const opMap: Record<string, Operator> = {};
      ops.forEach((o: any) => {
        opMap[o.id] = {
          id: o.id, brand_name: o.brand_name, subdomain: o.subdomain, status: o.status,
          volume: 0, predictions: 0, commission: 0, last_active: null,
        };
      });
      entries.forEach((e: any) => {
        if (e.source_operator_id && opMap[e.source_operator_id]) {
          opMap[e.source_operator_id].volume += e.amount_usd || 0;
          opMap[e.source_operator_id].predictions++;
          if (!opMap[e.source_operator_id].last_active || e.created_at > opMap[e.source_operator_id].last_active!)
            opMap[e.source_operator_id].last_active = e.created_at;
        }
      });
      revenue.forEach((r: any) => {
        if (opMap[r.operator_id]) opMap[r.operator_id].commission += r.operator_fee_usdc || 0;
      });
      setOperators(Object.values(opMap).sort((a, b) => b.volume - a.volume));

      // Top events
      const eventPools: Record<string, number> = {};
      fights.forEach((f: any) => {
        const pool = (f.pool_a_usd || 0) + (f.pool_b_usd || 0);
        eventPools[f.event_name] = (eventPools[f.event_name] || 0) + pool;
      });
      setTopEvents(
        Object.entries(eventPools)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([event_name, pool]) => ({ event_name, pool }))
      );

      // Activity log
      setActivityLog(logs);

      // 30-day volume chart
      const dayMap: Record<string, { flagship: number; platform: number }> = {};
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now.getTime() - i * 86400000);
        const key = d.toISOString().slice(0, 10);
        dayMap[key] = { flagship: 0, platform: 0 };
      }
      entries.forEach((e: any) => {
        const key = e.created_at?.slice(0, 10);
        if (dayMap[key]) {
          if (e.source_operator_id) dayMap[key].platform += e.amount_usd || 0;
          else dayMap[key].flagship += e.amount_usd || 0;
        }
      });
      setVolumeChart(Object.entries(dayMap).map(([date, v]) => ({ date: date.slice(5), ...v })));

      // Sport chart
      const sportCounts: Record<string, number> = {};
      fights.forEach((f: any) => {
        const sport = parseSport(f.event_name, null, null);
        sportCounts[sport] = (sportCounts[sport] || 0) + 1;
      });
      setSportChart(
        Object.entries(sportCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([sport, count]) => ({ sport, count }))
      );
    } catch (err) {
      console.error("[AdminOverview] loadOverview failed:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!stats) return null;

  const totalVolume = stats.flagshipVolume + stats.platformVolume;

  return (
    <div className="space-y-6">
      {/* Comparison cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-card border-border/50 p-4">
          <h3 className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-3">1MGAMING.COM</h3>
          <div className="space-y-2">
            <Stat label="Active Events" value={stats.flagshipEvents} />
            <Stat label="Total Predictions" value={stats.flagshipPredictions} />
            <Stat label="USDC Volume" value={`$${fmtNum(stats.flagshipVolume)}`} />
            <Stat label="Settled Today" value={stats.settledToday} />
          </div>
        </Card>
        <Card className="bg-card border-border/50 p-4">
          <h3 className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-3">1MG.LIVE</h3>
          <div className="space-y-2">
            <Stat label="Active Events" value={stats.platformEvents} />
            <Stat label="Total Predictions" value={stats.platformPredictions} />
            <Stat label="USDC Volume" value={`$${fmtNum(stats.platformVolume)}`} />
            <Stat label="Active Operators" value={stats.activeOperators} />
          </div>
        </Card>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total USDC" value={`$${fmtNum(totalVolume)}`} />
        <MiniStat label="Today" value={stats.predictionsToday} sub="predictions" />
        <MiniStat label="This Week" value={stats.predictionsWeek} sub="predictions" />
        <MiniStat label="Commission" value={`$${fmtNum(stats.totalCommission)}`} />
      </div>
      {stats.cronLastRun && (
        <p className="text-[10px] text-muted-foreground">
          Cron last run: {new Date(stats.cronLastRun).toLocaleString()}
        </p>
      )}

      {/* Charts */}
      <Card className="bg-card border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">30-Day Volume</h3>
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={volumeChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Legend />
              <Line type="monotone" dataKey="flagship" name="1mgaming" stroke="#d4a017" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="platform" name="1mg.live" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="bg-card border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Predictions by Sport</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sportChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="sport" tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 9 }} angle={-45} textAnchor="end" height={60} />
              <YAxis tick={{ fill: "rgba(255,255,255,0.3)", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
              <Bar dataKey="count" fill="#d4a017" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Top events */}
      <Card className="bg-card border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Top 10 Events by Pool</h3>
        <div className="space-y-2">
          {topEvents.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground truncate flex-1 mr-2">{i + 1}. {e.event_name}</span>
              <span className="font-bold text-foreground">${fmtNum(e.pool)}</span>
            </div>
          ))}
          {topEvents.length === 0 && <p className="text-xs text-muted-foreground">No events yet</p>}
        </div>
      </Card>

      {/* Operators */}
      <Card className="bg-card border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Operators</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b border-border/30">
                <th className="text-left py-2">Subdomain</th>
                <th className="text-right py-2">Volume</th>
                <th className="text-right py-2">Predictions</th>
                <th className="text-right py-2">Commission</th>
                <th className="text-right py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {operators.map(op => (
                <tr key={op.id} className="border-b border-border/10">
                  <td className="py-2 text-foreground font-medium">{op.subdomain}</td>
                  <td className="py-2 text-right text-foreground">${fmtNum(op.volume)}</td>
                  <td className="py-2 text-right text-muted-foreground">{op.predictions}</td>
                  <td className="py-2 text-right text-green-400">${fmtNum(op.commission)}</td>
                  <td className="py-2 text-right">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${op.status === "active" ? "bg-green-500/20 text-green-400" : "bg-white/10 text-white/40"}`}>
                      {op.status}
                    </span>
                  </td>
                </tr>
              ))}
              {operators.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">No operators yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Activity feed */}
      <Card className="bg-card border-border/50 p-4">
        <h3 className="text-sm font-bold text-foreground mb-3">Recent Activity</h3>
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {activityLog.map((log: any) => (
            <div key={log.id} className="flex items-start gap-3 text-xs py-2 border-b border-border/10">
              <span className="text-muted-foreground whitespace-nowrap">
                {new Date(log.created_at).toLocaleDateString()} {new Date(log.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              <div className="flex-1">
                <span className="font-bold text-foreground">{log.action}</span>
                <p className="text-muted-foreground mt-0.5 line-clamp-2">{log.description}</p>
              </div>
            </div>
          ))}
          {activityLog.length === 0 && <p className="text-xs text-muted-foreground">No recent activity</p>}
        </div>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold text-foreground">{value}</span>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="bg-card border-border/50 p-3 text-center">
      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-lg font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </Card>
  );
}

function fmtNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}
