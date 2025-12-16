import { useEffect, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

// Single source of truth for RoomManager address
export const ROOMMANAGER_V7_ADDRESS = "0x4f3998195462100D867129747967BFCb56C07fe2" as const;

const FALLBACK_RPC = "https://polygon-rpc.com";

/**
 * Runtime contract validation hook.
 * Verifies the RoomManager address is a valid contract and latestRoomId() works on app load.
 */
export function useContractValidation() {
  const [isValidContract, setIsValidContract] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function validateContract() {
      try {
        // Try browser provider first, fallback to RPC
        let provider: BrowserProvider | JsonRpcProvider;
        const eth = (window as any).ethereum;
        
        if (eth) {
          provider = new BrowserProvider(eth);
        } else {
          provider = new JsonRpcProvider(FALLBACK_RPC);
        }

        // Fetch bytecode at the RoomManager address
        const bytecode = await provider.getCode(ROOMMANAGER_V7_ADDRESS);

        // Check if bytecode exists (not just "0x" or empty)
        if (!bytecode || bytecode === "0x" || bytecode.length < 4) {
          const errMsg = `Wrong contract address configured: ${ROOMMANAGER_V7_ADDRESS}`;
          console.error("[ContractValidation] FATAL:", errMsg);
          setError(errMsg);
          setIsValidContract(false);
          return;
        }

        // Now try calling latestRoomId() to verify ABI compatibility
        try {
          const contract = new Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, provider);
          const latestRoomId = await contract.latestRoomId();
          console.log(`ROOMMANAGER_ACTIVE=${ROOMMANAGER_V7_ADDRESS}`);
          console.log("[ContractValidation] latestRoomId:", latestRoomId.toString());
          setIsValidContract(true);
        } catch (readErr) {
          const errMsg = `Wrong contract address configured: ${ROOMMANAGER_V7_ADDRESS} (latestRoomId call failed)`;
          console.error("[ContractValidation] FATAL:", errMsg, readErr);
          setError(errMsg);
          setIsValidContract(false);
          return;
        }
      } catch (err) {
        console.error("[ContractValidation] Error checking contract:", err);
        setIsValidContract(true); // Don't block on network errors
      }
    }

    validateContract();
  }, []);

  return { isValidContract, error };
}
