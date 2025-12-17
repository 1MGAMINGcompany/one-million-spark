import { ReactNode, createContext, useContext } from "react";
import { ThirdwebProvider, useActiveAccount, useActiveWallet, useDisconnect } from "thirdweb/react";

// Context for smart account state
interface SmartAccountContextType {
  smartAccount: ReturnType<typeof useActiveAccount> | null;
  isConnecting: boolean;
  isConnected: boolean;
  address: string | undefined;
  isSmartAccount: boolean;
  disconnect: () => void;
}

const SmartAccountContext = createContext<SmartAccountContextType | null>(null);

// Inner provider that uses thirdweb hooks
function SmartAccountProviderInner({ children }: { children: ReactNode }) {
  const activeAccount = useActiveAccount();
  const activeWallet = useActiveWallet();
  const { disconnect: twDisconnect } = useDisconnect();

  // Debug: log account info when it changes
  if (activeAccount) {
    console.log("[ThirdwebSmartProvider] Active account:", activeAccount.address);
    console.log("[ThirdwebSmartProvider] Wallet type:", activeWallet?.id);
  }

  // Check if connected via smart account (in-app wallet with smart account)
  const isSmartAccount = activeWallet?.id === "inApp" || activeWallet?.id?.includes("smart");

  const disconnect = () => {
    (twDisconnect as any)();
  };

  const value: SmartAccountContextType = {
    smartAccount: activeAccount || null,
    isConnecting: false, // ConnectButton handles this internally
    isConnected: !!activeAccount,
    address: activeAccount?.address,
    isSmartAccount,
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

// Hook to access smart account context (safe fallback)
export function useSmartAccount() {
  const context = useContext(SmartAccountContext);
  
  // Return safe fallback if context is missing (provider not mounted)
  if (!context) {
    return {
      smartAccount: null,
      isConnecting: false,
      isConnected: false,
      address: undefined,
      isSmartAccount: false,
      disconnect: () => { console.warn("ThirdwebSmartProvider not mounted"); },
      providerMissing: true,
    };
  }
  
  return { ...context, providerMissing: false };
}
