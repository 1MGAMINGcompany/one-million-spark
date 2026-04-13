import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Zap, Search, Building2, ImageIcon } from "lucide-react";
import { getTeamLogo } from "@/lib/teamLogos";

const SPORT_GROUPS = [
  {
    label: "🇺🇸 American Sports",
    sports: ["NBA", "NFL", "NHL", "MLB", "MLS", "NCAAB", "CWBB"],
  },
  {
    label: "⚽ Soccer",
    sports: [
      "Soccer", "EPL", "La Liga", "Bundesliga", "Serie A", "Ligue 1",
      "UCL", "UEL", "Copa Libertadores", "Liga MX", "Brazil Série A",
      "Eredivisie", "Primeira Liga", "Saudi Pro League", "K-League",
      "J-League", "A-League",
    ],
  },
  {
    label: "🥊 Combat",
    sports: ["UFC", "MMA", "Boxing", "Muay Thai", "Bare Knuckle", "Kickboxing", "BKFC"],
  },
  {
    label: "🎾 Racket & Individual",
    sports: ["Tennis", "Table Tennis", "Golf", "Pickleball"],
  },
  {
    label: "🏏 Cricket & Rugby",
    sports: ["Cricket IPL", "Cricket PSL", "Cricket International", "Rugby"],
  },
  {
    label: "🏒 Hockey (Other)",
    sports: ["KHL", "SHL", "AHL"],
  },
  {
    label: "🏀 Basketball (Other)",
    sports: ["EuroLeague"],
  },
  {
    label: "🏎️ Motorsport & Other",
    sports: ["Formula 1", "Chess", "Wrestling"],
  },
];

const VISIBILITY_OPTIONS = [
  { value: "flagship", label: "1MGAMING.com only" },
  { value: "platform", label: "1MG.live only" },
  { value: "all", label: "Both" },
  { value: "operator", label: "Specific operator app" },
] as const;

interface OperatorOption {
  id: string;
  brand_name: string;
  subdomain: string;
}

