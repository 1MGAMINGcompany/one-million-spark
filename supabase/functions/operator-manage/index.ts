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
const BASE_PRICE_USDC = 2400;
const USDC_DECIMALS = BigInt(10 ** 6);
const CENTS_TO_USDC_RAW = BigInt(10 ** 4);
const FULL_PRICE_RAW = BigInt(BASE_PRICE_USDC) * USDC_DECIMALS;

const POLYGON_RPCS = [
  "https://polygon-bor-rpc.publicnode.com",
  "https://polygon.drpc.org",
  "https://rpc.ankr.com/polygon",
];

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

function calculateDiscountedCents(promo: { discount_type: string; discount_value: number }): number {
  const baseCents = BASE_PRICE_USDC * 100;
  if (promo.discount_type === "full") return 0;
  if (promo.discount_type === "percent") {
    return Math.max(0, Math.round(baseCents * (1 - Number(promo.discount_value || 0) / 100)));
  }
  if (promo.discount_type === "fixed") {
    return Math.max(0, baseCents - Math.round(Number(promo.discount_value || 0) * 100));
  }
  return baseCents;
}

function centsToUsdc(cents: number): number {
  return cents / 100;
}

function centsToRaw(cents: number): bigint {
  return BigInt(cents) * CENTS_TO_USDC_RAW;
}

const ALLOWED_SPORTS_SET = new Set([
  "NFL", "NBA", "NHL", "SOCCER", "MMA", "BOXING", "MLB", "TENNIS",
  "GOLF", "NCAA", "CRICKET", "F1", "NASCAR", "MLS",
  "UFC", "FUTBOL", "PGA", "FORMULA 1", "BARE KNUCKLE", "BKFC",
]);

// ── Operator-purchase referral commission tiers ──
// Configurable per price tier. Future: add { price: 24000, commission: 4000 }.
const COMMISSION_BY_PRICE: Array<{ price: number; commission: number }> = [
  { price: 2400, commission: 400 },
];

/**
 * Best-effort: validates a referral code against player_profiles, guards against
 * self-referral, stamps the operator row (idempotent), and inserts a commission
 * event into operator_purchase_referrals. NEVER throws — purchase must succeed
 * even if attribution fails.
 */
// deno-lint-ignore no-explicit-any
async function recordReferralBestEffort(sb: any, opts: {
  operatorId: string;
  privyDid: string;
  referralCode?: string | null;
  txHash?: string | null;
  amountCharged: number;
}) {
  try {
    const code = opts.referralCode?.trim().toUpperCase();
    if (!code) return;

    // Validate against existing player_profiles referral_code namespace
    const { data: refProfile } = await sb
      .from("player_profiles")
      .select("wallet, referral_code")
      .eq("referral_code", code)
      .maybeSingle();
    if (!refProfile) return; // unknown code — silent ignore

    // Self-referral guard via payout_wallet comparison
    const { data: opRow } = await sb
      .from("operators")
      .select("payout_wallet")
      .eq("id", opts.operatorId)
      .maybeSingle();
    if (
      opRow?.payout_wallet &&
      opRow.payout_wallet.toLowerCase() === refProfile.wallet.toLowerCase()
    ) {
      return; // self-referral
    }

    const tier = COMMISSION_BY_PRICE.find((t) => t.price === opts.amountCharged);
    const commission = tier?.commission ?? 0;

    // Idempotent stamp on operator row (only if referral_code not already set)
    await sb.from("operators").update({
      referral_code: code,
      referred_by_wallet: refProfile.wallet,
    }).eq("id", opts.operatorId).is("referral_code", null);

    // Commission event
    await sb.from("operator_purchase_referrals").insert({
      operator_id: opts.operatorId,
      referral_code: code,
      referred_by_wallet: refProfile.wallet,
      purchase_tx_hash: opts.txHash ?? null,
      purchase_amount_usdc: opts.amountCharged,
      commission_usdc: commission,
      payout_status: "accrued",
    });
    console.log("[referral] recorded", { operator: opts.operatorId, code, commission });
  } catch (e) {
    console.error("[referral] best-effort insert failed:", e);
    // NEVER throw
  }
}

