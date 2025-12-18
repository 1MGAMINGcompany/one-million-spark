import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import idl from "../idl/one_million_gaming.json";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export const PROGRAM_ID = new PublicKey(
  "4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu"
);

export function getAnchorProvider(
  connection: anchor.web3.Connection,
  wallet: WalletContextState
) {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  return new anchor.AnchorProvider(connection, wallet as unknown as anchor.Wallet, {
    commitment: "confirmed",
  });
}

export function getProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(idl as unknown as anchor.Idl, provider);
}
