import { createThirdwebClient } from "thirdweb";
import { 
  ROOMMANAGER_V7_ADDRESS, 
  TRUSTED_FORWARDER_ADDRESS 
} from "./contractAddresses";

// Re-export addresses for backwards compatibility
export { ROOMMANAGER_V7_ADDRESS, TRUSTED_FORWARDER_ADDRESS };

// Thirdweb client for gasless transactions
// Client ID from thirdweb dashboard (loaded from env variable)
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Gasless config for OpenZeppelin ERC-2771
export const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: import.meta.env.VITE_RELAYER_URL || "https://prj_cmj4z7zde06ad7j0lbgauwexy.engine.thirdweb.com",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};
