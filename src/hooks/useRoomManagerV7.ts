import { useCallback, useMemo, useState } from "react";
import { BrowserProvider, Contract } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS =
  "0xF99df196a90ae9Ea1A124316D2c85363D2A9cDA1" as const;

export function useRoomManagerV7() {
  const [isBusy, setIsBusy] = useState(false);

  const getContract = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("WALLET_NOT_FOUND");

    const provider = new BrowserProvider(eth);
    const signer = await provider.getSigner();
    return new Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, signer);
  }, []);

  const withLock = useCallback(async <T,>(fn: () => Promise<T>) => {
    if (isBusy) throw new Error("BUSY");
    setIsBusy(true);
    try {
      return await fn();
    } finally {
      setIsBusy(false);
    }
  }, [isBusy]);

  return useMemo(
    () => ({
      getContract,
      isBusy,
      withLock,
    }),
    [getContract, isBusy, withLock]
  );
}
