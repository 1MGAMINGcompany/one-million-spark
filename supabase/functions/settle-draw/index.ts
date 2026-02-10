import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, LAMPORTS_PER_SOL } from "npm:@solana/web3.js@1.95.0";
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mainnet production Program ID
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Fixed Config PDA address (source of truth - do not derive)
const CONFIG_PDA = new PublicKey("C91tU9iB9vG1huFsZoN45RuDLYrbJdKkKFVgHNLkxn8A");

// Default pubkey for filtering empty player slots
const DEFAULT_PUBKEY = new PublicKey("11111111111111111111111111111111");

// Helius RPC endpoint
const DEFAULT_RPC = "https://barbey-suiowt-fast-mainnet.helius-rpc.com";

// refund_draw instruction discriminator
const REFUND_DRAW_DISCRIMINATOR = new Uint8Array([27, 10, 92, 83, 43, 176, 204, 10]);

interface DrawSettleRequest {
  roomPda: string;
  reason?: string;
}

// Room account layout
interface RoomAccountData {
  roomId: bigint;
  creator: PublicKey;
  gameType: number;
  maxPlayers: number;
  playerCount: number;
  status: number;
  stakeAmount: bigint;
  winner: PublicKey;
  players: PublicKey[];
}

// Config account layout: 8 disc + 32 fee_recipient + 2 fee_bps + 32 result_authority
interface ConfigAccountData {
  feeRecipient: PublicKey;
  feeBps: number;
  resultAuthority: PublicKey;
}

function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function parseRoomAccount(data: Uint8Array): RoomAccountData | null {
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
    
    const stakeAmount = view.getBigUint64(offset, true);
    offset += 8;
    
    const winner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Parse players array (up to 4 players, preserve order)
    const players: PublicKey[] = [];
    for (let i = 0; i < 4; i++) {
      const playerKey = new PublicKey(data.slice(offset + (i * 32), offset + ((i + 1) * 32)));
      players.push(playerKey);
    }
    
    return {
      roomId,
      creator,
      gameType,
      maxPlayers,
      playerCount,
      status,
      stakeAmount,
      winner,
      players,
    };
  } catch (e) {
    console.error("[settle-draw] Failed to parse room account:", e);
    return null;
  }
}

