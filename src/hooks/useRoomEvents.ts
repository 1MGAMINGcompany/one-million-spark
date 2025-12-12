import { useEffect } from "react";
import { useWatchContractEvent } from "wagmi";
import { ROOM_MANAGER_ADDRESS, ROOM_MANAGER_ABI } from "@/contracts/roomManager";
import { useToast } from "@/hooks/use-toast";
import { useSound } from "@/contexts/SoundContext";

interface UseRoomEventsOptions {
  roomId?: bigint;
  maxPlayers?: number;
  onRoomReady?: () => void;
  onPlayerJoined?: (player: `0x${string}`) => void;
}

export function useRoomEvents({
  roomId,
  maxPlayers,
  onRoomReady,
  onPlayerJoined,
}: UseRoomEventsOptions) {
  const { toast } = useToast();
  const { play } = useSound();

  // Watch for players joining
  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomJoined",
    onLogs(logs) {
      logs.forEach((log) => {
        const eventRoomId = (log as any).args?.roomId;
        const player = (log as any).args?.player;
        
        if (roomId && eventRoomId === roomId) {
          play("rooms/player-join");
          toast({
            title: "Player joined!",
            description: `A new player has joined the room`,
          });
          onPlayerJoined?.(player);
        }
      });
    },
  });

  // Watch for room started (when full)
  useWatchContractEvent({
    address: ROOM_MANAGER_ADDRESS,
    abi: ROOM_MANAGER_ABI,
    eventName: "RoomStarted",
    onLogs(logs) {
      logs.forEach((log) => {
        const eventRoomId = (log as any).args?.roomId;
        
        if (roomId && eventRoomId === roomId) {
          play("rooms/match-start");
          toast({
            title: "Room Ready!",
            description: "All players have joined. The game is starting!",
          });
          onRoomReady?.();

          // Trigger browser notification if permitted
          if (Notification.permission === "granted") {
            new Notification("🎮 Game Ready!", {
              body: "All players have joined. Time to play!",
              icon: "/favicon.ico",
            });
          }
        }
      });
    },
  });

  return null;
}

// Hook to request notification permission
export function useNotificationPermission() {
  const requestPermission = async () => {
    if (!("Notification" in window)) {
      return "unsupported";
    }
    
    if (Notification.permission === "granted") {
      return "granted";
    }
    
    if (Notification.permission !== "denied") {
      const permission = await Notification.requestPermission();
      return permission;
    }
    
    return Notification.permission;
  };

  return { requestPermission, permission: Notification?.permission };
}
