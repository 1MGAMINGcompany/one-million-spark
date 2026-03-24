import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-privy-token, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Minimal Privy token verification — extract DID from JWT claims. */
function extractPrivyDid(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    if (payload.iss !== "privy.io") return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

const TREASURY = "0x72F3AA1B3B0815033AD6037edC1586dE592Ed88d".toLowerCase();
const USDC_CONTRACT = "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359".toLowerCase();
const MIN_AMOUNT_RAW = BigInt(2400) * BigInt(10 ** 6); // 2400 USDC

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

// ERC-20 Transfer event topic
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function verifyTxOnChain(txHash: string): Promise<{ valid: boolean; error?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getTransactionReceipt",
          params: [txHash],
        }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;

      const receipt = json.result;

      // Check tx succeeded
      if (receipt.status !== "0x1") {
        return { valid: false, error: "tx_reverted" };
      }

      // Find USDC Transfer log to treasury with >= 2400 USDC
      const transferLog = (receipt.logs || []).find((log: any) => {
        if (log.address?.toLowerCase() !== USDC_CONTRACT) return false;
        if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) return false;
        // topics[2] = recipient (padded)
        const recipient = "0x" + (log.topics[2] || "").slice(26).toLowerCase();
        if (recipient !== TREASURY) return false;
        // data = amount
        const amount = BigInt(log.data || "0x0");
        return amount >= MIN_AMOUNT_RAW;
      });

      if (!transferLog) {
        return { valid: false, error: "no_matching_transfer" };
      }

      return { valid: true };
    } catch {
      continue;
    }
  }
  return { valid: false, error: "all_rpcs_failed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Auth
    const privyToken = req.headers.get("x-privy-token");
    if (!privyToken) return jsonResp({ error: "unauthorized" }, 401);

    const privyDid = extractPrivyDid(privyToken);
    if (!privyDid) return jsonResp({ error: "invalid_token" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    // ── confirm_purchase ──
    if (action === "confirm_purchase") {
      const txHash = body.tx_hash;
      if (!txHash || typeof txHash !== "string" || txHash.length < 60) {
        return jsonResp({ error: "invalid_tx_hash" }, 400);
      }

      // Verify on-chain
      const verification = await verifyTxOnChain(txHash);
      if (!verification.valid) {
        return jsonResp({ error: verification.error || "verification_failed" }, 400);
      }

      // Create or update operator to active
      const { data: existing } = await sb
        .from("operators")
        .select("id, status")
        .eq("user_id", privyDid)
        .maybeSingle();

      if (existing) {
        await sb.from("operators").update({
          status: "active",
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
      } else {
        // Create a minimal operator record — will be completed in onboarding
        await sb.from("operators").insert({
          user_id: privyDid,
          brand_name: "My App",
          subdomain: "pending-" + Date.now(),
          status: "active",
        });
      }

      return jsonResp({ success: true, status: "active" });
    }

    // ── get_my_operator ──
    if (action === "get_my_operator") {
      const { data: op } = await sb
        .from("operators")
        .select("*, operator_settings(*)")
        .eq("user_id", privyDid)
        .maybeSingle();
      return jsonResp({ operator: op });
    }

    // ── create_operator ──
    if (action === "create_operator") {
      // Check if already exists and is active (paid)
      const { data: existing } = await sb
        .from("operators")
        .select("id, status")
        .eq("user_id", privyDid)
        .maybeSingle();

      if (existing && existing.status !== "active") {
        return jsonResp({ error: "payment_required", operator_id: existing.id }, 402);
      }

      if (existing) {
        // Update existing operator with full details
        const { error } = await sb.from("operators").update({
          brand_name: body.brand_name,
          subdomain: body.subdomain,
          logo_url: body.logo_url || null,
          theme: body.theme || "blue",
          fee_percent: body.fee_percent ?? 5,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        if (error) throw error;

        // Upsert settings
        await sb.from("operator_settings").upsert({
          operator_id: existing.id,
          allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
          show_polymarket_events: true,
          show_platform_events: true,
        }, { onConflict: "operator_id" });

        return jsonResp({ operator: { id: existing.id } });
      }

      // Subdomain availability
      const { data: subCheck } = await sb
        .from("operators")
        .select("id")
        .eq("subdomain", body.subdomain)
        .maybeSingle();
      if (subCheck) {
        return jsonResp({ error: "subdomain_taken" }, 409);
      }

      const { data: operator, error } = await sb
        .from("operators")
        .insert({
          user_id: privyDid,
          brand_name: body.brand_name,
          subdomain: body.subdomain,
          logo_url: body.logo_url || null,
          theme: body.theme || "blue",
          fee_percent: body.fee_percent ?? 5,
          status: "pending", // Not paid yet
        })
        .select()
        .single();
      if (error) throw error;

      // Default settings
      await sb.from("operator_settings").insert({
        operator_id: operator.id,
        allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
        show_polymarket_events: true,
        show_platform_events: true,
      });

      return jsonResp({ operator });
    }

    // ── update_operator ──
    if (action === "update_operator") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.brand_name) updates.brand_name = body.brand_name;
      if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
      if (body.theme) updates.theme = body.theme;
      if (body.fee_percent !== undefined) updates.fee_percent = body.fee_percent;

      const { error } = await sb.from("operators").update(updates).eq("id", op.id);
      if (error) throw error;
      return jsonResp({ success: true });
    }

    // ── update_settings ──
    if (action === "update_settings") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { error } = await sb
        .from("operator_settings")
        .update({
          allowed_sports: body.allowed_sports,
          show_polymarket_events: body.show_polymarket_events,
          show_platform_events: body.show_platform_events,
          homepage_layout: body.homepage_layout,
          featured_event_ids: body.featured_event_ids,
        })
        .eq("operator_id", op.id);
      if (error) throw error;
      return jsonResp({ success: true });
    }

    // ── create_event ──
    if (action === "create_event") {
      const { data: op } = await sb
        .from("operators")
        .select("id")
        .eq("user_id", privyDid)
        .single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { data: event, error } = await sb
        .from("operator_events")
        .insert({
          operator_id: op.id,
          title: body.title,
          sport: body.sport,
          team_a: body.team_a,
          team_b: body.team_b,
          event_date: body.event_date || null,
          image_url: body.image_url || null,
          is_featured: body.is_featured || false,
          status: "draft",
        })
        .select()
        .single();
      if (error) throw error;
      return jsonResp({ event });
    }

    return jsonResp({ error: "unknown_action" }, 400);
  } catch (err: any) {
    return jsonResp({ error: err.message || String(err) }, 500);
  }
});
