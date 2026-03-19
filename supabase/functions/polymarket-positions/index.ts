import { createClient } from "@supabase/supabase-js";

/**
 * polymarket-positions — Sync user positions from Polymarket CLOB API.
 *
 * Actions:
 *   - get_positions: Return cached positions from our DB
 *   - sync_positions: Fetch live positions from CLOB and cache locally
 *   - check_order: Check status of a specific order
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLOB_BASE = "https://clob.polymarket.com";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function generateClobHmac(
  apiSecret: string,
  timestamp: string,
  method: string,
  path: string,
  body: string = "",
): Promise<string> {
  const message = timestamp + method + path + body;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function clobHeaders(session: { pm_api_key: string; pm_api_secret: string; pm_passphrase: string }, method: string, path: string, body = "") {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  return generateClobHmac(session.pm_api_secret, timestamp, method, path, body).then(hmac => ({
    "POLY_API_KEY": session.pm_api_key,
    "POLY_SIGNATURE": hmac,
    "POLY_PASSPHRASE": session.pm_passphrase,
    "POLY_TIMESTAMP": timestamp,
    "Content-Type": "application/json",
  }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json();
    const { action = "get_positions", wallet } = body;

    if (!wallet) return json({ error: "Missing wallet" }, 400);

    const normalizedWallet = String(wallet).trim().toLowerCase();

    // ══════════════════════════════════════════════════
    // ACTION: get_positions — Return cached positions
    // ══════════════════════════════════════════════════
    if (action === "get_positions") {
      const { data: positions, error } = await supabase
        .from("polymarket_user_positions")
        .select(`
          id, wallet, fight_id, condition_id, outcome_index,
          token_id, size, avg_price, current_value, realized_pnl,
          pm_order_id, pm_order_status, synced_at
        `)
        .eq("wallet", normalizedWallet)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with fight data
      const fightIds = [...new Set((positions || []).map(p => p.fight_id).filter(Boolean))];
      let fights: Record<string, any> = {};

      if (fightIds.length > 0) {
        const { data: fightData } = await supabase
          .from("prediction_fights")
          .select("id, title, fighter_a_name, fighter_b_name, status, winner, price_a, price_b, source")
          .in("id", fightIds);

        fights = Object.fromEntries((fightData || []).map(f => [f.id, f]));
      }

      return json({
        positions: (positions || []).map(p => ({
          ...p,
          fight: fights[p.fight_id] || null,
        })),
      });
    }

    // ══════════════════════════════════════════════════
    // ACTION: sync_positions — Live sync from CLOB API
    // ══════════════════════════════════════════════════
    if (action === "sync_positions") {
      // Require active Polymarket session
      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("id, status, pm_api_key, pm_api_secret, pm_passphrase, pm_derived_address, expires_at")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session) {
        return json({ error: "No Polymarket session. Please authenticate first." }, 401);
      }

      const isValid = session.status === "active"
        && session.pm_api_key
        && session.pm_api_secret
        && session.pm_passphrase;

      if (!isValid) {
        // Fallback: sync from local prediction_entries
        return await syncFromLocalEntries(supabase, normalizedWallet);
      }

      // ── Fetch open orders from CLOB ──
      try {
        const ordersPath = "/orders?open=true";
        const headers = await clobHeaders(
          { pm_api_key: session.pm_api_key!, pm_api_secret: session.pm_api_secret!, pm_passphrase: session.pm_passphrase! },
          "GET",
          ordersPath,
        );

        const ordersRes = await fetch(`${CLOB_BASE}${ordersPath}`, { headers });

        if (!ordersRes.ok) {
          console.warn(`[polymarket-positions] CLOB orders fetch failed: ${ordersRes.status}`);
          return await syncFromLocalEntries(supabase, normalizedWallet);
        }

        const orders = await ordersRes.json();

        // Map our prediction_entries to CLOB order status
        const { data: entries } = await supabase
          .from("prediction_entries")
          .select("id, fight_id, fighter_pick, pool_usd, shares, polymarket_order_id, polymarket_status")
          .eq("wallet", normalizedWallet)
          .not("polymarket_order_id", "is", null);

        // Update order statuses from CLOB
        const orderMap = new Map((orders || []).map((o: any) => [o.id, o]));
        let synced = 0;

        for (const entry of (entries || [])) {
          if (!entry.polymarket_order_id) continue;
          const clobOrder = orderMap.get(entry.polymarket_order_id);

          if (clobOrder) {
            // Update status from CLOB
            const newStatus = clobOrder.status === "FILLED" ? "filled"
              : clobOrder.status === "CANCELED" ? "cancelled"
              : clobOrder.status === "LIVE" ? "live"
              : "submitted";

            if (newStatus !== entry.polymarket_status) {
              await supabase
                .from("prediction_entries")
                .update({ polymarket_status: newStatus })
                .eq("id", entry.id);
            }
          }
        }

        // Also sync into polymarket_user_positions
        await syncFromLocalEntries(supabase, normalizedWallet);

        return json({
          synced: (entries || []).length,
          source: "polymarket_clob_api",
          open_orders: (orders || []).length,
        });
      } catch (clobErr) {
        console.warn("[polymarket-positions] CLOB sync error:", clobErr);
        return await syncFromLocalEntries(supabase, normalizedWallet);
      }
    }

    // ══════════════════════════════════════════════════
    // ACTION: check_order — Check specific order status
    // ══════════════════════════════════════════════════
    if (action === "check_order") {
      const { order_id } = body;
      if (!order_id) return json({ error: "Missing order_id" }, 400);

      const { data: session } = await supabase
        .from("polymarket_user_sessions")
        .select("pm_api_key, pm_api_secret, pm_passphrase")
        .eq("wallet", normalizedWallet)
        .maybeSingle();

      if (!session?.pm_api_key) {
        return json({ error: "No active session" }, 401);
      }

      const path = `/order/${order_id}`;
      const headers = await clobHeaders(
        { pm_api_key: session.pm_api_key!, pm_api_secret: session.pm_api_secret!, pm_passphrase: session.pm_passphrase! },
        "GET",
        path,
      );

      const res = await fetch(`${CLOB_BASE}${path}`, { headers });
      if (!res.ok) {
        return json({ error: `CLOB returned ${res.status}` }, 502);
      }

      const order = await res.json();
      return json({ order });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    console.error("[polymarket-positions] Error:", err);
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

/**
 * Fallback: sync positions from our local prediction_entries table
 */
