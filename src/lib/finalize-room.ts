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

// Fee recipient (from on-chain config - hardcoded for now)
export const FEE_RECIPIENT = new PublicKey("5vT4VNWwdxKtBAwKCMYKSA1t5rKb7ujgjNe2jxcUpHFC");

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
 * Build the finalize_room instruction
 * 
 * @param roomPda - The room's PDA
 * @param winnerPubkey - The winner's public key
 * @returns TransactionInstruction
 */
export function buildFinalizeRoomIx(
  roomPda: PublicKey,
  winnerPubkey: PublicKey
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
    { pubkey: FEE_RECIPIENT, isSigner: false, isWritable: true },    // fee_recipient
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
 * It builds and sends the finalize_room transaction, then waits for confirmation.
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

    console.log("[finalizeRoom] Building instruction:", {
      roomPda: roomPdaPubkey.toBase58().slice(0, 8) + "...",
      winner: winnerPubkeyPubkey.toBase58().slice(0, 8) + "...",
      signer: publicKey.toBase58().slice(0, 8) + "...",
    });

    // Build instruction
    const ix = buildFinalizeRoomIx(roomPdaPubkey, winnerPubkeyPubkey);

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
