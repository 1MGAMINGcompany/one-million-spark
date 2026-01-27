import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as ed from "npm:@noble/ed25519@2.0.0";
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum age for acceptance timestamp (5 minutes)
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

interface SimpleAcceptancePayload {
  roomPda: string;
  playerWallet: string;
  mode: "simple"; // Simple acceptance (stake tx is implicit signature)
}

interface SignedAcceptancePayload {
  roomPda: string;
  playerWallet: string;
  mode: "signed"; // Full cryptographic acceptance
  rulesHash: string;
  nonce: string;
  timestamp: number;
  signature: string;
  stakeLamports: number;
  turnTimeSeconds: number;
}

type AcceptancePayload = SimpleAcceptancePayload | SignedAcceptancePayload;

/**
 * Verify Ed25519 signature from Solana wallet
 */
async function verifySignature(
  message: string,
  signatureBase58: string,
  publicKeyBase58: string
): Promise<boolean> {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = bs58.decode(signatureBase58);
    const publicKeyBytes = bs58.decode(publicKeyBase58);
    
    return await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
  } catch (error) {
    console.error("[ranked-accept] Signature verification error:", error);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json() as AcceptancePayload;

    console.log("[ranked-accept] Received request:", {
      roomPda: body.roomPda?.slice(0, 8),
      playerWallet: body.playerWallet?.slice(0, 8),
      mode: body.mode,
    });

    // Validate required fields
    if (!body.roomPda || !body.playerWallet) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda or playerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    let sessionToken: string;
    let signatureForRecord: string;

    if (body.mode === "signed") {
      // Full cryptographic acceptance flow
      const { rulesHash, nonce, timestamp, signature, stakeLamports, turnTimeSeconds } = body;

      // Validate timestamp is recent (prevent replay with old timestamps)
      const timestampAge = now - timestamp;
      
      if (timestampAge > MAX_TIMESTAMP_AGE_MS) {
        console.error("[ranked-accept] Timestamp too old:", timestampAge);
        return new Response(
          JSON.stringify({ success: false, error: "Acceptance timestamp expired" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (timestampAge < -60000) {
        console.error("[ranked-accept] Timestamp in future:", timestampAge);
        return new Response(
          JSON.stringify({ success: false, error: "Invalid timestamp" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Reconstruct the signed message and verify
      const message = `1MG_ACCEPT_V1|${body.roomPda}|${body.playerWallet}|${rulesHash}|${nonce}|${timestamp}`;
      const isValid = await verifySignature(message, signature, body.playerWallet);

      if (!isValid) {
        console.error("[ranked-accept] Invalid signature");
        return new Response(
          JSON.stringify({ success: false, error: "Invalid signature" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("[ranked-accept] Signature verified successfully");

      // Call start_session RPC with verified signature
      const { data: token, error: sessionError } = await supabase.rpc("start_session", {
        p_room_pda: body.roomPda,
        p_wallet: body.playerWallet,
        p_rules_hash: rulesHash,
        p_nonce: nonce,
        p_signature: signature,
        p_sig_valid: true,
      });

      if (sessionError) {
        console.error("[ranked-accept] start_session error:", sessionError);
        
        if (sessionError.message?.includes("bad or expired nonce")) {
          return new Response(
            JSON.stringify({ success: false, error: "Nonce expired or already used" }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        return new Response(
          JSON.stringify({ success: false, error: "Failed to create session" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      sessionToken = token;
      signatureForRecord = signature;

      // Record acceptance with cryptographic signature
      const { error: acceptanceError } = await supabase
        .from("game_acceptances")
        .insert({
          room_pda: body.roomPda,
          player_wallet: body.playerWallet,
          rules_hash: rulesHash,
          nonce: nonce,
          timestamp_ms: timestamp,
          signature: signatureForRecord,
          session_token: sessionToken,
          session_expires_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        });

      if (acceptanceError) {
        console.error("[ranked-accept] Failed to record acceptance:", acceptanceError);
        // Don't fail - session is valid, acceptance record is for dice roll seeding
      }

    } else {
      // Simple acceptance flow (stake tx is implicit signature)
      console.log("[ranked-accept] Simple acceptance mode");

      // Generate session token and record
      const nonce = crypto.randomUUID();
      sessionToken = crypto.randomUUID();
      signatureForRecord = "implicit_stake_acceptance";

      // Record acceptance
      const { error: acceptanceError } = await supabase
        .from("game_acceptances")
        .insert({
          room_pda: body.roomPda,
          player_wallet: body.playerWallet,
          nonce,
          timestamp_ms: now,
          signature: signatureForRecord,
          rules_hash: "stake_verified",
          session_token: sessionToken,
          session_expires_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        });

      if (acceptanceError) {
        console.error("[ranked-accept] Failed to record acceptance:", acceptanceError);
        // Continue anyway - ready flag is more important
      } else {
        console.log("[ranked-accept] ✅ Simple acceptance recorded");
      }
    }

    // Mark player as ready (both modes)
    console.log("[ranked-accept] Marking player ready...");
    const { error: readyError } = await supabase.rpc("set_player_ready", {
      p_room_pda: body.roomPda,
      p_wallet: body.playerWallet,
    });

    if (readyError) {
      console.error("[ranked-accept] Failed to set ready:", readyError);
      return new Response(
        JSON.stringify({ success: false, error: readyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiresAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();

    console.log("[ranked-accept] ✅ Acceptance complete for", body.playerWallet.slice(0, 8));

    return new Response(
      JSON.stringify({
        success: true,
        sessionToken,
        expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[ranked-accept] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
