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

    // Extract join trace correlation ID if present (for debugging)
    const traceId = req.headers.get("X-Join-Trace-Id") || null;
    if (traceId) {
      console.log("[ranked-accept] traceId:", traceId, "roomPda:", body.roomPda?.slice(0, 8));
    }

    // Validate roomPda (required for all modes)
    if (!body.roomPda) {
      console.error("[ranked-accept] Missing roomPda", traceId ? `traceId=${traceId}` : "");
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

      // ─────────────────────────────────────────────────────────────
      // CRITICAL FIX: Ensure player_sessions row exists (idempotent UPSERT)
      // This fixes the bug where joiners end up with no player_sessions row
      // ─────────────────────────────────────────────────────────────
      const { data: existingPlayerSession } = await supabase
        .from("player_sessions")
        .select("session_token")
        .eq("room_pda", body.roomPda)
        .eq("wallet", playerWallet)
        .maybeSingle();

      let sessionCreated = false;

      if (existingPlayerSession?.session_token) {
        // Row exists - UPDATE metadata only (preserve existing token)
        const { error: updateError } = await supabase
          .from("player_sessions")
          .update({
            rules_hash: "stake_verified",
            last_turn: 0,
            last_hash: "genesis",
            revoked: false,
          })
          .eq("room_pda", body.roomPda)
          .eq("wallet", playerWallet);

        if (updateError) {
          console.error("[ranked-accept] Failed to update player_session:", updateError);
        } else {
          console.log("[ranked-accept] ✅ player_sessions metadata updated (token preserved)");
        }
      } else {
        // Row MISSING - INSERT new row with a fresh token
        // This is the critical fix for joiners who never got a player_sessions row
        const newToken = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
        sessionToken = newToken; // Return this new token to frontend
        sessionCreated = true;

        const { error: insertError } = await supabase
          .from("player_sessions")
          .insert({
            room_pda: body.roomPda,
            wallet: playerWallet,
            session_token: newToken,
            rules_hash: "stake_verified",
            last_turn: 0,
            last_hash: "genesis",
            revoked: false,
            desync_count: 0,
          });

        if (insertError) {
          // Handle race condition - another insert happened first
          if (insertError.code === "23505") {
            console.log("[ranked-accept] player_sessions row inserted by concurrent request");
            // Fetch the token that was just inserted
            const { data: raceSession } = await supabase
              .from("player_sessions")
              .select("session_token")
              .eq("room_pda", body.roomPda)
              .eq("wallet", playerWallet)
              .single();
            if (raceSession?.session_token) {
              sessionToken = raceSession.session_token;
            }
          } else {
            console.error("[ranked-accept] Failed to insert player_session:", insertError);
          }
        } else {
          console.log("[ranked-accept] ✅ player_sessions row CREATED (missing row fix)");
        }
      }

      // Debug log for tracking
      console.log("[ranked-accept.session.upsert]", {
        roomPda: body.roomPda.slice(0, 8),
        walletPrefix: playerWallet.slice(0, 8),
        created: sessionCreated,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SYNC PARTICIPANTS FROM ON-CHAIN BEFORE MARKING READY
    // This is the AUTHORITATIVE sync step that populates:
    // - game_sessions.participants[] (array of all players)
    // - game_sessions.player2_wallet (for 2-player games)
    // 
    // CRITICAL: Retry up to 3 times with 300ms backoff on RPC failure
    // ─────────────────────────────────────────────────────────────
    const rpcUrl = Deno.env.get("SOLANA_RPC_URL");
    let onChainParticipants: string[] = [];
    let onChainCreator: string | null = null;
    let onChainMaxPlayers = 2;
    let onChainGameType = 0;
    let onChainFetchSuccess = false;
    
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 300;
    
    if (rpcUrl) {
      const connection = new Connection(rpcUrl);
      const roomPubkey = new PublicKey(body.roomPda);
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          console.log(`[ranked-accept] on-chain fetch attempt ${attempt}/${MAX_RETRIES}...`);
          const accountInfo = await connection.getAccountInfo(roomPubkey);
          
          if (accountInfo?.data) {
            const roomData = parseRoomAccount(new Uint8Array(accountInfo.data));
            
            if (roomData && roomData.players.length > 0) {
              onChainParticipants = roomData.players.map(p => p.toBase58());
              onChainCreator = roomData.creator.toBase58();
              onChainMaxPlayers = roomData.maxPlayers;
              onChainGameType = roomData.gameType;
              onChainFetchSuccess = true;
              console.log(`[ranked-accept] on-chain sync success: participantsCount=${onChainParticipants.length}, players=${onChainParticipants.map(p => p.slice(0,8)).join(",")}`);
              break; // Success - exit retry loop
            } else {
              console.warn(`[ranked-accept] on-chain fetch attempt ${attempt}/${MAX_RETRIES} failed: no players in parsed data`);
            }
          } else {
            console.warn(`[ranked-accept] on-chain fetch attempt ${attempt}/${MAX_RETRIES} failed: no account data`);
          }
        } catch (err) {
          console.warn(`[ranked-accept] on-chain fetch attempt ${attempt}/${MAX_RETRIES} failed:`, err);
        }
        
        // Wait before retry (except on last attempt)
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
      
      if (!onChainFetchSuccess) {
        console.warn("[ranked-accept] on-chain sync failed after retries; will preserve existing participants");
      }
    }

    // ─────────────────────────────────────────────────────────────
    // ENSURE game_sessions ROW EXISTS BEFORE set_player_ready
    // ─────────────────────────────────────────────────────────────
    const { data: existingSession } = await supabase
      .from("game_sessions")
      .select("room_pda, player1_wallet, player2_wallet, participants, max_players")
      .eq("room_pda", body.roomPda)
      .maybeSingle();

    // Track if we need to signal frontend that sync is pending
    let needsSync = false;

    if (!existingSession) {
      // Session doesn't exist - CREATE it
      // CRITICAL: Only use on-chain data if fetch succeeded; otherwise use safe defaults
      
      if (onChainFetchSuccess) {
        // On-chain fetch succeeded - use authoritative data
        const player1 = onChainCreator || onChainParticipants[0] || playerWallet;
        const player2 = onChainMaxPlayers <= 2 && onChainParticipants.length >= 2
          ? onChainParticipants.find(p => p !== player1) || null
          : null;
        
        const gameTypeMap: Record<number, string> = { 
          0: "unknown", 1: "chess", 2: "dominos", 3: "backgammon", 4: "checkers", 5: "ludo" 
        };
        const gameTypeStr = gameTypeMap[onChainGameType] || "unknown";
        const mode = (body as any).gameMode || "ranked";
        
        console.log("[ranked-accept] Creating game_sessions row with on-chain data:", {
          roomPda: body.roomPda.slice(0, 8),
          player1: player1.slice(0, 8),
          player2: player2?.slice(0, 8) || "null",
          participants: onChainParticipants.length,
          mode,
          gameType: gameTypeStr,
          maxPlayers: onChainMaxPlayers,
        });
        
        const { error: insertErr } = await supabase
          .from("game_sessions")
          .insert({
            room_pda: body.roomPda,
            player1_wallet: player1,
            player2_wallet: player2,
            participants: onChainParticipants,
            max_players: onChainMaxPlayers,
            game_type: gameTypeStr,
            game_state: {},
            status: "waiting",
            status_int: 1,
            mode,
            p1_ready: false,
            p2_ready: false,
          });
        
        if (insertErr && insertErr.code !== "23505") {
          console.error("[ranked-accept] ❌ CRITICAL: Failed to create game_sessions:", insertErr);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to initialize game session: " + insertErr.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("[ranked-accept] ✅ Created game_sessions row with on-chain participants");
        
      } else {
        // On-chain fetch FAILED - create minimal row with only playerWallet
        // Signal that frontend needs to retry sync
        needsSync = true;
        
        const gameTypeHint = (body as any).gameType || "unknown";
        const mode = (body as any).gameMode || "ranked";
        
        console.log("[ranked-accept] ⚠️ Creating game_sessions row WITHOUT on-chain data (needsSync=true):", {
          roomPda: body.roomPda.slice(0, 8),
          player1: playerWallet.slice(0, 8),
          gameType: gameTypeHint,
        });
        
        const { error: insertErr } = await supabase
          .from("game_sessions")
          .insert({
            room_pda: body.roomPda,
            player1_wallet: playerWallet,
            player2_wallet: null,
            participants: [playerWallet],
            max_players: 2,
            game_type: gameTypeHint,
            game_state: {},
            status: "waiting",
            status_int: 1,
            mode,
            p1_ready: false,
            p2_ready: false,
          });
        
        if (insertErr && insertErr.code !== "23505") {
          console.error("[ranked-accept] ❌ Failed to create minimal game_sessions:", insertErr);
          return new Response(
            JSON.stringify({ success: false, error: "Failed to initialize game session" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.log("[ranked-accept] ✅ Created minimal game_sessions row (needs sync)");
      }
    } else {
      // Session exists - UPDATE with on-chain participants ONLY if fetch succeeded
      if (onChainFetchSuccess && onChainParticipants.length > 0) {
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
      } else if (!onChainFetchSuccess) {
        // On-chain fetch failed - use DB-first pattern
        // SAFE: playerWallet comes from requireSession (verified against player_sessions table)
        const existingParticipants: string[] = existingSession.participants || [];
        const expectedCount = existingSession.max_players || 2;
        
        console.log("[ranked-accept] on-chain sync failed; checking if caller needs to be added:", {
          callerWallet: playerWallet.slice(0, 8),
          existingParticipants: existingParticipants.length,
          expectedCount,
          existingList: existingParticipants.map((p: string) => p.slice(0, 8)),
        });
        
        // SAFETY GUARD: Only append if NOT already in list AND below maxPlayers
        const callerNotInList = !existingParticipants.includes(playerWallet);
        const roomNotFull = existingParticipants.length < expectedCount;
        
        if (callerNotInList && roomNotFull) {
          const updatedParticipants = [...existingParticipants, playerWallet];
          
          const updateObj: Record<string, unknown> = {
            participants: updatedParticipants,
            updated_at: new Date().toISOString(),
          };
          
          // For 2-player games, set player2_wallet if we're the joiner (not the creator)
          if (expectedCount <= 2 && !existingSession.player2_wallet) {
            if (playerWallet !== existingSession.player1_wallet) {
              updateObj.player2_wallet = playerWallet;
            }
          }
          
          const { error: updateError } = await supabase
            .from("game_sessions")
            .update(updateObj)
            .eq("room_pda", body.roomPda);
          
          if (!updateError) {
            console.log("[ranked-accept] ✅ Added caller to participants (RPC fallback):", playerWallet.slice(0, 8));
            // Don't set needsSync - we successfully synced the important part (ourselves)
          } else {
            console.warn("[ranked-accept] ⚠️ Failed to add caller to participants:", updateError);
            needsSync = true;
          }
        } else if (!callerNotInList) {
          console.log("[ranked-accept] Caller already in participants");
          // Check if sync still needed for other players
          if (existingParticipants.length < expectedCount) {
            needsSync = true;
          }
        } else {
          // Room is full but caller not in list - unusual state
          console.warn("[ranked-accept] Room full but caller not in participants:", {
            existingCount: existingParticipants.length,
            expectedCount,
            callerWallet: playerWallet.slice(0, 8),
          });
          needsSync = true;
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

    console.log("[ranked-accept] ✅ Acceptance complete for", playerWallet.slice(0, 8), needsSync ? "(needsSync)" : "");

    return new Response(
      JSON.stringify({
        success: true,
        sessionToken,
        expiresAt,
        needsSync, // Signal frontend if on-chain sync failed
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
