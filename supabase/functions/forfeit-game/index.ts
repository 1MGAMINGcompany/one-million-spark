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

interface ForfeitRequest {
  roomPda: string;
  gameType?: string;
  mode?: "manual" | "timeout";
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
    console.error("[forfeit-game] Failed to parse room account:", e);
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

// ============================================================================
// Balance Delta Logging - "Follow the SOL"
// ============================================================================
interface BalanceDelta {
  wallet: string;
  label: string;
  preBalance: number;
  postBalance: number;
  deltaLamports: number;
  deltaSol: number;
}

async function logBalanceDeltas(
  connection: Connection,
  txSignature: string,
  roomPda: string,
  action: string,
  forfeiter: string | null,
  winner: string | null,
  stakeLamports: bigint,
  accountLabels: Map<string, string> // pubkey -> label (e.g., "player1", "vault")
) {
  try {
    // Fetch parsed transaction with meta
    const txResponse = await connection.getTransaction(txSignature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!txResponse || !txResponse.meta) {
      console.warn("[forfeit-game] ⚠️ Could not fetch tx for balance delta logging", { txSignature });
      return;
    }

    const { meta, transaction } = txResponse;
    const accountKeys = transaction.message.staticAccountKeys?.map(k => k.toBase58()) 
      ?? (transaction.message as unknown as { accountKeys: PublicKey[] }).accountKeys?.map((k: PublicKey) => k.toBase58())
      ?? [];

    const preBalances = meta.preBalances ?? [];
    const postBalances = meta.postBalances ?? [];

    const deltas: BalanceDelta[] = [];

    for (let i = 0; i < accountKeys.length; i++) {
      const pubkey = accountKeys[i];
      const pre = preBalances[i] ?? 0;
      const post = postBalances[i] ?? 0;
      const delta = post - pre;

      // Only log accounts with changes or known labels
      if (delta !== 0 || accountLabels.has(pubkey)) {
        const label = accountLabels.get(pubkey) ?? `account_${i}`;
        deltas.push({
          wallet: pubkey,
          label,
          preBalance: pre,
          postBalance: post,
          deltaLamports: delta,
          deltaSol: delta / 1e9,
        });
      }
    }

    // Find fee payer and fee
    const feePayer = accountKeys[0] ?? "unknown";
    const fee = meta.fee ?? 0;

    console.log("[forfeit-game] 💰 BALANCE_DELTAS", {
      roomPda: roomPda.slice(0, 8),
      action,
      forfeiter: forfeiter?.slice(0, 8) ?? null,
      winner: winner?.slice(0, 8) ?? null,
      txSig: txSignature.slice(0, 16),
      stakeLamports: stakeLamports.toString(),
      feePayer: feePayer.slice(0, 8),
      feeLamports: fee,
      deltas: deltas.map(d => ({
        label: d.label,
        wallet: d.wallet.slice(0, 8),
        delta: `${d.deltaSol >= 0 ? "+" : ""}${d.deltaSol.toFixed(6)} SOL`,
      })),
    });

    // Log detailed deltas for each participant
    for (const d of deltas) {
      if (d.deltaLamports !== 0) {
        console.log(`[forfeit-game] 📊 ${d.label}: ${d.wallet.slice(0, 8)} | ${d.preBalance} → ${d.postBalance} (${d.deltaLamports >= 0 ? "+" : ""}${d.deltaLamports} lamports)`);
      }
    }

  } catch (e) {
    console.error("[forfeit-game] ⚠️ Balance delta logging failed:", e);
    // Non-fatal - don't affect the main flow
  }
}

Deno.serve(async (req: Request) => {
  console.log("[forfeit-game] HIT", {
    ts: new Date().toISOString(),
    method: req.method,
    url: req.url,
  });

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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
    
    const requestId = crypto.randomUUID();
    const ts = new Date().toISOString();

    if (!roomPda) {
      console.error("[forfeit-game] Missing roomPda", { requestId });
      return json200({ success: false, error: "Missing roomPda", requestId });
    }

    if (!supabase) {
      console.error("[forfeit-game] Missing SUPABASE credentials", { requestId });
      return json200({ success: false, error: "Server configuration error", requestId });
    }

    // 🔒 SECURITY: Require session token and derive caller wallet from DB
    const sessionRes = await requireSession(supabase, req);
    if (!sessionRes.ok) {
      console.error("[forfeit-game] Unauthorized:", { requestId, reason: sessionRes.error });
      return json200({ success: false, error: "Unauthorized", details: sessionRes.error, requestId });
    }

    const callerWallet = sessionRes.session.wallet;

    // 🔒 Fetch game_sessions with all needed fields including max_players and eliminated_players
    const { data: sessionRow, error: sessionError } = await supabase
      .from("game_sessions")
      .select("player1_wallet, player2_wallet, participants, current_turn_wallet, turn_started_at, turn_time_seconds, status_int, status, max_players, eliminated_players, mode, game_type, game_state")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (sessionError || !sessionRow) {
      console.error("[forfeit-game] Game session not found:", { requestId, roomPda, error: sessionError });
      return json200({ success: false, error: "Game session not found", requestId });
    }

    // Build DB-authoritative participants list
    const dbParticipants: string[] = sessionRow.participants?.length 
      ? sessionRow.participants 
      : [sessionRow.player1_wallet, sessionRow.player2_wallet].filter(Boolean);
    
    const participantsCount = dbParticipants.length;
    const maxPlayers = sessionRow.max_players ?? 2;
    const eliminatedPlayers: string[] = sessionRow.eliminated_players ?? [];
    const statusInt = sessionRow.status_int ?? 1;
    const dbMode = sessionRow.mode ?? "casual";
    const dbGameType = sessionRow.game_type ?? gameType ?? "unknown";
    const isCreator = callerWallet === sessionRow.player1_wallet;

    // Validate caller is a participant
    const isCallerParticipant = dbParticipants.includes(callerWallet);
    if (!isCallerParticipant) {
      console.error("[forfeit-game] Forbidden: caller not a participant", { 
        requestId, callerWallet, participants: dbParticipants 
      });
      return json200({ success: false, error: "Forbidden", requestId });
    }

    // 🔒 Dedupe guard - don't settle a terminal room twice (3=finished, 4=void, 5=cancelled)
    const isTerminal = statusInt >= 3;
    if (isTerminal || sessionRow.status === "finished" || sessionRow.status === "cancelled" || sessionRow.status === "void") {
      console.log("[forfeit-game] Room already terminal", { requestId, roomPda, status_int: statusInt, status: sessionRow.status });
      return json200({ 
        success: true, 
        action: "noop_already_finished",
        message: "Room already settled",
        requestId 
      });
    }

    // =========================================================================
    // COUNT ACCEPTANCES for readiness check
    // =========================================================================
    const { count: acceptedCount, error: accCountError } = await supabase
      .from("game_acceptances")
      .select("*", { count: "exact", head: true })
      .eq("room_pda", roomPda);

    if (accCountError) {
      console.warn("[forfeit-game] game_acceptances count error:", accCountError);
    }

    const safeAcceptedCount = acceptedCount ?? 0;

    // =========================================================================
    // DECISION: CANCEL vs FORFEIT
    // =========================================================================
    // requiredCount = max(2, max_players)
    // isActive = (statusInt >= 2) OR (participantsCount >= requiredCount AND acceptedCount >= requiredCount)
    // 
    // If !isActive: CANCEL flow (refund all joined)
    // If isActive: FORFEIT flow (caller loses, opponent wins)
    // =========================================================================
    const requiredCount = Math.max(2, maxPlayers);
    const readyByCounts = (participantsCount >= requiredCount) && (safeAcceptedCount >= requiredCount);
    const isActive = (statusInt >= 2) || readyByCounts;

    console.log("[forfeit-game] DECISION", {
      roomPda: roomPda.slice(0, 8),
      gameType: dbGameType,
      mode: dbMode,
      statusInt,
      requiredCount,
      acceptedCount: safeAcceptedCount,
      participantsCount,
      readyByCounts,
      isActive,
      forfeitingWallet: callerWallet.slice(0, 8),
      isCreator,
    });

    // =========================================================================
    // CANCEL FLOW (!isActive) - refund all joined participants
    // =========================================================================
    if (!isActive) {
      console.log("[forfeit-game] CANCEL_PATH: room not active, refunding all", {
        requestId,
        roomPda: roomPda.slice(0, 8),
        participantsCount,
        requiredCount,
        acceptedCount: safeAcceptedCount,
        isCreator,
      });

      // Load verifier key for cancel tx
      const skRaw = Deno.env.get("VERIFIER_SECRET_KEY_V2") ?? "";
      if (!skRaw.trim()) {
        return json200({ success: false, error: "VERIFIER_SECRET_KEY_V2 not configured", requestId });
      }
      const { keypair: verifierKeypair } = loadVerifierKeypair(skRaw);

      const rpcUrl = (
        Deno.env.get("SOLANA_RPC_URL") ||
        Deno.env.get("VITE_SOLANA_RPC_URL") ||
        "https://api.mainnet-beta.solana.com"
      ).replace(/^([^h])/, "https://$1");

      const connection = new Connection(rpcUrl, "confirmed");
      const roomPdaKey = new PublicKey(roomPda);

      // Fetch room on-chain
      const accountInfo = await connection.getAccountInfo(roomPdaKey);
      if (!accountInfo) {
        // Room already closed on-chain - just update DB
        // INVARIANT: CANCELLED (5) requires winner_wallet=null, game_over_at=set
        console.log("[forfeit-game] Room already closed on-chain, updating DB only", { requestId });
        
        await supabase
          .from("game_sessions")
          .update({
            status: "cancelled",
            status_int: 5, // CANCELLED
            winner_wallet: null, // INVARIANT: cancelled has no winner
            game_over_at: new Date().toISOString(), // INVARIANT: must be set
            updated_at: new Date().toISOString(),
          })
          .eq("room_pda", roomPda);

        return json200({
          success: true,
          action: "cancel",
          message: "Room already closed on-chain, DB updated",
          refunded: dbParticipants,
          requestId,
        });
      }

      const roomData = parseRoomAccount(accountInfo.data);
      if (!roomData) {
        return json200({ success: false, error: "Failed to parse room account", requestId });
      }

      // Use close_room instruction (discriminator for close_room)
      // This refunds all players who deposited and returns rent to creator
      const closeRoomDiscriminator = new Uint8Array([189, 143, 143, 182, 44, 11, 186, 234]);

      const [configPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("config")],
        PROGRAM_ID
      );

      const configInfo = await connection.getAccountInfo(configPda);
      if (!configInfo) {
        return json200({ success: false, error: "Config account missing", requestId });
      }

      const configData = parseConfigAccount(configInfo.data);
      if (!configData) {
        return json200({ success: false, error: "Config parse failed", requestId });
      }

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode("vault"), roomPdaKey.toBuffer()],
        PROGRAM_ID
      );

