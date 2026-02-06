import { createContext, useContext, useCallback, useState, ReactNode } from "react";

interface WalletConnectContextType {
  openConnectDialog: () => void;
  registerOpenDialog: (fn: () => void) => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

export function useConnectWallet() {
  const ctx = useContext(WalletConnectContext);
  if (!ctx) {
    throw new Error("useConnectWallet must be used within WalletConnectProvider");
  }
  return ctx;
}

interface WalletConnectProviderProps {
  children: ReactNode;
}

export function WalletConnectProvider({ children }: WalletConnectProviderProps) {
  const [openFn, setOpenFn] = useState<(() => void) | null>(null);

  const registerOpenDialog = useCallback((fn: () => void) => {
    setOpenFn(() => fn);
  }, []);

  const openConnectDialog = useCallback(() => {
    if (openFn) {
      openFn();
    } else {
      console.warn("[WalletConnect] No dialog opener registered yet");
    }
  }, [openFn]);

  return (
    <WalletConnectContext.Provider value={{ openConnectDialog, registerOpenDialog }}>
      {children}
    </WalletConnectContext.Provider>
  );
}
