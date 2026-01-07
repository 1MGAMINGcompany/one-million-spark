import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from "https://esm.sh/@solana/web3.js@1.98.0";
import bs58 from "https://esm.sh/bs58@6.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Mainnet production Program ID - MUST match solana-program.ts
const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Platform fee recipient
const FEE_RECIPIENT = new PublicKey("3bcV9vtxeiHsXgNx4qvQbS4ZL4cMUnAg2tF3DZjtmGUj");

interface ForfeitRequest {
  roomPda: string;
  forfeitingWallet: string;
  gameType?: string;
  winnerWallet?: string; // Optional: explicit winner (for win settlement)
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
      stakeLamports,
      winner,
      players,
    };
  } catch (e) {
    console.error("[forfeit-game] Failed to parse room account:", e);
    return null;
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, forfeitingWallet, gameType, winnerWallet: explicitWinner } = await req.json() as ForfeitRequest;

    if (!roomPda || !forfeitingWallet) {
      console.error("[forfeit-game] Missing required fields:", { roomPda, forfeitingWallet });
      // Return 200 with success:false for consistent client handling
      return new Response(
        JSON.stringify({ success: false, error: "Missing roomPda or forfeitingWallet" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[forfeit-game] Processing forfeit:", { roomPda, forfeitingWallet, gameType, explicitWinner });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ======== DEBUG: Verifier Key Diagnostics ========
    const verifierSecretKey = Deno.env.get('VERIFIER_SECRET_KEY');
    
    // Log existence (never log the full value!)
    console.log("[forfeit-game] 🔑 VERIFIER_SECRET_KEY exists:", !!verifierSecretKey);
    
    if (!verifierSecretKey) {
      console.error("[forfeit-game] ❌ VERIFIER_SECRET_KEY is NOT set in environment");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Server configuration error: VERIFIER_SECRET_KEY not configured",
          details: "The secret is missing from Supabase Edge Function secrets"
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Log first 2 chars only (safe preview)
    const keyPreview = verifierSecretKey.substring(0, 2);
    console.log("[forfeit-game] 🔑 Key starts with:", keyPreview);
    console.log("[forfeit-game] 🔑 Key total length (chars):", verifierSecretKey.length);

    // Helper function to load verifier keypair - supports JSON array, base58, and 32-byte seeds
    function loadVerifierKeypair(verifierSecretKeyStr: string): Keypair {
      const keyString = verifierSecretKeyStr.trim();
      let bytes: Uint8Array;

      if (keyString.startsWith("[")) {
        // JSON array format: [1,2,3,...,64 numbers]
        console.log("[forfeit-game] 📋 Parsing verifier key as JSON array");
        try {
          bytes = new Uint8Array(JSON.parse(keyString));
        } catch (parseErr) {
          throw new Error(`JSON parse failed: ${parseErr instanceof Error ? parseErr.message : parseErr}`);
        }
      } else {
        // Base58 format
        console.log("[forfeit-game] 🔤 Parsing verifier key as Base58");
        try {
          bytes = bs58.decode(keyString);
        } catch (decodeErr) {
          throw new Error(`Base58 decode failed: ${decodeErr instanceof Error ? decodeErr.message : decodeErr}`);
        }
      }

      console.log("[forfeit-game] 📏 Decoded byte length:", bytes.length);

      // Solana keypair secretKey is 64 bytes
      if (bytes.length === 64) {
        console.log("[forfeit-game] ✅ Using 64-byte secret key format");
        return Keypair.fromSecretKey(bytes);
      }

      // Some people store 32-byte seeds by mistake - support it
      if (bytes.length === 32) {
        console.log("[forfeit-game] ⚠️ Using 32-byte seed format (not recommended)");
        return Keypair.fromSeed(bytes);
      }

      throw new Error(`Invalid verifier key length: ${bytes.length} (expected 64 or 32)`);
    }

    // Parse verifier keypair
    let verifierKeypair: Keypair;
    try {
      verifierKeypair = loadVerifierKeypair(verifierSecretKey);
      console.log("[forfeit-game] ✅ Verifier keypair loaded successfully");
      console.log("[forfeit-game] 🔑 Verifier pubkey:", verifierKeypair.publicKey.toBase58());
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error("[forfeit-game] ❌ Failed to parse verifier key:", errMsg);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Server configuration error: invalid verifier key format",
          details: errMsg
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Connect to Solana
    const rpcUrl = Deno.env.get('VITE_SOLANA_RPC_URL') || 'https://api.mainnet-beta.solana.com';
    const connection = new Connection(rpcUrl, 'confirmed');

    // Fetch the on-chain room account
    const roomPdaKey = new PublicKey(roomPda);
    const accountInfo = await connection.getAccountInfo(roomPdaKey);

    if (!accountInfo) {
      console.error("[forfeit-game] Room not found on-chain:", roomPda);
      return new Response(
        JSON.stringify({ success: false, error: "Room not found on-chain" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse room account data with correct layout
    const roomData = parseRoomAccount(accountInfo.data);
    if (!roomData) {
      console.error("[forfeit-game] Failed to parse room data");
      return new Response(
        JSON.stringify({ success: false, error: "Failed to parse room account" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[forfeit-game] Room data:", { 
      roomId: roomData.roomId.toString(), 
      status: roomData.status, 
      maxPlayers: roomData.maxPlayers, 
      playerCount: roomData.playerCount, 
      stakeLamports: roomData.stakeLamports.toString(),
      creator: roomData.creator.toBase58()
    });
    console.log("[forfeit-game] Room players:", roomData.players.map(p => p.toBase58()));

    // Verify the forfeiting wallet is in the room
    const forfeitingPubkey = new PublicKey(forfeitingWallet);
    const playerIndex = roomData.players.findIndex(p => p.equals(forfeitingPubkey));
    if (playerIndex === -1) {
      console.error("[forfeit-game] Forfeiting wallet not in room:", forfeitingWallet);
      return new Response(
        JSON.stringify({ success: false, error: "Player not in this room" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Allow forfeit if:
    // 1. Room has 2+ players
    // 2. Room is not finished (status !== 3)
    // 3. Room is not cancelled (status !== 4)
    
    if (roomData.playerCount < 2) {
      console.error("[forfeit-game] Only 1 player - use cancel instead");
      return new Response(
        JSON.stringify({ success: false, error: "Room has only 1 player. Use Cancel to get refund." }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (roomData.status === 3 || roomData.status === 4) {
      console.error("[forfeit-game] Room already finished/cancelled:", roomData.status);
      return new Response(
        JSON.stringify({ success: false, error: "Room is already finished or cancelled" }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[forfeit-game] Allowing forfeit - 2+ players and room not finished/cancelled");

    // Determine the winner
    const isLudo = gameType === 'ludo' || roomData.maxPlayers > 2;
    let winnerWallet: string | null = null;

    if (isLudo && roomData.playerCount > 2) {
      // Ludo with 3+ players: mark as eliminated, game continues
      console.log("[forfeit-game] Ludo game with multiple players - marking player as eliminated");
      
      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('game_state')
        .eq('room_pda', roomPda)
        .single();

      if (sessionError) {
        console.error("[forfeit-game] Failed to fetch game session:", sessionError);
      } else {
        const currentState = sessionData?.game_state || {};
        const eliminatedPlayers = (currentState as Record<string, unknown>).eliminatedPlayers as string[] || [];
        eliminatedPlayers.push(forfeitingWallet);
        
        const { error: updateError } = await supabase
          .from('game_sessions')
          .update({ 
            game_state: { ...currentState as object, eliminatedPlayers },
            updated_at: new Date().toISOString()
          })
          .eq('room_pda', roomPda);

        if (updateError) {
          console.error("[forfeit-game] Failed to update game state:", updateError);
        }
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: 'eliminated',
          message: 'Player eliminated from Ludo game',
          forfeitingWallet 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2-player game: use explicit winner if provided, otherwise determine from players
    let winnerPubkey: PublicKey;
    if (explicitWinner) {
      winnerPubkey = new PublicKey(explicitWinner);
      winnerWallet = explicitWinner;
      console.log("[forfeit-game] Using explicit winner:", winnerWallet);
    } else {
      const winnerIndex = playerIndex === 0 ? 1 : 0;
      if (winnerIndex >= roomData.players.length) {
        console.error("[forfeit-game] Cannot determine winner - only one player in room");
        return new Response(
          JSON.stringify({ success: false, error: "Cannot forfeit - only one player in room. Use cancel instead." }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      winnerPubkey = roomData.players[winnerIndex];
      winnerWallet = winnerPubkey.toBase58();
      console.log("[forfeit-game] Winner determined:", winnerWallet);
    }

    // Build submit_result instruction
    const submitResultDiscriminator = new Uint8Array([240, 42, 89, 180, 10, 239, 9, 214]);
    
    const [configPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("config")],
      PROGRAM_ID
    );

    const [vaultPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("vault"), roomPdaKey.toBuffer()],
      PROGRAM_ID
    );

    const instructionDataArray = new Uint8Array(8 + 32);
    instructionDataArray.set(submitResultDiscriminator, 0);
    instructionDataArray.set(winnerPubkey.toBytes(), 8);

    const submitResultIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false },
        { pubkey: configPda, isSigner: false, isWritable: false },
        { pubkey: roomPdaKey, isSigner: false, isWritable: true },
        { pubkey: vaultPda, isSigner: false, isWritable: true },
        { pubkey: winnerPubkey, isSigner: false, isWritable: true },
        { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },
      ],
      data: instructionDataArray as any,
    });

    console.log("[forfeit-game] submit_result accounts:", {
      verifier: verifierKeypair.publicKey.toBase58(),
      config: configPda.toBase58(),
      room: roomPdaKey.toBase58(),
      vault: vaultPda.toBase58(),
      winner: winnerPubkey.toBase58(),
      feeRecipient: FEE_RECIPIENT.toBase58(),
      rpc: rpcUrl,
    });

    // Build and sign transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: verifierKeypair.publicKey,
      recentBlockhash: blockhash,
    }).add(submitResultIx);

    transaction.sign(verifierKeypair);

    console.log("[forfeit-game] Sending submit_result transaction...");
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log("[forfeit-game] ✅ Transaction sent:", signature);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      console.error("[forfeit-game] ❌ Transaction FAILED:", confirmation.value.err);
      const tx = await connection.getTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      console.error("[forfeit-game] Failure logs:", tx?.meta?.logMessages);
      
      await supabase
        .from('game_sessions')
        .update({ 
          status: 'needs_settlement',
          game_state: {
            settlementError: JSON.stringify(confirmation.value.err),
            intendedWinner: winnerWallet,
            failedAt: new Date().toISOString(),
            failedTxSignature: signature,
          },
          updated_at: new Date().toISOString()
        })
        .eq('room_pda', roomPda);
      
      // Return 200 with success:false for consistent client handling
      return new Response(
        JSON.stringify({
          success: false,
          error: "Payout transaction failed",
          status: "needs_settlement",
          signature,
          txErr: confirmation.value.err,
          logs: tx?.meta?.logMessages || null,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[forfeit-game] ✅ Transaction confirmed:", signature);

    // Record match result in database
    const playersArray = roomData.players.map(p => p.toBase58());
    const { error: rpcError } = await supabase.rpc('record_match_result', {
      p_room_pda: roomPda,
      p_finalize_tx: signature,
      p_winner_wallet: winnerWallet,
      p_game_type: gameType || 'unknown',
      p_max_players: roomData.maxPlayers,
      p_stake_lamports: Number(roomData.stakeLamports),
      p_mode: 'ranked',
      p_players: playersArray,
    });

    if (rpcError) {
      console.error("[forfeit-game] Failed to record match result:", rpcError);
    } else {
      console.log("[forfeit-game] Match result recorded in database");
    }

    // Mark game session as finished
    await supabase.rpc('finish_game_session', {
      p_room_pda: roomPda,
      p_caller_wallet: forfeitingWallet,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        action: 'forfeit',
        signature,
        winnerWallet,
        forfeitingWallet
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("[forfeit-game] Unexpected error:", error);
    // Return 200 with success:false for consistent client handling
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Internal server error",
        details: error instanceof Error ? error.stack : undefined
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