      // Build close_room instruction
      // Keys: [verifier, config, room, vault, creator, ...players]
      const closeKeys = [
        { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: roomPdaKey, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: roomData.creator, isSigner: false, isWritable: true }, // rent return
      ];

      // Add all on-chain players for refund
      for (const player of roomData.players) {
        if (!player.equals(PublicKey.default)) {
          closeKeys.push({ pubkey: player, isSigner: false, isWritable: true });
        }
      }

      const closeIx = new TransactionInstruction({
        programId: PROGRAM_ID,
        keys: closeKeys,
        data: closeRoomDiscriminator,
      });

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      const closeTx = new Transaction({
        feePayer: verifierKeypair.publicKey,
        recentBlockhash: blockhash,
      }).add(closeIx);

      closeTx.sign(verifierKeypair);

      let cancelSignature: string;
      try {
        cancelSignature = await connection.sendRawTransaction(closeTx.serialize());
        await connection.confirmTransaction(cancelSignature, "confirmed");
        console.log("[forfeit-game] ✅ Cancel tx confirmed", { signature: cancelSignature.slice(0, 16) });
      } catch (txError) {
        console.error("[forfeit-game] Cancel tx failed:", txError);
        
        // INVARIANT: On tx failure, mark as VOID (4) with null winner, game_over_at set
        await supabase
          .from("game_sessions")
          .update({
            status: "void",
            status_int: 4, // VOID - settlement failed
            winner_wallet: null, // INVARIANT: void has no winner
            game_over_at: new Date().toISOString(), // INVARIANT: must be set
            game_state: {
              ...(sessionRow.game_state ?? {}),
              settlement_error: String((txError as Error)?.message ?? txError),
              settlement_failed_at: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("room_pda", roomPda);
        
        await logSettlement(supabase, {
          room_pda: roomPda,
          action: "cancel_failed",
          success: false,
          error_message: String((txError as Error)?.message ?? txError),
        });
        
        return json200({ 
          success: false, 
          error: "Cancel transaction failed", 
          details: String((txError as Error)?.message ?? txError),
          requestId 
        });
      }

      // Log balance deltas for cancel
      const cancelLabels = new Map<string, string>();
      cancelLabels.set(verifierKeypair.publicKey.toBase58(), "verifier");
      cancelLabels.set(vaultPda.toBase58(), "vault");
      cancelLabels.set(roomData.creator.toBase58(), "creator");
      for (let i = 0; i < dbParticipants.length; i++) {
        cancelLabels.set(dbParticipants[i], `player${i + 1}`);
      }

      await logBalanceDeltas(
        connection,
        cancelSignature,
        roomPda,
        "cancel",
        null,
        null,
        roomData.stakeLamports,
        cancelLabels
      );

      // Update DB - INVARIANT: CANCELLED (5) requires winner_wallet=null, game_over_at=set
      const { error: cancelDbError } = await supabase
        .from("game_sessions")
        .update({
          status: "cancelled",
          status_int: 5, // CANCELLED
          winner_wallet: null, // INVARIANT: cancelled has no winner
          game_over_at: new Date().toISOString(), // INVARIANT: must be set
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      if (cancelDbError) {
        console.error("[forfeit-game] Failed to update DB after cancel:", cancelDbError);
      }

      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "cancel",
        success: true,
        signature: cancelSignature,
        winner_wallet: null,
        forfeiting_wallet: null,
        stake_per_player: Number(roomData.stakeLamports),
        player_count: roomData.playerCount,
      });

      return json200({
        success: true,
        action: "cancel",
        txSig: cancelSignature,
        roomPda,
        refunded: roomData.players.filter(p => !p.equals(PublicKey.default)).map(p => p.toBase58()),
        requestId,
      });
    }

    // =========================================================================
    // FORFEIT FLOW (isActive = true)
    // =========================================================================
    // Determine forfeiting wallet based on mode
    let forfeitingWallet: string;

    if (mode === "timeout") {
      // Timeout mode: forfeiter is current_turn_wallet
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

      // Anti-grief: timed-out player cannot trigger their own timeout
      if (callerWallet === forfeitingWallet) {
        console.error("[forfeit-game] Forbidden: timed-out player cannot trigger own timeout", { 
          requestId, callerWallet, forfeitingWallet 
        });
        return json200({ success: false, error: "Forbidden", requestId });
      }
    } else {
      // Manual mode: caller forfeits themselves
      forfeitingWallet = callerWallet;
    }

    console.log("[forfeit-game] FORFEIT_PATH", {
      requestId, ts, roomPda: roomPda.slice(0, 8), mode,
      callerWallet: callerWallet.slice(0, 8),
      forfeitingWallet: forfeitingWallet.slice(0, 8),
      gameType: dbGameType, participantsCount, maxPlayers,
      eliminatedBefore: eliminatedPlayers.length,
    });

    // =========================================================================
    // LUDO 3/4 PLAYER ELIMINATION LOGIC
    // =========================================================================
    // For max_players >= 3: leaving = elimination, not instant settlement
    // Only settle when exactly 1 active player remains
    // =========================================================================
    
    if (maxPlayers >= 3 && participantsCount >= 3) {
      // Calculate active players (not eliminated and not the forfeiter)
      const alreadyEliminated = new Set(eliminatedPlayers);
      const activeBeforeThisLeave = dbParticipants.filter(
        p => !alreadyEliminated.has(p) && p !== forfeitingWallet
      );
      const activeAfterThisLeave = activeBeforeThisLeave.length;

      console.log("[forfeit-game] LUDO_ELIMINATION_CHECK", {
        requestId,
        maxPlayers,
        participantsCount,
        eliminatedBefore: eliminatedPlayers.length,
        forfeitingWallet: forfeitingWallet.slice(0, 8),
        activeAfterThisLeave,
      });

      if (activeAfterThisLeave > 1) {
        // Add forfeiter to eliminated_players (using DISTINCT logic)
        const newEliminated = [...new Set([...eliminatedPlayers, forfeitingWallet])];
        
        const { error: elimError } = await supabase
          .from("game_sessions")
          .update({
            eliminated_players: newEliminated,
            updated_at: new Date().toISOString(),
          })
          .eq("room_pda", roomPda);

        if (elimError) {
          console.error("[forfeit-game] Failed to update eliminated_players:", elimError);
        }

        console.log("[forfeit-game] 🚫 ELIMINATION (no settlement yet)", {
          requestId,
          roomPda: roomPda.slice(0, 8),
          action: "eliminate",
          forfeiter: forfeitingWallet.slice(0, 8),
          activeRemaining: activeAfterThisLeave,
          eliminatedNow: newEliminated.length,
        });

        await logSettlement(supabase, {
          room_pda: roomPda,
          action: "eliminate",
          success: true,
          signature: null,
          forfeiting_wallet: forfeitingWallet,
          winner_wallet: null,
        });

        return json200({
          success: true,
          action: "eliminate",
          forfeitingWallet,
          activeRemaining: activeAfterThisLeave,
          message: "Player eliminated; game continues.",
          requestId,
        });
      }

      // activeAfterThisLeave === 1: last player standing, proceed to settlement
      console.log("[forfeit-game] LUDO_FINAL_SETTLEMENT: 1 player remains", { requestId });
    }

    // =========================================================================
    // SETTLEMENT: 2-player games OR Ludo final winner
    // =========================================================================

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
      return json200({ success: false, error: "VERIFIER_SECRET_KEY_V2 not configured", requestId });
    }

    const { keypair: verifierKeypair } = loadVerifierKeypair(skRaw);

    const rpcUrl = (
      Deno.env.get("SOLANA_RPC_URL") ||
      Deno.env.get("VITE_SOLANA_RPC_URL") ||
      "https://api.mainnet-beta.solana.com"
    ).replace(/^([^h])/, "https://$1");

    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch room on-chain
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

    // Cross-check caller is in on-chain players
    if (!playersOnChain.includes(callerWallet)) {
      console.error("[forfeit-game] Caller not in on-chain players", { 
        requestId, callerWallet, playersOnChain 
      });
      return json200({ success: false, error: "Unauthorized: not a participant on-chain", requestId });
    }

    // =========================================================================
    // WINNER SELECTION (DB-authoritative)
    // =========================================================================
    let winnerWallet: string;

    if (maxPlayers >= 3 && participantsCount >= 3) {
      // Ludo: winner is the last non-eliminated, non-forfeiting player
      const alreadyEliminated = new Set(eliminatedPlayers);
      const remaining = dbParticipants.filter(
        p => !alreadyEliminated.has(p) && p !== forfeitingWallet
      );
      if (remaining.length !== 1) {
        console.error("[forfeit-game] Ludo settlement: expected 1 remaining", { remaining });
        return json200({ success: false, error: "Invalid Ludo settlement state", requestId });
      }
      winnerWallet = remaining[0];
    } else {
      // 2-player: winner is the other participant (NOT the forfeiter)
      const otherPlayer = dbParticipants.find(p => p !== forfeitingWallet);
      if (!otherPlayer) {
        console.error("[forfeit-game] Could not derive winner", { forfeitingWallet, dbParticipants });
        return json200({ success: false, error: "Could not derive winner", requestId });
      }
      winnerWallet = otherPlayer;
    }

    const winnerPubkey = new PublicKey(winnerWallet);

    console.log("[forfeit-game] WINNER_DERIVED", {
      requestId,
      forfeitingWallet: forfeitingWallet.slice(0, 8),
      winnerWallet: winnerWallet.slice(0, 8),
      maxPlayers,
      method: maxPlayers >= 3 ? "ludo_last_standing" : "2p_other_player",
    });

    // Build on-chain settlement tx
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

    // =========================================================================
    // SETTLEMENT EXECUTION WITH VOID FALLBACK
    // INVARIANT: On failure, mark as VOID (4) with null winner, game_over_at set
    // =========================================================================
    let signature: string;
    try {
      signature = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(signature, "confirmed");

      console.log("[forfeit-game] ✅ On-chain settlement confirmed", { 
        requestId, signature: signature.slice(0, 16), winner: winnerWallet.slice(0, 8) 
      });
    } catch (txError) {
      console.error("[forfeit-game] ❌ Settlement tx failed:", txError);
      
      // INVARIANT: VOID (4) requires winner_wallet=null, game_over_at=set
      const existingGameState = (sessionRow.game_state as Record<string, unknown>) ?? {};
      
      await supabase
        .from("game_sessions")
        .update({
          status: "void",
          status_int: 4, // VOID - settlement failed
          winner_wallet: null, // INVARIANT: void has no winner
          game_over_at: new Date().toISOString(), // INVARIANT: must be set
          game_state: {
            ...existingGameState,
            settlement_error: String((txError as Error)?.message ?? txError),
            settlement_failed_at: new Date().toISOString(),
            intended_winner: winnerWallet,
            forfeiting_player: forfeitingWallet,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);
      
      // Record failure in match_share_cards for visibility
      await supabase
        .from("match_share_cards")
        .upsert({
          room_pda: roomPda,
          mode: dbMode || "casual",
          game_type: dbGameType || "unknown",
          winner_wallet: null,
          loser_wallet: null,
          win_reason: "settlement_failed",
          stake_lamports: Number(roomData.stakeLamports),
          tx_signature: null,
          metadata: {
            error: String((txError as Error)?.message ?? txError),
            intended_winner: winnerWallet,
            forfeiting_player: forfeitingWallet,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: "room_pda" });
      
      await logSettlement(supabase, {
        room_pda: roomPda,
        action: "forfeit_failed",
        success: false,
        winner_wallet: null,
        forfeiting_wallet: forfeitingWallet,
        error_message: String((txError as Error)?.message ?? txError),
        stake_per_player: Number(roomData.stakeLamports),
        player_count: participantsCount,
      });
      
      return json200({
        success: false,
        error: "Settlement transaction failed",
        details: String((txError as Error)?.message ?? txError),
        action: "void",
        status_int: 4,
        requestId,
      });
    }

    // =========================================================================
    // BALANCE DELTA LOGGING - "Follow the SOL"
    // =========================================================================
    const accountLabels = new Map<string, string>();
    accountLabels.set(verifierKeypair.publicKey.toBase58(), "verifier");
    accountLabels.set(vaultPda.toBase58(), "vault");
    accountLabels.set(winnerPubkey.toBase58(), "winner");
    accountLabels.set(configData.feeRecipient.toBase58(), "fee_recipient");
    accountLabels.set(roomData.creator.toBase58(), "creator");
    
    // Label all participants
    for (let i = 0; i < dbParticipants.length; i++) {
      const p = dbParticipants[i];
      if (!accountLabels.has(p)) {
        accountLabels.set(p, `player${i + 1}`);
      }
    }

    await logBalanceDeltas(
      connection,
      signature,
      roomPda,
      "forfeit",
      forfeitingWallet,
      winnerWallet,
      roomData.stakeLamports,
      accountLabels
    );

    // Update game_sessions to mark as finished
    // INVARIANT: FINISHED (3) requires winner_wallet and game_over_at
    const { error: dbUpdateError } = await supabase
      .from("game_sessions")
      .update({
        status: "finished",
        status_int: 3, // FINISHED
        winner_wallet: winnerWallet, // INVARIANT: must be set
        game_over_at: new Date().toISOString(), // INVARIANT: must be set
        updated_at: new Date().toISOString(),
      })
      .eq("room_pda", roomPda);

    if (dbUpdateError) {
      console.error("[forfeit-game] Failed to update game_sessions:", dbUpdateError);
    } else {
      console.log("[forfeit-game] ✅ game_sessions marked finished", { 
        status_int: 3, winner: winnerWallet.slice(0, 8) 
      });
    }

    // Upsert into match_share_cards for social sharing
    const { error: shareCardError } = await supabase
      .from("match_share_cards")
      .upsert({
        room_pda: roomPda,
        mode: dbMode || "casual",
        game_type: dbGameType || "unknown",
        winner_wallet: winnerWallet,
        loser_wallet: forfeitingWallet,
        win_reason: "forfeit",
        stake_lamports: Number(roomData.stakeLamports),
        tx_signature: signature,
        updated_at: new Date().toISOString(),
      }, { onConflict: "room_pda" });

    if (shareCardError) {
      console.error("[forfeit-game] Failed to upsert match_share_cards:", shareCardError);
    } else {
      console.log("[forfeit-game] ✅ match_share_cards upserted");
    }

    await logSettlement(supabase, {
      room_pda: roomPda,
      action: "forfeit",
      success: true,
      signature,
      winner_wallet: winnerWallet,
      forfeiting_wallet: forfeitingWallet,
      stake_per_player: Number(roomData.stakeLamports),
      player_count: participantsCount,
    });

    return json200({
      success: true,
      action: "forfeit",
      signature,
      winnerWallet,
      forfeitingWallet,
      requestId,
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
