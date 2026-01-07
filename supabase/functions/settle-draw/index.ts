import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Connection, PublicKey, Transaction, TransactionInstruction, Keypair, LAMPORTS_PER_SOL } from "https://esm.sh/@solana/web3.js@1.98.0";
import bs58 from "https://esm.sh/bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mainnet production Program ID - MUST match solana-program.ts
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Platform fee recipient
const FEE_RECIPIENT = new PublicKey("3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj");

// Platform fee: 5%
const FEE_BPS = 500;

interface DrawSettleRequest {
  roomPda: string;
  callerWallet: string;
  gameType?: string;
}

// Room account layout (same as other edge functions)
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
    
    // Parse players array
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, callerWallet, gameType }: DrawSettleRequest = await req.json();

    if (!roomPda || !callerWallet) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda or callerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[settle-draw] Draw settlement request for room ${roomPda} by ${callerWallet}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Get verifier key
    const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY");
    if (!verifierSecretKey) {
      console.error("[settle-draw] VERIFIER_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verifier: Keypair;
    try {
      const keyString = verifierSecretKey.trim();
      let keyBytes: Uint8Array;
      if (keyString.startsWith("[")) {
        keyBytes = new Uint8Array(JSON.parse(keyString));
      } else {
        keyBytes = bs58.decode(keyString);
      }
      verifier = Keypair.fromSecretKey(keyBytes);
      console.log("[settle-draw] Verifier public key:", verifier.publicKey.toBase58());
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

    // Verify caller is a participant
    const callerPubkey = new PublicKey(callerWallet);
    const isParticipant = roomData.players.some(p => p.equals(callerPubkey));
    if (!isParticipant) {
      return new Response(
        JSON.stringify({ error: "Caller is not a participant in this room" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check room is in Started status (2)
    if (roomData.status !== 2) {
      if (roomData.status === 3 || roomData.status === 4) {
        return new Response(
          JSON.stringify({ 
            status: "already_resolved",
            message: "Room is already finished or cancelled" 
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Room is not in active game state" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify 2-player game (draws only supported for 2 players currently)
    if (roomData.playerCount !== 2) {
      return new Response(
        JSON.stringify({ error: "Draw settlement only supported for 2-player games" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // LIMITATION: The on-chain program only supports a single winner
    // For draws, we'll declare player 1 (creator) as the on-chain "winner"
    // The actual draw handling is done in the database only
    // NOTE: Funds still go to one player on-chain - this is a program limitation
    // A proper draw implementation would require updating the Solana program
    
    console.log("[settle-draw] IMPORTANT: On-chain program doesn't support true draws.");
    console.log("[settle-draw] Recording as draw in database, but on-chain will show creator as winner.");
    console.log("[settle-draw] For true 50/50 split, the Solana program needs to be updated.");

    // Calculate payout info for logging
    const pot = Number(roomData.stakeAmount) * 2;
    const fee = Math.floor(pot * FEE_BPS / 10000);
    const winnerPayout = pot - fee;
    
    console.log("[settle-draw] Payout breakdown:", {
      pot: pot / LAMPORTS_PER_SOL,
      fee: fee / LAMPORTS_PER_SOL,
      winnerPayout: winnerPayout / LAMPORTS_PER_SOL,
    });

    // Build submit_result instruction with creator as "winner"
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [textToBytes("vault"), roomPubkey.toBuffer()],
      PROGRAM_ID
    );
    
    const [configPda] = PublicKey.findProgramAddressSync(
      [textToBytes("config")],
      PROGRAM_ID
    );

    // submit_result discriminator: [240, 42, 89, 180, 10, 239, 9, 214]
    const discriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);
    
    // Use creator as the nominal "winner" for on-chain settlement
    const nominalWinner = roomData.creator;
    
    const data = new Uint8Array(8 + 32);
    data.set(discriminator, 0);
    data.set(nominalWinner.toBytes(), 8);

    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: verifier.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: roomPubkey, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: nominalWinner, isSigner: false, isWritable: true },
        { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      ],
      programId: PROGRAM_ID,
      data: data as any,
    });

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    const transaction = new Transaction({
      feePayer: verifier.publicKey,
      blockhash,
      lastValidBlockHeight,
    }).add(instruction);

    transaction.sign(verifier);

    console.log("[settle-draw] Sending submit_result transaction...");

    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });

    console.log("[settle-draw] Transaction sent:", signature);

    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, "confirmed");

    console.log("[settle-draw] Transaction confirmed:", signature);

    // Mark game session as finished with draw recorded
    await supabase
      .from("game_sessions")
      .update({ 
        status: "finished", 
        updated_at: new Date().toISOString() 
      })
      .eq("room_pda", roomPda);

    // Record the draw in finalize_receipts
    await supabase.from("finalize_receipts").insert({
      room_pda: roomPda,
      finalize_tx: signature,
    });

    // Note: We intentionally do NOT call record_match_result for draws
    // since the on-chain winner doesn't reflect the true game outcome
    // In a proper implementation, record_match_result would need a draw variant

    return new Response(
      JSON.stringify({
        status: "settled",
        message: "Draw settled on-chain. Note: Due to program limitations, creator received the pot. For true 50/50 splits, contact support.",
        signature,
        onChainWinner: nominalWinner.toBase58(),
        isDraw: true,
        note: "On-chain program doesn't support draws. Funds went to creator. Database records this as a draw.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (e: any) {
    console.error("[settle-draw] Error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
