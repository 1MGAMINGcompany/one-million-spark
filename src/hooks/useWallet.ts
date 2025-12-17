import { useAccount, useChainId, useDisconnect, useSwitchChain } from "wagmi";
import { polygon } from "@/lib/wagmi-config";

export function useWallet() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const chainId = useChainId();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const isWrongNetwork = isConnected && chainId !== polygon.id;

  const switchToPolygon = () => {
    if (switchChain) {
      switchChain({ chainId: polygon.id });
    }
  };

  return {
    address,
    isConnected,
    isConnecting: isConnecting || isReconnecting,
    chainId,
    isWrongNetwork,
    disconnect,
    switchToPolygon,
  };
}
