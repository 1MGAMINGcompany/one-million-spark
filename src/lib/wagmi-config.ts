import { createConfig, http, fallback } from "wagmi";
import { polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// WalletConnect project ID - you can get one free at https://cloud.walletconnect.com
const projectId = "3a8170812b534d0ff9d794f19a901d64";

// Public RPC endpoints for Polygon Mainnet (no auth required)
const POLYGON_RPC_PRIMARY = "https://polygon-rpc.com";
const POLYGON_RPC_FALLBACK = "https://rpc.ankr.com/polygon";

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({ appName: "1M GAMING" }),
  ],
  transports: {
    [polygon.id]: fallback([
      http(POLYGON_RPC_PRIMARY),
      http(POLYGON_RPC_FALLBACK),
    ]),
  },
});

export { polygon };
