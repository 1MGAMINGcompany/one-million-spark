import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, Keypair } from "https://esm.sh/@solana/web3.js@1.98.0";
import bs58 from "https://esm.sh/bs58@6.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PROGRAM_ID = new PublicKey("GamesMmG4u79VDvhk3mv2g88zB6ogjLoFmj7kkwdsnP");
const STALE_THRESHOLD_HOURS = 24;

interface RecoverRequest {
  roomPda: string;
  callerWallet: string;
}

interface RoomAccountData {
  roomId: bigint;
  creator: PublicKey;
  gameType: number;
  maxPlayers: number;
  status: number; // 1=Open, 2=Started, 3=Finished, 4=Cancelled
  stakeAmount: bigint;
  winner: PublicKey;
  players: PublicKey[];
  playerCount: number;
}

// Helper to convert string to Uint8Array for seeds
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function parseRoomAccount(data: Uint8Array): RoomAccountData | null {
  try {
    const view = new DataView(data.buffer, data.byteOffset);
    
    // Skip 8-byte discriminator
    let offset = 8;
    
    const roomId = view.getBigUint64(offset, true);
    offset += 8;
    
    const creator = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    const gameType = data[offset];
    offset += 1;
    
    const maxPlayers = data[offset];
    offset += 1;
    
    const status = data[offset];
    offset += 1;
    
    const stakeAmount = view.getBigUint64(offset, true);
    offset += 8;
    
    const winner = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Parse players array (max 4 players, 32 bytes each)
    const players: PublicKey[] = [];
    for (let i = 0; i < 4; i++) {
      const playerKey = new PublicKey(data.slice(offset, offset + 32));
      if (!playerKey.equals(PublicKey.default)) {
        players.push(playerKey);
      }
      offset += 32;
    }
    
    return {
      roomId,
      creator,
      gameType,
      maxPlayers,
      status,
      stakeAmount,
      winner,
      players,
      playerCount: players.length,
    };
  } catch (e) {
    console.error("Failed to parse room account:", e);
    return null;
  }
}

