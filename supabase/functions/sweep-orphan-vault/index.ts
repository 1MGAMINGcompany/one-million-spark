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

interface SweepRequest {
  creatorWallet: string;
  roomId: number;
}

// Helper to convert string to Uint8Array for seeds
function textToBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

// Derive room PDA from (creator, room_id)
function getRoomPDA(creator: PublicKey, roomId: number): [PublicKey, number] {
  const roomIdBuffer = new Uint8Array(8);
  const view = new DataView(roomIdBuffer.buffer);
  view.setBigUint64(0, BigInt(roomId), true); // little-endian
  
  return PublicKey.findProgramAddressSync(
    [textToBytes("room"), creator.toBuffer(), roomIdBuffer],
    PROGRAM_ID
  );
}

// Derive vault PDA from room PDA
function getVaultPDA(roomPda: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textToBytes("vault"), roomPda.toBuffer()],
    PROGRAM_ID
  );
}

// Derive config PDA
function getConfigPDA(): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [textToBytes("config")],
    PROGRAM_ID
  );
}

// Config account layout from IDL:
// - 8 bytes discriminator
// - 32 bytes authority (pubkey)
// - 32 bytes fee_recipient (pubkey)
// - 2 bytes fee_bps (u16, little-endian)
// - 32 bytes verifier (pubkey)
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
    console.error("[sweep-orphan-vault] Failed to parse config account:", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { creatorWallet, roomId }: SweepRequest = await req.json();

    if (!creatorWallet || roomId === undefined || roomId === null) {
      return new Response(
        JSON.stringify({ error: "Missing creatorWallet or roomId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sweep-orphan-vault] Sweep request for creator=${creatorWallet}, roomId=${roomId}`);

    // Initialize clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const rpcUrl = Deno.env.get("VITE_SOLANA_RPC_URL") || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");

    const creatorPubkey = new PublicKey(creatorWallet);

    // Derive PDAs
    const [roomPda] = getRoomPDA(creatorPubkey, roomId);
    const [vaultPda] = getVaultPDA(roomPda);
    const [configPda] = getConfigPDA();

    console.log(`[sweep-orphan-vault] Derived PDAs:
  roomPda: ${roomPda.toBase58()}
  vaultPda: ${vaultPda.toBase58()}
  configPda: ${configPda.toBase58()}`);

    // Check if room exists (should NOT exist for orphan vault)
    const roomInfo = await connection.getAccountInfo(roomPda);
    if (roomInfo !== null) {
      console.log(`[sweep-orphan-vault] Room account EXISTS - this is not an orphan vault`);
      return new Response(
        JSON.stringify({ 
          error: "Room account exists - vault is not orphaned",
          roomPda: roomPda.toBase58(),
          vaultPda: vaultPda.toBase58(),
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if vault exists (should exist for orphan vault)
    const vaultInfo = await connection.getAccountInfo(vaultPda);
    if (vaultInfo === null) {
      console.log(`[sweep-orphan-vault] Vault account does NOT exist - nothing to sweep`);
      return new Response(
        JSON.stringify({ 
          status: "already_clean",
          message: "Vault account does not exist - nothing to sweep",
          roomPda: roomPda.toBase58(),
          vaultPda: vaultPda.toBase58(),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const vaultLamports = vaultInfo.lamports;
    console.log(`[sweep-orphan-vault] Found orphan vault with ${vaultLamports} lamports (${vaultLamports / 1e9} SOL)`);

    // Fetch config to validate
    const configInfo = await connection.getAccountInfo(configPda);
    if (!configInfo) {
      return new Response(
        JSON.stringify({ error: "Config not initialized on-chain" }),
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

    // Load verifier key
    const verifierSecretKey = Deno.env.get("VERIFIER_SECRET_KEY");
    if (!verifierSecretKey) {
      console.error("[sweep-orphan-vault] VERIFIER_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ error: "Server configuration error - missing verifier key" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let verifierKeypair: Uint8Array;
    try {
      const keyString = verifierSecretKey.trim();
      if (keyString.startsWith("[")) {
        verifierKeypair = new Uint8Array(JSON.parse(keyString));
      } else {
        verifierKeypair = bs58.decode(keyString);
      }
    } catch (e) {
      console.error("[sweep-orphan-vault] Failed to parse verifier key:", e);
      return new Response(
        JSON.stringify({ error: "Server configuration error - invalid verifier key format" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const verifier = Keypair.fromSecretKey(verifierKeypair);

    // Validate verifier matches config
    const isAuthority = configData.authority.equals(verifier.publicKey);
    const isVerifier = configData.verifier.equals(verifier.publicKey);

    if (!isAuthority && !isVerifier) {
      console.error("[sweep-orphan-vault] Signer not authorized:", {
        signer: verifier.publicKey.toBase58(),
        authority: configData.authority.toBase58(),
        verifier: configData.verifier.toBase58(),
      });
      return new Response(
        JSON.stringify({ error: "Verifier key is neither authority nor verifier in config" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sweep-orphan-vault] Authorized as ${isAuthority ? 'authority' : 'verifier'}`);

    // Build sweep_orphan_vault instruction
    // Discriminator: first 8 bytes of sha256("global:sweep_orphan_vault")
    // Computed via: Buffer.from(sha256.digest("global:sweep_orphan_vault")).slice(0, 8)
    // For now, use placeholder - UPDATE THIS after actual program deployment
    const discriminator = new Uint8Array([45, 183, 117, 42, 156, 224, 8, 201]);

    // Args: room_id as u64 little-endian
    const roomIdBuffer = new Uint8Array(8);
    const roomIdView = new DataView(roomIdBuffer.buffer);
    roomIdView.setBigUint64(0, BigInt(roomId), true); // little-endian

    // Instruction data: discriminator (8) + room_id (8)
    const data = new Uint8Array(16);
    data.set(discriminator, 0);
    data.set(roomIdBuffer, 8);

    // Accounts from IDL: signer, config, creator, vault, system_program
    const instruction = new TransactionInstruction({
      keys: [
        { pubkey: verifier.publicKey, isSigner: true, isWritable: false }, // signer
        { pubkey: configPda, isSigner: false, isWritable: false }, // config
        { pubkey: creatorPubkey, isSigner: false, isWritable: true }, // creator (refund destination)
        { pubkey: vaultPda, isSigner: false, isWritable: true }, // vault (to be closed)
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
      ],
      programId: PROGRAM_ID,
      data: data as any,
    });

    console.log(`[sweep-orphan-vault] Building transaction with accounts:
  signer: ${verifier.publicKey.toBase58()}
  config: ${configPda.toBase58()}
  creator: ${creatorPubkey.toBase58()}
  vault: ${vaultPda.toBase58()}
  system_program: ${SystemProgram.programId.toBase58()}`);

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

      console.log(`[sweep-orphan-vault] Transaction sent: ${signature}`);

      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, "confirmed");

      console.log(`[sweep-orphan-vault] ✅ Successfully swept orphan vault!
  creator: ${creatorWallet}
  roomId: ${roomId}
  vaultPda: ${vaultPda.toBase58()}
  lamportsRefunded: ${vaultLamports}
  txSignature: ${signature}`);

      // Log the sweep
      try {
        await supabase.from("recovery_logs").insert({
          room_pda: roomPda.toBase58(),
          caller_wallet: "system",
          action: "sweep_orphan_vault",
          result: "success",
          tx_signature: signature,
        });
      } catch (logErr) {
        console.warn("[sweep-orphan-vault] Failed to log sweep:", logErr);
      }

      return new Response(
        JSON.stringify({
          status: "success",
          message: "Orphan vault swept successfully",
          creatorWallet,
          roomId,
          roomPda: roomPda.toBase58(),
          vaultPda: vaultPda.toBase58(),
          lamportsRefunded: vaultLamports,
          solRefunded: vaultLamports / 1e9,
          txSignature: signature,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (txErr: any) {
      console.error("[sweep-orphan-vault] Transaction failed:", txErr);
      
      // Extract logs if available
      const logs = txErr?.logs || [];
      
      return new Response(
        JSON.stringify({
          status: "tx_failed",
          error: txErr.message || "Transaction failed",
          logs,
          creatorWallet,
          roomId,
          roomPda: roomPda.toBase58(),
          vaultPda: vaultPda.toBase58(),
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (err: any) {
    console.error("[sweep-orphan-vault] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
