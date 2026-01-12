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
  forfeitingWallet: string; // loser / forfeiter
  gameType?: string;
  winnerWallet?: string; // OPTIONAL: explicit winner for "win" settlement reuse
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
    const forfeitingWallet = body?.forfeitingWallet;
    const gameType = body?.gameType;
    const winnerWalletOverride = body?.winnerWallet;

    // Generate unique requestId for this request
    const requestId = crypto.randomUUID();
    const ts = new Date().toISOString();

    // PER-REQUEST DEBUG: Log immediately after parsing body
    console.log("[forfeit-game] PER_REQUEST_START", {
      requestId,
      ts,
      roomPda,
      forfeitingWallet,
      gameType,
      winnerWalletOverride,
    });

    if (!roomPda || !forfeitingWallet) {
      console.error("[forfeit-game] Missing required fields:", { requestId, roomPda, forfeitingWallet });
      return json200({
        success: false,
        error: "Missing roomPda or forfeitingWallet",
      });
    }

    // Supabase client
    if (!supabase) {
      console.error("[forfeit-game] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { requestId });
      return json200({
        success: false,
        error: "Server configuration error: Supabase service credentials missing",
      });
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

      console.log("[forfeit-game] ✅ Verifier pubkey matches on-chain config", { requestId });
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

    // Solana connection
    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // CRITICAL: Check verifier wallet has enough SOL for transaction fees
    const MIN_VERIFIER_BALANCE = 10_000_000; // 0.01 SOL minimum for tx fees
    const verifierBalance = await connection.getBalance(verifierKeypair.publicKey, "confirmed");

    console.log("[forfeit-game] 💰 Verifier balance check:", {
      pubkey: verifierKeypair.publicKey.toBase58(),
      lamports: verifierBalance,
      minRequired: MIN_VERIFIER_BALANCE,
      hasSufficientFunds: verifierBalance >= MIN_VERIFIER_BALANCE,
    });

    if (verifierBalance < MIN_VERIFIER_BALANCE) {
      console.error("[forfeit-game] ❌ Verifier wallet has insufficient SOL for fees!");
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

    // FIX B: Sync on-chain players to game_sessions (prevent player2_wallet corruption)
    if (playersOnChain.length >= 1) {
      const { error: syncError } = await supabase
        .from("game_sessions")
        .update({
          player1_wallet: playersOnChain[0] ?? null,
          player2_wallet: playersOnChain[1] ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      if (syncError) {
        console.error("[forfeit-game] Failed to sync players to DB:", syncError);
      } else {
        console.log("[forfeit-game] ✅ Synced on-chain players to game_sessions:", {
          player1: playersOnChain[0],
          player2: playersOnChain[1] ?? "none",
        });
      }
    }

    // Validate forfeiter is in room
    const forfeitingPubkey = new PublicKey(forfeitingWallet);
    const playerIndex = roomData.players.findIndex((p) => p.equals(forfeitingPubkey));
    if (playerIndex === -1) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        room_status: roomData.status,
        error_message: "Player not in this room",
      });
      return json200({
        success: false,
        error: "Player not in this room",
      });
    }

    // Validate room state (must have 2+ players and not finished/cancelled)
    if (roomData.playerCount < 2) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        player_count: roomData.playerCount,
        room_status: roomData.status,
        error_message: "Room has only 1 player",
      });
      return json200({
        success: false,
        error: "Room has only 1 player. Use Cancel to get refund.",
      });
    }

    // status values depend on your program; keeping your logic:
    // 3 finished, 4 cancelled
    if (roomData.status === 3 || roomData.status === 4) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: true,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        room_status: roomData.status,
        error_message: "Room already closed (no action needed)",
      });
      return json200({
        success: true,
        action: "already_closed",
        message: "Room is already closed",
        roomPda,
      });
    }

    // Determine winner
    const isLudo = gameType === "ludo" || roomData.maxPlayers > 2;

    // Ludo multi-player elimination path (NO on-chain submit_result)
    if (isLudo && roomData.playerCount > 2) {
      console.log("[forfeit-game] Ludo multi-player: marking eliminated in DB only");

      const { data: sessionData, error: sessionError } = await supabase
        .from("game_sessions")
        .select("game_state")
        .eq("room_pda", roomPda)
        .single();

      if (sessionError) {
        console.error("[forfeit-game] Failed to fetch game session:", sessionError);
      } else {
        const currentState = (sessionData?.game_state || {}) as Record<string, unknown>;
        const eliminatedPlayers = (currentState.eliminatedPlayers as string[] | undefined) || [];
        eliminatedPlayers.push(forfeitingWallet);

        const { error: updateError } = await supabase
          .from("game_sessions")
          .update({
            game_state: { ...currentState, eliminatedPlayers },
            updated_at: new Date().toISOString(),
          })
          .eq("room_pda", roomPda);

        if (updateError) {
          console.error("[forfeit-game] Failed to update game state:", updateError);
        }
      }

      return json200({
        success: true,
        action: "eliminated",
        message: "Player eliminated from Ludo game",
        forfeitingWallet,
      });
    }

    // 2-player winner: either explicit override OR "the other player"
    let winnerPubkey: PublicKey;

    if (winnerWalletOverride) {
      winnerPubkey = new PublicKey(winnerWalletOverride);
      console.log("[forfeit-game] Using explicit winnerWallet:", winnerWalletOverride);

      // safety: ensure winner is actually in room
      const ok = roomData.players.some((p) => p.equals(winnerPubkey));
      if (!ok) {
        await logSettlement(supabase, {
          room_pda: roomPda,
          action: "forfeit",
          success: false,
          forfeiting_wallet: forfeitingWallet,
          winner_wallet: winnerWalletOverride,
          verifier_pubkey: verifierKeypair.publicKey.toBase58(),
          verifier_lamports: verifierBalance,
          room_status: roomData.status,
          error_message: "winnerWallet is not a player in this room",
        });
        return json200({
          success: false,
          error: "winnerWallet is not a player in this room",
        });
      }
    } else {
      const winnerIndex = playerIndex === 0 ? 1 : 0;
      if (winnerIndex >= roomData.players.length) {
        await logSettlement(supabase, {
          room_pda: roomPda,
          action: "forfeit",
          success: false,
          forfeiting_wallet: forfeitingWallet,
          verifier_pubkey: verifierKeypair.publicKey.toBase58(),
          verifier_lamports: verifierBalance,
          player_count: roomData.playerCount,
          room_status: roomData.status,
          error_message: "Cannot determine winner - only one player",
        });
        return json200({
          success: false,
          error: "Cannot determine winner - room appears to have only one player",
        });
      }
      winnerPubkey = roomData.players[winnerIndex];
    }

    const winnerWallet = winnerPubkey.toBase58();
    console.log("[forfeit-game] Winner:", winnerWallet);

    // Build submit_result instruction
    const submitResultDiscriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);

    const [configPda] = PublicKey.findProgramAddressSync([new TextEncoder().encode("config")], PROGRAM_ID);

    // ─────────────────────────────────────────────────────────────
    // CRITICAL FIX: Fetch Config account to get fee_recipient dynamically
    // This fixes BadFeeRecipient (0x177a) error
    // ─────────────────────────────────────────────────────────────
    const configAccountInfo = await connection.getAccountInfo(configPda);
    if (!configAccountInfo) {
      console.error("[forfeit-game] ❌ Config account not found on-chain");
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        error_message: "Config account not found on-chain",
      });
      return json200({
        success: false,
        error: "Config account not initialized on-chain",
      });
    }

    const configData = parseConfigAccount(configAccountInfo.data);
    if (!configData) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        error_message: "Failed to parse config account",
      });
      return json200({
        success: false,
        error: "Failed to parse config account",
      });
    }

    // Log parsed config for debugging
    console.log("[forfeit-game] 📋 On-chain config:", {
      authority: configData.authority.toBase58(),
      feeRecipient: configData.feeRecipient.toBase58(),
      feeBps: configData.feeBps,
      verifier: configData.verifier.toBase58(),
    });

    // Validate verifier matches on-chain config
    if (!configData.verifier.equals(verifierKeypair.publicKey)) {
      console.error("[forfeit-game] ❌ Verifier mismatch with on-chain config!", {
        expected: configData.verifier.toBase58(),
        actual: verifierKeypair.publicKey.toBase58(),
      });
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        forfeiting_wallet: forfeitingWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        error_message: `Verifier mismatch: expected ${configData.verifier.toBase58()}, got ${verifierKeypair.publicKey.toBase58()}`,
      });
      return json200({
        success: false,
        error: "Verifier mismatch with on-chain config",
        expected: configData.verifier.toBase58(),
        actual: verifierKeypair.publicKey.toBase58(),
      });
    }

    console.log("[forfeit-game] ✅ Verifier matches on-chain config");

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), roomPdaKey.toBuffer()],
      PROGRAM_ID,
    );

    // FIX A: Enhanced vault sanity check with better diagnostics
    const vaultLamports = await connection.getBalance(vaultPda, "confirmed");
    const stakePerPlayer = Number(roomData.stakeLamports);
    const playerCount = roomData.playerCount;
    const expectedPot = stakePerPlayer * playerCount;
    const RENT_EXEMPT_MINIMUM = 890880; // ~0.00089 SOL rent-exempt minimum
    const effectiveBalance = Math.max(0, vaultLamports - RENT_EXEMPT_MINIMUM);

    console.log("[forfeit-game] 🏦 Vault sanity check:", {
      vault: vaultPda.toBase58(),
      vaultLamports,
      stakePerPlayer,
      playerCount,
      expectedPot,
      rentExempt: RENT_EXEMPT_MINIMUM,
      effectiveBalance,
      canPayout: effectiveBalance >= expectedPot,
    });

    // FIX A: If vault doesn't have enough to cover the stake payout, return detailed error
    if (effectiveBalance < expectedPot) {
      console.error("[forfeit-game] ❌ Vault underfunded - cannot settle:", {
        vault: vaultPda.toBase58(),
        vaultLamports,
        expectedPot,
        shortfall: expectedPot - effectiveBalance,
      });

      // Log the failure
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        winner_wallet: winnerWallet,
        forfeiting_wallet: forfeitingWallet,
        vault_pda: vaultPda.toBase58(),
        vault_lamports: vaultLamports,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        stake_per_player: stakePerPlayer,
        player_count: playerCount,
        expected_pot: expectedPot,
        room_status: roomData.status,
        error_message: `Vault underfunded: ${vaultLamports} lamports, need ${expectedPot}`,
      });

      // Fetch existing game state
      const { data: sessionData } = await supabase
        .from("game_sessions")
        .select("game_state")
        .eq("room_pda", roomPda)
        .single();

      const existingState = (sessionData?.game_state || {}) as Record<string, unknown>;

      // Update game_sessions to mark as finished with void settlement
      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({
          status: "finished",
          game_state: {
            ...existingState,
            playersOnChain: playersOnChain,
            voidSettlement: true,
            reason: "vault_underfunded",
            vaultLamports,
            expectedPot,
            shortfall: expectedPot - effectiveBalance,
            clearedAt: new Date().toISOString(),
            intendedWinner: winnerWallet,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      if (updateError) {
        console.error("[forfeit-game] Failed to void-clear session:", updateError);
      }

      return json200({
        success: false,
        error: "Vault underfunded",
        action: "void_cleared",
        message: "Vault has insufficient funds for payout. Deposits may have gone to wrong address.",
        details: {
          vault: vaultPda.toBase58(),
          vaultLamports,
          expectedPot,
          shortfall: expectedPot - effectiveBalance,
          stakePerPlayer,
          playerCount,
        },
        roomPda,
        intendedWinner: winnerWallet,
        vaultLamports,
        verifierLamports: verifierBalance,
      });
    }

    // Wrap settlement in try/catch - void-clear on ANY failure
    try {
      // data = discriminator (8) + winner pubkey (32)
      const ixData = new Uint8Array(8 + 32);
      ixData.set(submitResultDiscriminator, 0);
      ixData.set(winnerPubkey.toBytes(), 8);

      const submitResultIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false }, // verifier
          { pubkey: configPda, isSigner: false, isWritable: false }, // config
          { pubkey: roomPdaKey, isSigner: false, isWritable: true }, // room
          { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault
          { pubkey: winnerPubkey, isSigner: false, isWritable: true }, // winner
          { pubkey: configData.feeRecipient, isSigner: false, isWritable: true }, // fee recipient (DYNAMIC from config!)
        ],
        data: ixData as any,
      });

      console.log("[forfeit-game] submit_result accounts:", {
        verifier: verifierKeypair.publicKey.toBase58(),
        config: configPda.toBase58(),
        room: roomPdaKey.toBase58(),
        vault: vaultPda.toBase58(),
        winner: winnerPubkey.toBase58(),
        feeRecipient: configData.feeRecipient.toBase58(), // Now using dynamic value
        rpc: rpcUrl,
        decodedLen,
      });

      // Build + sign tx
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: verifierKeypair.publicKey,
        recentBlockhash: blockhash,
      }).add(submitResultIx);

      tx.sign(verifierKeypair);

      console.log("[forfeit-game] Sending submit_result...");

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("[forfeit-game] Sent:", signature);

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      if (confirmation.value.err) {
        // Throw to trigger void-clear in catch block
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("[forfeit-game] ✅ Confirmed:", signature);

      // LOG SUCCESS
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: true,
        signature,
        winner_wallet: winnerWallet,
        forfeiting_wallet: forfeitingWallet,
        vault_pda: vaultPda.toBase58(),
        vault_lamports: vaultLamports,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        stake_per_player: stakePerPlayer,
        player_count: playerCount,
        expected_pot: expectedPot,
        room_status: roomData.status,
      });

      // Record match result (best effort) - use already extracted playersOnChain
      const { error: rpcError } = await supabase.rpc("record_match_result", {
        p_room_pda: roomPda,
        p_finalize_tx: signature,
        p_winner_wallet: winnerWallet,
        p_game_type: gameType || "unknown",
        p_max_players: roomData.maxPlayers,
        p_stake_lamports: Number(roomData.stakeLamports),
        p_mode: "ranked",
        p_players: playersOnChain,
      });

      if (rpcError) {
        console.error("[forfeit-game] record_match_result failed:", rpcError);
        // not fatal
      }

      // Finish session (best effort)
      const { error: finishErr } = await supabase.rpc("finish_game_session", {
        p_room_pda: roomPda,
        p_caller_wallet: forfeitingWallet,
      });

      if (finishErr) {
        console.error("[forfeit-game] finish_game_session failed:", finishErr);
      }

      // ─────────────────────────────────────────────────────────────
      // AUTO CLOSE ROOM: Refund rent to creator after successful settlement
      // close_room requires NO creator signature - verifier can pay fees
      // ─────────────────────────────────────────────────────────────
      let closeRoomSignature: string | null = null;
      let closeRoomError: string | null = null;

      try {
        console.log("[forfeit-game] Closing room to refund rent...", {
          room: roomPdaKey.toBase58(),
          creator: roomData.creator.toBase58(),
        });

        // close_room discriminator: [152, 197, 88, 192, 98, 197, 51, 211]
        const closeRoomDiscriminator = new Uint8Array([152, 197, 88, 192, 98, 197, 51, 211]);

        // close_room accounts ORDER (from IDL):
        // 1) room     signer=false writable=true
        // 2) creator  signer=false writable=true
        const closeRoomIx = new TransactionInstruction({
          programId: PROGRAM_ID,
          keys: [
            { pubkey: roomPdaKey, isSigner: false, isWritable: true },         // room
            { pubkey: roomData.creator, isSigner: false, isWritable: true },   // creator
          ],
          data: closeRoomDiscriminator as any,
        });

        // Build + sign close_room tx (verifier pays fees)
        const { blockhash: closeBlockhash, lastValidBlockHeight: closeLastValid } = 
          await connection.getLatestBlockhash("confirmed");

        const closeTx = new Transaction({
          feePayer: verifierKeypair.publicKey,
          recentBlockhash: closeBlockhash,
        }).add(closeRoomIx);

        closeTx.sign(verifierKeypair);

        closeRoomSignature = await connection.sendRawTransaction(closeTx.serialize(), {
          skipPreflight: false,
          preflightCommitment: "confirmed",
        });

        console.log("[forfeit-game] close_room sent:", closeRoomSignature);

        const closeConfirmation = await connection.confirmTransaction(
          { signature: closeRoomSignature, blockhash: closeBlockhash, lastValidBlockHeight: closeLastValid },
          "confirmed",
        );

        if (closeConfirmation.value.err) {
          throw new Error(`close_room failed: ${JSON.stringify(closeConfirmation.value.err)}`);
        }

        console.log("[forfeit-game] ✅ close_room confirmed", { closeSig: closeRoomSignature });

      } catch (closeErr) {
        // close_room failure is NOT fatal - forfeit payout already succeeded
        closeRoomError = String((closeErr as Error)?.message ?? closeErr);
        console.warn("[forfeit-game] ⚠️ close_room failed", { error: closeRoomError });
      }

      return json200({
        success: true,
        action: "forfeit",
        signature,
        winnerWallet,
        forfeitingWallet,
        vaultLamports,
        verifierLamports: verifierBalance,
        closeRoomSignature,
        closeRoomError,
      });

    } catch (settlementError) {
      console.error("[forfeit-game] Settlement failed - void clearing room:", settlementError);

      // LOG FAILURE
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit",
        success: false,
        winner_wallet: winnerWallet,
        forfeiting_wallet: forfeitingWallet,
        vault_pda: vaultPda.toBase58(),
        vault_lamports: vaultLamports,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        stake_per_player: stakePerPlayer,
        player_count: playerCount,
        expected_pot: expectedPot,
        room_status: roomData.status,
        error_message: String((settlementError as Error)?.message ?? settlementError),
      });

      // Fetch existing game state for merge
      const { data: sessionData } = await supabase
        .from("game_sessions")
        .select("game_state")
        .eq("room_pda", roomPda)
        .single();

      const existingState = (sessionData?.game_state || {}) as Record<string, unknown>;

      // Update session to finished with void settlement - include players and vault info
      const { error: updateError } = await supabase
        .from("game_sessions")
        .update({
          status: "finished",
          game_state: {
            ...existingState,
            playersOnChain: playersOnChain,
            voidSettlement: true,
            reason: "settlement_failed",
            clearedAt: new Date().toISOString(),
            intendedWinner: winnerWallet,
            settlementError: String((settlementError as Error)?.message ?? settlementError),
            vaultLamports,
            expectedPot,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      if (updateError) {
        console.error("[forfeit-game] Failed to void-clear session:", updateError);
      }

      return json200({
        success: false,
        action: "void_cleared",
        message: "Settlement failed; room cleared without payout",
        error: String((settlementError as Error)?.message ?? settlementError),
        roomPda,
        intendedWinner: winnerWallet,
        vaultLamports,
        verifierLamports: verifierBalance,
      });
    }
  } catch (error) {
    console.error("[forfeit-game] Unexpected error:", error);
    return json200({
      success: false,
      error: "Unexpected server error",
      details: String((error as Error)?.message ?? error),
    });
  }
});
