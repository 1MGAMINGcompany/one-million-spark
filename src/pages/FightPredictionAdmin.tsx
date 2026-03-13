import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Shield, Plus, Lock, Trophy, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWallet } from "@/hooks/useWallet";
import { toast } from "sonner";

interface Fight {
  id: string;
  title: string;
  fighter_a_name: string;
  fighter_b_name: string;
  pool_a_lamports: number;
  pool_b_lamports: number;
  status: string;
  winner: string | null;
  event_name: string;
}

const LAMPORTS = 1_000_000_000;

export default function FightPredictionAdmin() {
  const { address } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fights, setFights] = useState<Fight[]>([]);
  const [busy, setBusy] = useState(false);

  // Form state
  const [title, setTitle] = useState("");
  const [fighterA, setFighterA] = useState("");
  const [fighterB, setFighterB] = useState("");
  const [eventName, setEventName] = useState("Silvertooth Promotions");

  // Check admin
  useEffect(() => {
    if (!address) {
      setIsAdmin(false);
      setLoading(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("prediction_admins")
        .select("wallet")
        .eq("wallet", address)
        .maybeSingle();
      setIsAdmin(!!data);
      setLoading(false);
    })();
  }, [address]);

  // Load fights
  const loadFights = useCallback(async () => {
    const { data } = await supabase
      .from("prediction_fights")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setFights(data as any);
  }, []);

  useEffect(() => {
    if (isAdmin) loadFights();
  }, [isAdmin, loadFights]);

  const callAdmin = async (action: string, extra: Record<string, any> = {}) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action, wallet: address, ...extra },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!title || !fighterA || !fighterB) {
      toast.error("Fill in all fields");
      return;
    }
    try {
      await callAdmin("createFight", {
        title,
        fighter_a_name: fighterA,
        fighter_b_name: fighterB,
        event_name: eventName,
      });
      toast.success("Fight created!");
      setTitle("");
      setFighterA("");
      setFighterB("");
      loadFights();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleLock = async (fightId: string) => {
    try {
      await callAdmin("lockPredictions", { fight_id: fightId });
      toast.success("Predictions locked!");
      loadFights();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleResolve = async (fightId: string, winner: string) => {
    try {
      await callAdmin("resolveFight", { fight_id: fightId, winner });
      toast.success("Fight resolved!");
      loadFights();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pt-16">
        <div className="text-center">
          <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">Admin access required.</p>
          {address && (
            <p className="text-xs text-muted-foreground/60 mt-1 font-mono">{address}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 px-4 pb-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold text-foreground font-['Cinzel'] mb-6 flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          Prediction Admin
        </h1>

        {/* Create Fight */}
        <Card className="bg-card border-border/50 p-4 mb-6">
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
            <Plus className="w-4 h-4 text-primary" />
            Create Fight
          </h2>
          <div className="space-y-3">
            <Input
              placeholder="Fight title (e.g. Main Event)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                placeholder="Fighter A name"
                value={fighterA}
                onChange={(e) => setFighterA(e.target.value)}
              />
              <Input
                placeholder="Fighter B name"
                value={fighterB}
                onChange={(e) => setFighterB(e.target.value)}
              />
            </div>
            <Input
              placeholder="Event name"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
            />
            <Button
              className="w-full bg-primary text-primary-foreground"
              onClick={handleCreate}
              disabled={busy}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create Fight
            </Button>
          </div>
        </Card>

        {/* Existing Fights */}
        <div className="space-y-3">
          {fights.map((fight) => (
            <Card key={fight.id} className="bg-card border-border/50 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-bold text-foreground text-sm">{fight.title}</h3>
                  <p className="text-xs text-muted-foreground">
                    {fight.fighter_a_name} vs {fight.fighter_b_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Pool: {((fight.pool_a_lamports + fight.pool_b_lamports) / LAMPORTS).toFixed(2)} SOL
                  </p>
                </div>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    fight.status === "open"
                      ? "bg-green-500/20 text-green-400"
                      : fight.status === "locked"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-primary/20 text-primary"
                  }`}
                >
                  {fight.status.toUpperCase()}
                </span>
              </div>

              <div className="flex gap-2 mt-3">
                {fight.status === "open" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleLock(fight.id)}
                    disabled={busy}
                    className="border-yellow-500/50 text-yellow-400 hover:bg-yellow-500/10"
                  >
                    <Lock className="w-3 h-3 mr-1" />
                    Lock
                  </Button>
                )}
                {fight.status === "locked" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() => handleResolve(fight.id, "fighter_a")}
                      disabled={busy}
                      className="bg-primary/20 text-primary hover:bg-primary/30"
                    >
                      <Trophy className="w-3 h-3 mr-1" />
                      {fight.fighter_a_name} Wins
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleResolve(fight.id, "fighter_b")}
                      disabled={busy}
                      className="bg-primary/20 text-primary hover:bg-primary/30"
                    >
                      <Trophy className="w-3 h-3 mr-1" />
                      {fight.fighter_b_name} Wins
                    </Button>
                  </>
                )}
                {fight.status === "resolved" && (
                  <p className="text-xs text-muted-foreground">
                    Winner: {fight.winner === "fighter_a" ? fight.fighter_a_name : fight.fighter_b_name}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
