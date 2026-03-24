import { useOperatorBySubdomain, useOperatorSettings } from "@/hooks/useOperator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Globe, Trophy } from "lucide-react";

const THEME_MAP: Record<string, { primary: string; bg: string; card: string }> = {
  blue: { primary: "#3b82f6", bg: "#06080f", card: "rgba(255,255,255,0.03)" },
  gold: { primary: "#d4a017", bg: "#0a0a0a", card: "rgba(255,255,255,0.03)" },
  red: { primary: "#ef4444", bg: "#0a0a0f", card: "rgba(255,255,255,0.03)" },
};

interface OperatorAppProps {
  subdomain: string;
}

export default function OperatorApp({ subdomain }: OperatorAppProps) {
  const { data: operator, isLoading } = useOperatorBySubdomain(subdomain);
  const { data: settings } = useOperatorSettings(operator?.id ?? null);

  // Operator's custom events
  const { data: operatorEvents } = useQuery({
    queryKey: ["operator_events", operator?.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("operator_events")
        .select("*")
        .eq("operator_id", operator!.id)
        .in("status", ["open", "draft"])
        .order("is_featured", { ascending: false });
      return data || [];
    },
    enabled: !!operator?.id,
  });

  // Platform-shared events (prediction_fights)
  const { data: platformEvents } = useQuery({
    queryKey: ["platform_fights_shared"],
    queryFn: async () => {
      const { data } = await supabase
        .from("prediction_fights")
        .select("*")
        .in("status", ["open", "locked"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
    enabled: settings?.show_platform_events !== false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center">
        <div className="text-white/50 animate-pulse">Loading...</div>
      </div>
    );
  }

  if (!operator) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-2">Not Found</h2>
          <p className="text-white/50">This operator doesn't exist yet.</p>
        </div>
      </div>
    );
  }

  const theme = THEME_MAP[operator.theme] || THEME_MAP.blue;

  return (
    <div className="min-h-screen text-white" style={{ backgroundColor: theme.bg }}>
      {/* Navbar */}
      <nav
        className="border-b border-white/5 backdrop-blur-xl"
        style={{ backgroundColor: `${theme.bg}cc` }}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {operator.logo_url && (
              <img
                src={operator.logo_url}
                alt={operator.brand_name}
                className="h-8 w-8 rounded-lg object-contain"
              />
            )}
            <span className="font-bold text-lg">{operator.brand_name}</span>
          </div>
          <div className="text-xs text-white/30">Powered by 1MG</div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Operator events */}
        {operatorEvents && operatorEvents.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Trophy size={20} style={{ color: theme.primary }} /> Featured Events
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {operatorEvents.map((ev: any) => (
                <div
                  key={ev.id}
                  className="rounded-xl border border-white/5 p-5"
                  style={{ backgroundColor: theme.card }}
                >
                  <div className="text-xs text-white/40 mb-2">{ev.sport}</div>
                  <div className="font-semibold mb-1">
                    {ev.team_a} vs {ev.team_b}
                  </div>
                  <div className="text-sm text-white/40">
                    {ev.event_date
                      ? new Date(ev.event_date).toLocaleDateString()
                      : "TBD"}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Platform events */}
        {platformEvents && platformEvents.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <Globe size={20} style={{ color: theme.primary }} /> Sports Events
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {platformEvents.map((fight: any) => (
                <div
                  key={fight.id}
                  className="rounded-xl border border-white/5 p-5"
                  style={{ backgroundColor: theme.card }}
                >
                  <div className="text-xs text-white/40 mb-2">
                    {fight.event_name}
                  </div>
                  <div className="font-semibold mb-1">
                    {fight.fighter_a_name} vs {fight.fighter_b_name}
                  </div>
                  <div className="text-sm text-white/40">{fight.title}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(!operatorEvents || operatorEvents.length === 0) &&
          (!platformEvents || platformEvents.length === 0) && (
            <div className="text-center py-20 text-white/30">
              No events available yet. Check back soon!
            </div>
          )}
      </div>

      <footer className="border-t border-white/5 py-6 text-center text-xs text-white/20">
        Powered by{" "}
        <span style={{ color: theme.primary }}>1MG.live</span>
      </footer>
    </div>
  );
}
