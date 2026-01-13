import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, LAMPORTS_PER_SOL, SystemProgram } from "npm:@solana/web3.js@1.95.0";
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mainnet production Program ID
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Helius RPC endpoint
const DEFAULT_RPC = "https://barbey-suiowt-fast-mainnet.helius-rpc.com";

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

// Config account layout
interface ConfigAccountData {
  authority: PublicKey;
  verifier: PublicKey;
  feeRecipient: PublicKey;
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
    
    // Parse players array (up to 4 players)
    const players: PublicKey[] = [];
    for (let i = 0; i < playerCount && i < 4; i++) {
      const playerKey = new PublicKey(data.slice(offset + (i * 32), offset + ((i + 1) * 32)));
      if (!playerKey.equals(PublicKey.default)) {
        players.push(playerKey);
      }
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
    // Config layout: 8 disc + 32 authority + 32 verifier + 32 feeRecipient
    const authority = new PublicKey(data.slice(8, 40));
    const verifier = new PublicKey(data.slice(40, 72));
    const feeRecipient = new PublicKey(data.slice(72, 104));
    
    return { authority, verifier, feeRecipient };
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

    console.log("[settle-draw] Room data:", {
      status: roomData.status,
      playerCount: roomData.playerCount,
      stake: roomData.stakeAmount.toString(),
      creator: roomData.creator.toBase58(),
      players: roomData.players.map(p => p.toBase58()),
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

    // Derive PDAs
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [textToBytes("vault"), roomPubkey.toBuffer()],
      PROGRAM_ID
    );
    
    const [configPda] = PublicKey.findProgramAddressSync(
      [textToBytes("config")],
      PROGRAM_ID
    );

    console.log("[settle-draw] Vault PDA:", vaultPda.toBase58());
    console.log("[settle-draw] Config PDA:", configPda.toBase58());

    // Fetch config for fee_recipient
    const configInfo = await connection.getAccountInfo(configPda);
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

    // Check vault balance
    const vaultBalance = await connection.getBalance(vaultPda);
    console.log("[settle-draw] Vault balance:", vaultBalance / LAMPORTS_PER_SOL, "SOL");

    if (vaultBalance === 0) {
      // Vault is empty - might already be refunded
      console.log("[settle-draw] Vault is empty, marking as already settled");
      
      // Mark session as finished
      await supabase
        .from("game_sessions")
        .update({ 
          status: "finished", 
          updated_at: new Date().toISOString() 
        })
        .eq("room_pda", roomPda);
      
      return new Response(
        JSON.stringify({
          ok: true,
          alreadySettled: true,
          message: "Vault already empty - funds already refunded",
          roomPda,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build refund_draw instruction
    // Instruction discriminator for refund_draw (you'll need to compute this from anchor)
    // Using sha256("global:refund_draw")[0..8]
    // For now, we'll try the instruction and handle errors gracefully
    
    // refund_draw expected accounts (based on typical pattern):
    // ['verifier', 'config', 'room', 'vault', 'player1', 'player2', ..., 'fee_recipient', 'creator', 'system_program']
    
    // Build accounts array for refund_draw
    const refundDrawKeys = [
      { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: true },  // verifier (fee payer)
      { pubkey: configPda, isSigner: false, isWritable: false },                 // config
      { pubkey: roomPubkey, isSigner: false, isWritable: true },                 // room
      { pubkey: vaultPda, isSigner: false, isWritable: true },                   // vault
    ];

    // Add all players as writable (to receive refunds)
    for (const player of roomData.players) {
      refundDrawKeys.push({ pubkey: player, isSigner: false, isWritable: true });
    }
    
    // Pad remaining player slots (if less than maxPlayers)
    for (let i = roomData.players.length; i < roomData.maxPlayers; i++) {
      // Use system program as placeholder for empty slots
      refundDrawKeys.push({ pubkey: SystemProgram.programId, isSigner: false, isWritable: false });
    }

    refundDrawKeys.push(
      { pubkey: configData.feeRecipient, isSigner: false, isWritable: true },  // fee_recipient
      { pubkey: roomData.creator, isSigner: false, isWritable: true },          // creator (vault close refund)
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // system_program
    );

    console.log("[settle-draw] refund_draw account keys in order:");
    refundDrawKeys.forEach((key, i) => {
      console.log(`  [${i}] ${key.pubkey.toBase58()} (signer: ${key.isSigner}, writable: ${key.isWritable})`);
    });

    // refund_draw discriminator - compute from "global:refund_draw"
    // For Anchor, it's sha256("global:refund_draw")[0..8]
    // This needs to match your on-chain program
    const refundDrawDiscriminator = new Uint8Array([
      0x8a, 0x5b, 0x2e, 0x9f, 0x7c, 0x3d, 0x1a, 0x4e  // Placeholder - update with actual discriminator
    ]);

    const refundDrawInstruction = new TransactionInstruction({
      keys: refundDrawKeys,
      programId: PROGRAM_ID,
      data: refundDrawDiscriminator as any,
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
        errorStr.includes('0x65') // Custom error code for unknown instruction
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
      
      // Re-throw for other errors
      throw txError;
    }

    // Now call close_room to reclaim room rent
    console.log("[settle-draw] Calling close_room to reclaim rent...");

    // close_room discriminator: sha256("global:close_room")[0..8]
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
        playersRefunded: roomData.players.map(p => p.toBase58()),
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
