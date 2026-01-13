/**
 * Example script to call sweep-orphan-vault edge function
 * 
 * Usage:
 *   npx ts-node scripts/sweep-orphan-example.ts
 * 
 * Or with Deno:
 *   deno run --allow-net scripts/sweep-orphan-example.ts
 * 
 * This script sweeps the known orphan vault:
 *   - creator: Fbk1rBg1QJyYaG73wvQnnmX5onbRbBBkVRpfX4GaFfEh
 *   - roomId: 26
 *   - vaultPda: 6RoRAC87FtyK9nP2DPSVxDVUnfaEgGe8Kan9xcnxyjVg
 */

const SUPABASE_URL = "https://mhtikjiticopicziepnj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1odGlraml0aWNvcGljemllcG5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY1Mjc5NDYsImV4cCI6MjA4MjEwMzk0Nn0.mEBbUtscNdJBZhGwUqdzN2HPF0spzJEDMx_sA55vYvM";

async function sweepOrphanVault(creatorWallet: string, roomId: number) {
  console.log(`\n🧹 Sweeping orphan vault...`);
  console.log(`  Creator: ${creatorWallet}`);
  console.log(`  Room ID: ${roomId}`);

  const response = await fetch(`${SUPABASE_URL}/functions/v1/sweep-orphan-vault`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      creatorWallet,
      roomId,
    }),
  });

  const result = await response.json();

  if (response.ok) {
    console.log(`\n✅ SUCCESS!`);
    console.log(`  Room PDA: ${result.roomPda}`);
    console.log(`  Vault PDA: ${result.vaultPda}`);
    console.log(`  Lamports Refunded: ${result.lamportsRefunded}`);
    console.log(`  SOL Refunded: ${result.solRefunded}`);
    console.log(`  TX Signature: ${result.txSignature}`);
    console.log(`\n  View on Solscan: https://solscan.io/tx/${result.txSignature}`);
  } else {
    console.log(`\n❌ FAILED!`);
    console.log(`  Status: ${response.status}`);
    console.log(`  Error: ${result.error || JSON.stringify(result)}`);
    if (result.logs) {
      console.log(`  Logs:`, result.logs);
    }
  }

  return result;
}

// Main execution
const CREATOR_WALLET = "Fbk1rBg1QJyYaG73wvQnnmX5onbRbBBkVRpfX4GaFfEh";
const ROOM_ID = 26;

sweepOrphanVault(CREATOR_WALLET, ROOM_ID)
  .then(() => console.log("\nDone!"))
  .catch(err => console.error("Script error:", err));
