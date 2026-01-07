/**
 * finalize_room instruction builder and action
 * 
 * This module provides the primitive to finalize a game room and distribute payouts.
 * The winner receives the pot minus platform fees.
 * 
 * Accounts:
 * - config: PDA ["config"]
 * - room: roomPda
 * - vault: PDA ["vault", roomPda]
 * - winner: winner's pubkey (receives payout)
 * - fee_recipient: from on-chain config (receives platform fee)
 * - system_program: System program
 */

import {
  Connection,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { normalizeSignature } from "@/lib/solana-utils";

// Program ID (mainnet)
export const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Instruction discriminator for finalize_room
// This is the first 8 bytes of sha256("global:finalize_room")
const FINALIZE_ROOM_DISCRIMINATOR = Buffer.from([
  194, 85, 247, 245, 247, 118, 52, 180
]);

/**
 * Derive the config PDA
 */
export function getConfigPDA(): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PROGRAM_ID
  );
  return pda;
}

/**
 * Derive the vault PDA for a room
 */
export function getVaultPDA(roomPda: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), roomPda.toBuffer()],
    PROGRAM_ID
  );
  return pda;
}

/**
 * On-chain Config account data
 */
export interface ProgramConfig {
  feeRecipient: PublicKey;
  feeBps: number;
}

// Cached config to avoid repeated fetches
let cachedConfig: ProgramConfig | null = null;

/**
 * Fetch the on-chain Config account
 * Returns fee_recipient and fee_bps from the program's config PDA
 * 
 * Config account layout (observed):
 * - 8 bytes: discriminator
 * - 32 bytes: fee_recipient (PublicKey)
 * - 2 bytes: fee_bps (u16)
 */
export async function fetchConfig(connection: Connection): Promise<ProgramConfig> {
  // Return cached if available
  if (cachedConfig) {
    console.log("[fetchConfig] Using cached config");
    return cachedConfig;
  }

  const configPda = getConfigPDA();
  console.log("[fetchConfig] Fetching config from PDA:", configPda.toBase58());

  const accountInfo = await connection.getAccountInfo(configPda);
  if (!accountInfo) {
    throw new Error("Config account not found on-chain");
  }

  const data = accountInfo.data;
  
  // Parse config account
  // Skip 8-byte discriminator
  const feeRecipientBytes = data.slice(8, 40); // 32 bytes
  const feeBpsBytes = data.slice(40, 42); // 2 bytes (u16)

  const feeRecipient = new PublicKey(feeRecipientBytes);
  const feeBps = feeBpsBytes[0] | (feeBpsBytes[1] << 8); // little-endian u16

  cachedConfig = { feeRecipient, feeBps };

  console.log("[fetchConfig] Config loaded:", {
    feeRecipient: feeRecipient.toBase58(),
    feeBps,
  });

  return cachedConfig;
}

/**
 * Clear cached config (useful for testing or if config changes)
 */
export function clearConfigCache(): void {
  cachedConfig = null;
}

/**
 * Build the finalize_room instruction
 * 
 * @param roomPda - The room's PDA
 * @param winnerPubkey - The winner's public key
 * @param feeRecipient - The fee recipient from on-chain config
 * @returns TransactionInstruction
 */
export function buildFinalizeRoomIx(
  roomPda: PublicKey,
  winnerPubkey: PublicKey,
  feeRecipient: PublicKey
): TransactionInstruction {
  const configPda = getConfigPDA();
  const vaultPda = getVaultPDA(roomPda);

  // Instruction data: discriminator + winner pubkey
  const data = Buffer.concat([
    FINALIZE_ROOM_DISCRIMINATOR,
    winnerPubkey.toBuffer(),
  ]);

  // Account metas (order matters - must match IDL)
  const keys = [
    { pubkey: configPda, isSigner: false, isWritable: false },      // config
    { pubkey: roomPda, isSigner: false, isWritable: true },          // room
    { pubkey: vaultPda, isSigner: false, isWritable: true },         // vault
    { pubkey: winnerPubkey, isSigner: false, isWritable: true },     // winner
    { pubkey: feeRecipient, isSigner: false, isWritable: true },     // fee_recipient (from config)
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }, // system_program
  ];

  return new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data,
  });
}