/** Small image preview with onError fallback */
function ImagePreview({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return null;
  return (
    <div className="flex items-center gap-1.5 mt-1">
      <img
        src={url}
        alt={label}
        className="w-8 h-8 rounded object-contain border border-border"
        onError={() => setFailed(true)}
      />
      <span className="text-[10px] text-green-400">✓ Preview OK</span>
    </div>
  );
}

export default function PlatformEventCreator({ wallet, defaultVisibility = "all" }: { wallet: string; defaultVisibility?: string }) {
  const [sport, setSport] = useState("Soccer");
  const [league, setLeague] = useState("");
  const [teamA, setTeamA] = useState("");
  const [teamB, setTeamB] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [featured, setFeatured] = useState(false);
  const [drawAllowed, setDrawAllowed] = useState(false);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [creating, setCreating] = useState(false);

  // Image URL state
  const [photoA, setPhotoA] = useState("");
  const [photoB, setPhotoB] = useState("");
  const [showImages, setShowImages] = useState(false);

  // Operator selection state
  const [operators, setOperators] = useState<OperatorOption[]>([]);
  const [operatorSearch, setOperatorSearch] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<OperatorOption | null>(null);
  const [loadingOperators, setLoadingOperators] = useState(false);

  // Load operators when "operator" visibility is selected
  useEffect(() => {
    if (visibility !== "operator") {
      setSelectedOperator(null);
      return;
    }
    if (operators.length > 0) return;
    setLoadingOperators(true);
    (supabase as any)
      .from("operators")
      .select("id, brand_name, subdomain")
      .eq("status", "active")
      .order("brand_name")
      .then(({ data, error }: any) => {
        if (!error && data) setOperators(data);
        setLoadingOperators(false);
      });
  }, [visibility]);

  const filteredOperators = operators.filter(
    (op) =>
      op.brand_name.toLowerCase().includes(operatorSearch.toLowerCase()) ||
      op.subdomain.toLowerCase().includes(operatorSearch.toLowerCase())
  );

  const handleCreate = async () => {
    if (!teamA.trim() || !teamB.trim()) { toast.error("Both teams/fighters required"); return; }
    if (!eventDate) { toast.error("Event date/time is required"); return; }
    if (visibility === "operator" && !selectedOperator) { toast.error("Please select an operator"); return; }
    setCreating(true);
    try {
      const title = `${teamA.trim()} vs ${teamB.trim()}`;
      const eventName = league ? `${league} — ${title}` : title;

      const logoA = getTeamLogo(teamA.trim(), sport);
      const logoB = getTeamLogo(teamB.trim(), sport);

      // When targeting a specific operator, set visibility to "platform"
      const effectiveVisibility = visibility === "operator" ? "platform" : visibility;

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
          fighter_a_photo: photoA.trim() || null,
          fighter_b_photo: photoB.trim() || null,
          visibility: effectiveVisibility,
          operator_id: selectedOperator?.id || null,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      const targetLabel = selectedOperator ? `for ${selectedOperator.brand_name}` : "";
      toast.success(`"${title}" is now live ${targetLabel}!`);
      setTeamA("");
      setTeamB("");
      setLeague("");
      setEventDate("");
      setFeatured(false);
      setDrawAllowed(false);
      setSelectedOperator(null);
      setOperatorSearch("");
      setPhotoA("");
      setPhotoB("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

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
            {SPORT_GROUPS.map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.sports.map(s => <option key={s} value={s}>{s}</option>)}
              </optgroup>
            ))}
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

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Event Date/Time <span className="text-red-400">*</span></label>
          <Input
            type="datetime-local"
            value={eventDate}
            onChange={e => setEventDate(e.target.value)}
            className="text-foreground"
            required
          />
        </div>

        {/* Image URL section — collapsible */}
        <div>
          <button
            type="button"
            onClick={() => setShowImages(!showImages)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            {showImages ? "Hide" : "Add"} fighter/team images (optional)
          </button>
          {showImages && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <Input
                  value={photoA}
                  onChange={e => setPhotoA(e.target.value)}
                  placeholder="Image URL — Fighter/Team A"
                  className="text-xs"
                />
                <ImagePreview url={photoA.trim()} label="Fighter A" />
              </div>
              <div>
                <Input
                  value={photoB}
                  onChange={e => setPhotoB(e.target.value)}
                  placeholder="Image URL — Fighter/Team B"
                  className="text-xs"
                />
                <ImagePreview url={photoB.trim()} label="Fighter B" />
              </div>
              <p className="col-span-2 text-[10px] text-muted-foreground">
                Paste direct image URLs (png, jpg, webp). These override auto-detected logos.
              </p>
            </div>
          )}
        </div>

        {/* Visibility selector */}
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Visibility</label>
          <select
            value={visibility}
            onChange={e => { setVisibility(e.target.value); setSelectedOperator(null); }}
            className="bg-background border border-border rounded-md h-10 px-3 text-sm text-foreground w-full"
          >
            {VISIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Operator picker — only when "Specific operator app" selected */}
        {visibility === "operator" && (
          <div className="border border-border rounded-md p-3 space-y-2 bg-secondary/30">
            <label className="text-xs text-muted-foreground flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Select operator
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                value={operatorSearch}
                onChange={e => setOperatorSearch(e.target.value)}
                placeholder="Search by name or slug..."
                className="pl-8"
              />
            </div>
            {loadingOperators ? (
              <p className="text-xs text-muted-foreground">Loading operators…</p>
            ) : (
              <div className="max-h-32 overflow-y-auto space-y-1">
                {filteredOperators.length === 0 && (
                  <p className="text-xs text-muted-foreground py-1">No operators found</p>
                )}
                {filteredOperators.map(op => (
                  <button
                    key={op.id}
                    type="button"
                    onClick={() => setSelectedOperator(op)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedOperator?.id === op.id
                        ? "bg-primary/20 text-primary border border-primary/30"
                        : "hover:bg-secondary text-foreground"
                    }`}
                  >
                    <span className="font-medium">{op.brand_name}</span>
                    <span className="text-muted-foreground ml-1">/{op.subdomain}</span>
                  </button>
                ))}
              </div>
            )}
            {selectedOperator && (
              <p className="text-xs text-green-400">
                ✓ Will appear in <strong>{selectedOperator.brand_name}</strong> (/{selectedOperator.subdomain})
              </p>
            )}
          </div>
        )}

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

        <Button onClick={handleCreate} disabled={creating || !teamA.trim() || !teamB.trim() || !eventDate || (visibility === "operator" && !selectedOperator)} className="w-full gap-2">
          <Plus className="w-4 h-4" /> {creating ? "Creating..." : "Create & Go Live"}
        </Button>
      </div>
    </Card>
  );
}