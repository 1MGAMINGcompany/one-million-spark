/**
 * DEV-ONLY: Fetch and log the on-chain program Config account
 * to inspect verifier authorization settings.
 */
import { Connection } from "@solana/web3.js";
import { getConfigPDA, parseConfigAccount, PROGRAM_ID } from "./solana-program";
import { getSolanaEndpoint } from "./solana-config";

export async function devLogProgramConfig(): Promise<void> {
  // Only log once per session
  if (sessionStorage.getItem("did_log_config") === "1") return;
  sessionStorage.setItem("did_log_config", "1");

  console.log("[CONFIG] === CONFIG CHECK ===");
  console.log("[CONFIG] Program ID:", PROGRAM_ID.toBase58());

  try {
    const endpoint = getSolanaEndpoint();
    console.log("[CONFIG] RPC endpoint:", endpoint);

    const connection = new Connection(endpoint, "confirmed");

    // Derive config PDA using seeds ["config"]
    const [configPda, bump] = getConfigPDA();
    console.log("[CONFIG] PDA:", configPda.toBase58());
    console.log("[CONFIG] PDA bump:", bump);

    // Fetch the account
    const accountInfo = await connection.getAccountInfo(configPda);

    if (!accountInfo) {
      console.error("[CONFIG] Config account NOT FOUND on-chain");
      return;
    }

    console.log("[CONFIG] Account exists, data length:", accountInfo.data.length);
    console.log("[CONFIG] Owner:", accountInfo.owner.toBase58());

    // Parse the config data
    const config = parseConfigAccount(Buffer.from(accountInfo.data));

    if (!config) {
      console.error("[CONFIG] Failed to parse config account data");
      console.log("[CONFIG] Raw data (hex):", Buffer.from(accountInfo.data).toString("hex"));
      return;
    }

    console.log("[CONFIG] DATA:", config);

    // Specifically log verifier-related fields
    console.log("[CONFIG] === VERIFIER AUTHORIZATION ===");
    console.log("[CONFIG] verifier:", config.verifier.toBase58());
    console.log("[CONFIG] authority:", config.authority.toBase58());
    console.log("[CONFIG] feeRecipient:", config.feeRecipient.toBase58());
    console.log("[CONFIG] feeBps:", config.feeBps);
    console.log("[CONFIG] bump:", config.bump);

    console.log("[CONFIG] === END CONFIG CHECK ===");
  } catch (err) {
    console.error("[CONFIG] Error fetching config:", err);
  }
}

// Auto-run on import (all builds, but only once per session)
setTimeout(() => {
  devLogProgramConfig();
}, 1000);
