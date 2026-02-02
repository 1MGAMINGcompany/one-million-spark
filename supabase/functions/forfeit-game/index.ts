import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "npm:@solana/web3.js@1.95.0";
import bs58 from "npm:bs58@5.0.0";
import { requireSession } from "../_shared/requireSession.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json200(body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Mainnet production Program ID - MUST match solana-program.ts
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// NOTE: FEE_RECIPIENT is now fetched dynamically from on-chain Config account
// to avoid BadFeeRecipient (0x177a) error caused by mismatch with config.fee_recipient

interface ForfeitRequest {
  roomPda: string;

  // NOTE: Do not trust any wallet from request body.
  // Manual mode uses caller wallet from session token.
  // Timeout mode uses server-derived current_turn_wallet after DB expiry check.
  forfeitingWallet?: string;

  gameType?: string;
  winnerWallet?: string; // OPTIONAL: explicit winner for "win" settlement reuse
  mode?: "manual" | "timeout";
}

// Room account layout from IDL:
// - 8 bytes discriminator
// - 8 bytes room_id (u64)
// - 32 bytes creator (pubkey)
// - 1 byte game_type (u8)
// - 1 byte max_players (u8)
// - 1 byte player_count (u8)
// - 1 byte status (u8)
// - 8 bytes stake_lamports (u64)
// - 32 bytes winner (pubkey)
// - 128 bytes players array (4 x 32 bytes)
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
    console.error("[forfeit-game] Failed to parse room account:", e);
    return null;
  }
}

// Config account layout from IDL:
// - 8 bytes discriminator
// - 32 bytes authority (pubkey)
// - 32 bytes fee_recipient (pubkey)
// - 2 bytes fee_bps (u16, little-endian)
// - 32 bytes verifier (pubkey)
// Total: 106 bytes
interface ParsedConfig {
  authority: PublicKey;
  feeRecipient: PublicKey;
  feeBps: number;
  verifier: PublicKey;
}

function parseConfigAccount(data: Uint8Array): ParsedConfig | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    let offset = 8; // Skip 8-byte discriminator

    // authority: Pubkey (32 bytes)
    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // fee_recipient: Pubkey (32 bytes)
    const feeRecipient = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    // fee_bps: u16 (2 bytes, little-endian)
    const feeBps = view.getUint16(offset, true);
    offset += 2;

    // verifier: Pubkey (32 bytes)
    const verifier = new PublicKey(data.slice(offset, offset + 32));

    return { authority, feeRecipient, feeBps, verifier };
  } catch (e) {
    console.error("[forfeit-game] Failed to parse config account:", e);
    return null;
  }
}

function loadVerifierKeypair(secret: string): { keypair: Keypair; decodedLen: number } {
  const keyString = secret.trim();
  let bytes: Uint8Array;

  if (keyString.startsWith("[")) {
    bytes = new Uint8Array(JSON.parse(keyString));
  } else {
    bytes = bs58.decode(keyString);
  }

  const decodedLen = bytes.length;

  if (decodedLen === 64) {
    return { keypair: Keypair.fromSecretKey(bytes), decodedLen };
  }
  if (decodedLen === 32) {
    return { keypair: Keypair.fromSeed(bytes), decodedLen };
  }

  throw new Error(`Invalid verifier key length: ${decodedLen} (expected 64 or 32)`);
}

// Helper to log settlement attempt (success or failure)
// deno-lint-ignore no-explicit-any
async function logSettlement(
  supabase: any,
  log: Record<string, unknown>
) {
  try {
    const { error } = await supabase.from("settlement_logs").insert(log);
    if (error) {
      console.error("[forfeit-game] Failed to log settlement:", error);
    } else {
      console.log("[forfeit-game] 📝 Settlement logged:", { success: log.success, action: log.action });
    }
  } catch (e) {
    console.error("[forfeit-game] Exception logging settlement:", e);
  }
}

