import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as ed from "https://esm.sh/@noble/ed25519@2.0.0";
import { decode as decodeBase58 } from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Session token validity (4 hours)
const SESSION_DURATION_MS = 4 * 60 * 60 * 1000;

// Maximum age for acceptance timestamp (5 minutes)
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

interface AcceptancePayload {
  roomPda: string;
  playerWallet: string;
  rulesHash: string;
  nonce: string;
  timestamp: number;
  signature: string;
}

interface RulesParams {
  roomPda: string;
  gameType: number;
  mode: "casual" | "ranked";
  maxPlayers: number;
  stakeLamports: number;
  feeBps: number;
  turnTimeSeconds: number;
  forfeitPolicy: string;
  version: number;
}

/**
 * Compute SHA-256 hash of the rules JSON (stable key ordering)
 */
async function computeRulesHash(rules: RulesParams): Promise<string> {
  const orderedKeys = [
    "roomPda",
    "gameType", 
    "mode",
    "maxPlayers",
    "stakeLamports",
    "feeBps",
    "turnTimeSeconds",
    "forfeitPolicy",
    "version",
  ];
  
  const orderedObj: Record<string, unknown> = {};
  for (const key of orderedKeys) {
    orderedObj[key] = rules[key as keyof RulesParams];
  }
  
  const jsonString = JSON.stringify(orderedObj);
  const encoder = new TextEncoder();
  const data = encoder.encode(jsonString);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  
  // Convert to hex string
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Generate a secure random session token
 */
function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
    const signatureBytes = decodeBase58(signatureBase58);
    const publicKeyBytes = decodeBase58(publicKeyBase58);
    
    return await ed.verifyAsync(signatureBytes, messageBytes, publicKeyBytes);
  } catch (error) {
    console.error("[verify-acceptance] Signature verification error:", error);
    return false;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { acceptance, rules } = body as {
      acceptance: AcceptancePayload;
      rules: RulesParams;
    };

    console.log("[verify-acceptance] Received request:", {
      roomPda: acceptance.roomPda.slice(0, 8),
      playerWallet: acceptance.playerWallet.slice(0, 8),
      nonce: acceptance.nonce.slice(0, 8),
    });

    // 1. Validate timestamp is recent (prevent replay with old timestamps)
    const now = Date.now();
    const timestampAge = now - acceptance.timestamp;
    
    if (timestampAge > MAX_TIMESTAMP_AGE_MS) {
      console.error("[verify-acceptance] Timestamp too old:", timestampAge);
      return new Response(
        JSON.stringify({ error: "Acceptance timestamp expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (timestampAge < -60000) {
      // Allow 1 minute clock skew into future
      console.error("[verify-acceptance] Timestamp in future:", timestampAge);
      return new Response(
        JSON.stringify({ error: "Invalid timestamp" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Compute and verify rules hash
    const computedHash = await computeRulesHash(rules);
    
    if (computedHash !== acceptance.rulesHash) {
      console.error("[verify-acceptance] Rules hash mismatch:", {
        computed: computedHash.slice(0, 16),
        provided: acceptance.rulesHash.slice(0, 16),
      });
      return new Response(
        JSON.stringify({ error: "Rules hash mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Reconstruct the signed message
    const message = `1MG_ACCEPT_V1|${acceptance.roomPda}|${acceptance.playerWallet}|${acceptance.rulesHash}|${acceptance.nonce}|${acceptance.timestamp}`;

    // 4. Verify the signature
    const isValid = await verifySignature(
      message,
      acceptance.signature,
      acceptance.playerWallet
    );

    if (!isValid) {
      console.error("[verify-acceptance] Invalid signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[verify-acceptance] Signature verified successfully");

    // 5. Check nonce hasn't been used (replay protection)
    const { data: existingNonce } = await supabase
      .from("game_acceptances")
      .select("id")
      .eq("nonce", acceptance.nonce)
      .maybeSingle();

    if (existingNonce) {
      console.error("[verify-acceptance] Nonce already used");
      return new Response(
        JSON.stringify({ error: "Nonce already used" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Generate session token
    const sessionToken = generateSessionToken();
    const sessionExpiresAt = new Date(now + SESSION_DURATION_MS).toISOString();

    // 7. Store the acceptance (upsert to handle rejoins)
    const { error: insertError } = await supabase
      .from("game_acceptances")
      .upsert(
        {
          room_pda: acceptance.roomPda,
          player_wallet: acceptance.playerWallet,
          rules_hash: acceptance.rulesHash,
          nonce: acceptance.nonce,
          timestamp_ms: acceptance.timestamp,
          signature: acceptance.signature,
          session_token: sessionToken,
          session_expires_at: sessionExpiresAt,
        },
        { onConflict: "room_pda,player_wallet" }
      );

    if (insertError) {
      console.error("[verify-acceptance] Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to store acceptance" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[verify-acceptance] Acceptance stored, session created");

    return new Response(
      JSON.stringify({
        success: true,
        sessionToken,
        expiresAt: sessionExpiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[verify-acceptance] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
