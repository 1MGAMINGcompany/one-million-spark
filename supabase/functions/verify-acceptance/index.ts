import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as ed from "https://esm.sh/@noble/ed25519@2.0.0";
import { decode as decodeBase58 } from "https://esm.sh/bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  
  return Array.from(hashArray)
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
        JSON.stringify({ success: false, error: "Acceptance timestamp expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (timestampAge < -60000) {
      console.error("[verify-acceptance] Timestamp in future:", timestampAge);
      return new Response(
        JSON.stringify({ success: false, error: "Invalid timestamp" }),
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
        JSON.stringify({ success: false, error: "Rules hash mismatch" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Reconstruct the signed message
    const message = `1MG_ACCEPT_V1|${acceptance.roomPda}|${acceptance.playerWallet}|${acceptance.rulesHash}|${acceptance.nonce}|${acceptance.timestamp}`;

    // 4. Verify the signature cryptographically
    const isValid = await verifySignature(
      message,
      acceptance.signature,
      acceptance.playerWallet
    );

    if (!isValid) {
      console.error("[verify-acceptance] Invalid signature");
      return new Response(
        JSON.stringify({ success: false, error: "Invalid signature" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[verify-acceptance] Signature verified successfully");

    // 5. Call start_session RPC with verified signature
    // The RPC validates the nonce (exists, not expired, not used) and creates session
    const { data: sessionToken, error: sessionError } = await supabase.rpc("start_session", {
      p_room_pda: acceptance.roomPda,
      p_wallet: acceptance.playerWallet,
      p_rules_hash: acceptance.rulesHash,
      p_nonce: acceptance.nonce,
      p_signature: acceptance.signature,
      p_sig_valid: true, // We verified the signature above
    });

    if (sessionError) {
      console.error("[verify-acceptance] start_session error:", sessionError);
      
      // Handle specific errors
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

    // Calculate expiry (4 hours from now)
    const expiresAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();

    console.log("[verify-acceptance] Session created:", sessionToken.slice(0, 8) + "...");

    return new Response(
      JSON.stringify({
        success: true,
        sessionToken,
        expiresAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[verify-acceptance] Unexpected error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
