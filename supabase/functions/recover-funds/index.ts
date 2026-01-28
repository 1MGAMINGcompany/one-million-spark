import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Connection, PublicKey, Transaction, TransactionInstruction, SystemProgram, Keypair } from "npm:@solana/web3.js@1.95.0";
import bs58 from "npm:bs58@5.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mainnet production Program ID - MUST match solana-program.ts
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Stale threshold for force-settle

const STALE_THRESHOLD_HOURS = 24;

interface RecoverRequest {
  roomPda: string;
  callerWallet: string;
}

// Room account layout from IDL:
// - 8 bytes discriminator
// - 8 bytes room_id (u64)
// - 32 bytes creator (pubkey)
// - 1 byte game_type (u8)
// - 1 byte max_players (u8)
// - 1 byte player_count (u8)
// - 1 byte status (u8): 1=Open, 2=Started, 3=Finished, 4=Cancelled
// - 8 bytes stake_lamports (u64)
// - 32 bytes winner (pubkey)
// - 128 bytes players array (4 x 32 bytes)
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

// Helper to convert string to Uint8Array for seeds
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
    
    // Parse players array (max 4 players, 32 bytes each)
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
    console.error("[recover-funds] Failed to parse room account:", e);
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

    const authority = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const feeRecipient = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;

    const feeBps = view.getUint16(offset, true);
    offset += 2;

    const verifier = new PublicKey(data.slice(offset, offset + 32));

    return { authority, feeRecipient, feeBps, verifier };
  } catch (e) {
    console.error("[recover-funds] Failed to parse config account:", e);
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
    console.error("[recover-funds] Failed to log recovery attempt:", e);
  }
}

