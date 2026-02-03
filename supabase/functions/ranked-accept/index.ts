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
  // playerWallet is IGNORED - always derived from session token
}

interface SignedAcceptancePayload {
  roomPda: string;
  mode: "signed"; // Full cryptographic acceptance
  rulesHash: string;
  nonce: string;
  timestamp: number;
  signature: string;
  stakeLamports: number;
  turnTimeSeconds: number;
  // playerWallet is IGNORED for security - derived from signature verification
}

type AcceptancePayload = SimpleAcceptancePayload | SignedAcceptancePayload;

// ─────────────────────────────────────────────────────────────
// Parse room account from on-chain data (for participant sync only)
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

    // ─────────────────────────────────────────────────────────────
    // SECURITY: Require session token for ALL modes (no fallback)
    // ─────────────────────────────────────────────────────────────
    const sessionResult = await requireSession(supabase, req);
    
    if (!sessionResult.ok) {
      console.error("[ranked-accept] Unauthorized - no valid session token");
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // playerWallet is ALWAYS derived from session - never from request body
    const playerWallet = sessionResult.session.wallet;
    console.log("[ranked-accept] Wallet from session:", playerWallet.slice(0, 8));

    const now = Date.now();
    let sessionToken: string;
    let signatureForRecord: string;

    if (body.mode === "signed") {
      // Full cryptographic acceptance flow - wallet from session, signature in body
      const { rulesHash, nonce, timestamp, signature } = body as SignedAcceptancePayload;

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
      // SIMPLE ACCEPTANCE FLOW - wallet already derived from session above
      // ─────────────────────────────────────────────────────────────
      console.log("[ranked-accept] Simple acceptance mode for:", playerWallet.slice(0, 8));

      // CRITICAL FIX: Reuse the existing session token from the Authorization header
      // This prevents overwriting the token that the frontend already stored in localStorage
      sessionToken = sessionResult.session.token;
      const nonce = crypto.randomUUID();
      signatureForRecord = "implicit_stake_acceptance";

      console.log("[ranked-accept] Reusing existing session token:", sessionToken.slice(0, 8));

      // Record acceptance in game_acceptances (for dice roll seeding)
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

      // Update player_sessions metadata WITHOUT overwriting session_token
      // The token was already created by record_acceptance RPC - just update metadata
      const { error: sessionError } = await supabase
        .from("player_sessions")
        .update({
          rules_hash: "stake_verified",
          last_turn: 0,
          last_hash: "genesis",
          revoked: false,
        })
        .eq("room_pda", body.roomPda)
        .eq("wallet", playerWallet);

      if (sessionError) {
        console.error("[ranked-accept] Failed to update player_session:", sessionError);
      } else {
        console.log("[ranked-accept] ✅ player_sessions metadata updated (token preserved)");
      }
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC PARTICIPANTS FROM ON-CHAIN BEFORE MARKING READY
    // This is the AUTHORITATIVE sync step that populates:
    // - game_sessions.participants[] (array of all players)
    // - game_sessions.player2_wallet (for 2-player games)
    // ─────────────────────────────────────────────────────────────
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    let onChainParticipants: string[] = [];
    let onChainCreator: string | null = null;
    let onChainMaxPlayers = 2;
    let onChainGameType = 0;
    
    if (rpcUrl) {
      try {
        console.log("[ranked-accept] Syncing participants from on-chain...");
        const connection = new Connection(rpcUrl);
        const roomPubkey = new PublicKey(body.roomPda);
        const accountInfo = await connection.getAccountInfo(roomPubkey);
        
        if (accountInfo?.data) {
          const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
          
          if (roomData) {
            onChainParticipants = roomData.players.map(p => p.toBase58());
            onChainCreator = roomData.creator.toBase58();
            onChainMaxPlayers = roomData.maxPlayers;
            onChainGameType = roomData.gameType;
            console.log("[ranked-accept] On-chain players:", onChainParticipants);
          }
        }
      } catch (err) {
        console.warn("[ranked-accept] On-chain fetch failed:", err);
      }
    }

    // ─────────────────────────────────────────────────────────────
    // ENSURE game_sessions ROW EXISTS BEFORE set_player_ready
    // ─────────────────────────────────────────────────────────────
    const { data: existingSession } = await supabase
      .from("game_sessions")
      .select("room_pda, player1_wallet, player2_wallet, participants")
      .eq("room_pda", body.roomPda)
      .maybeSingle();

    if (!existingSession) {
      // Session doesn't exist - CREATE it even if on-chain fetch failed
      // P0 FIX: Use safe defaults when on-chain data is unavailable
      const player1 = onChainCreator || onChainParticipants[0] || playerWallet;
      const player2 = onChainMaxPlayers <= 2 && onChainParticipants.length >= 2
        ? onChainParticipants.find(p => p !== player1) || null
        : null;
      // CRITICAL: Always ensure at least playerWallet is in participants
      const participants = onChainParticipants.length > 0 ? onChainParticipants : [player1];
      
      // Map gameType number to string (best effort, fallback to "unknown")
      const gameTypeMap: Record<number, string> = { 
        0: "unknown", 1: "chess", 2: "dominos", 3: "backgammon", 4: "checkers", 5: "ludo" 
      };
      const gameTypeStr = gameTypeMap[onChainGameType] || "unknown";
      
      // Mode from request body is acceptable since this is just a hint
      const mode = (body as any).gameMode || "ranked";
      
      // Use safe defaults when on-chain failed
      const safeMaxPlayers = onChainMaxPlayers > 0 ? onChainMaxPlayers : 2;
      
      console.log("[ranked-accept] Creating game_sessions row (on-chain success:", onChainParticipants.length > 0, "):", {
        roomPda: body.roomPda.slice(0, 8),
        player1: player1.slice(0, 8),
        player2: player2?.slice(0, 8) || "null",
        participants: participants.length,
        mode,
        gameType: gameTypeStr,
        maxPlayers: safeMaxPlayers,
      });
      
      const { error: insertErr } = await supabase
        .from("game_sessions")
        .insert({
          room_pda: body.roomPda,
          player1_wallet: player1,
          player2_wallet: player2,
          participants,
          max_players: safeMaxPlayers,
          game_type: gameTypeStr,
          game_state: {},
          status: "waiting",
          status_int: 1,
          mode,
          p1_ready: false,
          p2_ready: false,
        });
      
      if (insertErr) {
        // Check for conflict (race condition - another process created it)
        if (insertErr.code === "23505") {
          console.log("[ranked-accept] game_sessions conflict - row exists, proceeding");
        } else {
          // P0 FIX: Log loudly and return error - don't silently continue
          console.error("[ranked-accept] ❌ CRITICAL: Failed to create game_sessions:", insertErr);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to initialize game session: " + insertErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.log("[ranked-accept] ✅ Created game_sessions row");
      }
    } else {
      // Session exists - UPDATE with on-chain participants
      if (onChainParticipants.length > 0) {
        const updateObj: Record<string, unknown> = {
          participants: onChainParticipants,
          max_players: onChainMaxPlayers > 0 ? onChainMaxPlayers : 2,
          updated_at: new Date().toISOString(),
        };
        
        // CRITICAL: For 2-player games, ensure player2_wallet is set
        if (onChainMaxPlayers <= 2 && onChainParticipants.length >= 2) {
          const creator = existingSession.player1_wallet || onChainCreator;
          const player2 = onChainParticipants.find(p => p !== creator);
          if (player2 && !existingSession.player2_wallet) {
            updateObj.player2_wallet = player2;
            console.log("[ranked-accept] ✅ Setting player2_wallet:", player2.slice(0, 8));
          }
        }
        
        const { error: updateError } = await supabase
          .from("game_sessions")
          .update(updateObj)
          .eq("room_pda", body.roomPda);
          
        if (updateError) {
          console.warn("[ranked-accept] Failed to update participants:", updateError);
        } else {
          console.log("[ranked-accept] ✅ Synced participants:", onChainParticipants.length);
        }
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