async function syncFromLocalEntries(supabase: any, wallet: string) {
  const { data: entries } = await supabase
    .from("prediction_entries")
    .select(`
      id, fight_id, fighter_pick, amount_usd, pool_usd, shares,
      polymarket_order_id, polymarket_status
    `)
    .eq("wallet", wallet)
    .not("fight_id", "is", null);

  if (!entries || entries.length === 0) {
    return json({ synced: 0, positions: [], source: "local_entries" });
  }

  const fightIds = [...new Set(entries.map((e: any) => e.fight_id))];
  const { data: fightData } = await supabase
    .from("prediction_fights")
    .select("id, polymarket_condition_id, polymarket_outcome_a_token, polymarket_outcome_b_token, source, price_a, price_b")
    .in("id", fightIds);

  const fightMap = Object.fromEntries((fightData || []).map((f: any) => [f.id, f]));

  let synced = 0;
  for (const entry of entries) {
    const fight = fightMap[entry.fight_id];
    if (!fight) continue;

    const outcomeIndex = entry.fighter_pick === "fighter_a" ? 0 : 1;
    const tokenId = entry.fighter_pick === "fighter_a"
      ? fight.polymarket_outcome_a_token
      : fight.polymarket_outcome_b_token;

    const currentPrice = entry.fighter_pick === "fighter_a"
      ? Number(fight.price_a || 0)
      : Number(fight.price_b || 0);

    const conditionId = fight.polymarket_condition_id || `local_${fight.id}`;

    await supabase
      .from("polymarket_user_positions")
      .upsert({
        wallet,
        fight_id: entry.fight_id,
        condition_id: conditionId,
        outcome_index: outcomeIndex,
        token_id: tokenId || null,
        size: Number(entry.shares || 0),
        avg_price: Number(entry.pool_usd || 0) > 0 && Number(entry.shares || 0) > 0
          ? Number(entry.pool_usd) / Number(entry.shares) * 100
          : 0,
        current_value: Number(entry.shares || 0) * currentPrice / 100,
        realized_pnl: 0,
        pm_order_id: entry.polymarket_order_id || null,
        pm_order_status: entry.polymarket_status || "local",
        synced_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "wallet,condition_id,outcome_index",
      });

    synced++;
  }

  return json({ synced, source: "local_entries" });
}
