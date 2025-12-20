// Stub anchor program - @coral-xyz/anchor has native deps that don't work in browser
// This file provides type-compatible stubs for the Anchor functionality
import { Connection, PublicKey } from "@solana/web3.js";
import type { WalletContextState } from "@solana/wallet-adapter-react";

export const PROGRAM_ID = new PublicKey(
  "4nkWS2ZYPqQrRSYbXD6XW6U6VenmBiZV2TkutY3vSPHu"
);

// Minimal provider interface for compatibility
export interface StubProvider {
  connection: Connection;
  wallet: WalletContextState;
  publicKey: PublicKey;
}

// Stub program interface for compatibility
export interface StubProgram {
  account: Record<string, any>;
  methods: Record<string, any>;
  programId: PublicKey;
}

export function getAnchorProvider(
  connection: Connection,
  wallet: WalletContextState
): StubProvider {
  if (!wallet.publicKey || !wallet.signTransaction) {
    throw new Error("Wallet not connected");
  }

  return {
    connection,
    wallet,
    publicKey: wallet.publicKey,
  };
}

export function getProgram(_provider: StubProvider): StubProgram {
  console.warn("[Anchor] Using stub program - full Anchor not available in browser");
  return {
    account: {},
    methods: {},
    programId: PROGRAM_ID,
  };
}
