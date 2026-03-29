import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Zap } from "lucide-react";
import { getTeamLogo } from "@/lib/teamLogos";

const SPORTS = ["Soccer", "MMA", "Boxing", "NFL", "NBA", "NHL", "MLB", "NCAA", "Tennis", "Golf", "Muay Thai", "Bare Knuckle"];

export default function PlatformEventCreator({ wallet }: { wallet: string }) {
  const [sport, setSport] = useState("Soccer");
  const [league, setLeague] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [featured, setFeatured] = useState(false);
  const [drawAllowed, setDrawAllowed] = useState(false);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!teamA.trim() || !teamB.trim()) { toast.error("Both teams/fighters required"); return; }
    setCreating(true);
    try {
      const title = `${teamA.trim()} vs ${teamB.trim()}`;
      const eventName = league ? `${league} — ${title}` : title;

      // Auto-detect logos
      const logoA = getTeamLogo(teamA.trim(), sport);
      const logoB = getTeamLogo(teamB.trim(), sport);

      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: {
          action: "createPlatformFight",
          wallet,
          title,
          event_name: eventName,
          fighter_a_name: teamA.trim(),
          fighter_b_name: teamB.trim(),
          sport: sport.toUpperCase(),
          event_date: eventDate || null,
          featured,
          draw_allowed: drawAllowed,
          home_logo: logoA?.url || null,
          away_logo: logoB?.url || null,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`"${title}" is now live!`);
      setTeamA("");
      setTeamB("");
      setLeague("");
      setEventDate("");
      setFeatured(false);
      setDrawAllowed(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  // Preview logos
  const previewA = teamA.trim() ? getTeamLogo(teamA.trim(), sport) : null;
  const previewB = teamB.trim() ? getTeamLogo(teamB.trim(), sport) : null;

  return (
    <Card className="bg-card border-border/50 p-4">
      <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <Zap className="w-4 h-4 text-primary" /> Quick Platform Event
      </h2>
      <p className="text-xs text-muted-foreground mb-3">
        Create a platform event instantly. Goes live immediately with trading enabled.
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={sport}
            onChange={e => setSport(e.target.value)}
            className="bg-background border border-border rounded-md h-10 px-3 text-sm text-foreground"
          >
            {SPORTS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <Input
            value={league}
            onChange={e => setLeague(e.target.value)}
            placeholder="League (optional)"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Input
              value={teamA}
              onChange={e => setTeamA(e.target.value)}
              placeholder="Team / Fighter A"
            />
            {previewA && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-green-400">
                {previewA.emoji && <span>{previewA.emoji}</span>}
                {previewA.url && <img src={previewA.url} className="w-4 h-4 object-contain" alt="" />}
                <span>Logo found</span>
              </div>
            )}
          </div>
          <div>
            <Input
              value={teamB}
              onChange={e => setTeamB(e.target.value)}
              placeholder="Team / Fighter B"
            />
            {previewB && (
              <div className="flex items-center gap-1 mt-1 text-[10px] text-green-400">
                {previewB.emoji && <span>{previewB.emoji}</span>}
                {previewB.url && <img src={previewB.url} className="w-4 h-4 object-contain" alt="" />}
                <span>Logo found</span>
              </div>
            )}
          </div>
        </div>

        <Input
          type="datetime-local"
          value={eventDate}
          onChange={e => setEventDate(e.target.value)}
          className="text-foreground"
        />

        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={featured} onCheckedChange={v => setFeatured(v === true)} />
            Featured
          </label>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
            <Checkbox checked={drawAllowed} onCheckedChange={v => setDrawAllowed(v === true)} />
            Draw allowed
          </label>
        </div>

        <Button onClick={handleCreate} disabled={creating || !teamA.trim() || !teamB.trim()} className="w-full gap-2">
          <Plus className="w-4 h-4" /> {creating ? "Creating..." : "Create & Go Live"}
        </Button>
      </div>
    </Card>
  );
}
