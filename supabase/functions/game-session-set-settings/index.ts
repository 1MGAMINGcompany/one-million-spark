/**
 * Edge Function: game-session-set-settings
 * 
 * HARDENED with signature verification - only the room creator can set settings.
 * 
 * Request body:
 * {
 *   roomPda: string,
 *   turnTimeSeconds: number,
 *   mode: "casual" | "ranked",
 *   creatorWallet: string,
 *   timestamp: number,  // unix ms
 *   signature: string   // base64 ed25519 signature
 * }
 * 
 * Signature message format:
 * 1MGAMING:SET_SETTINGS
 * roomPda=${roomPda}
 * turnTimeSeconds=${turnTimeSeconds}
 * mode=${mode}
 * ts=${timestamp}
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as ed from "@noble/ed25519";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Mode = "casual" | "ranked" | "private";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Base58 alphabet (Bitcoin/Solana)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(str: string): Uint8Array {
  const bytes: number[] = [];
  for (const char of str) {
    let carry = BASE58_ALPHABET.indexOf(char);
    if (carry < 0) throw new Error(`Invalid base58 character: ${char}`);
    for (let j = 0; j < bytes.length; j++) {
      const x = bytes[j] * 58 + carry;
      bytes[j] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  // Handle leading zeros
  for (const char of str) {
    if (char === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function decodeBase64(str: string): Uint8Array {
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function verifySignature(
  message: string,
  signatureBase64: string,
  publicKeyBase58: string
): Promise<boolean> {
  try {
    const publicKey = decodeBase58(publicKeyBase58);
    const signature = decodeBase64(signatureBase64);
    const messageBytes = new TextEncoder().encode(message);

    // Verify ed25519 signature
    return await ed.verifyAsync(signature, messageBytes, publicKey);
  } catch (e) {
    console.error("[game-session-set-settings] Signature verification error:", e);
    return false;
  }
}

// Check if running in dev/preview environment
function isDevEnvironment(): boolean {
  const url = Deno.env.get("SUPABASE_URL") || "";
  // Devnet/preview domains or localhost
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("preview");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { ok: false, error: "method_not_allowed" });
  }

  try {
    const payload = await req.json().catch(() => null);
    const roomPda = payload?.roomPda;
    const turnTimeSecondsRaw = payload?.turnTimeSeconds;
    const mode = payload?.mode as Mode;
    const creatorWallet = payload?.creatorWallet;
    const timestamp = payload?.timestamp;
    const signature = payload?.signature;
    const maxPlayersRaw = payload?.maxPlayers; // Ludo: 2, 3, or 4 players
    const gameTypeFromPayload = payload?.gameType; // "Chess", "Dominos", etc.

    // Validate required fields
    if (!roomPda || typeof roomPda !== "string") {
      return json(400, { ok: false, error: "roomPda_required" });
    }

    const turnTimeSeconds = Number(turnTimeSecondsRaw);
    if (!Number.isFinite(turnTimeSeconds) || turnTimeSeconds < 0) {
      return json(400, { ok: false, error: "turnTimeSeconds_invalid" });
    }

    if (mode !== "casual" && mode !== "ranked" && mode !== "private") {
      return json(400, { ok: false, error: "mode_invalid" });
    }

    // Check if signature verification is required
    const requiresSignature = !isDevEnvironment();
    
    if (requiresSignature) {
      // Signature verification required for production
      if (!creatorWallet || typeof creatorWallet !== "string") {
        return json(400, { ok: false, error: "creatorWallet_required" });
      }
      if (typeof timestamp !== "number") {
        return json(400, { ok: false, error: "timestamp_required" });
      }
      if (!signature || typeof signature !== "string") {
        return json(400, { ok: false, error: "signature_required" });
      }

      // Verify timestamp is within 2 minutes
      const now = Date.now();
      const MAX_AGE_MS = 2 * 60 * 1000; // 2 minutes
      if (Math.abs(now - timestamp) > MAX_AGE_MS) {
        console.warn("[game-session-set-settings] Timestamp out of range:", { timestamp, now, diff: Math.abs(now - timestamp) });
        return json(401, { ok: false, error: "timestamp_expired" });
      }

      // Build message for signature verification
      const message = `1MGAMING:SET_SETTINGS\nroomPda=${roomPda}\nturnTimeSeconds=${turnTimeSeconds}\nmode=${mode}\nts=${timestamp}`;
      
      console.log("[game-session-set-settings] Verifying signature for message:", message.replace(/\n/g, " | "));

      const isValid = await verifySignature(message, signature, creatorWallet);
      if (!isValid) {
        console.warn("[game-session-set-settings] Invalid signature for wallet:", creatorWallet.slice(0, 8));
        return json(401, { ok: false, error: "invalid_signature" });
      }

      console.log("[game-session-set-settings] ✅ Signature verified for:", creatorWallet.slice(0, 8));
    } else {
      console.log("[game-session-set-settings] Dev environment - skipping signature verification");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.error("[game-session-set-settings] Missing env vars");
      return json(500, { ok: false, error: "server_misconfigured" });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    // Fetch session and verify creator
    let { data: session, error: sessionErr } = await supabase
      .from("game_sessions")
      .select("room_pda, status, start_roll_finalized, player1_wallet")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (sessionErr) {
      console.error("[game-session-set-settings] session fetch error", sessionErr);
      return json(500, { ok: false, error: "session_fetch_failed" });
    }

    // Parse max_players if provided (for Ludo: 2, 3, or 4)
    const maxPlayers = typeof maxPlayersRaw === "number" && maxPlayersRaw >= 2 && maxPlayersRaw <= 4
      ? maxPlayersRaw
      : 2; // Default to 2 for non-Ludo games

    if (!session) {
      // Session doesn't exist yet - CREATE it with the settings
      console.log("[game-session-set-settings] No session found, creating new one");
      
      const { error: insertErr } = await supabase
        .from("game_sessions")
        .insert({
          room_pda: roomPda,
          player1_wallet: creatorWallet,
          player2_wallet: null,
          game_type: gameTypeFromPayload || "unknown",
          game_state: {},
          status: "waiting",
          mode: mode,
          turn_time_seconds: turnTimeSeconds,
          max_players: maxPlayers,
          p1_ready: false,
          p2_ready: false,
        });

      if (insertErr) {
        // Check if conflict (room created by another process)
        if (insertErr.code === "23505") {
          // Unique constraint violation - session was created concurrently
          // Fall through to UPDATE logic
          console.log("[game-session-set-settings] Conflict detected, falling back to update");
        } else {
          console.error("[game-session-set-settings] insert error", insertErr);
          return json(500, { ok: false, error: "insert_failed" });
        }
      } else {
        console.log("[game-session-set-settings] ✅ Session created:", { 
          roomPda: roomPda.slice(0, 8), 
          mode, 
          turnTimeSeconds, 
          maxPlayers,
          gameType: gameTypeFromPayload || "unknown",
        });
        return json(200, { ok: true });
      }
      
      // If we got here due to conflict, re-fetch and continue to UPDATE
      const { data: conflictSession } = await supabase
        .from("game_sessions")
        .select("room_pda, status, start_roll_finalized, player1_wallet")
        .eq("room_pda", roomPda)
        .maybeSingle();
        
      if (!conflictSession) {
        return json(500, { ok: false, error: "session_race_condition" });
      }
      
      // Use the fetched session for subsequent validation
      session = conflictSession;
    }

    // Verify caller is the room creator (player1_wallet)
    if (requiresSignature && creatorWallet) {
      const sessionCreator = session.player1_wallet?.trim();
      const requestCreator = creatorWallet.trim();
      
      if (sessionCreator !== requestCreator) {
        console.warn("[game-session-set-settings] Creator mismatch:", {
          sessionCreator: sessionCreator?.slice(0, 8),
          requestCreator: requestCreator?.slice(0, 8),
        });
        return json(403, { ok: false, error: "not_room_creator" });
      }
    }

    // Guard: do not allow changing settings after game has started
    const status = String(session.status ?? "").toLowerCase();
    const alreadyStarted =
      Boolean(session.start_roll_finalized) ||
      ["active", "started", "finished", "complete"].includes(status);

    if (alreadyStarted) {
      return json(409, { ok: false, error: "game_already_started" });
    }

    // Update settings (session already exists)
    const { error: updateErr } = await supabase
      .from("game_sessions")
      .update({
        turn_time_seconds: turnTimeSeconds,
        mode,
        max_players: maxPlayers,
      })
      .eq("room_pda", roomPda);

    if (updateErr) {
      console.error("[game-session-set-settings] update error", updateErr);
      return json(500, { ok: false, error: "update_failed" });
    }

    console.log("[game-session-set-settings] ✅ Settings updated:", { roomPda: roomPda.slice(0, 8), turnTimeSeconds, mode, maxPlayers });
    return json(200, { ok: true });
  } catch (e) {
    console.error("[game-session-set-settings] unexpected error", e);
    return json(500, { ok: false, error: "internal_error" });
  }
});
