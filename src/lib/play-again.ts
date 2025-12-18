import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";
import { getAnchorProvider, getProgram, PROGRAM_ID } from "./anchor-program";

function u64le(n: bigint): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(n, 0);
  return b;
}

function newRoomIdU64(): bigint {
  const now = BigInt(Date.now()); // ms
  const r = BigInt(Math.floor(Math.random() * 1000)); // 0..999
  return now * 1000n + r;
}

export async function playAgain(args: {
  connection: anchor.web3.Connection;
  wallet: WalletContextState;
  // reuse settings from the finished room:
  gameType: number;       // u8
  maxPlayers: number;     // u8 (2..4)
  stakeLamports: bigint;  // u64
}) {
  const { connection, wallet, gameType, maxPlayers, stakeLamports } = args;

  if (!wallet.publicKey) throw new Error("Wallet not connected");

  const provider = getAnchorProvider(connection, wallet);
  const program = getProgram(provider);

  const roomId = newRoomIdU64();

  const [roomPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("room"), wallet.publicKey.toBuffer(), u64le(roomId)],
    PROGRAM_ID
  );

  const [vaultPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), roomPda.toBuffer()],
    PROGRAM_ID
  );

  const sig = await program.methods
    .createRoom(
      new anchor.BN(roomId.toString()),
      gameType,
      maxPlayers,
      new anchor.BN(stakeLamports.toString())
    )
    .accounts({
      creator: wallet.publicKey,
      room: roomPda,
      vault: vaultPda,
      systemProgram: SystemProgram.programId,
    })
    .rpc();

  return { sig, roomId, roomPda: roomPda.toBase58(), vaultPda: vaultPda.toBase58() };
}