/**
 * Result type for finalizeRoom action
 */
export interface FinalizeRoomResult {
  ok: boolean;
  signature?: string;
  error?: string;
}

/**
 * Finalize a room and distribute payouts
 * 
 * This is the main action to call from UI components.
 * It fetches the on-chain config for fee_recipient, builds and sends the 
 * finalize_room transaction, then waits for confirmation.
 * 
 * @param connection - Solana connection
 * @param roomPda - The room's PDA (string or PublicKey)
 * @param winnerPubkey - The winner's public key (string or PublicKey)
 * @param sendTransaction - Wallet adapter's sendTransaction function
 * @param publicKey - The signer's public key
 * @returns FinalizeRoomResult
 */
export async function finalizeRoom(
  connection: Connection,
  roomPda: string | PublicKey,
  winnerPubkey: string | PublicKey,
  sendTransaction: (tx: VersionedTransaction, connection: Connection) => Promise<string | Uint8Array>,
  publicKey: PublicKey
): Promise<FinalizeRoomResult> {
  try {
    // Normalize inputs
    const roomPdaPubkey = typeof roomPda === "string" ? new PublicKey(roomPda) : roomPda;
    const winnerPubkeyPubkey = typeof winnerPubkey === "string" ? new PublicKey(winnerPubkey) : winnerPubkey;

    // Fetch fee_recipient from on-chain config (cached after first call)
    const config = await fetchConfig(connection);

    console.log("[finalizeRoom] Building instruction:", {
      roomPda: roomPdaPubkey.toBase58().slice(0, 8) + "...",
      winner: winnerPubkeyPubkey.toBase58().slice(0, 8) + "...",
      feeRecipient: config.feeRecipient.toBase58().slice(0, 8) + "...",
      signer: publicKey.toBase58().slice(0, 8) + "...",
    });

    // Build instruction with fee_recipient from config
    const ix = buildFinalizeRoomIx(roomPdaPubkey, winnerPubkeyPubkey, config.feeRecipient);

    // Get fresh blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");

    // Build V0 message
    const messageV0 = new TransactionMessage({
      payerKey: publicKey,
      recentBlockhash: blockhash,
      instructions: [ix],
    }).compileToV0Message();

    // Create VersionedTransaction
    const vtx = new VersionedTransaction(messageV0);

    // Pre-send simulation (log only, don't block)
    try {
      console.log("[finalizeRoom] Simulating transaction...");
      const simulation = await connection.simulateTransaction(vtx);
      if (simulation.value.err) {
        console.warn("[finalizeRoom] Simulation failed (proceeding anyway):", simulation.value.err);
        console.warn("[finalizeRoom] Simulation logs:", simulation.value.logs);
      } else {
        console.log("[finalizeRoom] Simulation passed");
      }
    } catch (simErr) {
      console.warn("[finalizeRoom] Simulation error (proceeding anyway):", simErr);
    }

    console.log("[finalizeRoom] Sending transaction...");

    // Send transaction (one wallet prompt)
    const rawSignature = await sendTransaction(vtx, connection);
    const signature = normalizeSignature(rawSignature);

    console.log("[finalizeRoom] Transaction sent:", signature);

    // Wait for confirmation
    console.log("[finalizeRoom] Waiting for confirmation...");
    const confirmation = await connection.confirmTransaction(
      { signature, blockhash, lastValidBlockHeight },
      "confirmed"
    );

    if (confirmation.value.err) {
      console.error("[finalizeRoom] Transaction failed:", confirmation.value.err);
      return {
        ok: false,
        signature,
        error: `Transaction failed: ${JSON.stringify(confirmation.value.err)}`,
      };
    }

    console.log("[finalizeRoom] Game settled / Payout complete");
    return { ok: true, signature };
  } catch (err: any) {
    console.error("[finalizeRoom] Error:", err);
    return {
      ok: false,
      error: err?.message || String(err),
    };
  }
}
