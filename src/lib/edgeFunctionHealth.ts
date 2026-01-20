import { supabase } from "@/integrations/supabase/client";
import { dbg } from "@/lib/debugLog";

/**
 * Checks if Edge Functions are reachable from this client.
 * Call on game page load to diagnose connectivity issues.
 */
export async function checkEdgeFunctionHealth(): Promise<{
  ok: boolean;
  elapsedMs: number;
  error?: string;
  response?: any;
}> {
  const start = Date.now();
  
  // Log URLs being used
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  console.log("[EdgeHealth] Supabase URL:", supabaseUrl);
  console.log("[EdgeHealth] Functions endpoint:", `${supabaseUrl}/functions/v1/health`);
  dbg("edge.health.url", { supabaseUrl });

  try {
    const { data, error } = await supabase.functions.invoke("health");
    const elapsedMs = Date.now() - start;

    if (error) {
      console.error("[EdgeHealth] FAILED:", error);
      console.error("[EdgeHealth] Error name:", error.name);
      console.error("[EdgeHealth] Error message:", error.message);
      console.error("[EdgeHealth] Full error:", JSON.stringify(error, null, 2));
      dbg("edge.health.fail", { error: error.message, name: error.name, elapsedMs });
      return { ok: false, elapsedMs, error: error.message };
    }

    console.log("[EdgeHealth] SUCCESS:", data, `(${elapsedMs}ms)`);
    dbg("edge.health.ok", { data, elapsedMs });
    return { ok: true, elapsedMs, response: data };
  } catch (err: any) {
    const elapsedMs = Date.now() - start;
    console.error("[EdgeHealth] EXCEPTION:", err);
    console.error("[EdgeHealth] Type:", err.constructor?.name);
    console.error("[EdgeHealth] Stack:", err.stack);
    dbg("edge.health.exception", { error: err.message, type: err.constructor?.name, elapsedMs });
    return { ok: false, elapsedMs, error: err.message };
  }
}
