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
// Bridged USDC.e — canonical token for all prediction money flows (including purchase)
const USDC_CONTRACT = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174".toLowerCase();
const MIN_AMOUNT_RAW = BigInt(2400) * BigInt(10 ** 6);

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

async function verifyTxOnChain(txHash: string): Promise<{ valid: boolean; error?: string }> {
  for (const rpc of POLYGON_RPCS) {
    try {
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] }),
      });
      if (!res.ok) continue;
      const json = await res.json();
      if (json.error || !json.result) continue;
      const receipt = json.result;
      if (receipt.status !== "0x1") return { valid: false, error: "tx_reverted" };
      const transferLog = (receipt.logs || []).find((log: any) => {
        if (log.address?.toLowerCase() !== USDC_CONTRACT) return false;
        if (!log.topics || log.topics[0] !== TRANSFER_TOPIC) return false;
        const recipient = "0x" + (log.topics[2] || "").slice(26).toLowerCase();
        if (recipient !== TREASURY) return false;
        return BigInt(log.data || "0x0") >= MIN_AMOUNT_RAW;
      });
      if (!transferLog) return { valid: false, error: "no_matching_transfer" };
      return { valid: true };
    } catch { continue; }
  }
  return { valid: false, error: "all_rpcs_failed" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { action } = body;

    const privyToken = req.headers.get("x-privy-token");
    if (!privyToken) return jsonResp({ error: "unauthorized" }, 401);
    const privyDid = extractPrivyDid(privyToken);
    if (!privyDid) return jsonResp({ error: "invalid_token" }, 401);

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // ── confirm_purchase ──
    if (action === "confirm_purchase") {
      const txHash = body.tx_hash;
      const promoCode = body.promo_code;

      // If promo code provided, validate and potentially skip payment
      if (promoCode) {
        const { data: promo } = await sb.from("promo_codes").select("*").eq("code", promoCode.toUpperCase()).maybeSingle();
        if (!promo) return jsonResp({ error: "invalid_promo_code" }, 400);
        if (promo.uses_count >= promo.max_uses) return jsonResp({ error: "promo_code_exhausted" }, 400);
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return jsonResp({ error: "promo_code_expired" }, 400);

        let discountedPrice = 2400;
        if (promo.discount_type === "full") discountedPrice = 0;
        else if (promo.discount_type === "percent") discountedPrice = Math.max(0, 2400 * (1 - promo.discount_value / 100));
        else if (promo.discount_type === "fixed") discountedPrice = Math.max(0, 2400 - promo.discount_value);

        if (discountedPrice === 0) {
          // Full discount — activate without payment
          await sb.from("promo_codes").update({ uses_count: promo.uses_count + 1 }).eq("id", promo.id);
          const { data: existing } = await sb.from("operators").select("id, status").eq("user_id", privyDid).maybeSingle();
          if (existing) {
            await sb.from("operators").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", existing.id);
          } else {
            await sb.from("operators").insert({ user_id: privyDid, brand_name: "My App", subdomain: "pending-" + Date.now(), status: "active" });
          }
          return jsonResp({ success: true, status: "active", promo_applied: true, amount_charged: 0 });
        }

        // Partial discount — still need tx verification but with lower amount
        // For now, just verify tx normally and increment promo usage
        if (!txHash) return jsonResp({ error: "tx_hash_required_for_partial_discount", discounted_price: discountedPrice }, 400);
        const verification = await verifyTxOnChain(txHash);
        if (!verification.valid) return jsonResp({ error: verification.error || "verification_failed" }, 400);
        await sb.from("promo_codes").update({ uses_count: promo.uses_count + 1 }).eq("id", promo.id);
        const { data: existing } = await sb.from("operators").select("id, status").eq("user_id", privyDid).maybeSingle();
        if (existing) {
          await sb.from("operators").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", existing.id);
        } else {
          await sb.from("operators").insert({ user_id: privyDid, brand_name: "My App", subdomain: "pending-" + Date.now(), status: "active" });
        }
        return jsonResp({ success: true, status: "active", promo_applied: true });
      }

      // No promo code — standard payment verification
      if (!txHash || typeof txHash !== "string" || txHash.length < 60) return jsonResp({ error: "invalid_tx_hash" }, 400);
      const verification = await verifyTxOnChain(txHash);
      if (!verification.valid) return jsonResp({ error: verification.error || "verification_failed" }, 400);
      const { data: existing } = await sb.from("operators").select("id, status").eq("user_id", privyDid).maybeSingle();
      if (existing) {
        await sb.from("operators").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", existing.id);
      } else {
        await sb.from("operators").insert({ user_id: privyDid, brand_name: "My App", subdomain: "pending-" + Date.now(), status: "active" });
      }
      return jsonResp({ success: true, status: "active" });
    }

    // ── check_subdomain ──
    if (action === "check_subdomain") {
      const sub = body.subdomain;
      if (!sub || typeof sub !== "string" || sub.length < 3) return jsonResp({ available: false, error: "too_short" });
      const reserved = ["www", "api", "admin", "app", "dashboard", "help", "support", "mail"];
      if (reserved.includes(sub)) return jsonResp({ available: false, error: "reserved" });
      const { data } = await sb.from("operators").select("id").eq("subdomain", sub).maybeSingle();
      return jsonResp({ available: !data });
    }

    // ── get_my_operator ──
    if (action === "get_my_operator") {
      const { data: op } = await sb.from("operators").select("*, operator_settings(*)").eq("user_id", privyDid).maybeSingle();
      return jsonResp({ operator: op });
    }

    // ── create_operator ──
    if (action === "create_operator") {
      const { data: existing } = await sb.from("operators").select("id, status").eq("user_id", privyDid).maybeSingle();
      if (existing && existing.status !== "active") return jsonResp({ error: "payment_required", operator_id: existing.id }, 402);
      if (existing) {
        await sb.from("operators").update({
          brand_name: body.brand_name, subdomain: body.subdomain, logo_url: body.logo_url || null,
          theme: body.theme || "blue", fee_percent: body.fee_percent ?? 5, updated_at: new Date().toISOString(),
        }).eq("id", existing.id);
        await sb.from("operator_settings").upsert({
          operator_id: existing.id, allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
          show_polymarket_events: true, show_platform_events: true,
        }, { onConflict: "operator_id" });
        return jsonResp({ operator: { id: existing.id } });
      }
      const { data: subCheck } = await sb.from("operators").select("id").eq("subdomain", body.subdomain).maybeSingle();
      if (subCheck) return jsonResp({ error: "subdomain_taken" }, 409);
      const { data: operator, error } = await sb.from("operators").insert({
        user_id: privyDid, brand_name: body.brand_name, subdomain: body.subdomain,
        logo_url: body.logo_url || null, theme: body.theme || "blue", fee_percent: body.fee_percent ?? 5, status: "pending",
      }).select().single();
      if (error) throw error;
      await sb.from("operator_settings").insert({
        operator_id: operator.id, allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
        show_polymarket_events: true, show_platform_events: true,
      });
      return jsonResp({ operator });
    }

    // ── update_operator ──
    if (action === "update_operator") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.brand_name) updates.brand_name = body.brand_name;
      if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
      if (body.theme) updates.theme = body.theme;
      if (body.fee_percent !== undefined) updates.fee_percent = body.fee_percent;
      await sb.from("operators").update(updates).eq("id", op.id);
      return jsonResp({ success: true });
    }

    // ── update_settings ──
    if (action === "update_settings") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      await sb.from("operator_settings").update({
        allowed_sports: body.allowed_sports, show_polymarket_events: body.show_polymarket_events,
        show_platform_events: body.show_platform_events, homepage_layout: body.homepage_layout,
        featured_event_ids: body.featured_event_ids,
      }).eq("operator_id", op.id);
      return jsonResp({ success: true });
    }

    // ── create_event ── (auto-creates prediction_fight)
    if (action === "create_event") {
      const { data: op } = await sb.from("operators").select("id, fee_percent, brand_name").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const { data: event, error: evErr } = await sb.from("operator_events").insert({
        operator_id: op.id, title: body.title, sport: body.sport, team_a: body.team_a,
        team_b: body.team_b, event_date: body.event_date || null, image_url: body.image_url || null,
        is_featured: body.is_featured || false, status: "open",
      }).select().single();
      if (evErr) throw evErr;
      const commissionBps = Math.round((op.fee_percent + 1) * 100);
      const { data: fight, error: fightErr } = await sb.from("prediction_fights").insert({
        title: body.title, fighter_a_name: body.team_a, fighter_b_name: body.team_b,
        event_name: body.title, status: "open", source: "operator", trading_allowed: true,
        operator_id: op.id, operator_event_id: event.id, commission_bps: commissionBps,
        featured: body.is_featured || false,
      }).select("id").single();
      if (fightErr) console.error("[operator-manage] Failed to create prediction_fight:", fightErr);
      return jsonResp({ event, fight_id: fight?.id || null });
    }

    // ── close_event ── (lock predictions)
    if (action === "close_event") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const fightId = body.fight_id;
      if (fightId) {
        // Verify ownership
        const { data: fight } = await sb.from("prediction_fights").select("id, operator_id, status").eq("id", fightId).single();
        if (!fight || fight.operator_id !== op.id) return jsonResp({ error: "not_your_event" }, 403);
        if (fight.status !== "open") return jsonResp({ error: "already_closed" }, 400);
        await sb.from("prediction_fights").update({ status: "locked", trading_allowed: false, updated_at: new Date().toISOString() }).eq("id", fightId);
      }
      await sb.from("operator_events").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", body.event_id).eq("operator_id", op.id);
      return jsonResp({ success: true });
    }

    // ── settle_event ── (set winner + trigger settlement)
    if (action === "settle_event") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const { fight_id, winner } = body;
      if (!fight_id || !winner) return jsonResp({ error: "fight_id and winner required" }, 400);
      if (!["fighter_a", "fighter_b", "draw"].includes(winner)) return jsonResp({ error: "invalid winner value" }, 400);

      // Verify ownership + status
      const { data: fight } = await sb.from("prediction_fights")
        .select("id, operator_id, status, winner, settled_at")
        .eq("id", fight_id).single();
      if (!fight || fight.operator_id !== op.id) return jsonResp({ error: "not_your_event" }, 403);
      if (fight.settled_at) return jsonResp({ error: "already_settled" }, 400);
      if (fight.winner) return jsonResp({ error: "winner_already_set" }, 400);

      const now = new Date().toISOString();

      if (winner === "draw") {
        // Draw = refund scenario — mark as cancelled/refund
        await sb.from("prediction_fights").update({
          status: "cancelled", winner: "draw", trading_allowed: false,
          refund_status: "pending", updated_at: now,
        }).eq("id", fight_id);
        await sb.from("operator_events").update({ status: "settled", updated_at: now })
          .eq("id", body.event_id).eq("operator_id", op.id);
        return jsonResp({ success: true, outcome: "draw_refund_pending" });
      }

      // Set winner + mark as confirmed (auto-claim worker picks it up)
      const claimsOpenAt = new Date(Date.now() + 3 * 60 * 1000).toISOString(); // 3 min buffer
      await sb.from("prediction_fights").update({
        winner, status: "confirmed", confirmed_at: now, claims_open_at: claimsOpenAt,
        trading_allowed: false, updated_at: now,
      }).eq("id", fight_id).eq("status", fight.status); // CAS guard

      await sb.from("operator_events").update({ status: "settled", updated_at: now })
        .eq("id", body.event_id).eq("operator_id", op.id);

      // Log settlement
      await sb.from("automation_logs").insert({
        action: "operator_settle_event", fight_id, source: "operator-manage",
        details: { winner, operator_id: op.id, settled_by: privyDid },
      });

      return jsonResp({ success: true, outcome: "settled", winner });
    }

    // ── request_withdrawal ──
    if (action === "request_withdrawal") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      // Calculate available balance
      const { data: revData } = await sb.from("operator_revenue").select("operator_fee_usdc").eq("operator_id", op.id);
      const totalEarned = (revData || []).reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);

      const { data: payData } = await sb.from("operator_payouts").select("amount_usdc, status").eq("operator_id", op.id);
      const totalPaid = (payData || []).reduce((s: number, r: any) => s + Number(r.amount_usdc || 0), 0);

      const available = Math.max(0, totalEarned - totalPaid);
      if (available < 0.01) return jsonResp({ error: "insufficient_balance" }, 400);

      await sb.from("operator_payouts").insert({
        operator_id: op.id, amount_usdc: available, status: "pending",
      });

      return jsonResp({ success: true, amount: available });
    }

    // ── list_all_operators (admin) ──
    if (action === "list_all_operators") {
      const { data } = await sb.from("operators").select("*, operator_settings(*)").order("created_at", { ascending: false });
      return jsonResp({ operators: data || [] });
    }

    return jsonResp({ error: "unknown_action" }, 400);
  } catch (err: any) {
    return jsonResp({ error: err.message || String(err) }, 500);
  }
});
