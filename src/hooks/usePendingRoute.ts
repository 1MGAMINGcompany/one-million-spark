import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

const PENDING_ROOM_KEY = '1m-pending-room';

/**
 * Hook for persisting the intended room destination across wallet connection.
 * 
 * Flow:
 * 1. User lands on /room/:pda without wallet connected
 * 2. setPendingRoom() saves the PDA to localStorage
 * 3. User opens link in wallet browser and connects
 * 4. autoNavigateIfPending() is called, redirecting to the room
 */
export function usePendingRoute() {
  const navigate = useNavigate();
  
  /**
   * Save a room PDA as the pending destination
   */
  const setPendingRoom = useCallback((roomPda: string) => {
    try {
      localStorage.setItem(PENDING_ROOM_KEY, roomPda);
      console.log("[PendingRoute] Saved:", roomPda.slice(0, 8));
    } catch (e) {
      console.warn("[PendingRoute] Failed to save:", e);
    }
  }, []);
  
  /**
   * Get and remove the pending room PDA (one-time consumption)
   */
  const consumePendingRoom = useCallback((): string | null => {
    try {
      const room = localStorage.getItem(PENDING_ROOM_KEY);
      if (room) {
        localStorage.removeItem(PENDING_ROOM_KEY);
        console.log("[PendingRoute] Consumed:", room.slice(0, 8));
      }
      return room;
    } catch (e) {
      console.warn("[PendingRoute] Failed to consume:", e);
      return null;
    }
  }, []);
  
  /**
   * Check for pending room and navigate if connected
   */
  const autoNavigateIfPending = useCallback((connected: boolean) => {
    if (connected) {
      const pending = consumePendingRoom();
      if (pending) {
        console.log("[PendingRoute] Auto-navigating to room:", pending.slice(0, 8));
        navigate(`/room/${pending}`);
      }
    }
  }, [consumePendingRoom, navigate]);
  
  return { setPendingRoom, consumePendingRoom, autoNavigateIfPending };
}
