import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as ed from "npm:@noble/ed25519@2.0.0";
import bs58 from "npm:bs58@5.0.0";
import { Connection, PublicKey } from "npm:@solana/web3.js@1.95.0";
import { requireSession } from "../_shared/requireSession.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maximum age for acceptance timestamp (5 minutes)
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

interface SimpleAcceptancePayload {
  roomPda: string;
  mode: "simple"; // Simple acceptance (stake tx is implicit signature)
  // playerWallet removed - derived from session OR on-chain
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

// ─────────────────────────────────────────────────────────────
// Parse room account from on-chain data
// ─────────────────────────────────────────────────────────────
interface ParsedRoom {
  roomId: bigint;
  creator: PublicKey;
  gameType: number;
  maxPlayers: number;
  playerCount: number;
  status: number;
  stakeLamports: bigint;
  winner: PublicKey;
  players: PublicKey[];
}

function parseRoomAccount(data: Uint8Array): ParsedRoom | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    let offset = 8; // Skip discriminator

    const roomId = view.getBigUint64(offset, true);
    offset += 8;

    const creator = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const gameType = data[offset];
    offset += 1;

    const maxPlayers = data[offset];
    offset += 1;

    const playerCount = data[offset];
    offset += 1;

    const status = data[offset];
    offset += 1;

    const stakeLamports = view.getBigUint64(offset, true);
    offset += 8;

    const winner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const players: PublicKey[] = [];
    for (let i = 0; i < playerCount && i < 4; i++) {
      const start = offset + i * 32;
      const end = start + 32;
      const playerKey = new PublicKey(data.slice(start, end));
      if (!playerKey.equals(PublicKey.default)) players.push(playerKey);
    }

