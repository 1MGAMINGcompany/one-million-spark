import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tag, Plus, Trash2, Copy } from "lucide-react";

interface PromoCode {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number;
  uses_count: number;
  expires_at: string | null;
  created_at: string;
  created_by: string | null;
}

export default function PromoCodeManager({ wallet }: { wallet: string }) {
  const [codes, setCodes] = useState<PromoCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [newCode, setNewCode] = useState("");
  const [discountType, setDiscountType] = useState<"full" | "percent" | "fixed">("full");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState("");

  const loadCodes = useCallback(async () => {
    const { data } = await (supabase as any)
      .from("promo_codes")
      .select("*")
      .order("created_at", { ascending: false });
    setCodes(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadCodes(); }, [loadCodes]);

  const handleCreate = async () => {
    if (!newCode.trim()) { toast.error("Code is required"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: {
          action: "createPromoCode",
          wallet,
          code: newCode.trim().toUpperCase(),
          discount_type: discountType,
          discount_value: discountType === "full" ? 2400 : Number(discountValue) || 0,
          max_uses: Number(maxUses) || 1,
          expires_at: expiresAt || null,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Promo code "${newCode.trim().toUpperCase()}" created`);
      setNewCode("");
      setDiscountValue("");
      setMaxUses("1");
      setExpiresAt("");
      loadCodes();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string, code: string) => {
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: { action: "deletePromoCode", wallet, promo_id: id },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`"${code}" deleted`);
      loadCodes();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const formatDiscount = (c: PromoCode) => {
    if (c.discount_type === "full") return "FREE (100%)";
    if (c.discount_type === "percent") return `${c.discount_value}% off`;
    return `$${c.discount_value} off`;
  };

  return (
    <Card className="bg-card border-border/50 p-4">
      <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
        <Tag className="w-4 h-4 text-primary" /> Promo Codes
      </h2>

      {/* Create form */}
      <div className="space-y-3 mb-4 p-3 bg-muted/10 border border-border/30 rounded-lg">
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={newCode}
            onChange={e => setNewCode(e.target.value)}
            placeholder="CODE"
            className="uppercase font-mono"
          />
          <select
            value={discountType}
            onChange={e => setDiscountType(e.target.value as any)}
            className="bg-background border border-border rounded-md h-10 px-3 text-sm text-foreground"
          >
            <option value="full">Full (free)</option>
            <option value="percent">Percent off</option>
            <option value="fixed">Fixed $ off</option>
          </select>
        </div>
        {discountType !== "full" && (
          <Input
            type="number"
            value={discountValue}
            onChange={e => setDiscountValue(e.target.value)}
            placeholder={discountType === "percent" ? "e.g. 50 for 50%" : "e.g. 500 for $500 off"}
          />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            value={maxUses}
            onChange={e => setMaxUses(e.target.value)}
            placeholder="Max uses"
          />
          <Input
            type="datetime-local"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
          />
        </div>
        <Button onClick={handleCreate} disabled={creating || !newCode.trim()} size="sm" className="w-full gap-2">
          <Plus className="w-4 h-4" /> {creating ? "Creating..." : "Create Promo Code"}
        </Button>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
      ) : codes.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No promo codes yet.</p>
      ) : (
        <div className="space-y-2">
          {codes.map(c => (
            <div key={c.id} className="flex items-center justify-between bg-background/50 border border-border/30 rounded-lg p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-foreground">{c.code}</span>
                  <button onClick={() => { navigator.clipboard.writeText(c.code); toast.success("Copied"); }} className="text-muted-foreground hover:text-foreground">
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                  <span className="font-bold text-primary">{formatDiscount(c)}</span>
                  <span>{c.uses_count}/{c.max_uses} used</span>
                  {c.expires_at && <span>Exp: {new Date(c.expires_at).toLocaleDateString()}</span>}
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id, c.code)} className="text-destructive hover:text-destructive h-8 w-8 p-0">
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
