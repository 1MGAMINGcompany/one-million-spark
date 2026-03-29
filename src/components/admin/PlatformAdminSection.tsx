import { useState, useEffect, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Globe, Loader2, Trash2, Lock, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import PlatformEventCreator from "./PlatformEventCreator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface PlatformFight {
  id: string;
  title: string;
  status: string;
  pool_a_usd: number;
  pool_b_usd: number;
  visibility: string;
  created_at: string;
  fighter_a_name: string;
  fighter_b_name: string;
  winner: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-green-500/20 text-green-400",
  locked: "bg-yellow-500/20 text-yellow-400",
  live: "bg-red-500/20 text-red-400",
  confirmed: "bg-blue-500/20 text-blue-400",
  settled: "bg-primary/20 text-primary",
};

export default function PlatformAdminSection({ wallet }: { wallet: string }) {
  const [open, setOpen] = useState(false);
  const [fights, setFights] = useState<PlatformFight[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"active" | "settled" | "all">("active");
  const [busy, setBusy] = useState(false);

  const loadFights = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("prediction_fights")
      .select("id, title, status, pool_a_usd, pool_b_usd, visibility, created_at, fighter_a_name, fighter_b_name, winner")
      .in("visibility", ["platform", "all"])
      .is("operator_id", null)
      .order("created_at", { ascending: false });
    if (data) setFights(data as PlatformFight[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) loadFights();
  }, [open, loadFights]);

  const callAdmin = async (action: string, extra: Record<string, any>) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action, wallet, ...extra },
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

  const filtered = fights.filter(f => {
    if (filter === "active") return ["open", "locked", "live", "result_selected", "confirmed"].includes(f.status);
    if (filter === "settled") return ["settled", "draw", "refunds_complete", "cancelled"].includes(f.status);
    return true;
  });

  const platformCount = fights.filter(f => ["open", "locked", "live"].includes(f.status)).length;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="bg-card border-border/50 p-4">
        <CollapsibleTrigger asChild>
          <button className="flex items-center justify-between w-full text-left">
            <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-400" /> 1MG.live Platform Events
              {platformCount > 0 && (
                <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full">{platformCount} active</span>
              )}
            </h2>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-3 space-y-4">
          <p className="text-xs text-muted-foreground">
            Events here appear on 1mg.live and operator apps. They do NOT show on 1mgaming.com unless set to "Both".
          </p>

          {/* Creator defaults to platform visibility */}
          <PlatformEventCreator wallet={wallet} defaultVisibility="platform" />

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(["active", "settled", "all"] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs px-3 py-1 rounded-full transition-colors ${
                  filter === f ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No platform events yet</p>
          ) : (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filtered.map(f => (
                <div key={f.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 border border-border/30">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{f.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || "bg-muted text-muted-foreground"}`}>
                        {f.status}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Pool: ${((f.pool_a_usd || 0) + (f.pool_b_usd || 0)).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-blue-400/60">
                        {f.visibility === "platform" ? "1MG.live" : f.visibility === "all" ? "Both" : "Flagship"}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    {f.status === "open" && (
                      <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                        onClick={() => callAdmin("lockPredictions", { fight_id: f.id })}>
                        <Lock className="w-3 h-3" />
                      </Button>
                    )}
                    {f.status === "live" && (
                      <>
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                          onClick={() => callAdmin("selectResult", { fight_id: f.id, winner: "fighter_a" })}>
                          A
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={busy}
                          onClick={() => callAdmin("selectResult", { fight_id: f.id, winner: "fighter_b" })}>
                          B
                        </Button>
                      </>
                    )}
                    {f.status === "open" && (
                      <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2 text-destructive" disabled={busy}
                        onClick={() => callAdmin("deleteFight", { fight_id: f.id })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
