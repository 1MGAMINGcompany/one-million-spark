import * as anchor from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

// TODO: we will fix this import path in the next step
import idl from "../idl/one_million_gaming.json";

export const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

export function getAnchorProvider(connection: anchor.web3.Connection, wallet: any) {
  if (!wallet?.publicKey || !wallet?.signTransaction) {
    throw new Error("Wallet not connected");
  }

  return new anchor.AnchorProvider(connection, wallet as anchor.Wallet, {
    commitment: "confirmed",
  });
}

export function getProgram(provider: anchor.AnchorProvider) {
  return new anchor.Program(idl as unknown as anchor.Idl, provider);
}
