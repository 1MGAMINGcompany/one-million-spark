// src/lib/wagmi.ts
import { http, createConfig } from "wagmi";
import { polygon } from "wagmi/chains";
import { walletConnect, injected } from "wagmi/connectors";

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string;

export const wagmiConfig = createConfig({
  chains: [polygon],
  connectors: [
    injected(),
    walletConnect({
      projectId,
      showQrModal: true,
      metadata: {
        name: "1M Gaming",
        description: "Decentralized skill gaming",
        url: typeof window !== "undefined" ? window.location.origin : "",
        icons: [typeof window !== "undefined" ? `${window.location.origin}/favicon.ico` : ""],
      },
    }),
  ],
  transports: {
    [polygon.id]: http("https://polygon-rpc.com"),
  },
});
