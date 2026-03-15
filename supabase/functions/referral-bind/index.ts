import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { wallet, referralCode } = await req.json();

    if (!wallet || typeof wallet !== "string" || wallet.length < 32) {
      return Response.json({ success: false, error: "invalid_wallet" }, { headers: corsHeaders });
    }

    if (!referralCode || typeof referralCode !== "string" || referralCode.length < 4) {
      return Response.json({ success: false, error: "invalid_code" }, { headers: corsHeaders });
    }

    const code = referralCode.trim().toUpperCase();

    // 1. Find referrer by code
    const { data: referrer, error: refErr } = await supabase
      .from("player_profiles")
      .select("wallet, referral_code")
      .eq("referral_code", code)
      .maybeSingle();

    if (refErr || !referrer) {
      await logAbuse(supabase, wallet, code, "invalid_code");
      return Response.json({ success: false, error: "invalid_code" }, { headers: corsHeaders });
    }

    // 2. Self-referral check
    if (referrer.wallet === wallet) {
      await logAbuse(supabase, wallet, code, "self_referral");
      return Response.json({ success: false, error: "self_referral" }, { headers: corsHeaders });
    }

    // 3. Get or create player profile for the new user
    const { data: existingProfile } = await supabase
      .from("player_profiles")
      .select("wallet, referred_by_wallet, referral_code")
      .eq("wallet", wallet)
      .maybeSingle();

    // 4. Already referred check
    if (existingProfile?.referred_by_wallet) {
      await logAbuse(supabase, wallet, code, "already_referred");
      return Response.json({ success: false, error: "already_referred" }, { headers: corsHeaders });
    }

    // 5. Circular referral check: if referrer was referred by this wallet
    const { data: referrerProfile } = await supabase
      .from("player_profiles")
      .select("referred_by_wallet")
      .eq("wallet", referrer.wallet)
      .maybeSingle();

    if (referrerProfile?.referred_by_wallet === wallet) {
      await logAbuse(supabase, wallet, code, "circular_referral");
      return Response.json({ success: false, error: "circular_referral" }, { headers: corsHeaders });
    }

    // 6. Generate referral code for new user if needed
    const newUserCode = existingProfile?.referral_code ||
      generateReferralCode(wallet);

    // 7. Upsert the player profile with referral binding
    const { error: upsertErr } = await supabase
      .from("player_profiles")
      .upsert(
        {
          wallet,
          referred_by_code: code,
          referred_by_wallet: referrer.wallet,
          referral_created_at: new Date().toISOString(),
          referral_code: newUserCode,
        },
        { onConflict: "wallet" }
      );

    if (upsertErr) {
      console.error("[referral-bind] Upsert failed:", upsertErr);
      return Response.json({ success: false, error: "db_error" }, { headers: corsHeaders });
    }

    console.log("[referral-bind] ✅ Bound:", { wallet: wallet.slice(0, 8), referrer: referrer.wallet.slice(0, 8), code });

    return Response.json(
      { success: true, referrerWallet: referrer.wallet },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[referral-bind] Error:", err);
    return Response.json(
      { success: false, error: "server_error" },
      { headers: corsHeaders, status: 500 }
    );
  }
});

function generateReferralCode(wallet: string): string {
  // Simple deterministic code from wallet
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    const charCode = wallet.charCodeAt(i % wallet.length) + i * 7;
    code += chars[charCode % chars.length];
  }
  return code;
}

// deno-lint-ignore no-explicit-any
async function logAbuse(supabase: any, wallet: string, code: string, reason: string) {
  try {
    await supabase.from("referral_abuse_logs").insert({
      wallet,
      attempted_code: code,
      reason,
    });
  } catch (e) {
    console.error("[referral-bind] Failed to log abuse:", e);
  }
}
