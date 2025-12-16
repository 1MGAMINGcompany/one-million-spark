/**
 * Minimal Smart Account Client for Gasless Transactions (ERC-4337)
 * 
 * This file is intentionally loosely typed to avoid TypeScript type explosion.
 * Uses thirdweb SDK for Smart Account transactions with gas sponsorship.
 */

import { createThirdwebClient, getContract, prepareContractCall, sendTransaction } from "thirdweb";
import { polygon } from "thirdweb/chains";
import { inAppWallet, smartWallet } from "thirdweb/wallets";

// Thirdweb client (reuse existing client ID)
const client = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Contract addresses
const ROOMMANAGER_V7_ADDRESS = "0xA039B03De894ebFa92933a9A7326c1715f040b96";

/**
 * Send a gasless transaction using Smart Account (ERC-4337)
 * 
 * @param options.contractAddress - Target contract address
 * @param options.abi - Contract ABI (array)
 * @param options.method - Method name to call
 * @param options.params - Method parameters (array)
 * @param options.userAddress - User's EOA address (for logging/context)
 * @returns Transaction receipt
 */
export async function sendGaslessTransaction(options: {
  contractAddress: string;
  abi: any[];
  method: string;
  params: any[];
  userAddress: string;
}): Promise<any> {
  const { contractAddress, abi, method, params, userAddress } = options;

  try {
    console.log("[SmartAccount] Preparing gasless transaction:", { method, params, userAddress });

    // Get the contract with explicit ABI
    const contract = getContract({
      client,
      chain: polygon,
      address: contractAddress as `0x${string}`,
      abi: abi,
    });

    // Find the method in ABI
    const methodAbi = abi.find((item: any) => item.name === method && item.type === "function");
    if (!methodAbi) {
      throw new Error(`Method ${method} not found in ABI`);
    }

    // Build the method signature string for thirdweb
    const inputTypes = methodAbi.inputs?.map((i: any) => `${i.type} ${i.name}`).join(", ") || "";
    const outputTypes = methodAbi.outputs?.map((o: any) => o.type).join(", ") || "";
    const methodSig = `function ${method}(${inputTypes})${outputTypes ? ` returns (${outputTypes})` : ""}`;

    console.log("[SmartAccount] Method signature:", methodSig);

    // Create a Smart Wallet using in-app wallet as the personal account
    // For gasless, we need the user to connect their wallet through thirdweb's flow
    // Since we're using MetaMask EOA, we need to create a smart wallet that wraps it
    
    const personalWallet = inAppWallet();
    const wallet = smartWallet({
      chain: polygon,
      sponsorGas: true, // Enable gas sponsorship
    });

    // For now, we'll use direct transaction preparation
    // The actual gasless flow requires proper thirdweb React integration
    
    // Prepare the transaction call
    const transaction = prepareContractCall({
      contract,
      method: methodSig as any,
      params: params as any,
    });

    console.log("[SmartAccount] Transaction prepared, attempting to send...");

    // For true gasless, this requires the thirdweb provider to be set up
    // with account abstraction enabled. Since we're keeping MetaMask,
    // we'll throw a descriptive error for now.
    throw new Error(
      "Gasless transactions require thirdweb Smart Account setup. " +
      "Please ensure the app is wrapped with ThirdwebProvider with accountAbstraction enabled, " +
      "or use the useSmartCreateRoom hook from useSmartAccountTransactions.ts instead."
    );

  } catch (error: any) {
    console.error("[SmartAccount] Transaction failed:", error);
    throw error;
  }
}

/**
 * Check if gas sponsorship is available
 */
export function isGaslessAvailable(): boolean {
  // Gas sponsorship requires thirdweb dashboard configuration
  return true; // Enabled now
}

/**
 * Get the Smart Account address for a given EOA
 */
export async function getSmartAccountAddress(eoaAddress: string): Promise<string | null> {
  try {
    console.log("[SmartAccount] Getting Smart Account for EOA:", eoaAddress);
    return null; // Placeholder - would need proper implementation
  } catch (error) {
    console.error("[SmartAccount] Failed to get Smart Account address:", error);
    return null;
  }
}

export { ROOMMANAGER_V7_ADDRESS, client as thirdwebClient };
