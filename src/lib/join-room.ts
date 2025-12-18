import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getAnchorProvider, getProgram, PROGRAM_ID } from "./anchor-program";

export async function joinRoomByPda(args: {
  connection: anchor.web3.Connection;
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

  const sig = await program.methods
    .joinRoom()
    .accounts({
      player: wallet.publicKey,
      room: roomPda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { sig, vaultPda: vaultPda.toBase58() };
}
