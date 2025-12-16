import { createThirdwebClient } from "thirdweb";

// Thirdweb client for gasless transactions
// Client ID from thirdweb dashboard (public, safe to expose)
export const thirdwebClient = createThirdwebClient({
  clientId: "e9e1086beb8bf58653a15ccaa171f889",
});

// Contract addresses
export const ROOMMANAGER_V7_ADDRESS = "0xF99df196a90ae9Ea1A124316D2c85363D2A9cDA1" as const;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

// Gasless config for OpenZeppelin ERC-2771
export const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: "https://prj_cmj4z7zde06ad7j0lbgauwexy.engine.thirdweb.com",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};
