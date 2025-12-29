import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Connection, PublicKey, Keypair, Transaction, TransactionInstruction } from "https://esm.sh/@solana/web3.js@1.98.0";
import { decode } from "https://deno.land/std@0.168.0/encoding/base58.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Program ID for the on-chain game program
const PROGRAM_ID = new PublicKey("71TYeGwaKEQ3NxJvJ3VJrP2sASLWq4wJ7Tn8ue7V1eGP");

interface ForfeitRequest {
  roomPda: string;
  forfeitingWallet: string;
  gameType?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { roomPda, forfeitingWallet, gameType } = await req.json() as ForfeitRequest;

    if (!roomPda || !forfeitingWallet) {
      console.error("[forfeit-game] Missing required fields:", { roomPda, forfeitingWallet });
      return new Response(
        JSON.stringify({ error: "Missing roomPda or forfeitingWallet" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("[forfeit-game] Processing forfeit:", { roomPda, forfeitingWallet, gameType });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get verifier secret key
    const verifierSecretKey = Deno.env.get('VERIFIER_SECRET_KEY');
    if (!verifierSecretKey) {
      console.error("[forfeit-game] VERIFIER_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error: verifier not configured" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse verifier keypair
    let verifierKeypair: Keypair;
    try {
      const secretKeyBytes = decode(verifierSecretKey);
      verifierKeypair = Keypair.fromSecretKey(new Uint8Array(secretKeyBytes));
      console.log("[forfeit-game] Verifier public key:", verifierKeypair.publicKey.toBase58());
    } catch (err) {
      console.error("[forfeit-game] Failed to parse verifier key:", err);
      return new Response(
        JSON.stringify({ error: "Server configuration error: invalid verifier key" }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
        JSON.stringify({ error: "Room not found on-chain" }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse room account data
    // The room account layout:
    // 0-7: discriminator (8 bytes)
    // 8-11: room_id (4 bytes, u32)
    // 12-43: creator (32 bytes, Pubkey)
    // 44: status (1 byte)
    // 45: game_type (1 byte)
    // 46: max_players (1 byte)
    // 47-54: entry_fee (8 bytes, u64)
    // 55: player_count (1 byte)
    // 56+: players array (32 bytes each)
    
    const data = accountInfo.data;
    const dataView = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const roomId = dataView.getUint32(8, true);
    const creator = new PublicKey(data.slice(12, 44));
    const status = data[44];
    const maxPlayers = data[46];
    const entryFee = dataView.getBigUint64(47, true);
    const playerCount = data[55];

    console.log("[forfeit-game] Room data:", { roomId, status, maxPlayers, playerCount, entryFee: entryFee.toString() });

    // Extract players from the room
    const players: PublicKey[] = [];
    for (let i = 0; i < playerCount; i++) {
      const offset = 56 + (i * 32);
      const playerPubkey = new PublicKey(data.slice(offset, offset + 32));
      players.push(playerPubkey);
    }

    console.log("[forfeit-game] Room players:", players.map(p => p.toBase58()));

    // Verify the forfeiting wallet is in the room
    const forfeitingPubkey = new PublicKey(forfeitingWallet);
    const playerIndex = players.findIndex(p => p.equals(forfeitingPubkey));
    if (playerIndex === -1) {
      console.error("[forfeit-game] Forfeiting wallet not in room:", forfeitingWallet);
      return new Response(
        JSON.stringify({ error: "Player not in this room" }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check room status (1 = Started)
    if (status !== 1) {
      console.error("[forfeit-game] Room not in Started status:", status);
      return new Response(
        JSON.stringify({ error: "Room is not in active game state" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the winner (for 2-player games: the other player)
    // For Ludo (4-player): mark player as eliminated, game continues
    const isLudo = gameType === 'ludo' || maxPlayers > 2;
    let winnerWallet: string | null = null;

    if (isLudo && playerCount > 2) {
      // Ludo with 3+ players: mark as eliminated, game continues
      console.log("[forfeit-game] Ludo game with multiple players - marking player as eliminated");
      
      // Get current game state from database
      const { data: sessionData, error: sessionError } = await supabase
        .from('game_sessions')
        .select('game_state')
        .eq('room_pda', roomPda)
        .single();

      if (sessionError) {
        console.error("[forfeit-game] Failed to fetch game session:", sessionError);
      } else {
        // Update game state to mark player as eliminated
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

    // 2-player game: determine winner (the other player)
    const winnerIndex = playerIndex === 0 ? 1 : 0;
    if (winnerIndex >= players.length) {
      console.error("[forfeit-game] Cannot determine winner - only one player in room");
      return new Response(
        JSON.stringify({ error: "Cannot forfeit - only one player in room. Use cancel instead." }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    winnerWallet = players[winnerIndex].toBase58();
    console.log("[forfeit-game] Winner determined:", winnerWallet);

    // Build submit_result instruction
    // discriminator for submit_result
    const submitResultDiscriminator = new Uint8Array([152, 41, 65, 39, 109, 229, 167, 41]);
    
    // Config PDA for the verifier
    const [configPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("config")],
      PROGRAM_ID
    );

    // Treasury PDA
    const [treasuryPda] = PublicKey.findProgramAddressSync(
      [new TextEncoder().encode("treasury")],
      PROGRAM_ID
    );

    // Build instruction data
    const winnerPubkey = new PublicKey(winnerWallet);
    const resultType = 0; // 0 = normal, 1 = gammon, 2 = backgammon
    
    // Concatenate instruction data using Buffer for compatibility
    const instructionDataArray = new Uint8Array(submitResultDiscriminator.length + 32 + 1);
    instructionDataArray.set(submitResultDiscriminator, 0);
    instructionDataArray.set(winnerPubkey.toBytes(), submitResultDiscriminator.length);
    instructionDataArray[submitResultDiscriminator.length + 32] = resultType;

    // Build accounts list for submit_result
    const submitResultIx = new TransactionInstruction({
      programId: PROGRAM_ID,
      keys: [
        { pubkey: verifierKeypair.publicKey, isSigner: true, isWritable: false }, // verifier
        { pubkey: configPda, isSigner: false, isWritable: false }, // config
        { pubkey: roomPdaKey, isSigner: false, isWritable: true }, // room
        { pubkey: creator, isSigner: false, isWritable: true }, // creator (for refund if applicable)
        { pubkey: winnerPubkey, isSigner: false, isWritable: true }, // winner
        { pubkey: treasuryPda, isSigner: false, isWritable: true }, // treasury
        { pubkey: new PublicKey("11111111111111111111111111111111"), isSigner: false, isWritable: false }, // system_program
      ],
      // @ts-ignore - Uint8Array is compatible with Buffer in runtime
      data: instructionDataArray,
    });

    // Build and sign transaction
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    const transaction = new Transaction({
      feePayer: verifierKeypair.publicKey,
      recentBlockhash: blockhash,
    }).add(submitResultIx);

    transaction.sign(verifierKeypair);

    console.log("[forfeit-game] Sending submit_result transaction...");
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
    });

    console.log("[forfeit-game] Transaction sent:", signature);

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash,
      lastValidBlockHeight,
    }, 'confirmed');

    console.log("[forfeit-game] Transaction confirmed:", signature);

    // Record match result in database
    const playersArray = players.map(p => p.toBase58());
    const { error: rpcError } = await supabase.rpc('record_match_result', {
      p_room_pda: roomPda,
      p_finalize_tx: signature,
      p_winner_wallet: winnerWallet,
      p_game_type: gameType || 'unknown',
      p_max_players: maxPlayers,
      p_stake_lamports: Number(entryFee),
      p_mode: 'ranked', // Forfeit typically happens in ranked games
      p_players: playersArray,
    });

    if (rpcError) {
      console.error("[forfeit-game] Failed to record match result:", rpcError);
      // Don't fail the request - the on-chain tx succeeded
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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
