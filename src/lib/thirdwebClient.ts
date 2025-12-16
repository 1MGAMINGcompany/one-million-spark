import { createThirdwebClient } from "thirdweb";

// Contract addresses - hardcoded, no env vars with quotes
export const USDT_ADDRESS = "0xc2132D05D31c914a87C6611C10748AEb04B58e8F" as `0x${string}`;
export const ROOMMANAGER_V7_ADDRESS = "0xA039B03De894ebFa92933a9A7326c1715f040b96" as `0x${string}`;
export const TRUSTED_FORWARDER_ADDRESS = "0x819e9EEf99446117476820aA2Ef754F068D7305e" as `0x${string}`;
export const FEE_RECIPIENT_ADDRESS = "0x55dD5b94C332aB44ceAAC7C6AD787497B3Af47a8" as `0x${string}`;
export const GAME_VERIFIER_ADDRESS = "0x92a9d0482194166Cb7Fd185c41d254B44Bc01faB" as `0x${string}`;

// Thirdweb client for gasless transactions
export const thirdwebClient = createThirdwebClient({
  clientId: import.meta.env.VITE_THIRDWEB_CLIENT_ID || "e9e1086beb8bf58653a15ccaa171f889",
});

// Gasless config for OpenZeppelin ERC-2771 forwarding
// This ensures createRoom is sent via the trusted forwarder
export const GASLESS_CONFIG = {
  provider: "openzeppelin" as const,
  relayerUrl: import.meta.env.VITE_RELAYER_URL || "https://api.defender.openzeppelin.com/autotasks/...",
  relayerForwarderAddress: TRUSTED_FORWARDER_ADDRESS,
};

// Validate addresses at module load
const validateAddress = (addr: string, name: string) => {
  if (addr.length !== 42 || !addr.startsWith("0x")) {
    throw new Error(`Invalid ${name}: ${addr}`);
  }
};

validateAddress(USDT_ADDRESS, "USDT_ADDRESS");
validateAddress(ROOMMANAGER_V7_ADDRESS, "ROOMMANAGER_V7_ADDRESS");
validateAddress(TRUSTED_FORWARDER_ADDRESS, "TRUSTED_FORWARDER_ADDRESS");
