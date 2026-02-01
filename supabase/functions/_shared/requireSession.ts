// supabase/functions/_shared/requireSession.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type SessionInfo = {
  token: string;
  wallet: string;
  expiresAt: string;
};

export async function requireSession(
  supabase: SupabaseClient,
  req: Request
): Promise<{ ok: true; session: SessionInfo } | { ok: false; error: string }> {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "Missing Authorization: Bearer <session_token>" };
  }

  const token = auth.slice(7).trim();
  if (!token || token.length < 24) {
    return { ok: false, error: "Invalid session token format" };
  }

  const nowIso = new Date().toISOString();

  // player_sessions schema used elsewhere:
  // - session_token
  // - player_wallet
  // - session_expires_at
  // - revoked
  const { data, error } = await supabase
    .from("player_sessions")
    .select("player_wallet, session_expires_at, revoked")
    .eq("session_token", token)
    .maybeSingle();

  if (error) return { ok: false, error: `Session lookup error: ${error.message}` };
  if (!data) return { ok: false, error: "Session not found" };
  if (data.revoked) return { ok: false, error: "Session revoked" };
  if (!data.session_expires_at || data.session_expires_at <= nowIso) {
    return { ok: false, error: "Session expired" };
  }

  const wallet = String(data.player_wallet || "").trim();
  if (!wallet) return { ok: false, error: "Session missing wallet" };

  return { ok: true, session: { token, wallet, expiresAt: data.session_expires_at } };
}
