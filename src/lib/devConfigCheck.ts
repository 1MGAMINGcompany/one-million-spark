/**
 * DEV-ONLY: Fetch and log the on-chain program Config account
 * to inspect verifier authorization settings.
 */
import { Connection, PublicKey } from "@solana/web3.js";
import { getConfigPDA, PROGRAM_ID } from "./solana-program";
import { getSolanaEndpoint } from "./solana-config";

export async function devLogProgramConfig(): Promise<void> {
  // Only log once per session
  if (sessionStorage.getItem("did_log_config_v2") === "1") return;
  sessionStorage.setItem("did_log_config_v2", "1");

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

    // Manual byte parsing (discriminator: 0..8, then 3 pubkeys + u16)
    const data = Buffer.from(accountInfo.data);
    const authority = new PublicKey(data.slice(8, 40));
    const verifier = new PublicKey(data.slice(40, 72));
    const feeRecipient = new PublicKey(data.slice(72, 104));
    const feeBps = data.readUInt16LE(104);

    console.log("[CONFIG] authority", authority.toBase58());
    console.log("[CONFIG] verifier", verifier.toBase58());
    console.log("[CONFIG] feeRecipient", feeRecipient.toBase58());
    console.log("[CONFIG] feeBps", feeBps);

    console.log("[CONFIG] === END CONFIG CHECK ===");
  } catch (err) {
    console.error("[CONFIG] Error fetching config:", err);
  }
}

// Auto-run on import (all builds, but only once per session)
setTimeout(() => {
  devLogProgramConfig();
}, 1000);
