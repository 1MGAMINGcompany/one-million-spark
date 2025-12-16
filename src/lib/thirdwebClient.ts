import { createThirdwebClient } from "thirdweb";

// Thirdweb client for gasless transactions
// Client ID from thirdweb dashboard (loaded from env variable)
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Contract addresses
export const ROOMMANAGER_V7_ADDRESS = "0xA039B03De894ebFa92933a9A7326c1715f040b96" as const;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

// Gasless config for OpenZeppelin ERC-2771
export const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: "https://prj_cmj4z7zde06ad7j0lbgauwexy.engine.thirdweb.com",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};