function parseConfigAccount(data: Uint8Array): ConfigAccountData | null {
  try {
    // Layout: 8 disc + 32 fee_recipient + 2 fee_bps + 32 result_authority
    const view = new DataView(data.buffer, data.byteOffset);
    const feeRecipient = new PublicKey(data.slice(8, 40));
    const feeBps = view.getUint16(40, true);
    const resultAuthority = new PublicKey(data.slice(42, 74));
    
    return { feeRecipient, feeBps, resultAuthority };
  } catch (e) {
    console.error("[settle-draw] Failed to parse config account:", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, reason }: DrawSettleRequest = await req.json();

    if (!roomPda) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[settle-draw] Draw settlement request for room ${roomPda}, reason: ${reason || 'draw'}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || DEFAULT_RPC;
    const connection = new Connection(rpcUrl, "confirmed");

    // Check if already settled via finalize_receipts
    const { data: existingReceipt } = await supabase
      .from("finalize_receipts")
      .select("finalize_tx")
      .eq("room_pda", roomPda)
      .maybeSingle();

    if (existingReceipt?.finalize_tx) {
      console.log("[settle-draw] Already settled, tx:", existingReceipt.finalize_tx);
      return new Response(
        JSON.stringify({
          ok: true,
          alreadySettled: true,
          signature: existingReceipt.finalize_tx,
          roomPda,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get verifier key (use V2 first, fallback to V1)
    const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY_V2") || Deno.env.get("VERIFIER_SECRET_KEY");
    if (!verifierSecretKey) {
      console.error("[settle-draw] VERIFIER_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verifierKeypair: Keypair;
    try {
      const keyString = verifierSecretKey.trim();
      let keyBytes: Uint8Array;
      if (keyString.startsWith("[")) {
        keyBytes = new Uint8Array(JSON.parse(keyString));
      } else {
        keyBytes = bs58.decode(keyString);
      }
      verifierKeypair = Keypair.fromSecretKey(keyBytes);
      console.log("[settle-draw] Verifier public key:", verifierKeypair.publicKey.toBase58());
    } catch (e) {
      console.error("[settle-draw] Failed to parse verifier key:", e);
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch on-chain room data
    const roomPubkey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPubkey);

    if (!accountInfo) {
      return new Response(
        JSON.stringify({ error: "Room not found on-chain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      return new Response(
        JSON.stringify({ error: "Failed to parse room account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out default pubkeys from players, preserve canonical order
    const validPlayers = roomData.players.filter(p => !p.equals(DEFAULT_PUBKEY));

    console.log("[settle-draw] Room data:", {
      status: roomData.status,
      playerCount: roomData.playerCount,
      stake: roomData.stakeAmount.toString(),
      creator: roomData.creator.toBase58(),
      players: validPlayers.map(p => p.toBase58()),
    });

    // Check room is in Started status (2)
    if (roomData.status !== 2) {
      if (roomData.status === 3 || roomData.status === 4) {
        return new Response(
          JSON.stringify({ 
            ok: true,
            alreadySettled: true,
            message: "Room is already finished or cancelled",
            roomPda,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Room is not in active game state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Derive vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [textToBytes("vault"), roomPubkey.toBuffer()],
      PROGRAM_ID
    );

    console.log("[settle-draw] Vault PDA:", vaultPda.toBase58());
    console.log("[settle-draw] Config PDA:", CONFIG_PDA.toBase58());

    // Fetch config for fee_recipient
    const configInfo = await connection.getAccountInfo(CONFIG_PDA);
    if (!configInfo) {
      return new Response(
        JSON.stringify({ error: "Config account not found" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const configData = parseConfigAccount(configInfo.data);
    if (!configData) {
      return new Response(
        JSON.stringify({ error: "Failed to parse config account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[settle-draw] Fee recipient:", configData.feeRecipient.toBase58());

    // Vault sanity check - same logic as settle-game/forfeit-game
    const vaultLamports = await connection.getBalance(vaultPda);
    const stakePerPlayer = Number(roomData.stakeAmount);
    const expectedPot = stakePerPlayer * validPlayers.length;
    const RENT_EXEMPT_MINIMUM = 890880; // ~0.00089 SOL rent-exempt minimum
    const effectiveBalance = Math.max(0, vaultLamports - RENT_EXEMPT_MINIMUM);

    console.log("[settle-draw] 🏦 Vault sanity check:", {
      vault: vaultPda.toBase58(),
      vaultLamports,
      stakePerPlayer,
      playerCount: validPlayers.length,
      expectedPot,
      rentExempt: RENT_EXEMPT_MINIMUM,
      effectiveBalance,
      canRefund: effectiveBalance >= expectedPot,
    });

    // VAULT_UNFUNDED check - same pattern as forfeit-game/settle-game
    if (effectiveBalance < expectedPot) {
      console.error("[settle-draw] ❌ Vault underfunded - cannot settle:", {
        vault: vaultPda.toBase58(),
        vaultLamports,
        expectedPot,
        shortfall: expectedPot - effectiveBalance,
      });

      // Mark session as void (same as forfeit-game)
      await supabase
        .from("game_sessions")
        .update({
          status: "finished",
          game_state: {
            voidSettlement: true,
            reason: "vault_underfunded",
            vaultLamports,
            expectedPot,
            shortfall: expectedPot - effectiveBalance,
            clearedAt: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("room_pda", roomPda);

      return new Response(
        JSON.stringify({
          ok: false,
          error: "VAULT_UNFUNDED",
          action: "void_cleared",
          message: "Vault has insufficient funds for refund. Stakes may not have been deposited.",
          vaultLamports,
          expectedPotLamports: expectedPot,
          shortfall: expectedPot - effectiveBalance,
          roomPda,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build refund_draw instruction (true draw refund + fee, closes vault)
    const refundDrawKeys = [
      { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false },  // 0. verifier
      { pubkey: CONFIG_PDA, isSigner: false, isWritable: false },                 // 1. config
      { pubkey: roomPubkey, isSigner: false, isWritable: true },                  // 2. room
      { pubkey: vaultPda, isSigner: false, isWritable: true },                    // 3. vault
      { pubkey: configData.feeRecipient, isSigner: false, isWritable: true },     // 4. fee_recipient (from config)
      { pubkey: roomData.creator, isSigner: false, isWritable: true },            // 5. creator (vault close refund)
    ];

    // 6+. remaining_accounts = valid players (writable, filtered)
    for (const player of validPlayers) {
      refundDrawKeys.push({ pubkey: player, isSigner: false, isWritable: true });
    }

    console.log("[settle-draw] refund_draw account keys in order:");
    refundDrawKeys.forEach((key, i) => {
      console.log(`  [${i}] ${key.pubkey.toBase58()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });

    const refundDrawInstruction = new TransactionInstruction({
      keys: refundDrawKeys,
      programId: PROGRAM_ID,
      data: REFUND_DRAW_DISCRIMINATOR as any,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: verifierKeypair.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(refundDrawInstruction);

    transaction.sign(verifierKeypair);

    console.log("[settle-draw] Sending refund_draw transaction...");

    let refundSignature: string;
    try {
      refundSignature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      console.log("[settle-draw] refund_draw transaction sent:", refundSignature);

      await connection.confirmTransaction({
        signature: refundSignature,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      console.log("[settle-draw] refund_draw transaction confirmed:", refundSignature);
    } catch (txError: any) {
      console.error("[settle-draw] refund_draw transaction failed:", txError);
      
      // Check if it's an instruction not found error
      const errorStr = txError.message?.toLowerCase() || '';
      if (
        errorStr.includes('instruction') ||
        errorStr.includes('not found') ||
        errorStr.includes('invalid instruction') ||
        errorStr.includes('unknown instruction') ||
        errorStr.includes('0x65')
      ) {
        return new Response(
          JSON.stringify({
            ok: false,
            error: "refund_draw instruction not available",
            message: "Draw refund not enabled yet. Please try again later or contact support.",
            code: "INSTRUCTION_NOT_FOUND",
            roomPda,
          }),
          { status: 501, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw txError;
    }

    // Now call close_room to reclaim room rent
    console.log("[settle-draw] Calling close_room to reclaim rent...");

    // close_room discriminator
    const closeRoomDiscriminator = new Uint8Array([189, 91, 239, 135, 160, 46, 105, 88]);

    const closeRoomInstruction = new TransactionInstruction({
      keys: [
        { pubkey: roomPubkey, isSigner: false, isWritable: true },       // room
        { pubkey: roomData.creator, isSigner: false, isWritable: true }, // creator
      ],
      programId: PROGRAM_ID,
      data: closeRoomDiscriminator as any,
    });

    const closeBlockhash = await connection.getLatestBlockhash();
    const closeTransaction = new Transaction({
      feePayer: verifierKeypair.publicKey,
      blockhash: closeBlockhash.blockhash,
      lastValidBlockHeight: closeBlockhash.lastValidBlockHeight,
    }).add(closeRoomInstruction);

    closeTransaction.sign(verifierKeypair);

    let closeSignature: string | null = null;
    try {
      closeSignature = await connection.sendRawTransaction(closeTransaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });

      await connection.confirmTransaction({
        signature: closeSignature,
        blockhash: closeBlockhash.blockhash,
        lastValidBlockHeight: closeBlockhash.lastValidBlockHeight,
      }, "confirmed");

      console.log("[settle-draw] close_room confirmed:", closeSignature);
    } catch (closeError: any) {
      console.warn("[settle-draw] close_room failed (non-fatal):", closeError.message);
      // close_room failure is non-fatal - the refund already happened
    }

    // Mark game session as finished
    await supabase
      .from("game_sessions")
      .update({ 
        status: "finished", 
        updated_at: new Date().toISOString() 
      })
      .eq("room_pda", roomPda);

    // Record the settlement in finalize_receipts
    await supabase.from("finalize_receipts").insert({
      room_pda: roomPda,
      finalize_tx: refundSignature,
    });

    console.log("[settle-draw] Draw settlement complete");

    return new Response(
      JSON.stringify({
        ok: true,
        signature: refundSignature,
        closeRoomSignature: closeSignature,
        roomPda,
        playersRefunded: validPlayers.map(p => p.toBase58()),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("[settle-draw] Error:", e);
    return new Response(
      JSON.stringify({ 
        ok: false,
        error: e.message || "Internal server error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
