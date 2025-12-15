import { useCallback, useMemo, useState } from "react";
import { ethers } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS =
  "0xA039B03De894ebFa92933a9A7326c1715f040b96" as const;

export function useRoomManagerV7() {
  const [isBusy, setIsBusy] = useState(false);

  const getContract = useCallback(async () => {
    const eth = (window as any).ethereum;
    if (!eth) throw new Error("WALLET_NOT_FOUND");

    const provider = new ethers.providers.Web3Provider(eth);
    const signer = provider.getSigner();
    return new ethers.Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, signer);
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