    return {
      roomId,
      creator,
      gameType,
      maxPlayers,
      playerCount,
      status,
      stakeLamports,
      winner,
      players,
    };
  } catch (e) {
    console.error("[ranked-accept] Failed to parse room account:", e);
    return null;
  }
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

    // Validate roomPda (required for all modes)
    if (!body.roomPda) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const now = Date.now();
    let sessionToken: string;
    let signatureForRecord: string;
    let playerWallet: string;

    if (body.mode === "signed") {
      // Full cryptographic acceptance flow - playerWallet required in body
      if (!body.playerWallet) {
        return new Response(
          JSON.stringify({ success: false, error: "Missing playerWallet for signed mode" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      playerWallet = body.playerWallet;
      
      const { rulesHash, nonce, timestamp, signature } = body;

      console.log("[ranked-accept] Signed mode request:", {
        roomPda: body.roomPda?.slice(0, 8),
        playerWallet: playerWallet?.slice(0, 8),
      });

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
      const message = `1MG_ACCEPT_V1|${body.roomPda}|${playerWallet}|${rulesHash}|${nonce}|${timestamp}`;
      const isValid = await verifySignature(message, signature, playerWallet);

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
        p_wallet: playerWallet,
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

      // Record acceptance with cryptographic signature (handles UNIQUE constraint)
      const { error: acceptanceError } = await supabase
        .from("game_acceptances")
        .upsert({
          room_pda: body.roomPda,
          player_wallet: playerWallet,
          rules_hash: rulesHash,
          nonce: nonce,
          timestamp_ms: timestamp,
          signature: signatureForRecord,
          session_token: sessionToken,
          session_expires_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'room_pda,player_wallet' });

      if (acceptanceError) {
        console.error("[ranked-accept] Failed to record acceptance:", acceptanceError);
        // Don't fail - session is valid, acceptance record is for dice roll seeding
      }

    } else {
      // ─────────────────────────────────────────────────────────────
      // SIMPLE ACCEPTANCE FLOW
      // Derive wallet from: 1) session token, or 2) on-chain participants
      // ─────────────────────────────────────────────────────────────
      console.log("[ranked-accept] Simple acceptance mode");

      // Try to get wallet from session token (preferred - zero trust)
      const sessionResult = await requireSession(supabase, req);
      
      if (sessionResult.ok) {
        playerWallet = sessionResult.session.wallet;
        console.log("[ranked-accept] Wallet derived from session:", playerWallet.slice(0, 8));
      } else {
        // Fallback: Look up the joiner from on-chain room data
        // This handles the case where joiner doesn't have a session yet
        const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
        if (!rpcUrl) {
          return new Response(
            JSON.stringify({ success: false, error: "No session token and RPC unavailable" }),
            { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        try {
          const connection = new Connection(rpcUrl);
          const roomPubkey = new PublicKey(body.roomPda);
          const accountInfo = await connection.getAccountInfo(roomPubkey);
          
          if (!accountInfo?.data) {
            return new Response(
              JSON.stringify({ success: false, error: "Room not found on-chain" }),
              { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
          if (!roomData || roomData.players.length < 2) {
            return new Response(
              JSON.stringify({ success: false, error: "Room has insufficient players" }),
              { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
          }

          // Get the most recent joiner (player 2 for 2-player games)
          // For N-player, we'd need a different approach
          playerWallet = roomData.players[roomData.players.length - 1].toBase58();
          console.log("[ranked-accept] Wallet derived from on-chain (joiner):", playerWallet.slice(0, 8));
        } catch (err) {
          console.error("[ranked-accept] On-chain lookup failed:", err);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to determine wallet" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      // Generate session token and record
      const nonce = crypto.randomUUID();
      sessionToken = crypto.randomUUID();
      signatureForRecord = "implicit_stake_acceptance";

      // Record acceptance (handles UNIQUE constraint)
      const { error: acceptanceError } = await supabase
        .from("game_acceptances")
        .upsert({
          room_pda: body.roomPda,
          player_wallet: playerWallet,
          nonce,
          timestamp_ms: now,
          signature: signatureForRecord,
          rules_hash: "stake_verified",
          session_token: sessionToken,
          session_expires_at: new Date(now + 4 * 60 * 60 * 1000).toISOString(),
        }, { onConflict: 'room_pda,player_wallet' });

      if (acceptanceError) {
        console.error("[ranked-accept] Failed to record acceptance:", acceptanceError);
        // Continue anyway - ready flag is more important
      } else {
        console.log("[ranked-accept] ✅ Simple acceptance recorded");
      }

      // Also create player_sessions row (critical for forfeit-game)
      // This ensures the joiner (Player 2) can call server-verified timeout forfeit.
      const { error: sessionError } = await supabase
        .from("player_sessions")
        .upsert(
          {
            session_token: sessionToken,
            room_pda: body.roomPda,
            wallet: playerWallet,
            rules_hash: "stake_verified",
            last_turn: 0,
            last_hash: "genesis",
            revoked: false,
          },
          { onConflict: "room_pda,wallet" }
        );

      if (sessionError) {
        console.error("[ranked-accept] Failed to create player_session:", sessionError);
      } else {
        console.log("[ranked-accept] ✅ player_sessions row created for simple mode");
      }
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC PARTICIPANTS FROM ON-CHAIN BEFORE MARKING READY
    // ─────────────────────────────────────────────────────────────
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    if (rpcUrl) {
      try {
        console.log("[ranked-accept] Syncing participants from on-chain...");
        const connection = new Connection(rpcUrl);
        const roomPubkey = new PublicKey(body.roomPda);
        const accountInfo = await connection.getAccountInfo(roomPubkey);
        
        if (accountInfo?.data) {
          const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
          
          if (roomData) {
            const participants = roomData.players.map(p => p.toBase58());
            
            const { error: updateError } = await supabase
              .from('game_sessions')
              .update({
                participants,
                max_players: roomData.maxPlayers,
                updated_at: new Date().toISOString(),
              })
              .eq('room_pda', body.roomPda);
              
            if (updateError) {
              console.warn("[ranked-accept] Failed to update participants:", updateError);
            } else {
              console.log("[ranked-accept] ✅ Synced participants:", participants.length);
            }
          }
        }
      } catch (err) {
        console.warn("[ranked-accept] On-chain sync failed:", err);
      }
    }

    // Mark player as ready (both modes)
    console.log("[ranked-accept] Marking player ready...");
    const { error: readyError } = await supabase.rpc("set_player_ready", {
      p_room_pda: body.roomPda,
      p_wallet: playerWallet,
    });

    if (readyError) {
      console.error("[ranked-accept] Failed to set ready:", readyError);
      return new Response(
        JSON.stringify({ success: false, error: readyError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const expiresAt = new Date(now + 4 * 60 * 60 * 1000).toISOString();

    console.log("[ranked-accept] ✅ Acceptance complete for", playerWallet.slice(0, 8));

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