async function sendWelcomeEmail(slug: string, feePercent: number) {
  if (!RESEND_API_KEY) { console.warn("[email] RESEND_API_KEY not set, skipping"); return; }
  const operatorUrl = `https://1mg.live/${slug}`;
  const dashboardUrl = `https://1mg.live/dashboard`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#06080f;color:#fff;border-radius:16px">
    <h1 style="color:#d4a017;font-size:24px">🎉 Welcome to 1MG.live!</h1>
    <p style="color:#ccc">Your branded predictions platform is ready right now.</p>
    <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;margin:16px 0">
      <p style="margin:4px 0;color:#fff"><strong>Your Platform:</strong> <a href="${operatorUrl}" style="color:#3b82f6">${operatorUrl}</a></p>
      <p style="margin:4px 0;color:#fff"><strong>Dashboard:</strong> <a href="${dashboardUrl}" style="color:#3b82f6">${dashboardUrl}</a></p>
      <p style="margin:4px 0;color:#fff"><strong>Your Fee:</strong> ${feePercent}% on every prediction</p>
    </div>
    <h3 style="color:#d4a017">Quick Start Guide:</h3>
    <ol style="color:#ccc;padding-left:20px">
      <li>Visit your dashboard to customize your platform</li>
      <li>100+ live sports events are already loaded</li>
      <li>Share your platform link with your audience</li>
      <li>Earn ${feePercent}% on every prediction placed</li>
    </ol>
    <p style="color:#888;font-size:12px;margin-top:24px">Questions? Contact: <a href="mailto:1mgaming@proton.me" style="color:#3b82f6">1mgaming@proton.me</a></p>
    <p style="color:#555;font-size:11px;margin-top:12px">Powered by 1MG.live — The World's Sports Prediction Platform</p>
  </div>`;

  // Notify admin about new operator
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "1MG.live <noreply@1mg.live>",
        to: ["1mgaming@proton.me"],
        subject: `🎉 New Operator Activated: ${slug}`,
        html: `<div style="font-family:Arial,sans-serif;padding:16px;background:#111;color:#fff;border-radius:12px">
          <h2 style="color:#d4a017">New Operator Activated</h2>
          <p>Slug: <strong>${slug}</strong></p>
          <p>Fee: ${feePercent}%</p>
          <p>Platform: <a href="${operatorUrl}" style="color:#3b82f6">${operatorUrl}</a></p>
          <p>Dashboard: <a href="${dashboardUrl}" style="color:#3b82f6">${dashboardUrl}</a></p>
          <p style="color:#888;font-size:11px;margin-top:16px">Automated notification from 1MG.live</p>
        </div>`,
      }),
    });
    console.log(`[email] Admin notified about new operator: ${slug}`);
  } catch (e) { console.error("[email] admin notify failed:", e); }
}

async function verifyTxOnChain(txHash: string, minAmountRaw: bigint): Promise<{ valid: boolean; error?: string }> {
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
        return BigInt(log.data || "0x0") >= minAmountRaw;
      });
      if (!transferLog) return { valid: false, error: "no_matching_transfer" };
      return { valid: true };
    } catch { continue; }
  }
  return { valid: false, error: "all_rpcs_failed" };
}

// deno-lint-ignore no-explicit-any
function chooseCanonicalOperator(rows: any[] = []) {
  if (!rows.length) return null;
  const isConfigured = (op: any) => op?.status === "active" && op?.subdomain && !String(op.subdomain).startsWith("pending-");
  return rows.find(isConfigured)
    || rows.find((op) => op?.status === "active")
    || rows.find((op) => op?.status === "pending")
    || rows[0]
    || null;
}

// deno-lint-ignore no-explicit-any
async function fetchCanonicalOperator(sb: any, privyDid: string, select = "id, status, subdomain, fee_percent, created_at") {
  const { data, error } = await sb
    .from("operators")
    .select(select)
    .eq("user_id", privyDid)
    .order("created_at", { ascending: false });
  if (error) return { op: null, error };
  if ((data || []).length > 1) console.warn("[operator-manage] multiple operators found for user; selected canonical operator", { privyDid, count: data.length });
  return { op: chooseCanonicalOperator(data || []), error: null };
}

// deno-lint-ignore no-explicit-any
async function activatePurchasedOperator(sb: any, privyDid: string, txHash: string | null) {
  const { op: existing, error: lookupErr } = await fetchCanonicalOperator(sb, privyDid, "id, status, subdomain, fee_percent, created_at");
  if (lookupErr) return { error: "operator_lookup_failed", message: "Your account could not be activated. Please contact support." };

  let operatorId: string | null = null;
  let slug = "your-app";
  let feePercent = 5;

  if (existing) {
    const { error: updateErr } = await sb
      .from("operators")
      .update({ status: "active", ...(txHash ? { purchase_tx_hash: txHash } : {}), updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (updateErr) return { error: "operator_activation_failed", message: "Your account could not be activated. Please contact support." };
    operatorId = existing.id;
    slug = existing.subdomain || slug;
    feePercent = existing.fee_percent ?? feePercent;
  } else {
    const pendingSub = "pending-" + Date.now();
    const { data: inserted, error: insertErr } = await sb
      .from("operators")
      .insert({ user_id: privyDid, brand_name: "My App", subdomain: pendingSub, status: "active", ...(txHash ? { purchase_tx_hash: txHash } : {}) })
      .select("id")
      .single();
    if (insertErr || !inserted?.id) return { error: "operator_creation_failed", message: "Your account could not be activated. Please contact support." };
    operatorId = inserted.id;
    slug = pendingSub;
  }

  const { error: settingsErr } = await sb.from("operator_settings").upsert({
    operator_id: operatorId,
    allowed_sports: ["Soccer", "MMA", "Boxing"],
    show_polymarket_events: true,
    show_platform_events: true,
    homepage_layout: "default",
  }, { onConflict: "operator_id" });
  if (settingsErr) return { error: "settings_creation_failed", message: "Your account settings could not be created. Please contact support." };

  return { operatorId, slug, feePercent };
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
      const referralCode: string | undefined = typeof body.referral_code === "string" ? body.referral_code : undefined;

      // If promo code provided, validate and potentially skip payment
      if (promoCode) {
        const { data: promo } = await sb.from("promo_codes").select("*").eq("code", promoCode.toUpperCase()).maybeSingle();
        if (!promo) return jsonResp({ error: "invalid_promo_code" }, 400);
        if (promo.uses_count >= promo.max_uses) return jsonResp({ error: "promo_code_exhausted" }, 400);
        if (promo.expires_at && new Date(promo.expires_at) < new Date()) return jsonResp({ error: "promo_code_expired" }, 400);

        const discountedCents = calculateDiscountedCents(promo);
        const discountedPrice = centsToUsdc(discountedCents);

        if (discountedPrice === 0) {
          // Full discount — activate without payment, but only report success after all critical writes succeed.
          console.log("[operator-manage] full-discount promo activation started", { code: promo.code, privyDid });
          const activation = await activatePurchasedOperator(sb, privyDid, null);
          if (activation.error) {
            console.error("[operator-manage] full-discount activation failed", activation.error);
            return jsonResp({ success: false, error: activation.message, stage: activation.error }, 500);
          }

          const { error: promoUpdateErr } = await sb
            .from("promo_codes")
            .update({ uses_count: promo.uses_count + 1 })
            .eq("id", promo.id);
          if (promoUpdateErr) {
            console.error("[operator-manage] full-discount promo usage update failed", promoUpdateErr);
            return jsonResp({ success: false, error: "Promo activation failed. Please try again.", stage: "promo_usage_update_failed" });
          }

          if (activation.operatorId) {
            await recordReferralBestEffort(sb, { operatorId: activation.operatorId, privyDid, referralCode, txHash: null, amountCharged: 0 });
          }
          console.log("[operator-manage] full-discount promo activation complete", { operatorId: activation.operatorId, code: promo.code });
          sendWelcomeEmail(activation.slug || "your-app", activation.feePercent ?? 5).catch(e => console.error("[email]", e));
          return jsonResp({ success: true, status: "active", promo_applied: true, amount_charged: 0, promo_code: promo.code });
        }

        // Partial discount — still need tx verification but with lower amount
        if (!txHash) return jsonResp({ error: "tx_hash_required_for_partial_discount", discounted_price: discountedPrice }, 400);

        // Replay protection
        const { data: replay } = await sb.from("operators").select("id").eq("purchase_tx_hash", txHash).maybeSingle();
        if (replay) return jsonResp({ error: "tx_already_used" }, 409);

        const minRaw = centsToRaw(discountedCents);
        const verification = await verifyTxOnChain(txHash, minRaw);
        if (!verification.valid) return jsonResp({ error: verification.error || "verification_failed" }, 400);
        const activation = await activatePurchasedOperator(sb, privyDid, txHash);
        if (activation.error) return jsonResp({ success: false, error: activation.message, stage: activation.error }, 500);
        const { error: promoUpdateErr } = await sb.from("promo_codes").update({ uses_count: promo.uses_count + 1 }).eq("id", promo.id);
        if (promoUpdateErr) return jsonResp({ success: false, error: "Promo usage could not be recorded. Please contact support.", stage: "promo_usage_update_failed" }, 500);
        if (activation.operatorId) {
          await recordReferralBestEffort(sb, { operatorId: activation.operatorId, privyDid, referralCode, txHash, amountCharged: discountedPrice });
        }
        sendWelcomeEmail(activation.slug || "your-app", activation.feePercent ?? 5).catch(e => console.error("[email]", e));
        return jsonResp({ success: true, status: "active", promo_applied: true, promo_code: promo.code, amount_charged: discountedPrice });
      }

      // No promo code — standard payment verification
      if (!txHash || typeof txHash !== "string" || txHash.length < 60) return jsonResp({ error: "invalid_tx_hash" }, 400);

      // Replay protection
      const { data: replay } = await sb.from("operators").select("id").eq("purchase_tx_hash", txHash).maybeSingle();
      if (replay) return jsonResp({ error: "tx_already_used" }, 409);

      const verification = await verifyTxOnChain(txHash, FULL_PRICE_RAW);
      if (!verification.valid) return jsonResp({ error: verification.error || "verification_failed" }, 400);
      const activation = await activatePurchasedOperator(sb, privyDid, txHash);
      if (activation.error) return jsonResp({ success: false, error: activation.message, stage: activation.error }, 500);
      if (activation.operatorId) {
        await recordReferralBestEffort(sb, { operatorId: activation.operatorId, privyDid, referralCode, txHash, amountCharged: BASE_PRICE_USDC });
      }
      sendWelcomeEmail(activation.slug || "your-app", activation.feePercent ?? 5).catch(e => console.error("[email]", e));
      return jsonResp({ success: true, status: "active", promo_applied: false, amount_charged: BASE_PRICE_USDC });
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
      const { op } = await fetchCanonicalOperator(sb, privyDid, "*, operator_settings(*)");
      return jsonResp({ operator: op });
    }

    // ── create_operator ──
    if (action === "create_operator") {
      // Require agreement acceptance
      if (!body.agreement_version || typeof body.agreement_version !== "string" || body.agreement_version.trim().length === 0) {
        return jsonResp({ error: "agreement_version is required" }, 400);
      }
      const { op: existing } = await fetchCanonicalOperator(sb, privyDid, "id, status, subdomain, created_at");
      if (existing && existing.status !== "active") return jsonResp({ error: "payment_required", operator_id: existing.id }, 402);
      if (existing) {
        // Subdomain collision check on update path
        if (body.subdomain) {
          const { data: subCollision } = await sb.from("operators").select("id").eq("subdomain", body.subdomain).neq("id", existing.id).maybeSingle();
          if (subCollision) return jsonResp({ error: "subdomain_taken" }, 409);
        }
        await sb.from("operators").update({
          brand_name: body.brand_name, subdomain: body.subdomain, logo_url: body.logo_url || null,
          theme: body.theme || "blue", fee_percent: body.fee_percent ?? 5, updated_at: new Date().toISOString(),
          agreement_version: body.agreement_version, agreement_accepted_at: new Date().toISOString(),
          ...(body.payout_wallet ? { payout_wallet: body.payout_wallet } : {}),
        }).eq("id", existing.id);
        await sb.from("operator_settings").upsert({
          operator_id: existing.id, allowed_sports: body.allowed_sports || ["Soccer", "MMA", "Boxing"],
          show_polymarket_events: true, show_platform_events: true,
        }, { onConflict: "operator_id" });
        sendWelcomeEmail(body.subdomain, body.fee_percent ?? 5).catch(e => console.error("[email]", e));
        return jsonResp({ operator: { id: existing.id } });
      }
      const { data: subCheck } = await sb.from("operators").select("id").eq("subdomain", body.subdomain).maybeSingle();
      if (subCheck) return jsonResp({ error: "subdomain_taken" }, 409);
      const { data: operator, error } = await sb.from("operators").insert({
        user_id: privyDid, brand_name: body.brand_name, subdomain: body.subdomain,
        logo_url: body.logo_url || null, theme: body.theme || "blue", fee_percent: body.fee_percent ?? 5, status: "pending",
        payout_wallet: body.payout_wallet || null,
        agreement_version: body.agreement_version, agreement_accepted_at: new Date().toISOString(),
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
      const { op } = await fetchCanonicalOperator(sb, privyDid, "id, status, subdomain, created_at");
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.brand_name) updates.brand_name = body.brand_name;
      if (body.logo_url !== undefined) updates.logo_url = body.logo_url;
      if (body.theme) updates.theme = body.theme;
      if (body.fee_percent !== undefined) {
        const fp = Number(body.fee_percent);
        if (isNaN(fp) || fp < 0 || fp > 20) return jsonResp({ error: "fee_percent must be between 0 and 20" }, 400);
        updates.fee_percent = fp;
      }
      // Brand color validation
      if (body.brand_color !== undefined) {
        const color = String(body.brand_color).trim();
        if (!/^#[0-9a-fA-F]{6}$/.test(color)) return jsonResp({ error: "brand_color must be a valid hex color (#RRGGBB)" }, 400);
        updates.brand_color = color;
      }
      // Welcome message validation
      if (body.welcome_message !== undefined) {
        const msg = String(body.welcome_message || "").trim();
        if (msg.length > 500) return jsonResp({ error: "welcome_message must be 500 characters or less" }, 400);
        updates.welcome_message = msg || null;
      }
      // Support email validation
      if (body.support_email !== undefined) {
        const email = String(body.support_email || "").trim();
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResp({ error: "invalid support_email" }, 400);
        updates.support_email = email || null;
      }
      // Disabled sports validation
      if (body.disabled_sports !== undefined) {
        if (!Array.isArray(body.disabled_sports)) return jsonResp({ error: "disabled_sports must be an array" }, 400);
        for (const s of body.disabled_sports) {
          if (typeof s !== "string") return jsonResp({ error: "disabled_sports entries must be strings" }, 400);
        }
        updates.disabled_sports = body.disabled_sports;
      }
      // App pause toggle — only allow active <-> paused
      if (body.status !== undefined) {
        const newStatus = body.status;
        if (!["active", "paused"].includes(newStatus)) return jsonResp({ error: "status can only be 'active' or 'paused'" }, 400);
        if (op.status !== "active" && op.status !== "paused") return jsonResp({ error: "cannot change status from current state" }, 400);
        updates.status = newStatus;
      }
      await sb.from("operators").update(updates).eq("id", op.id);
      return jsonResp({ success: true });
    }

    // ── update_settings ──
    if (action === "update_settings") {
      const { op } = await fetchCanonicalOperator(sb, privyDid, "id, status, subdomain, created_at");
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
      const { data: op } = await sb.from("operators").select("id, fee_percent, brand_name, status").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      if (op.status === "paused") return jsonResp({ error: "app_is_paused" }, 400);

      // ── Validation ──
      const teamA = (body.team_a || "").trim();
      const teamB = (body.team_b || "").trim();
      const title = (body.title || "").trim();
      const sport = (body.sport || "").trim().toUpperCase();
      const eventDate = body.event_date || null;

      if (!teamA || !teamB) return jsonResp({ error: "Both teams/fighters are required" }, 400);
      if (!title) return jsonResp({ error: "Title is required" }, 400);
      if (!eventDate) return jsonResp({ error: "Event date is required" }, 400);

      if (!sport || !ALLOWED_SPORTS_SET.has(sport)) {
        return jsonResp({ error: `Invalid sport: "${body.sport}". Allowed: NFL, NBA, NHL, Soccer, MMA, Boxing, MLB, Tennis, Golf, NCAA, Cricket, F1, NASCAR, MLS` }, 400);
      }

      // Block prop-style markets
      const aLower = teamA.toLowerCase();
      const bLower = teamB.toLowerCase();
      if ((aLower === "yes" && bLower === "no") || (aLower === "no" && bLower === "yes") ||
          (aLower === "over" && bLower === "under") || (aLower === "under" && bLower === "over")) {
        return jsonResp({ error: "Only match winner markets are allowed (Team A vs Team B)" }, 400);
      }

      const { data: event, error: evErr } = await sb.from("operator_events").insert({
        operator_id: op.id, title, sport: body.sport, team_a: teamA,
        team_b: teamB, event_date: eventDate, image_url: body.image_url || null,
        is_featured: body.is_featured || false, status: "open",
      }).select().single();
      if (evErr) throw evErr;
      const commissionBps = Math.round((op.fee_percent + 1) * 100);
      const { data: fight, error: fightErr } = await sb.from("prediction_fights").insert({
        title, fighter_a_name: teamA, fighter_b_name: teamB,
        event_name: title, event_date: eventDate, status: "open", source: "operator", trading_allowed: true,
        operator_id: op.id, operator_event_id: event.id, commission_bps: commissionBps,
        featured: body.is_featured || false, draw_allowed: body.draw_allowed || false,
      }).select("id").single();
      if (fightErr) console.error("[operator-manage] Failed to create prediction_fight:", fightErr);
      return jsonResp({ event, fight_id: fight?.id || null });
    }

    // ── update_event ── (safe editing of operator custom events)
    if (action === "update_event") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const eventId = body.event_id;
      if (!eventId) return jsonResp({ error: "event_id required" }, 400);

      // Verify ownership
      const { data: event } = await sb.from("operator_events").select("id, operator_id, status").eq("id", eventId).single();
      if (!event || event.operator_id !== op.id) return jsonResp({ error: "not_your_event" }, 403);
      if (event.status === "settled") return jsonResp({ error: "cannot_edit_settled_event" }, 400);

      // Find linked fight
      const { data: fight } = await sb.from("prediction_fights")
        .select("id, operator_event_id, status")
        .eq("operator_event_id", eventId)
        .eq("operator_id", op.id)
        .maybeSingle();

      // Check if predictions exist — lock team names if so
      let hasPredictions = false;
      if (fight) {
        const { count } = await sb.from("prediction_entries")
          .select("id", { count: "exact", head: true })
          .eq("fight_id", fight.id);
        hasPredictions = (count || 0) > 0;
      }

      const eventUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const fightUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

      // Team names — locked if predictions exist
      if (body.team_a !== undefined || body.team_b !== undefined) {
        if (hasPredictions) return jsonResp({ error: "cannot_change_teams_after_predictions" }, 400);
        if (body.team_a) {
          const teamA = String(body.team_a).trim();
          if (!teamA) return jsonResp({ error: "team_a cannot be empty" }, 400);
          eventUpdates.team_a = teamA;
          fightUpdates.fighter_a_name = teamA;
        }
        if (body.team_b) {
          const teamB = String(body.team_b).trim();
          if (!teamB) return jsonResp({ error: "team_b cannot be empty" }, 400);
          eventUpdates.team_b = teamB;
          fightUpdates.fighter_b_name = teamB;
        }
        // Update title too
        const newA = body.team_a ? String(body.team_a).trim() : undefined;
        const newB = body.team_b ? String(body.team_b).trim() : undefined;
        if (newA || newB) {
          const titleA = newA || (event as any).team_a || "TBD";
          const titleB = newB || (event as any).team_b || "TBD";
          const newTitle = `${titleA} vs ${titleB}`;
          eventUpdates.title = newTitle;
          fightUpdates.title = newTitle;
          fightUpdates.event_name = newTitle;
        }
      }

      // Sport — always editable
      if (body.sport !== undefined) {
        const sport = String(body.sport).trim().toUpperCase();
        if (!ALLOWED_SPORTS_SET.has(sport)) return jsonResp({ error: "invalid sport" }, 400);
        eventUpdates.sport = body.sport;
      }

      // Date — always editable
      if (body.event_date !== undefined) {
        eventUpdates.event_date = body.event_date;
        fightUpdates.event_date = body.event_date;
      }

      // Featured — always editable
      if (body.is_featured !== undefined) {
        eventUpdates.is_featured = !!body.is_featured;
        fightUpdates.featured = !!body.is_featured;
      }

      await sb.from("operator_events").update(eventUpdates).eq("id", eventId);
      if (fight && Object.keys(fightUpdates).length > 1) {
        await sb.from("prediction_fights").update(fightUpdates).eq("id", fight.id);
      }

      return jsonResp({ success: true, teams_locked: hasPredictions });
    }

    // ── close_event ── (lock predictions)
    if (action === "close_event") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const fightId = body.fight_id;
      if (fightId) {
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

      const { data: fight } = await sb.from("prediction_fights")
        .select("id, operator_id, status, winner, settled_at")
        .eq("id", fight_id).single();
      if (!fight || fight.operator_id !== op.id) return jsonResp({ error: "not_your_event" }, 403);
      if (fight.settled_at) return jsonResp({ error: "already_settled" }, 400);
      if (fight.winner) return jsonResp({ error: "winner_already_set" }, 400);

      const now = new Date().toISOString();

      if (winner === "draw") {
        await sb.from("prediction_fights").update({
          status: "cancelled", winner: "draw", trading_allowed: false,
          refund_status: "pending", updated_at: now,
        }).eq("id", fight_id);
        await sb.from("operator_events").update({ status: "settled", updated_at: now })
          .eq("id", body.event_id).eq("operator_id", op.id);
        return jsonResp({ success: true, outcome: "draw_refund_pending" });
      }

      const claimsOpenAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      await sb.from("prediction_fights").update({
        winner, status: "confirmed", confirmed_at: now, claims_open_at: claimsOpenAt,
        trading_allowed: false, updated_at: now,
      }).eq("id", fight_id).eq("status", fight.status);

      await sb.from("operator_events").update({ status: "settled", updated_at: now })
        .eq("id", body.event_id).eq("operator_id", op.id);

      await sb.from("automation_logs").insert({
        action: "operator_settle_event", fight_id, source: "operator-manage",
        details: { winner, operator_id: op.id, settled_by: privyDid },
      });

      return jsonResp({ success: true, outcome: "settled", winner });
    }

    // ── set_payout_wallet ──
    if (action === "set_payout_wallet") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);
      const wallet = body.payout_wallet;
      if (!wallet || typeof wallet !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return jsonResp({ error: "invalid_wallet_address" }, 400);
      }
      await sb.from("operators").update({
        payout_wallet: wallet, updated_at: new Date().toISOString(),
      }).eq("id", op.id);
      return jsonResp({ success: true, payout_wallet: wallet });
    }

    // ── get_sweep_history ──
    if (action === "get_sweep_history") {
      const { data: op } = await sb.from("operators").select("id, payout_wallet").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { data: sweeps } = await sb
        .from("operator_revenue")
        .select("id, operator_fee_usdc, sweep_status, sweep_tx_hash, sweep_destination_wallet, sweep_attempted_at, sweep_completed_at, sweep_error, created_at")
        .eq("operator_id", op.id)
        .neq("sweep_status", "accrued")
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: allRev } = await sb
        .from("operator_revenue")
        .select("operator_fee_usdc, sweep_status")
        .eq("operator_id", op.id);

      const totalEarned = (allRev || []).reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      const totalSwept = (allRev || [])
        .filter((r: any) => r.sweep_status === "sent" || r.sweep_status === "reconciled")
        .reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      const pendingSweep = (allRev || [])
        .filter((r: any) => r.sweep_status === "sending")
        .reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      const failedSweep = (allRev || [])
        .filter((r: any) => r.sweep_status === "failed")
        .reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      const accrued = (allRev || [])
        .filter((r: any) => r.sweep_status === "accrued")
        .reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);

      // Fetch on-chain USDC balance of payout wallet if set
      let payout_wallet_balance: number | null = null;
      if (op.payout_wallet) {
        try {
          const balanceOfData = "0x70a08231" + op.payout_wallet.slice(2).toLowerCase().padStart(64, "0");
          for (const rpc of POLYGON_RPCS) {
            try {
              const r = await fetch(rpc, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: USDC_CONTRACT, data: balanceOfData }, "latest"] }),
              });
              if (!r.ok) continue;
              const j = await r.json();
              if (j.result) {
                payout_wallet_balance = Number(BigInt(j.result)) / 1e6;
                break;
              }
            } catch { continue; }
          }
        } catch { /* non-critical */ }
      }

      return jsonResp({
        payout_wallet: op.payout_wallet,
        payout_wallet_balance,
        total_earned: totalEarned,
        total_swept: totalSwept,
        pending_sweep: pendingSweep,
        failed_sweep: failedSweep,
        accrued,
        sweeps: sweeps || [],
      });
    }

    // ── retry_failed_sweeps ──
    if (action === "retry_failed_sweeps") {
      const { data: op } = await sb.from("operators").select("id").eq("user_id", privyDid).single();
      if (!op) return jsonResp({ error: "not_found" }, 404);

      const { data: failed } = await sb
        .from("operator_revenue")
        .update({ sweep_status: "accrued", sweep_error: null, sweep_attempted_at: null })
        .eq("operator_id", op.id)
        .eq("sweep_status", "failed")
        .select("id");

      return jsonResp({ success: true, reset_count: (failed || []).length });
    }

    // ══════ ADMIN-SCOPED ACTIONS ══════
    // Helper: verify platform admin
    async function requireAdmin(): Promise<string | null> {
      const { data: account } = await sb.from("prediction_accounts").select("wallet_evm").eq("privy_did", privyDid).maybeSingle();
      const w = account?.wallet_evm?.toLowerCase();
      if (!w) return null;
      const { data: adminRow } = await sb.from("prediction_admins").select("wallet").eq("wallet", w).maybeSingle();
      return adminRow ? w : null;
    }

    // ── list_all_operators (admin-only) ──
    if (action === "list_all_operators") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const { data } = await sb.from("operators").select("*, operator_settings(*)").order("created_at", { ascending: false });
      return jsonResp({ operators: data || [] });
    }

    // ── admin_get_operator_events (admin-only) ──
    if (action === "admin_get_operator_events") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const opId = body.operator_id;
      if (!opId) return jsonResp({ error: "operator_id required" }, 400);
      const { data: events } = await sb.from("operator_events").select("*").eq("operator_id", opId).order("created_at", { ascending: false });
      // Get linked fights
      const { data: fights } = await sb.from("prediction_fights").select("id, operator_event_id, status, winner, pool_a_usd, pool_b_usd, shares_a, shares_b, settled_at, trading_allowed").eq("operator_id", opId);
      return jsonResp({ events: events || [], fights: fights || [] });
    }

    // ── admin_close_event (admin-only) ──
    if (action === "admin_close_event") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const { event_id, fight_id, operator_id } = body;
      if (!event_id || !operator_id) return jsonResp({ error: "event_id and operator_id required" }, 400);
      if (fight_id) {
        const { data: fight } = await sb.from("prediction_fights").select("id, operator_id, status").eq("id", fight_id).single();
        if (!fight || fight.operator_id !== operator_id) return jsonResp({ error: "fight_not_found" }, 404);
        if (fight.status !== "open") return jsonResp({ error: "already_closed" }, 400);
        await sb.from("prediction_fights").update({ status: "locked", trading_allowed: false, updated_at: new Date().toISOString() }).eq("id", fight_id);
      }
      await sb.from("operator_events").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", event_id).eq("operator_id", operator_id);
      await sb.from("automation_logs").insert({ action: "admin_close_event", fight_id, source: "operator-manage", details: { event_id, operator_id, admin: adminWallet } });
      return jsonResp({ success: true });
    }

    // ── admin_settle_event (admin-only) ──
    if (action === "admin_settle_event") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const { fight_id, winner, event_id, operator_id } = body;
      if (!fight_id || !winner || !operator_id) return jsonResp({ error: "fight_id, winner, operator_id required" }, 400);
      if (!["fighter_a", "fighter_b", "draw"].includes(winner)) return jsonResp({ error: "invalid winner" }, 400);
      const { data: fight } = await sb.from("prediction_fights").select("id, operator_id, status, winner, settled_at").eq("id", fight_id).single();
      if (!fight || fight.operator_id !== operator_id) return jsonResp({ error: "fight_not_found" }, 404);
      if (fight.settled_at) return jsonResp({ error: "already_settled" }, 400);
      if (fight.winner) return jsonResp({ error: "winner_already_set" }, 400);
      const now = new Date().toISOString();
      if (winner === "draw") {
        await sb.from("prediction_fights").update({ status: "cancelled", winner: "draw", trading_allowed: false, refund_status: "pending", updated_at: now }).eq("id", fight_id);
        if (event_id) await sb.from("operator_events").update({ status: "settled", updated_at: now }).eq("id", event_id).eq("operator_id", operator_id);
        await sb.from("automation_logs").insert({ action: "admin_settle_event", fight_id, source: "operator-manage", details: { winner, operator_id, admin: adminWallet } });
        return jsonResp({ success: true, outcome: "draw_refund_pending" });
      }
      const claimsOpenAt = new Date(Date.now() + 3 * 60 * 1000).toISOString();
      await sb.from("prediction_fights").update({ winner, status: "confirmed", confirmed_at: now, claims_open_at: claimsOpenAt, trading_allowed: false, updated_at: now }).eq("id", fight_id);
      if (event_id) await sb.from("operator_events").update({ status: "settled", updated_at: now }).eq("id", event_id).eq("operator_id", operator_id);
      await sb.from("automation_logs").insert({ action: "admin_settle_event", fight_id, source: "operator-manage", details: { winner, operator_id, admin: adminWallet } });
      return jsonResp({ success: true, outcome: "settled", winner });
    }

    // ── admin_toggle_operator_status (admin-only) ──
    if (action === "admin_toggle_operator_status") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const { operator_id, new_status } = body;
      if (!operator_id || !["active", "paused"].includes(new_status)) return jsonResp({ error: "operator_id and valid new_status required" }, 400);
      await sb.from("operators").update({ status: new_status, updated_at: new Date().toISOString() }).eq("id", operator_id);
      await sb.from("automation_logs").insert({ action: "admin_toggle_operator_status", source: "operator-manage", details: { operator_id, new_status, admin: adminWallet } });
      return jsonResp({ success: true });
    }

    // ── admin_create_event (admin-only, create event for any operator) ──
    if (action === "admin_create_event") {
      const adminWallet = await requireAdmin();
      if (!adminWallet) return jsonResp({ error: "forbidden" }, 403);
      const { operator_id } = body;
      if (!operator_id) return jsonResp({ error: "operator_id required" }, 400);
      const { data: op } = await sb.from("operators").select("id, fee_percent, brand_name, status").eq("id", operator_id).single();
      if (!op) return jsonResp({ error: "operator_not_found" }, 404);
      const teamA = (body.team_a || "").trim();
      const teamB = (body.team_b || "").trim();
      const title = (body.title || "").trim();
      const sport = (body.sport || "").trim().toUpperCase();
      const eventDate = body.event_date || null;
      if (!teamA || !teamB) return jsonResp({ error: "Both teams required" }, 400);
      if (!title) return jsonResp({ error: "Title required" }, 400);
      if (!eventDate) return jsonResp({ error: "Event date required" }, 400);
      if (!sport || !ALLOWED_SPORTS_SET.has(sport)) return jsonResp({ error: `Invalid sport` }, 400);
      const { data: event, error: evErr } = await sb.from("operator_events").insert({
        operator_id: op.id, title, sport: body.sport, team_a: teamA, team_b: teamB,
        event_date: eventDate, image_url: body.image_url || null, is_featured: body.is_featured || false, status: "open",
      }).select().single();
      if (evErr) throw evErr;
      const commissionBps = Math.round((op.fee_percent + 1) * 100);
      const { data: fight } = await sb.from("prediction_fights").insert({
        title, fighter_a_name: teamA, fighter_b_name: teamB, event_name: title, event_date: eventDate,
        status: "open", source: "operator", trading_allowed: true, operator_id: op.id, operator_event_id: event.id,
        commission_bps: commissionBps, featured: body.is_featured || false, draw_allowed: body.draw_allowed || false,
      }).select("id").single();
      await sb.from("automation_logs").insert({ action: "admin_create_event", source: "operator-manage", details: { operator_id, title, admin: adminWallet } });
      return jsonResp({ event, fight_id: fight?.id || null });
    }

    return jsonResp({ error: "unknown_action" }, 400);
  } catch (err: any) {
    return jsonResp({ error: err.message || String(err) }, 500);
  }
});
