import { useState, useCallback, useEffect } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import {
  RoomDisplay,
  GameType,
  RoomStatus,
  fetchOpenPublicRooms,
  fetchAllRooms,
  fetchRoomById,
  fetchNextRoomId,
  buildCreateRoomTx,
  buildJoinRoomTx,
  buildCancelRoomTx,
  PROGRAM_ID,
} from "@/lib/solana-program";

// Check if program is configured (not placeholder)
const isProgramConfigured = () => {
  return PROGRAM_ID.toBase58() !== "11111111111111111111111111111111";
};

export function useSolanaRooms() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected } = useWallet();
  const { toast } = useToast();
  
  const [rooms, setRooms] = useState<RoomDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomDisplay | null>(null);

  const programReady = isProgramConfigured();

  // Fetch user's active open room (created by them, status Open)
  const fetchCreatorActiveRoom = useCallback(async (): Promise<RoomDisplay | null> => {
    if (!programReady || !publicKey) {
      setActiveRoom(null);
      return null;
    }
    
    try {
      const allRooms = await fetchAllRooms(connection);
      const userActiveRoom = allRooms.find(
        room => room.creator === publicKey.toBase58() && room.status === RoomStatus.Created
      );
      setActiveRoom(userActiveRoom || null);
      return userActiveRoom || null;
    } catch (err) {
      console.error("Error fetching active room:", err);
      setActiveRoom(null);
      return null;
    }
  }, [connection, publicKey, programReady]);

  // Fetch all open public rooms
  const fetchRooms = useCallback(async () => {
    if (!programReady) {
      setError("Program not configured");
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      const fetchedRooms = await fetchOpenPublicRooms(connection);
      setRooms(fetchedRooms);
    } catch (err) {
      console.error("Error fetching rooms:", err);
      setError("Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  }, [connection, programReady]);

  // Fetch single room
  const getRoom = useCallback(async (roomId: number): Promise<RoomDisplay | null> => {
    if (!programReady) return null;
    return fetchRoomById(connection, roomId);
  }, [connection, programReady]);

  // Create room
  const createRoom = useCallback(async (
    gameType: GameType,
    entryFeeSol: number,
    maxPlayers: number,
    turnTimeSec: number,
    isPrivate: boolean
  ): Promise<number | null> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return null;
    }

    if (!programReady) {
      toast({
        title: "Program not ready",
        description: "Solana program is not yet deployed",
        variant: "destructive",
      });
      return null;
    }

    // Check for existing active room
    const existingRoom = await fetchCreatorActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before creating a new one",
        variant: "destructive",
      });
      return null;
    }

    setTxPending(true);
    
    try {
      // Get next room ID
      const roomId = await fetchNextRoomId(connection);
      
      // Build transaction
      const tx = await buildCreateRoomTx(
        publicKey,
        roomId,
        gameType,
        entryFeeSol,
        maxPlayers,
        turnTimeSec,
        isPrivate
      );
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      // Send and confirm
      const signature = await sendTransaction(tx, connection);
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      
      toast({
        title: "Room created!",
        description: `Room #${roomId} created successfully`,
      });
      
      // Refresh rooms
      await fetchRooms();
      
      return roomId;
    } catch (err: any) {
      console.error("Create room error:", err);
      toast({
        title: "Failed to create room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return null;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTransaction, toast, fetchRooms, programReady, fetchCreatorActiveRoom]);

  // Join room
  const joinRoom = useCallback(async (roomId: number): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return false;
    }

    if (!programReady) {
      toast({
        title: "Program not ready",
        description: "Solana program is not yet deployed",
        variant: "destructive",
      });
      return false;
    }

    // Check for existing active room
    const existingRoom = await fetchCreatorActiveRoom();
    if (existingRoom) {
      toast({
        title: "Active room exists",
        description: "Cancel your existing room before joining another",
        variant: "destructive",
      });
      return false;
    }

    setTxPending(true);
    
    try {
      const tx = await buildJoinRoomTx(publicKey, roomId);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signature = await sendTransaction(tx, connection);
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      
      toast({
        title: "Joined room!",
        description: `Successfully joined room #${roomId}`,
      });
      
      await fetchRooms();
      return true;
    } catch (err: any) {
      console.error("Join room error:", err);
      toast({
        title: "Failed to join room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTransaction, toast, fetchRooms, programReady, fetchCreatorActiveRoom]);

  // Cancel room
  const cancelRoom = useCallback(async (roomId: number): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return false;
    }

    if (!programReady) {
      toast({
        title: "Program not ready",
        description: "Solana program is not yet deployed",
        variant: "destructive",
      });
      return false;
    }

    setTxPending(true);
    
    try {
      const tx = await buildCancelRoomTx(publicKey, roomId);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signature = await sendTransaction(tx, connection);
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      
      toast({
        title: "Room cancelled",
        description: `Room #${roomId} has been cancelled`,
      });
      
      setActiveRoom(null);
      await fetchRooms();
      return true;
    } catch (err: any) {
      console.error("Cancel room error:", err);
      toast({
        title: "Failed to cancel room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTransaction, toast, fetchRooms, programReady]);

  // Get user's SOL balance
  const getBalance = useCallback(async (): Promise<number> => {
    if (!publicKey) return 0;
    try {
      const balance = await connection.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch {
      return 0;
    }
  }, [publicKey, connection]);

  return {
    rooms,
    loading,
    error,
    txPending,
    programReady,
    activeRoom,
    fetchRooms,
    getRoom,
    createRoom,
    joinRoom,
    cancelRoom,
    getBalance,
    fetchCreatorActiveRoom,
  };
}
