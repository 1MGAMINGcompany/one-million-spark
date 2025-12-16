import { useEffect, useState } from "react";

// Single source of truth for RoomManager address
export const ROOMMANAGER_V7_ADDRESS = "0x4f3998195462100D867129747967BFCb56C07fe2" as const;

/**
 * Runtime contract validation hook.
 * Verifies the RoomManager address is a valid contract (has bytecode) on app load.
 */
export function useContractValidation() {
  const [isValidContract, setIsValidContract] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateContract() {
      try {
        const eth = (window as any).ethereum;
        if (!eth) {
          console.warn("[ContractValidation] No ethereum provider - skipping validation");
          setIsValidContract(true); // Assume valid when no wallet
          return;
        }

        // Fetch bytecode at the RoomManager address
        const bytecode = await eth.request({
          method: "eth_getCode",
          params: [ROOMMANAGER_V7_ADDRESS, "latest"],
        });

        // Check if bytecode exists (not just "0x" or empty)
        if (!bytecode || bytecode === "0x" || bytecode.length < 4) {
          const errMsg = `RoomManager address misconfigured (not a contract): ${ROOMMANAGER_V7_ADDRESS}`;
          console.error("[ContractValidation] FATAL:", errMsg);
          setError(errMsg);
          setIsValidContract(false);
          return;
        }

        console.log("[ContractValidation] RoomManager contract verified at:", ROOMMANAGER_V7_ADDRESS);
        console.log("[ContractValidation] Bytecode length:", bytecode.length);
        setIsValidContract(true);
      } catch (err) {
        console.error("[ContractValidation] Error checking contract:", err);
        setIsValidContract(true); // Don't block on validation errors
      }
    }

    validateContract();
  }, []);

  return { isValidContract, error };
}
