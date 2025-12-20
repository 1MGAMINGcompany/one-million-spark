// Stub join-room - uses @solana/web3.js directly instead of Anchor
import { Connection, PublicKey, SystemProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getAnchorProvider, getProgram, PROGRAM_ID } from "./anchor-program";

export async function joinRoomByPda(args: {
  connection: Connection;
  wallet: WalletContextState;
  roomPda: PublicKey;
}) {
  const { connection, wallet, roomPda } = args;

  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const provider = getAnchorProvider(connection, wallet);
  const program = getProgram(provider);

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), roomPda.toBuffer()],
    PROGRAM_ID
  );

  // Stub: In production this would call the actual Solana program
  console.warn("[joinRoom] Using stub - full Anchor not available in browser");
  console.log("[joinRoom] Room:", roomPda.toBase58());
  console.log("[joinRoom] Vault:", vaultPda.toBase58());
  
  // Return stub result
  return { sig: "stub-signature", vaultPda: vaultPda.toBase58() };
}
