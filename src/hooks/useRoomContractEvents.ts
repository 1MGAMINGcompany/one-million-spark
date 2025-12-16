import { useEffect, useRef } from "react";
import { BrowserProvider, Contract } from "ethers";
import ABI from "@/abi/RoomManagerV7Production.abi.json";

export const ROOMMANAGER_V7_ADDRESS =
  "0x4f3998195462100D867129747967BFCb56C07fe2" as const;

interface UseRoomContractEventsOptions {
  onRoomCreated?: (roomId: bigint, creator: string, isPrivate: boolean) => void;
  onRoomJoined?: (roomId: bigint, player: string, playerCount: number) => void;
  onRoomCancelled?: (roomId: bigint) => void;
  onGameStarted?: (roomId: bigint) => void;
}

/**
 * Watches for real-time contract events on RoomManagerV7.
 * Triggers callbacks when rooms are created, joined, cancelled, or games start.
 */
export function useRoomContractEvents(options: UseRoomContractEventsOptions) {
  const contractRef = useRef<Contract | null>(null);
  const listenersSetup = useRef(false);

  useEffect(() => {
    const setupListeners = async () => {
      if (listenersSetup.current) return;

      try {
        const eth = (window as any).ethereum;
        if (!eth) {
          console.warn("No ethereum provider found for event watching");
          return;
        }

        const provider = new BrowserProvider(eth);
        const contract = new Contract(ROOMMANAGER_V7_ADDRESS, ABI as any, provider);
        contractRef.current = contract;
        listenersSetup.current = true;

        // Listen for RoomCreated events
        if (options.onRoomCreated) {
          contract.on("RoomCreated", (roomId, creator, entryFee, maxPlayers, isPrivate) => {
            console.log("[Event] RoomCreated:", { roomId: roomId.toString(), creator, isPrivate });
            options.onRoomCreated?.(BigInt(roomId), creator, isPrivate);
          });
        }

        // Listen for RoomJoined events
        if (options.onRoomJoined) {
          contract.on("RoomJoined", (roomId, player, playerCount) => {
            console.log("[Event] RoomJoined:", { roomId: roomId.toString(), player, playerCount });
            options.onRoomJoined?.(BigInt(roomId), player, Number(playerCount));
          });
        }

        // Listen for RoomCancelled events
        if (options.onRoomCancelled) {
          contract.on("RoomCancelled", (roomId) => {
            console.log("[Event] RoomCancelled:", { roomId: roomId.toString() });
            options.onRoomCancelled?.(BigInt(roomId));
          });
        }

        // Listen for GameStarted events
        if (options.onGameStarted) {
          contract.on("GameStarted", (roomId) => {
            console.log("[Event] GameStarted:", { roomId: roomId.toString() });
            options.onGameStarted?.(BigInt(roomId));
          });
        }

        console.log("[RoomContractEvents] Event listeners attached");
      } catch (e) {
        console.error("Failed to setup contract event listeners:", e);
      }
    };

    setupListeners();

    // Cleanup listeners on unmount
    return () => {
      if (contractRef.current) {
        contractRef.current.removeAllListeners();
        console.log("[RoomContractEvents] Event listeners removed");
      }
      listenersSetup.current = false;
    };
  }, [options.onRoomCreated, options.onRoomJoined, options.onRoomCancelled, options.onGameStarted]);
}
