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
    const { adminWallet, referralWallet, referralCode, amountSol, txHash, note } = await req.json();

    // Validate admin
    if (!adminWallet || typeof adminWallet !== "string" || adminWallet.length < 32) {
      return Response.json({ success: false, error: "invalid_admin_wallet" }, { headers: corsHeaders });
    }

    const { data: adminRow } = await supabase
      .from("prediction_admins")
      .select("wallet")
      .eq("wallet", adminWallet)
      .maybeSingle();

    if (!adminRow) {
      return Response.json({ success: false, error: "not_admin" }, { headers: corsHeaders });
    }

    // Validate referral wallet
    if (!referralWallet || typeof referralWallet !== "string" || referralWallet.length < 32) {
      return Response.json({ success: false, error: "invalid_referral_wallet" }, { headers: corsHeaders });
    }

    // Validate amount
    const amount = Number(amountSol);
    if (!amount || amount <= 0) {
      return Response.json({ success: false, error: "invalid_amount", message: "Amount must be greater than 0" }, { headers: corsHeaders });
    }

    // Insert payout log using service role (bypasses RLS)
    const { data: inserted, error: insertErr } = await supabase
      .from("referral_payout_logs")
      .insert({
        referral_wallet: referralWallet,
        referral_code: referralCode || null,
        amount_sol: amount,
        paid_by_admin_wallet: adminWallet,
        tx_hash: txHash?.trim() || null,
        note: note?.trim() || null,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("[referral-admin-record-payout] Insert failed:", insertErr);
      return Response.json({ success: false, error: "db_error", message: insertErr.message }, { headers: corsHeaders });
    }

    console.log(`[referral-admin-record-payout] ✅ Admin ${adminWallet.slice(0, 8)} recorded payout of ${amount} SOL to ${referralWallet.slice(0, 8)}`);

    return Response.json(
      { success: true, id: inserted.id, amountSol: amount },
      { headers: corsHeaders }
    );
  } catch (err) {
    console.error("[referral-admin-record-payout] Error:", err);
    return Response.json(
      { success: false, error: "server_error" },
      { headers: corsHeaders, status: 500 }
    );
  }
});
