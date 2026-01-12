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

// Mainnet production Program ID
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

interface SettleGameRequest {
  roomPda: string;
  reason?: "gameover" | "resign" | "timeout";
  gameType?: string;
  mode?: "casual" | "ranked";
}

// Room account layout from IDL
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
    console.error("[settle-game] Failed to parse room account:", e);
    return null;
  }
}

// Config account layout from IDL
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

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const feeRecipient = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const feeBps = view.getUint16(offset, true);
    offset += 2;

    const verifier = new PublicKey(data.slice(offset, offset + 32));

    return { authority, feeRecipient, feeBps, verifier };
  } catch (e) {
    console.error("[settle-game] Failed to parse config account:", e);
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

// Helper to log settlement attempt
// deno-lint-ignore no-explicit-any
async function logSettlement(
  supabase: any,
  log: Record<string, unknown>
) {
  try {
    const { error } = await supabase.from("settlement_logs").insert(log);
    if (error) {
      console.error("[settle-game] Failed to log settlement:", error);
    } else {
      console.log("[settle-game] 📝 Settlement logged:", { success: log.success, action: log.action });
    }
  } catch (e) {
    console.error("[settle-game] Exception logging settlement:", e);
  }
}

Deno.serve(async (req: Request) => {
  console.log("[settle-game] HIT", {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });

  // CORS preflight
  if (req.method === "OPTIONS") {
    console.log("[settle-game] OPTIONS preflight");
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize supabase early for logging
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  try {
    const body = (await req.json().catch(() => null)) as SettleGameRequest | null;

    const roomPda = body?.roomPda;
    const reason = body?.reason || "gameover";
    const requestedGameType = body?.gameType;
    const mode = body?.mode || "ranked";

    const requestId = crypto.randomUUID();
    const ts = new Date().toISOString();

    console.log("[settle-game] PER_REQUEST_START", {
      requestId,
      ts,
      roomPda,
      reason,
      mode,
    });

    // Validate required fields
    if (!roomPda) {
      return json200({ success: false, error: "Missing roomPda" });
    }

    if (!supabase) {
      console.error("[settle-game] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY", { requestId });
      return json200({
        success: false,
        error: "Server configuration error: Supabase service credentials missing",
      });
    }

    // ─────────────────────────────────────────────────────────────
    // FETCH GAME SESSION TO DETERMINE WINNER FROM DATABASE
    // ─────────────────────────────────────────────────────────────
    const { data: sessionRow, error: sessionError } = await supabase
      .from("game_sessions")
      .select("player1_wallet, player2_wallet, game_state, game_type")
      .eq("room_pda", roomPda)
      .single();

    if (sessionError || !sessionRow) {
      console.error("[settle-game] Game session not found:", sessionError);
      return json200({
        success: false,
        error: "Game session not found",
        roomPda,
      });
    }

    // Extract winner color from game_state.gameOver
    const gameState = sessionRow.game_state as Record<string, unknown> | null;
    const winnerColor = gameState?.gameOver as string | undefined;

    if (!winnerColor) {
      console.error("[settle-game] No winner in game_state.gameOver:", { gameState });
      return json200({
        success: false,
        error: "No winner determined in game_state.gameOver",
        roomPda,
      });
    }

    // Map winner color to wallet: gold -> player1_wallet, obsidian -> player2_wallet
    let winnerWallet: string;
    if (winnerColor === "gold") {
      winnerWallet = sessionRow.player1_wallet;
    } else if (winnerColor === "obsidian") {
      winnerWallet = sessionRow.player2_wallet;
    } else {
      console.error("[settle-game] Unknown winner color:", winnerColor);
      return json200({
        success: false,
        error: `Unknown winner color: ${winnerColor}`,
        roomPda,
      });
    }

    if (!winnerWallet) {
      console.error("[settle-game] Winner wallet is null:", { winnerColor, sessionRow });
      return json200({
        success: false,
        error: "Winner wallet is null in game session",
        roomPda,
        winnerColor,
      });
    }

    // Use gameType from DB if not provided in request
    const gameType = sessionRow.game_type || requestedGameType || "unknown";

    console.log("[settle-game] 🏆 Winner determined from DB:", {
      winnerColor,
      winnerWallet: winnerWallet.slice(0, 8) + "...",
      player1: sessionRow.player1_wallet?.slice(0, 8),
      player2: sessionRow.player2_wallet?.slice(0, 8),
      gameType,
    });

    // Load verifier key
    const skRaw = Deno.env.get("VERIFIER_SECRET_KEY_V2") ?? "";

    console.log("[settle-game] ENV check", {
      requestId,
      VERIFIER_SECRET_KEY_V2: !!Deno.env.get("VERIFIER_SECRET_KEY_V2"),
      skRawLen: skRaw.length,
    });

    if (!skRaw.trim()) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

      console.log("[settle-game] verifier pubkey", {
        requestId,
        verifierPubkey: verifierKeypair.publicKey.toBase58(),
        decodedLen,
      });

      // Hard safety check for correct verifier
      const REQUIRED_VERIFIER = "HrQiwW3WZXdDC8c7wbsuBAw2nP1EVtzZyokp7xPJ6Wjx";
      const actual = verifierKeypair.publicKey.toBase58();

      if (actual !== REQUIRED_VERIFIER) {
        console.error("[settle-game] WRONG VERIFIER LOADED", {
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

      console.log("[settle-game] ✅ Verifier pubkey matches on-chain config", { requestId });
    } catch (err) {
      console.error("[settle-game] Failed to parse verifier key:", { requestId, err });
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

    // Check verifier balance
    const MIN_VERIFIER_BALANCE = 10_000_000; // 0.01 SOL minimum
    const verifierBalance = await connection.getBalance(verifierKeypair.publicKey, "confirmed");

    console.log("[settle-game] 💰 Verifier balance check:", {
      pubkey: verifierKeypair.publicKey.toBase58(),
      lamports: verifierBalance,
      minRequired: MIN_VERIFIER_BALANCE,
      hasSufficientFunds: verifierBalance >= MIN_VERIFIER_BALANCE,
    });

    if (verifierBalance < MIN_VERIFIER_BALANCE) {
      console.error("[settle-game] ❌ Verifier wallet has insufficient SOL for fees!");
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

    // IDEMPOTENCY: If room account not found, it's already closed
    if (!accountInfo) {
      console.log("[settle-game] Room account not found - already closed:", roomPda);
      return json200({
        success: true,
        alreadyClosed: true,
        message: "Room already closed (account not found)",
        roomPda,
      });
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        error_message: "Failed to parse room account",
      });
      return json200({
        success: false,
        error: "Failed to parse room account",
      });
    }

    const playersOnChain = roomData.players.map((p) => p.toBase58());

    console.log("[settle-game] Room:", {
      roomId: roomData.roomId.toString(),
      status: roomData.status,
      maxPlayers: roomData.maxPlayers,
      playerCount: roomData.playerCount,
      stakeLamports: roomData.stakeLamports.toString(),
      creator: roomData.creator.toBase58(),
    });
    console.log("[settle-game] Players on-chain:", playersOnChain);

    // IDEMPOTENCY: If room is already Finished (status == 3)
    if (roomData.status === 3) {
      console.log("[settle-game] Room already settled (status=3):", roomPda);
      return json200({
        success: true,
        alreadySettled: true,
        message: "Room already settled (status=Finished)",
        roomPda,
        winner: roomData.winner.toBase58(),
      });
    }

    // If room is cancelled (status == 4), return error
    if (roomData.status === 4) {
      return json200({
        success: false,
        error: "Room is cancelled - cannot settle",
        roomPda,
      });
    }

    // Validate winner is in room
    const winnerPubkey = new PublicKey(winnerWallet);
    const winnerInRoom = roomData.players.some((p) => p.equals(winnerPubkey));
    if (!winnerInRoom) {
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        room_status: roomData.status,
        error_message: "winnerWallet is not a player in this room",
      });
      return json200({
        success: false,
        error: "winnerWallet is not a player in this room",
        providedWinner: winnerWallet,
        playersInRoom: playersOnChain,
      });
    }

    // Fetch Config PDA
    const [configPda] = PublicKey.findProgramAddressSync([new TextEncoder().encode("config")], PROGRAM_ID);
    const configAccountInfo = await connection.getAccountInfo(configPda);

    if (!configAccountInfo) {
      console.error("[settle-game] ❌ Config account not found on-chain");
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        error_message: "Failed to parse config account",
      });
      return json200({
        success: false,
        error: "Failed to parse config account",
      });
    }

    console.log("[settle-game] 📋 On-chain config:", {
      authority: configData.authority.toBase58(),
      feeRecipient: configData.feeRecipient.toBase58(),
      feeBps: configData.feeBps,
      verifier: configData.verifier.toBase58(),
    });

    // Validate verifier matches on-chain config
    if (!configData.verifier.equals(verifierKeypair.publicKey)) {
      console.error("[settle-game] ❌ Verifier mismatch with on-chain config!", {
        expected: configData.verifier.toBase58(),
        actual: verifierKeypair.publicKey.toBase58(),
      });
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

    console.log("[settle-game] ✅ Verifier matches on-chain config");

    // Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), roomPdaKey.toBuffer()],
      PROGRAM_ID,
    );

    // Vault sanity check
    const vaultLamports = await connection.getBalance(vaultPda, "confirmed");
    const stakePerPlayer = Number(roomData.stakeLamports);
    const playerCount = roomData.playerCount;
    const expectedPot = stakePerPlayer * playerCount;
    const RENT_EXEMPT_MINIMUM = 890880;
    const effectiveBalance = Math.max(0, vaultLamports - RENT_EXEMPT_MINIMUM);

    console.log("[settle-game] 🏦 Vault sanity check:", {
      vault: vaultPda.toBase58(),
      vaultLamports,
      stakePerPlayer,
      playerCount,
      expectedPot,
      rentExempt: RENT_EXEMPT_MINIMUM,
      effectiveBalance,
      canPayout: effectiveBalance >= expectedPot,
    });

    if (effectiveBalance < expectedPot) {
      console.error("[settle-game] ❌ Vault underfunded - cannot settle:", {
        vault: vaultPda.toBase58(),
        vaultLamports,
        expectedPot,
        shortfall: expectedPot - effectiveBalance,
      });

      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

      // Mark session as void
      const { data: sessionData } = await supabase
        .from("game_sessions")
        .select("game_state")
        .eq("room_pda", roomPda)
        .single();

      const existingState = (sessionData?.game_state || {}) as Record<string, unknown>;

      await supabase
        .from("game_sessions")
        .update({
          status: "finished",
          game_state: {
            ...existingState,
            playersOnChain,
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

      return json200({
        success: false,
        error: "Vault underfunded",
        action: "void_cleared",
        message: "Vault has insufficient funds for payout.",
        details: {
          vault: vaultPda.toBase58(),
          vaultLamports,
          expectedPot,
          shortfall: expectedPot - effectiveBalance,
        },
        roomPda,
        intendedWinner: winnerWallet,
      });
    }

    // ─────────────────────────────────────────────────────────────
    // SUBMIT_RESULT TRANSACTION
    // ─────────────────────────────────────────────────────────────
    try {
      const submitResultDiscriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);

      // data = discriminator (8) + winner pubkey (32)
      const ixData = new Uint8Array(8 + 32);
      ixData.set(submitResultDiscriminator, 0);
      ixData.set(winnerPubkey.toBytes(), 8);

      const submitResultIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: [
          { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false }, // verifier
          { pubkey: configPda, isSigner: false, isWritable: false },                 // config
          { pubkey: roomPdaKey, isSigner: false, isWritable: true },                 // room
          { pubkey: vaultPda, isSigner: false, isWritable: true },                   // vault
          { pubkey: winnerPubkey, isSigner: false, isWritable: true },               // winner
          { pubkey: configData.feeRecipient, isSigner: false, isWritable: true },    // fee recipient
        ],
        data: ixData as any,
      });

      console.log("[settle-game] submit_result accounts:", {
        verifier: verifierKeypair.publicKey.toBase58(),
        config: configPda.toBase58(),
        room: roomPdaKey.toBase58(),
        vault: vaultPda.toBase58(),
        winner: winnerPubkey.toBase58(),
        feeRecipient: configData.feeRecipient.toBase58(),
        decodedLen,
      });

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
      const tx = new Transaction({
        feePayer: verifierKeypair.publicKey,
        recentBlockhash: blockhash,
      }).add(submitResultIx);

      tx.sign(verifierKeypair);

      console.log("[settle-game] Sending submit_result...");

      const signature = await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("[settle-game] Sent:", signature);

      const confirmation = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
      );

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("[settle-game] ✅ submit_result confirmed:", signature);

      // Log success
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: true,
        signature,
        winner_wallet: winnerWallet,
        vault_pda: vaultPda.toBase58(),
        vault_lamports: vaultLamports,
        verifier_pubkey: verifierKeypair.publicKey.toBase58(),
        verifier_lamports: verifierBalance,
        stake_per_player: stakePerPlayer,
        player_count: playerCount,
        expected_pot: expectedPot,
        room_status: roomData.status,
      });

      // Record match result (best effort)
      const { error: rpcError } = await supabase.rpc("record_match_result", {
        p_room_pda: roomPda,
        p_finalize_tx: signature,
        p_winner_wallet: winnerWallet,
        p_game_type: gameType || "unknown",
        p_max_players: roomData.maxPlayers,
        p_stake_lamports: Number(roomData.stakeLamports),
        p_mode: mode,
        p_players: playersOnChain,
      });

      if (rpcError) {
        console.error("[settle-game] record_match_result failed:", rpcError);
      }

      // Finish session (best effort)
      const { error: finishErr } = await supabase.rpc("finish_game_session", {
        p_room_pda: roomPda,
        p_caller_wallet: winnerWallet,
      });

      if (finishErr) {
        console.error("[settle-game] finish_game_session failed:", finishErr);
      }

      // ─────────────────────────────────────────────────────────────
      // CLOSE_ROOM TRANSACTION: Refund rent to creator
      // close_room requires NO creator signature - verifier pays fees
      // Accounts ORDER: room (writable), creator (writable)
      // ─────────────────────────────────────────────────────────────
      let closeRoomSignature: string | null = null;
      let closeRoomError: string | null = null;

      try {
        console.log("[settle-game] Closing room to refund rent...", {
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

        console.log("[settle-game] close_room sent:", closeRoomSignature);

        const closeConfirmation = await connection.confirmTransaction(
          { signature: closeRoomSignature, blockhash: closeBlockhash, lastValidBlockHeight: closeLastValid },
          "confirmed",
        );

        if (closeConfirmation.value.err) {
          throw new Error(`close_room failed: ${JSON.stringify(closeConfirmation.value.err)}`);
        }

        console.log("[settle-game] ✅ close_room confirmed", { closeSig: closeRoomSignature });

      } catch (closeErr) {
        // close_room failure is NOT fatal - settlement payout already succeeded
        closeRoomError = String((closeErr as Error)?.message ?? closeErr);
        console.warn("[settle-game] ⚠️ close_room failed", { error: closeRoomError });
      }

      return json200({
        success: true,
        action: "settled",
        reason,
        signature,
        winnerWallet,
        vaultLamports,
        verifierLamports: verifierBalance,
        closeRoomSignature,
        closeRoomError,
      });

    } catch (settlementError) {
      console.error("[settle-game] Settlement failed - void clearing room:", settlementError);

      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "settle",
        success: false,
        winner_wallet: winnerWallet,
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

      const { data: sessionData } = await supabase
        .from("game_sessions")
        .select("game_state")
        .eq("room_pda", roomPda)
        .single();

      const existingState = (sessionData?.game_state || {}) as Record<string, unknown>;

      await supabase
        .from("game_sessions")
        .update({
          status: "finished",
          game_state: {
            ...existingState,
            playersOnChain,
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
    console.error("[settle-game] Unexpected error:", error);
    return json200({
      success: false,
      error: "Unexpected server error",
      details: String((error as Error)?.message ?? error),
    });
  }
});