Deno.serve(async (req: Request) => {
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

    console.log(`[recover-funds] Recovery request for room ${roomPda} by ${callerWallet}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
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

    console.log(`[recover-funds] Room status: ${roomData.status}, players: ${roomData.playerCount}, creator: ${roomData.creator.toBase58()}`);

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

          // cancel_room discriminator from IDL: [91, 107, 215, 178, 200, 224, 241, 237]
          const discriminator = new Uint8Array([91, 107, 215, 178, 200, 224, 241, 237]);
          
          // Accounts from IDL: creator, room, vault, system_program
          const instruction = new TransactionInstruction({
            keys: [
              { pubkey: new PublicKey(callerWallet), isSigner: true, isWritable: true }, // creator
              { pubkey: roomPubkey, isSigner: false, isWritable: true }, // room
              { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault
              { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
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

        console.log(`[recover-funds] Hours since last activity: ${hoursSinceActivity}`);

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
        const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY_V2") || Deno.env.get("VERIFIER_SECRET_KEY");
        if (!verifierSecretKey) {
          console.error("[recover-funds] VERIFIER_SECRET_KEY_V2 not configured");
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
          console.error("[recover-funds] Failed to parse verifier key:", e);
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "key_parse_failed");
          return new Response(
            JSON.stringify({ status: "error", message: "Server configuration error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const verifier = Keypair.fromSecretKey(verifierKeypair);

        // Build submit_result instruction - declare creator as winner for force-settle
        const [vaultPda] = PublicKey.findProgramAddressSync(
          [textToBytes("vault"), roomPubkey.toBuffer()],
          PROGRAM_ID
        );
        
        const [configPda] = PublicKey.findProgramAddressSync(
          [textToBytes("config")],
          PROGRAM_ID
        );

        // Fetch on-chain config to get fee_recipient dynamically
        const configInfo = await connection.getAccountInfo(configPda);
        if (!configInfo) {
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "config_not_found");
          return new Response(
            JSON.stringify({ status: "error", message: "Config not initialized on-chain" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const configData = parseConfigAccount(configInfo.data);
        if (!configData) {
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "config_parse_failed");
          return new Response(
            JSON.stringify({ status: "error", message: "Failed to parse config account" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        console.log(`[recover-funds] Using on-chain feeRecipient: ${configData.feeRecipient.toBase58()}`);

        // Validate verifier matches on-chain config
        if (!configData.verifier.equals(verifier.publicKey)) {
          console.error("[recover-funds] Verifier mismatch!", {
            expected: configData.verifier.toBase58(),
            actual: verifier.publicKey.toBase58(),
          });
          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "verifier_mismatch");
          return new Response(
            JSON.stringify({ status: "error", message: "Verifier key mismatch with on-chain config" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // submit_result discriminator from IDL: [240, 42, 89, 180, 10, 239, 9, 214]
        const discriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);
        
        // Instruction data: discriminator (8) + winner pubkey (32)
        const data = new Uint8Array(8 + 32);
        data.set(discriminator, 0);
        data.set(roomData.creator.toBytes(), 8); // Creator is winner for force-settle

        // IDL accounts order: ['verifier','config','room','vault','winner','fee_recipient','creator']
        const instruction = new TransactionInstruction({
          keys: [
            { pubkey: verifier.publicKey, isSigner: true, isWritable: false }, // verifier
            { pubkey: configPda, isSigner: false, isWritable: false }, // config
            { pubkey: roomPubkey, isSigner: false, isWritable: true }, // room
            { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault
            { pubkey: roomData.creator, isSigner: false, isWritable: true }, // winner (creator for force-settle)
            { pubkey: configData.feeRecipient, isSigner: false, isWritable: true }, // fee_recipient (from config)
            { pubkey: roomData.creator, isSigner: false, isWritable: true }, // creator (for vault close refund)
          ],
          programId: PROGRAM_ID,
          data: data as any,
        });

        console.log("[recover-funds] submit_result account keys in order:");
        console.log(`  [0] verifier: ${verifier.publicKey.toBase58()}`);
        console.log(`  [1] config: ${configPda.toBase58()}`);
        console.log(`  [2] room: ${roomPubkey.toBase58()}`);
        console.log(`  [3] vault: ${vaultPda.toBase58()}`);
        console.log(`  [4] winner: ${roomData.creator.toBase58()}`);
        console.log(`  [5] fee_recipient: ${configData.feeRecipient.toBase58()}`);
        console.log(`  [6] creator: ${roomData.creator.toBase58()}`);

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

          console.log(`[recover-funds] Force-settled room ${roomPda}, tx: ${signature}`);

          // Update game session status
          await supabase
            .from("game_sessions")
            .update({ status: "finished", updated_at: new Date().toISOString() })
            .eq("room_pda", roomPda);

          await logRecoveryAttempt(supabase, roomPda, callerWallet, "force_settle", "success", signature);

          // ─────────────────────────────────────────────────────────────
          // AUTO CLOSE ROOM: Refund rent to creator after successful settlement
          // close_room requires NO creator signature - verifier can pay fees
          // ─────────────────────────────────────────────────────────────
          let closeRoomSignature: string | null = null;
          let closeRoomError: string | null = null;

          try {
            console.log("[recover-funds] Closing room to refund rent...", {
              room: roomPubkey.toBase58(),
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
                { pubkey: roomPubkey, isSigner: false, isWritable: true },         // room
                { pubkey: roomData.creator, isSigner: false, isWritable: true },   // creator
              ],
              data: closeRoomDiscriminator as any,
            });

            // Build + sign close_room tx (verifier pays fees)
            const { blockhash: closeBlockhash, lastValidBlockHeight: closeLastValid } = 
              await connection.getLatestBlockhash("confirmed");

            const closeTx = new Transaction({
              feePayer: verifier.publicKey,
              recentBlockhash: closeBlockhash,
            }).add(closeRoomIx);

            closeTx.sign(verifier);

            closeRoomSignature = await connection.sendRawTransaction(closeTx.serialize(), {
              skipPreflight: false,
              preflightCommitment: "confirmed",
            });

            console.log("[recover-funds] close_room sent:", closeRoomSignature);

            const closeConfirmation = await connection.confirmTransaction(
              { signature: closeRoomSignature, blockhash: closeBlockhash, lastValidBlockHeight: closeLastValid },
              "confirmed",
            );

            if (closeConfirmation.value.err) {
              throw new Error(`close_room failed: ${JSON.stringify(closeConfirmation.value.err)}`);
            }

            console.log("[recover-funds] ✅ close_room confirmed", { closeSig: closeRoomSignature });

          } catch (closeErr) {
            // close_room failure is NOT fatal - force-settle payout already succeeded
            closeRoomError = String((closeErr as Error)?.message ?? closeErr);
            console.warn("[recover-funds] ⚠️ close_room failed", { error: closeRoomError });
          }

          return new Response(
            JSON.stringify({
              status: "force_settled",
              message: "Stale game force-settled. Funds returned to creator.",
              signature,
              winner: roomData.creator.toBase58(),
              closeRoomSignature,
              closeRoomError,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        } catch (e: any) {
          console.error("[recover-funds] Force settle transaction failed:", e);
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
    console.error("[recover-funds] Recovery endpoint error:", e);
    return new Response(
      JSON.stringify({ status: "error", message: e.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
