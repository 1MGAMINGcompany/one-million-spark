// Stub anchor client - @coral-xyz/anchor has native deps that don't work in browser
// This file provides type-compatible stubs for the Anchor functionality
import { Connection, PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey("4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu");

// Stub provider that doesn't use native anchor
export function getAnchorProvider(connection: Connection, wallet: any) {
  if (!wallet?.publicKey || !wallet?.signTransaction) {
    throw new Error("Wallet not connected");
  }
  return {
    connection,
    wallet,
    publicKey: wallet.publicKey,
  };
}

// Stub program - real implementation would use IDL
export function getProgram(_provider: any) {
  console.warn("[Anchor] Using stub program - full Anchor not available in browser");
  return {
    account: {},
    methods: {},
    programId: PROGRAM_ID,
  };
}
