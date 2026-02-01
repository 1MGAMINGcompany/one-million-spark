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
    const winnerWalletOverride = body?.winnerWallet;
    const mode = body?.mode === "timeout" ? "timeout" : "manual";
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

    // IMPORTANT: Do NOT trust forfeitingWallet from request body.
    // Manual forfeit = caller forfeits themselves (1-tap UX, no signatures).
