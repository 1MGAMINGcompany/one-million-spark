import { createContext, useContext, useState, ReactNode, useCallback } from "react";

interface LoadingContextType {
  isLoading: boolean;
  message: string;
  setGlobalLoading: (loading: boolean, message?: string) => void;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

const DEFAULT_MESSAGE = "Synchronizing the temple of skill...";

export const LoadingProvider = ({ children }: { children: ReactNode }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);

  const setGlobalLoading = useCallback((loading: boolean, customMessage?: string) => {
    setIsLoading(loading);
    setMessage(customMessage || DEFAULT_MESSAGE);
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading, message, setGlobalLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useGlobalLoading = () => {
  const context = useContext(LoadingContext);
  if (context === undefined) {
    throw new Error("useGlobalLoading must be used within a LoadingProvider");
  }
  return context;
};
