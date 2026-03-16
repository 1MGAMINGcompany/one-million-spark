import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_PERCENTAGES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const { adminWallet, targetWallet, customCode, label, percentage } = await req.json();

    // Validate inputs
    if (!adminWallet || typeof adminWallet !== "string" || adminWallet.length < 32) {
      return Response.json({ success: false, error: "invalid_admin_wallet" }, { headers: corsHeaders });
    }
    if (!targetWallet || typeof targetWallet !== "string" || targetWallet.length < 32) {
      return Response.json({ success: false, error: "invalid_target_wallet" }, { headers: corsHeaders });
    }
    if (!customCode || typeof customCode !== "string") {
      return Response.json({ success: false, error: "invalid_code" }, { headers: corsHeaders });
    }

    const code = customCode.trim().toUpperCase();

    // Validate code format: 4-16 chars, alphanumeric
    if (code.length < 4 || code.length > 16 || !/^[A-Z0-9]+$/.test(code)) {
      return Response.json(
        { success: false, error: "code_format_invalid", message: "Code must be 4-16 alphanumeric characters" },
        { headers: corsHeaders }
      );
    }

    // Validate percentage if provided
    const pct = percentage !== undefined && percentage !== null ? Number(percentage) : 20;
    if (!ALLOWED_PERCENTAGES.includes(pct)) {
      return Response.json(
        { success: false, error: "invalid_percentage", message: `Percentage must be one of: ${ALLOWED_PERCENTAGES.join(", ")}` },
        { headers: corsHeaders }
      );
    }

    // 1. Verify admin
    const { data: adminRow } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", adminWallet)
      .maybeSingle();

    if (!adminRow) {
      return Response.json({ success: false, error: "not_admin" }, { headers: corsHeaders });
    }

    // 2. Check code uniqueness (not already used by another wallet)
    const { data: existingCode } = await supabase
      .from("player_profiles")
      .select("wallet, referral_code")
      .eq("referral_code", code)
      .maybeSingle();

    if (existingCode && existingCode.wallet !== targetWallet) {
      return Response.json(
        { success: false, error: "code_taken", message: `Code "${code}" is already assigned to ${existingCode.wallet.slice(0, 8)}…` },
        { headers: corsHeaders }
      );
    }

    // 3. Upsert player_profiles with code + label + percentage
    const { error: upsertErr } = await supabase
      .from("player_profiles")
      .upsert(
        {
          wallet: targetWallet,
          referral_code: code,
          referral_label: label?.trim() || null,
          referral_percentage: pct,
        },
        { onConflict: "wallet" }
      );

    if (upsertErr) {
      console.error("[referral-admin-set-code] Upsert failed:", upsertErr);
      return Response.json({ success: false, error: "db_error" }, { headers: corsHeaders });
    }

    console.log(`[referral-admin-set-code] ✅ Admin ${adminWallet.slice(0, 8)} set code "${code}" for ${targetWallet.slice(0, 8)} (label: ${label || "none"}, pct: ${pct}%)`);

    return Response.json(
      { success: true, code, wallet: targetWallet, label: label || null, percentage: pct },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[referral-admin-set-code] Error:", err);
    return Response.json(
      { success: false, error: "server_error" },
      { headers: corsHeaders, status: 500 }
    );
  }
});