Deno.serve(async (req: Request) => {
  // DEBUG: First log immediately on entry
  console.log("[forfeit-game] HIT", {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });

  // CORS preflight
  if (req.method === "OPTIONS") {
    console.log("[forfeit-game] OPTIONS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize supabase early for logging
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  try {
    const body = (await req.json().catch(() => null)) as ForfeitRequest | null;

    const roomPda = body?.roomPda;
    const gameType = body?.gameType;
    const mode = body?.mode === "timeout" ? "timeout" : "manual";
    
    // 🔒 SECURITY (A): NEVER trust winnerWallet from body - always derive from participants
    // winnerWalletOverride is intentionally ignored for security
    
    // Generate unique requestId for this request
    const requestId = crypto.randomUUID();
    const ts = new Date().toISOString();

    // 🔒 SECURITY: roomPda is required
    if (!roomPda) {
      console.error("[forfeit-game] Missing required field:", { requestId, roomPda });
      return json200({ success: false, error: "Missing roomPda", requestId });
    }

    // Supabase client (admin for bypassing RLS)
    if (!supabase) {
      console.error("[forfeit-game] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { requestId });
      return json200({
        success: false,
        error: "Server configuration error: Supabase service credentials missing",
        requestId,
      });
    }

    // 🔒 SECURITY: Require session token and derive caller wallet from DB
    const sessionRes = await requireSession(supabase, req);
    if (!sessionRes.ok) {
      console.error("[forfeit-game] Unauthorized:", { requestId, reason: sessionRes.error });
      return json200({ success: false, error: "Unauthorized", details: sessionRes.error, requestId });
    }

    const callerWallet = sessionRes.session.wallet;

    // 🔒 SECURITY (B): Fetch game_sessions EARLY and validate caller is participant
    const { data: sessionRow, error: sessionError } = await supabase
      .from("game_sessions")
      .select("player1_wallet, player2_wallet, participants, current_turn_wallet, turn_started_at, turn_time_seconds, status_int")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      console.error("[forfeit-game] Game session not found:", { requestId, roomPda, error: sessionError });
      return json200({ success: false, error: "Game session not found", requestId });
    }

    // 🔒 SECURITY (B): Validate caller is a participant (applies to BOTH manual + timeout)
    const dbParticipants: string[] = sessionRow.participants?.length 
      ? sessionRow.participants 
      : [sessionRow.player1_wallet, sessionRow.player2_wallet].filter(Boolean);
    
    const isCallerParticipant = dbParticipants.includes(callerWallet);
    
    if (!isCallerParticipant) {
      console.error("[forfeit-game] Forbidden: caller not a participant", { 
        requestId, 
        callerWallet, 
        participants: dbParticipants 
      });
      return json200({ success: false, error: "Forbidden", requestId });
    }

    // 🔒 SECURITY (A): forfeitingWallet is NEVER read from body
    // - Manual mode: caller forfeits themselves
    // - Timeout mode: derived from DB current_turn_wallet after expiry check
    let forfeitingWallet: string;

    if (mode === "timeout") {
      // 🔒 SECURITY (C): Timeout mode - validate turn is expired and current_turn_wallet exists
      if (!sessionRow.current_turn_wallet) {
        console.error("[forfeit-game] Timeout mode: no current turn wallet", { requestId, roomPda });
        return json200({ success: false, error: "Timeout mode: no current turn", requestId });
      }

      const startedMs = Date.parse(sessionRow.turn_started_at);
      const turnSeconds = Number(sessionRow.turn_time_seconds || 60);
      const expired = Date.now() > startedMs + turnSeconds * 1000;

      if (!expired) {
        return json200({ success: false, error: "Timeout not yet expired", requestId });
      }

      forfeitingWallet = sessionRow.current_turn_wallet;
    } else {
      // Manual mode: caller forfeits themselves (1-tap UX)
      forfeitingWallet = callerWallet;
    }

    // PER-REQUEST DEBUG
    console.log("[forfeit-game] PER_REQUEST_START", {
      requestId,
      ts,
      roomPda,
      mode,
      callerWallet,
      forfeitingWallet,
      gameType,
      participantCount: dbParticipants.length,
    });

    // Idempotency: already settled?
    const { data: existingSettlement } = await supabase
      .from("settlement_logs")
      .select("id, success, signature")
      .eq("room_pda", roomPda)
      .eq("action", "forfeit")
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSettlement) {
      return json200({
        success: true,
        alreadySettled: true,
        signature: existingSettlement.signature,
      });
    }

    // Load verifier key
    const skRaw = Deno.env.get("VERIFIER_SECRET_KEY_V2") ?? "";
    if (!skRaw.trim()) {
      return json200({
        success: false,
        error: "VERIFIER_SECRET_KEY_V2 not configured",
        requestId,
      });
    }

    const { keypair: verifierKeypair } = loadVerifierKeypair(skRaw);

    const rpcUrl =
      (Deno.env.get("SOLANA_RPC_URL") ||
        Deno.env.get("VITE_SOLANA_RPC_URL") ||
        "https://api.mainnet-beta.solana.com").replace(/^([^h])/, "https://$1");

    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch room
    const roomPdaKey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPdaKey);

    if (!accountInfo) {
      return json200({ success: false, error: "Room not found on-chain" });
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      return json200({ success: false, error: "Failed to parse room account" });
    }

    const playersOnChain = roomData.players.map((p) => p.toBase58());

    // 🔒 SECURITY: Cross-check caller is also in on-chain players (defense in depth)
    if (!playersOnChain.includes(callerWallet)) {
      console.error("[forfeit-game] Caller not in on-chain players", { 
        requestId, 
        callerWallet, 
        playersOnChain 
      });
      return json200({
        success: false,
        error: "Unauthorized: not a participant on-chain",
        requestId,
      });
    }

    // 🔒 SECURITY (C): Derive winner from participants - NEVER use body override
    // For 2-player games: winner is the other participant
    // For N-player: current logic only supports 2-player settlement
    let winnerPubkey: PublicKey;

    if (dbParticipants.length === 2) {
      // 2-player game: winner is the participant who is NOT forfeiting
      const winnerWallet = dbParticipants.find(p => p !== forfeitingWallet);
      if (!winnerWallet) {
        console.error("[forfeit-game] Could not derive winner", { 
          requestId, 
          forfeitingWallet, 
          dbParticipants 
        });
        return json200({ success: false, error: "Could not derive winner", requestId });
      }
      winnerPubkey = new PublicKey(winnerWallet);
    } else if (dbParticipants.length > 2) {
      // N-player (e.g., Ludo): for now, only elimination is supported, not full settlement
      // Keep existing behavior: derive from on-chain data as fallback
      const loserIndex = playersOnChain.indexOf(forfeitingWallet);
      if (loserIndex === -1) {
        return json200({ success: false, error: "Forfeiter not found on-chain", requestId });
      }
      // For N-player, we pick the first non-forfeiter (simplified logic)
      const winnerIndex = loserIndex === 0 ? 1 : 0;
      winnerPubkey = roomData.players[winnerIndex];
      console.warn("[forfeit-game] N-player forfeit using simplified winner logic", { 
        requestId, 
        winnerIndex,
        playerCount: dbParticipants.length 
      });
    } else {
      return json200({ success: false, error: "Invalid participant count", requestId });
    }

    const submitResultDiscriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);

    const [configPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("config")],
      PROGRAM_ID
    );

    const configInfo = await connection.getAccountInfo(configPda);
    if (!configInfo) {
      return json200({ success: false, error: "Config account missing" });
    }

    const configData = parseConfigAccount(configInfo.data);
    if (!configData) {
      return json200({ success: false, error: "Config parse failed" });
    }

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), roomPdaKey.toBuffer()],
      PROGRAM_ID
    );

    const ixData = new Uint8Array(8 + 32);
    ixData.set(submitResultDiscriminator, 0);
    ixData.set(winnerPubkey.toBytes(), 8);

    const ix = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: roomPdaKey, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: winnerPubkey, isSigner: false, isWritable: true },
        { pubkey: configData.feeRecipient, isSigner: false, isWritable: true },
        { pubkey: roomData.creator, isSigner: false, isWritable: true },
      ],
      data: ixData,
    });

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    const tx = new Transaction({
      feePayer: verifierKeypair.publicKey,
      recentBlockhash: blockhash,
    }).add(ix);

    tx.sign(verifierKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize());
    await connection.confirmTransaction(signature, "confirmed");

    await logSettlement(supabase, {
      room_pda: roomPda,
      action: "forfeit",
      success: true,
      signature,
      winner_wallet: winnerPubkey.toBase58(),
      forfeiting_wallet: forfeitingWallet,
    });

    return json200({
      success: true,
      action: "forfeit",
      signature,
      winnerWallet: winnerPubkey.toBase58(),
      forfeitingWallet,
    });

  } catch (error) {
    console.error("[forfeit-game] Unexpected error:", error);
    return json200({
      success: false,
      error: "Unexpected server error",
      details: String((error as Error)?.message ?? error),
    });
  }
});