async function logRecoveryAttempt(
  supabase: any,
  roomPda: string,
  callerWallet: string,
  action: string,
  result: string,
  txSignature?: string
) {
  try {
    await supabase.from("recovery_logs").insert({
      room_pda: roomPda,
      caller_wallet: callerWallet,
      action,
      result,
      tx_signature: txSignature || null,
    });
  } catch (e) {
    console.error("Failed to log recovery attempt:", e);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, callerWallet }: RecoverRequest = await req.json();

    if (!roomPda || !callerWallet) {
      return new Response(
        JSON.stringify({ error: "Missing roomPda or callerWallet" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Recovery request for room ${roomPda} by ${callerWallet}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    // Fetch on-chain room data
    const roomPubkey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPubkey);

    if (!accountInfo) {
      await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "room_not_found");
      return new Response(
        JSON.stringify({ status: "not_found", message: "Room account not found on-chain" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "parse_failed");
      return new Response(
        JSON.stringify({ status: "error", message: "Failed to parse room account" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Room status: ${roomData.status}, players: ${roomData.playerCount}, creator: ${roomData.creator.toBase58()}`);

    // Status mapping: 1=Open, 2=Started, 3=Finished, 4=Cancelled
    switch (roomData.status) {
      case 3: // Finished
      case 4: // Cancelled
        await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "already_resolved");
        return new Response(
          JSON.stringify({ 
            status: "already_resolved", 
            message: roomData.status === 3 ? "Room already finished" : "Room already cancelled",
            onChainStatus: roomData.status
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

      case 1: // Open
        // Only creator can cancel an open room with 1 player
        if (roomData.playerCount === 1 && roomData.creator.toBase58() === callerWallet) {
          // Build cancel_room instruction for user to sign
          const [vaultPda] = PublicKey.findProgramAddressSync(
            [textToBytes("vault"), roomPubkey.toBuffer()],
            PROGRAM_ID
          );
          
          const [configPda] = PublicKey.findProgramAddressSync(
            [textToBytes("config")],
            PROGRAM_ID
          );

          // cancel_room instruction discriminator (first 8 bytes of sha256("global:cancel_room"))
          const discriminator = new Uint8Array([149, 119, 131, 119, 10, 44, 5, 220]);
          
          const instruction = new TransactionInstruction({
            keys: [
              { pubkey: roomPubkey, isSigner: false, isWritable: true },
              { pubkey: vaultPda, isSigner: false, isWritable: true },
              { pubkey: configPda, isSigner: false, isWritable: false },
              { pubkey: new PublicKey(callerWallet), isSigner: true, isWritable: true },
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ],
            programId: PROGRAM_ID,
            data: discriminator as any,
          });

          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
          const transaction = new Transaction({
            feePayer: new PublicKey(callerWallet),
            blockhash,
            lastValidBlockHeight,
          }).add(instruction);

          const serializedTx = bs58.encode(transaction.serialize({ requireAllSignatures: false }));

          await logRecoveryAttempt(supabase, roomPda, callerWallet, "cancel_prepared", "success");
          
          return new Response(
            JSON.stringify({
              status: "can_cancel",
              message: "You can cancel this room and get your stake back",
              unsignedTx: serializedTx,
              stakeAmount: roomData.stakeAmount.toString(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else if (roomData.playerCount > 1) {
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "room_has_players");
          return new Response(
            JSON.stringify({ 
              status: "no_action", 
              message: "Room has multiple players. Cannot cancel.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } else {
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "not_creator");
          return new Response(
            JSON.stringify({ 
              status: "not_authorized", 
              message: "Only the room creator can cancel",
            }),
            { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

      case 2: // Started
        // Check if game is stale
        const { data: session } = await supabase
          .from("game_sessions")
          .select("created_at, updated_at, status")
          .eq("room_pda", roomPda)
          .single();

        const { data: lastMove } = await supabase
          .from("game_moves")
          .select("created_at")
          .eq("room_pda", roomPda)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const lastActivity = lastMove?.created_at || session?.updated_at || session?.created_at;
        const hoursSinceActivity = lastActivity 
          ? (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60)
          : Infinity;

        console.log(`Hours since last activity: ${hoursSinceActivity}`);

        if (hoursSinceActivity < STALE_THRESHOLD_HOURS) {
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", "game_active");
          return new Response(
            JSON.stringify({
              status: "game_active",
              message: `Game is still active. Recovery available after ${STALE_THRESHOLD_HOURS} hours of inactivity.`,
              hoursSinceActivity: Math.round(hoursSinceActivity * 10) / 10,
              hoursRemaining: Math.round((STALE_THRESHOLD_HOURS - hoursSinceActivity) * 10) / 10,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Game is stale - verifier force-settles
        const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY");
        if (!verifierSecretKey) {
          console.error("VERIFIER_SECRET_KEY not configured");
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "verifier_key_missing");
          return new Response(
            JSON.stringify({ status: "error", message: "Server configuration error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Parse verifier key
        let verifierKeypair: Uint8Array;
        try {
          const keyString = verifierSecretKey.trim();
          if (keyString.startsWith("[")) {
            verifierKeypair = new Uint8Array(JSON.parse(keyString));
          } else {
            verifierKeypair = bs58.decode(keyString);
          }
        } catch (e) {
          console.error("Failed to parse verifier key:", e);
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "key_parse_failed");
          return new Response(
            JSON.stringify({ status: "error", message: "Server configuration error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const verifier = Keypair.fromSecretKey(verifierKeypair);

        // Build submit_result instruction - declare creator as winner (refunds both)
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [textToBytes("vault"), roomPubkey.toBuffer()],
          PROGRAM_ID
        );
        
        const [configPda] = PublicKey.findProgramAddressSync(
          [textToBytes("config")],
          PROGRAM_ID
        );

        // submit_result discriminator
        const discriminator = new Uint8Array([246, 215, 153, 130, 167, 40, 155, 42]);
        
        // Winner index = 0 (creator) as a single byte
        const data = new Uint8Array(discriminator.length + 1);
        data.set(discriminator, 0);
        data[discriminator.length] = 0; // winner_index = 0 (creator)

        // Get fee recipient from config
        const configInfo = await connection.getAccountInfo(configPda);
        let feeRecipient = roomData.creator; // fallback
        if (configInfo) {
          try {
            // Config: 8 disc + 32 authority + 32 fee_recipient + 2 fee_rate + 32 verifier
            feeRecipient = new PublicKey(configInfo.data.slice(40, 72));
          } catch (e) {
            console.error("Failed to parse config for fee recipient:", e);
          }
        }

        const remainingAccounts = roomData.players.map(p => ({
          pubkey: p,
          isSigner: false,
          isWritable: true,
        }));

        const instruction = new TransactionInstruction({
          keys: [
            { pubkey: roomPubkey, isSigner: false, isWritable: true },
            { pubkey: vaultPda, isSigner: false, isWritable: true },
            { pubkey: configPda, isSigner: false, isWritable: false },
            { pubkey: verifier.publicKey, isSigner: true, isWritable: false },
            { pubkey: feeRecipient, isSigner: false, isWritable: true },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
            ...remainingAccounts,
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

        try {
          const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            preflightCommitment: "confirmed",
          });

          await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
          }, "confirmed");

          console.log(`Force-settled room ${roomPda}, tx: ${signature}`);

          // Update game session status
          await supabase
            .from("game_sessions")
            .update({ status: "finished", updated_at: new Date().toISOString() })
            .eq("room_pda", roomPda);

          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "success", signature);

          return new Response(
            JSON.stringify({
              status: "force_settled",
              message: "Stale game force-settled. Funds returned to creator.",
              signature,
              winner: roomData.creator.toBase58(),
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e: any) {
          console.error("Force settle transaction failed:", e);
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", `failed: ${e.message}`);
          return new Response(
            JSON.stringify({ 
              status: "error", 
              message: "Failed to force-settle game",
              error: e.message,
            }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

      default:
        await logRecoveryAttempt(supabase, roomPda, callerWallet, "check", `unknown_status_${roomData.status}`);
        return new Response(
          JSON.stringify({ status: "unknown", message: `Unknown room status: ${roomData.status}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (e: any) {
    console.error("Recovery endpoint error:", e);
    return new Response(
      JSON.stringify({ status: "error", message: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
