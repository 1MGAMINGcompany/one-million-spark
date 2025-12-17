import { createThirdwebClient } from "thirdweb";

// Thirdweb client for gasless transactions
// Client ID from thirdweb dashboard (public, safe to expose)
export const thirdwebClient = createThirdwebClient({
  clientId: "your_thirdweb_client_id", // Replace with your actual thirdweb client ID
});

// Contract addresses
export const ROOMMANAGER_V7_ADDRESS = "0xF99df196a90ae9Ea1A124316D2c85363D2A9cDA1" as const;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as const;

// Gasless config for OpenZeppelin ERC-2771
export const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: "https://api.defender.openzeppelin.com/autotasks/...", // Replace with your relayer URL
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};
