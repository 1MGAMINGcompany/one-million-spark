import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface WalletConnectContextType {
  openConnectDialog: () => void;
  registerDialogOpener: (opener: () => void) => void;
}

const WalletConnectContext = createContext<WalletConnectContextType | null>(null);

export function WalletConnectProvider({ children }: { children: ReactNode }) {
  const [dialogOpener, setDialogOpener] = useState<(() => void) | null>(null);

  const registerDialogOpener = useCallback((opener: () => void) => {
    setDialogOpener(() => opener);
  }, []);

  const openConnectDialog = useCallback(() => {
    if (dialogOpener) {
      dialogOpener();
    } else {
      console.warn("[WalletConnect] No dialog opener registered");
    }
  }, [dialogOpener]);

  return (
    <WalletConnectContext.Provider value={{ openConnectDialog, registerDialogOpener }}>
      {children}
    </WalletConnectContext.Provider>
  );
}

export function useConnectWallet() {
  const context = useContext(WalletConnectContext);
  if (!context) {
    throw new Error("useConnectWallet must be used within WalletConnectProvider");
  }
  return context;
}
