import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { toast } from "sonner";

export interface TxResult {
  ok: boolean;
  signature?: string;
  reason?: "PHANTOM_BLOCKED_OR_REJECTED" | "CONFIRM_FAILED" | "ERROR";
}

interface TxLockContextType {
  isTxInFlight: boolean;
  withTxLock: <T>(fn: () => Promise<T>) => Promise<T | null>;
}

const TxLockContext = createContext<TxLockContextType | null>(null);

export function TxLockProvider({ children }: { children: ReactNode }) {
  const [isTxInFlight, setIsTxInFlight] = useState(false);

  const withTxLock = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    // Block if already in flight
    if (isTxInFlight) {
      toast.info("Transaction in progress...", {
        description: "Please wait for the current transaction to complete.",
        duration: 3000,
      });
      return null;
    }

    setIsTxInFlight(true);
    try {
      const result = await fn();
      return result;
    } finally {
      setIsTxInFlight(false);
    }
  }, [isTxInFlight]);

  return (
    <TxLockContext.Provider value={{ isTxInFlight, withTxLock }}>
      {children}
    </TxLockContext.Provider>
  );
}

export function useTxLock(): TxLockContextType {
  const context = useContext(TxLockContext);
  if (!context) {
    throw new Error("useTxLock must be used within a TxLockProvider");
  }
  return context;
}
