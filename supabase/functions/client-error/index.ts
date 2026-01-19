import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { error } = await supabase.from("client_errors").insert({
      route: body.route?.slice(0, 500),
      wallet_browser: body.walletBrowser?.slice(0, 100),
      user_agent: body.userAgent?.slice(0, 500),
      error_stack: body.errorStack?.slice(0, 5000),
      error_message: body.errorMessage?.slice(0, 1000),
      debug_events: body.debugEvents,
      build_version: body.buildVersion?.slice(0, 50),
      wallet_address: body.walletAddress?.slice(0, 100),
    });

    if (error) {
      console.error("[client-error] Insert failed:", error);
      throw error;
    }

    console.log("[client-error] Error logged:", body.errorMessage?.slice(0, 100));

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[client-error] Handler error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
