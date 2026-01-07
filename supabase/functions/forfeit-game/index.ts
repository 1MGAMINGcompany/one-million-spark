import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.0/+esm";
import bs58 from "https://cdn.jsdelivr.net/npm/bs58@5.0.0/+esm";

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

// Platform fee recipient
const FEE_RECIPIENT = new PublicKey("3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj");

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

serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = (await req.json().catch(() => null)) as ForfeitRequest | null;

    const roomPda = body?.roomPda;
    const forfeitingWallet = body?.forfeitingWallet;
    const gameType = body?.gameType;
    const winnerWalletOverride = body?.winnerWallet;

    if (!roomPda || !forfeitingWallet) {
      console.error("[forfeit-game] Missing required fields:", { roomPda, forfeitingWallet });
      return json200({
        success: false,
        error: "Missing roomPda or forfeitingWallet",
      });
    }

    console.log("[forfeit-game] Request:", { roomPda, forfeitingWallet, gameType, winnerWalletOverride });

    // Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      console.error("[forfeit-game] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return json200({
        success: false,
        error: "Server configuration error: Supabase service credentials missing",
      });
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Load verifier key
    const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY") ?? "";
    const exists = verifierSecretKey.trim().length > 0;
    const keyStart = exists ? verifierSecretKey.trim().slice(0, 2) : "";

    console.log("[forfeit-game] 🔑 VERIFIER_SECRET_KEY exists:", exists);
    console.log("[forfeit-game] 🔑 Key starts with:", keyStart);

    if (!exists) {
      return json200({
        success: false,
        error: "Server configuration error: verifier not configured",
        details: "VERIFIER_SECRET_KEY is missing",
      });
    }

    let verifierKeypair: Keypair;
    let decodedLen = 0;

    try {
      const loaded = loadVerifierKeypair(verifierSecretKey);
      verifierKeypair = loaded.keypair;
      decodedLen = loaded.decodedLen;
      console.log("[forfeit-game] 📏 Decoded byte length:", decodedLen);
      console.log("[forfeit-game] 🔑 Verifier pubkey:", verifierKeypair.publicKey.toBase58());
    } catch (err) {
      console.error("[forfeit-game] Failed to parse verifier key:", err);
      return json200({
        success: false,
        error: "Server configuration error: invalid verifier key format",
        details: String((err as Error)?.message ?? err),
      });
    }

    // Solana connection
    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch room account
    const roomPdaKey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPdaKey);

    if (!accountInfo) {
      console.error("[forfeit-game] Room not found on-chain:", roomPda);
      return json200({
        success: false,
        error: "Room not found on-chain",
      });
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
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
          game_state: supabase.rpc ? undefined : undefined, // Keep existing game_state
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
      return json200({
        success: false,
        error: "Player not in this room",
      });
    }

    // Validate room state (must have 2+ players and not finished/cancelled)
    if (roomData.playerCount < 2) {
      return json200({
        success: false,
        error: "Room has only 1 player. Use Cancel to get refund.",
      });
    }

    // status values depend on your program; keeping your logic:
    // 3 finished, 4 cancelled
    if (roomData.status === 3 || roomData.status === 4) {
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
        // still return success false? In your old code you continued. We'll keep it non-blocking:
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
        return json200({
          success: false,
          error: "winnerWallet is not a player in this room",
        });
      }
    } else {
      const winnerIndex = playerIndex === 0 ? 1 : 0;
      if (winnerIndex >= roomData.players.length) {
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
            playersOnChain: playersOnChain, // Store synced players
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
          { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true }, // fee recipient
        ],
        data: ixData as any,
      });

      console.log("[forfeit-game] submit_result accounts:", {
        verifier: verifierKeypair.publicKey.toBase58(),
        config: configPda.toBase58(),
        room: roomPdaKey.toBase58(),
        vault: vaultPda.toBase58(),
        winner: winnerPubkey.toBase58(),
        feeRecipient: FEE_RECIPIENT.toBase58(),
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

      console.log("[forfeit-game] Confirmed:", signature);

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

      return json200({
        success: true,
        action: "forfeit",
        signature,
        winnerWallet,
        forfeitingWallet,
      });

    } catch (settlementError) {
      console.error("[forfeit-game] Settlement failed - void clearing room:", settlementError);

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
            playersOnChain: playersOnChain, // Store synced players
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
        success: true,
        action: "void_cleared",
        message: "Settlement failed; room cleared without payout",
        roomPda,
        intendedWinner: winnerWallet,
        vaultLamports,
        expectedPot,
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
