import { createConfig, http } from "wagmi";
import { polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

// WalletConnect project ID - you can get one free at https://cloud.walletconnect.com
const projectId = "3a8170812b534d0ff9d794f19a901d64";

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    walletConnect({ projectId }),
    coinbaseWallet({ appName: "1M GAMING" }),
  ],
  transports: {
    [polygon.id]: http(),
  },
});

export { polygon };
