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
      console.log("[forfeit-game] ≡ƒô¥ Settlement logged:", { success: log.success, action: log.action });
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
    const winnerWalletOverride = body?.winnerWallet;
      const mode = body?.mode === "timeout" ? "timeout" : "manual";
    // Generate unique requestId for this request
    const requestId = crypto.randomUUID();
    const ts = new Date().toISOString();

    // ≡ƒöÆ SECURITY: roomPda is required
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

    // ≡ƒöÆ SECURITY: Require session token and derive caller wallet from DB
    const sessionRes = await requireSession(supabase, req);
    if (!sessionRes.ok) {
      console.error("[forfeit-game] Unauthorized:", { requestId, reason: sessionRes.error });
      return json200({ success: false, error: "Unauthorized", details: sessionRes.error, requestId });
    }

    const callerWallet = sessionRes.session.wallet;

    // IMPORTANT: Do NOT trust forfeitingWallet from request body.
    // Manual forfeit = caller forfeits themselves (1-tap UX, no signatures).
    // Manual forfeit = caller forfeits themselves (1-tap UX, no signatures).
    let forfeitingWallet = callerWallet;
    // PER-REQUEST DEBUG: Log immediately after deriving forfeiter
    console.log("[forfeit-game] PER_REQUEST_START", {
      requestId,
      ts,
      roomPda,
      forfeitingWallet,
      gameType,
      winnerWalletOverride,
    });
      // Idempotency: Check if forfeit already processed (use service role client to bypass RLS)
    const { data: existingSettlement } = await supabase
      .from("settlement_logs")
      .select("id, success, winner_wallet, forfeiting_wallet, signature, created_at")
      .eq("room_pda", roomPda)
      .eq("action", "forfeit")
      .eq("success", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSettlement) {
      console.log("[forfeit-game] Already forfeited. Returning existing settlement:", existingSettlement.signature);
      return new Response(
        JSON.stringify({ ok: true, alreadySettled: true, settlement: existingSettlement }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load verifier key - ONLY read VERIFIER_SECRET_KEY_V2 (no fallbacks)
    const skRaw = Deno.env.get("VERIFIER_SECRET_KEY_V2") ?? "";

    // Log env var presence for debugging
    console.log("[forfeit-game] ENV check PER_REQUEST", {
      requestId,
      VERIFIER_SECRET_KEY_V2: !!Deno.env.get("VERIFIER_SECRET_KEY_V2"),
      skRawLen: skRaw.length,
    });

    if (!skRaw.trim()) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        error_message: "VERIFIER_SECRET_KEY_V2 not set",
      });
      return json200({
        success: false,
        error: "Server configuration error: VERIFIER_SECRET_KEY_V2 not configured",
        requestId,
      });
    }

    let verifierKeypair: Keypair;
    let decodedLen = 0;

    try {
      const loaded = loadVerifierKeypair(skRaw);
      verifierKeypair = loaded.keypair;
      decodedLen = loaded.decodedLen;

      // PER-REQUEST DEBUG: Log verifier pubkey
      console.log("[forfeit-game] verifier pubkey PER_REQUEST", {
        requestId,
        verifierPubkey: verifierKeypair.publicKey.toBase58(),
        decodedLen,
      });

      // HARD SAFETY CHECK: Ensure we loaded the correct verifier
      const REQUIRED_VERIFIER = "HrQiwW3WZXdDC8c7wbsuBAw2nP1EVtzZyokp7xPJ6Wjx";
      const actual = verifierKeypair.publicKey.toBase58();

      if (actual !== REQUIRED_VERIFIER) {
        console.error("[forfeit-game] WRONG VERIFIER LOADED PER_REQUEST", {
          requestId,
          expected: REQUIRED_VERIFIER,
          actual,
        });
        return new Response(JSON.stringify({
          ok: false,
          code: "WRONG_VERIFIER_SECRET",
          expected: REQUIRED_VERIFIER,
          actual,
          requestId,
        }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }});
      }

      console.log("[forfeit-game] Γ£à Verifier pubkey matches on-chain config", { requestId });
    } catch (err) {
      console.error("[forfeit-game] Failed to parse verifier key:", { requestId, err });
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        error_message: `Invalid verifier key format: ${String((err as Error)?.message ?? err)}`,
      });
      return json200({
        success: false,
        error: "Server configuration error: invalid verifier key format",
        details: String((err as Error)?.message ?? err),
        requestId,
      });
    }

    // Solana connection with RPC URL validation and auto-fix
    const rpcUrlFromEnv =
      Deno.env.get("SOLANA_RPC_URL") ??
      Deno.env.get("VITE_SOLANA_RPC_URL") ??
      "";

    let rpcUrl = rpcUrlFromEnv.trim();

    // Auto-fix the common "missing https://" mistake
    if (rpcUrl && !rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://")) {
      console.warn("[forfeit-game] RPC URL missing protocol, adding https://");
      rpcUrl = `https://${rpcUrl}`;
    }

    // Fallback to public RPC if still invalid
    if (!rpcUrl || (!rpcUrl.startsWith("http://") && !rpcUrl.startsWith("https://"))) {
      console.warn("[forfeit-game] Invalid or missing RPC URL, using mainnet fallback");
      rpcUrl = "https://api.mainnet-beta.solana.com";
    }

    console.log("[forfeit-game] Using RPC:", rpcUrl.slice(0, 60));

    const connection = new Connection(rpcUrl, "confirmed");

    // CRITICAL: Check verifier wallet has enough SOL for transaction fees
    const MIN_VERIFIER_BALANCE = 10_000_000; // 0.01 SOL minimum for tx fees
    const verifierBalance = await connection.getBalance(verifierKeypair.publicKey, "confirmed");

    console.log("[forfeit-game] ≡ƒÆ░ Verifier balance check:", {
      pubkey: verifierKeypair.publicKey.toBase58(),
      lamports: verifierBalance,
      minRequired: MIN_VERIFIER_BALANCE,
      hasSufficientFunds: verifierBalance >= MIN_VERIFIER_BALANCE,
    });

    if (verifierBalance < MIN_VERIFIER_BALANCE) {
      console.error("[forfeit-game] Γ¥î Verifier wallet has insufficient SOL for fees!");
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        error_message: `Verifier needs funding: ${(verifierBalance / 1_000_000_000).toFixed(6)} SOL < 0.01 SOL required`,
      });
      return json200({
        success: false,
        error: "Server payout wallet needs funding",
        details: `Verifier ${verifierKeypair.publicKey.toBase58()} has ${(verifierBalance / 1_000_000_000).toFixed(6)} SOL, needs at least 0.01 SOL for transaction fees`,
        verifierPubkey: verifierKeypair.publicKey.toBase58(),
        verifierLamports: verifierBalance,
        minRequired: MIN_VERIFIER_BALANCE,
      });
    }

    // Fetch room account
    const roomPdaKey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPdaKey);

    if (!accountInfo) {
      console.error("[forfeit-game] Room not found on-chain:", roomPda);
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        error_message: "Room not found on-chain",
      });
      return json200({
        success: false,
        error: "Room not found on-chain",
      });
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        error_message: "Failed to parse room account",
      });
      return json200({
        success: false,
        error: "Failed to parse room account",
      });
    }

    // Extract players array for later use
    const playersOnChain = roomData.players.map((p) => p.toBase58());

    console.log("[forfeit-game] Room:", {
      roomId: roomData.roomId.toString(),
      status: roomData.status,
      maxPlayers: roomData.maxPlayers,
      playerCount: roomData.playerCount,
      stakeLamports: roomData.stakeLamports.toString(),
      creator: roomData.creator.toBase58(),
    });
    console.log("[forfeit-game] Players on-chain:", playersOnChain);

    // ≡ƒöÆ SECURITY: Caller must be a participant in the room
    if (!playersOnChain.includes(callerWallet)) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: callerWallet,
        error_message: "Caller not a participant in this room",
      });
      return json200({ success: false, error: "Unauthorized: not a participant", requestId });
    }

    // ΓÅ▒∩╕Å TIMEOUT MODE: opponent/server can trigger timeout ONLY if server verifies expiry
    if (mode === "timeout") {
      const { data: sessionRow, error: sessionErr } = await supabase
        .from("game_sessions")
        .select("current_turn_wallet, turn_started_at, turn_time_seconds, status_int")
        .eq("room_pda", roomPda)
        .maybeSingle();

      if (sessionErr || !sessionRow) {
        await logSettlement(supabase, {
          room_pda: roomPda,
          action: "forfeit",
          success: false,
          forfeiting_wallet: callerWallet,
          error_message: `Timeout mode: failed to load game session: ${sessionErr?.message ?? "not found"}`,
        });
        return json200({ success: false, error: "Timeout mode: game session not found", requestId });
      }

      // Optional: require active session status if present
      if (sessionRow.status_int !== null && sessionRow.status_int !== undefined && Number(sessionRow.status_int) !== 2) {
        return json200({ success: false, error: "Timeout mode: game not active", requestId });
      }

      const currentTurnWallet = String(sessionRow.current_turn_wallet ?? "").trim();
      const turnStartedAtIso = sessionRow.turn_started_at;
      const rawTurnSeconds = sessionRow.turn_time_seconds;
      const turnSeconds = (typeof rawTurnSeconds === "number" && rawTurnSeconds > 0) ? rawTurnSeconds : 60;

      if (!currentTurnWallet || !turnStartedAtIso) {
        return json200({ success: false, error: "Timeout mode: missing turn state", requestId });
      }

      const startedMs = Date.parse(turnStartedAtIso);
      if (!Number.isFinite(startedMs) || startedMs <= 0) {
