import { useEffect, useState } from "react";
import { JsonRpcProvider } from "ethers";
import { ROOMMANAGER_V7_ADDRESS } from "@/lib/contractAddresses";

// Re-export for backwards compatibility
export { ROOMMANAGER_V7_ADDRESS };

const FALLBACK_RPC = "https://polygon-rpc.com";

/**
 * Runtime contract validation hook.
 * Verifies the RoomManager address has bytecode on app load.
 * Does NOT block on latestRoomId failure - just logs warning.
 */
export function useContractValidation() {
  const [isValidContract, setIsValidContract] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateContract() {
      try {
        const provider = new JsonRpcProvider(FALLBACK_RPC);

        // Fetch bytecode at the RoomManager address
        const bytecode = await provider.getCode(ROOMMANAGER_V7_ADDRESS);

        // Check if bytecode exists (not just "0x" or empty)
        if (!bytecode || bytecode === "0x" || bytecode.length < 4) {
          const errMsg = `RoomManager address has no bytecode: ${ROOMMANAGER_V7_ADDRESS}`;
          console.error("[ContractValidation] FATAL:", errMsg);
          setError(errMsg);
          setIsValidContract(false);
          return;
        }

        console.log(`ROOMMANAGER_ACTIVE=${ROOMMANAGER_V7_ADDRESS}`);
        console.log("[ContractValidation] Bytecode verified, length:", bytecode.length);
        setIsValidContract(true);
      } catch (err) {
        console.warn("[ContractValidation] Error checking contract:", err);
        setIsValidContract(true); // Don't block on network errors
      }
    }

    validateContract();
  }, []);

  return { isValidContract, error };
}
