import { ReactNode, createContext, useContext, useState, useCallback } from "react";
import { ThirdwebProvider, useConnect, useActiveAccount, useDisconnect } from "thirdweb/react";
import { createWallet, walletConnect } from "thirdweb/wallets";
import { polygon } from "thirdweb/chains";
import { thirdwebClient } from "@/lib/thirdwebClient";

// Context for smart account state
interface SmartAccountContextType {
  smartAccount: ReturnType<typeof useActiveAccount> | null;
  isConnecting: boolean;
  isConnected: boolean;
  address: string | undefined;
  connectMetaMask: () => Promise<void>;
  connectWalletConnect: () => Promise<void>;
  disconnect: () => void;
}

const SmartAccountContext = createContext<SmartAccountContextType | null>(null);

// Inner provider that uses thirdweb hooks
function SmartAccountProviderInner({ children }: { children: ReactNode }) {
  const activeAccount = useActiveAccount();
  const { disconnect: twDisconnect } = useDisconnect();
  const [isConnecting, setIsConnecting] = useState(false);

  // Use useConnect with accountAbstraction for smart account + gas sponsorship
  const { connect } = useConnect({
    client: thirdwebClient,
    accountAbstraction: {
      chain: polygon,
      sponsorGas: true, // Enable gas sponsorship via thirdweb
    },
  });

  const connectMetaMask = useCallback(async () => {
    setIsConnecting(true);
    try {
      await connect(async () => {
        const wallet = createWallet("io.metamask");
        await wallet.connect({
          client: thirdwebClient,
          chain: polygon,
        });
        return wallet;
      });
    } catch (error) {
      console.error("MetaMask connection error:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [connect]);

  const connectWalletConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await connect(async () => {
        const wallet = walletConnect();
        await wallet.connect({
          client: thirdwebClient,
          chain: polygon,
        });
        return wallet;
      });
    } catch (error) {
      console.error("WalletConnect connection error:", error);
      throw error;
    } finally {
      setIsConnecting(false);
    }
  }, [connect]);

  const disconnect = useCallback(() => {
    twDisconnect();
  }, [twDisconnect]);

  const value: SmartAccountContextType = {
    smartAccount: activeAccount || null,
    isConnecting,
    isConnected: !!activeAccount,
    address: activeAccount?.address,
    connectMetaMask,
    connectWalletConnect,
    disconnect,
  };

  return (
    <SmartAccountContext.Provider value={value}>
      {children}
    </SmartAccountContext.Provider>
  );
}

// Main provider component
export function ThirdwebSmartProvider({ children }: { children: ReactNode }) {
  return (
    <ThirdwebProvider>
      <SmartAccountProviderInner>{children}</SmartAccountProviderInner>
    </ThirdwebProvider>
  );
}

// Hook to access smart account context
export function useSmartAccount() {
  const context = useContext(SmartAccountContext);
  if (!context) {
    throw new Error("useSmartAccount must be used within ThirdwebSmartProvider");
  }
  return context;
}
