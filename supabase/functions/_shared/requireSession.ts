// supabase/functions/_shared/requireSession.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export type SessionInfo = {
  token: string;
  wallet: string;
};

export async function requireSession(
  supabase: SupabaseClient,
  req: Request
): Promise<{ ok: true; session: SessionInfo } | { ok: false; error: string }> {
  const auth =
    req.headers.get("authorization") ||
    req.headers.get("Authorization") ||
    "";

  if (!auth.toLowerCase().startsWith("bearer ")) {
    return { ok: false, error: "Missing Authorization: Bearer <session_token>" };
  }

  const token = auth.slice(7).trim();
  if (!token || token.length < 24) {
    return { ok: false, error: "Invalid session token format" };
  }

  // player_sessions schema (actual):
  // session_token, room_pda, wallet, revoked, rules_hash, last_turn, last_hash, last_move_at, desync_count, created_at
  const { data, error } = await supabase
    .from("player_sessions")
    .select("wallet, revoked")
    .eq("session_token", token)
    .maybeSingle();

  if (error) return { ok: false, error: `Session lookup error: ${error.message}` };
  if (!data) return { ok: false, error: "Session not found" };
  if (data.revoked) return { ok: false, error: "Session revoked" };

  const wallet = String((data as any).wallet || "").trim();
  if (!wallet) return { ok: false, error: "Session missing wallet" };

  return { ok: true, session: { token, wallet } };
}
