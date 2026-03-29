import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Globe, DollarSign, Users, Calendar, ExternalLink, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Admin panel for viewing all operators (mounted inside 1mgaming admin).
 * Read-only visibility into operator ecosystem with search/filter.
 */
export default function OperatorAdminPanel() {
  const [search, setSearch] = useState("");

  const { data: operators, isLoading } = useQuery({
    queryKey: ["admin_operators"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operators")
        .select("*, operator_settings(*)")
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const { data: revenueMap } = useQuery({
    queryKey: ["admin_operator_revenue"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operator_revenue")
        .select("operator_id, operator_fee_usdc, platform_fee_usdc");
      const map: Record<string, { opFee: number; platformFee: number; count: number }> = {};
      (data || []).forEach((r: any) => {
        if (!map[r.operator_id]) map[r.operator_id] = { opFee: 0, platformFee: 0, count: 0 };
        map[r.operator_id].opFee += Number(r.operator_fee_usdc || 0);
        map[r.operator_id].platformFee += Number(r.platform_fee_usdc || 0);
        map[r.operator_id].count++;
      });
      return map;
    },
  });

  const { data: eventCounts } = useQuery({
    queryKey: ["admin_operator_events"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operator_events")
        .select("operator_id, id");
      const map: Record<string, number> = {};
      (data || []).forEach((e: any) => {
        map[e.operator_id] = (map[e.operator_id] || 0) + 1;
      });
      return map;
    },
  });

  if (isLoading) {
    return <div className="text-muted-foreground text-sm py-8 text-center">Loading operators...</div>;
  }

  if (!operators || operators.length === 0) {
    return <div className="text-muted-foreground text-sm py-8 text-center">No operators yet.</div>;
  }

  const q = search.toLowerCase().trim();
  const filtered = q
    ? operators.filter((op: any) =>
        (op.brand_name || "").toLowerCase().includes(q) ||
        (op.subdomain || "").toLowerCase().includes(q) ||
        (op.user_id || "").toLowerCase().includes(q) ||
        (op.status || "").toLowerCase().includes(q)
      )
    : operators;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        <Globe className="w-5 h-5 text-primary" />
        1MG Operators ({operators.length})
      </h2>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by brand, subdomain, or user ID..."
          className="pl-9 bg-card border-border"
        />
      </div>

      <div className="text-xs text-muted-foreground">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</div>

      <div className="space-y-3">
        {filtered.map((op: any) => {
          const rev = revenueMap?.[op.id];
          const evCount = eventCounts?.[op.id] || 0;
          const settings = op.operator_settings?.[0] || op.operator_settings;

          return (
            <div key={op.id} className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  {op.logo_url && (
                    <img src={op.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-white/5 p-1" />
                  )}
                  <div>
                    <div className="font-bold text-foreground">{op.brand_name}</div>
                    <a
                      href={`https://${op.subdomain}.1mg.live`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary flex items-center gap-1"
                    >
                      {op.subdomain}.1mg.live <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  op.status === "active" ? "bg-green-500/10 text-green-400" :
                  op.status === "pending" ? "bg-yellow-500/10 text-yellow-400" :
                  "bg-white/5 text-muted-foreground"
                }`}>
                  {op.status}
                </span>
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-muted-foreground mb-3">
                <span>User: <span className="font-mono text-foreground/60">{op.user_id?.slice(0, 12)}…</span></span>
                <span>Created: {new Date(op.created_at).toLocaleDateString()}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Fee</span>
                  <div className="font-bold text-foreground">{op.fee_percent}%</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Events</span>
                  <div className="font-bold text-foreground">{evCount}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">Op Revenue</span>
                  <div className="font-bold text-green-400">${(rev?.opFee || 0).toFixed(2)}</div>
                </div>
                <div>
                  <span className="text-muted-foreground">1MG Revenue</span>
                  <div className="font-bold text-primary">${(rev?.platformFee || 0).toFixed(2)}</div>
                </div>
              </div>

              {settings?.allowed_sports && (
                <div className="mt-3 flex gap-1 flex-wrap">
                  {(settings.allowed_sports || []).map((s: string) => (
                    <span key={s} className="text-[10px] bg-white/5 text-muted-foreground px-2 py-0.5 rounded-full">{s}</span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
