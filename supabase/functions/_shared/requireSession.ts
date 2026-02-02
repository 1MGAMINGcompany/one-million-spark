// supabase/functions/_shared/requireSession.ts
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

// Session TTL: 7 days
const SESSION_TTL_HOURS = 24 * 7;
const SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

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
    .select("wallet, revoked, created_at")
    .eq("session_token", token)
    .maybeSingle();

  if (error) return { ok: false, error: `Session lookup error: ${error.message}` };
  if (!data) return { ok: false, error: "Session not found" };
  if (data.revoked) return { ok: false, error: "Session revoked" };

  const wallet = String((data as any).wallet || "").trim();
  if (!wallet) return { ok: false, error: "Session missing wallet" };

  // 🔒 SECURITY: Enforce session TTL
  const createdAt = (data as any).created_at;
  if (createdAt) {
    const createdMs = Date.parse(createdAt);
    const nowMs = Date.now();
    const ageMs = nowMs - createdMs;
    
    if (ageMs > SESSION_TTL_MS) {
      return { ok: false, error: "Session expired" };
    }
  } else {
    // Backward compatibility: allow sessions without created_at but log warning
    console.warn("[requireSession] Session missing created_at, allowing but this is deprecated", { token: token.slice(0, 8) + "..." });
  }

  return { ok: true, session: { token, wallet } };
}
