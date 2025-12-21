import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, SendTransactionError } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import {
  RoomDisplay,
  GameType,
  RoomStatus,
  fetchOpenPublicRooms,
  fetchAllRooms,
  fetchRoomsByCreator,
  fetchNextRoomIdForCreator,
  buildCreateRoomTx,
  buildJoinRoomTx,
  buildCancelRoomTx,
  buildPingRoomTx,
  buildCancelAbandonedRoomTx,
} from "@/lib/solana-program";

// Program is deployed on mainnet - no preview guards needed

export function useSolanaRooms() {
  const { connection } = useConnection();
  const { publicKey, signTransaction, sendTransaction, connected } = useWallet();
  const { toast } = useToast();
  
  const [rooms, setRooms] = useState<RoomDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomDisplay | null>(null);

  // Fetch user's active open room (created by them, status Open)
  const fetchCreatorActiveRoom = useCallback(async (): Promise<RoomDisplay | null> => {
    if (!publicKey) {
      setActiveRoom(null);
      return null;
    }
    
    try {
      // Use creator-scoped fetch - more efficient than fetching all rooms
      const creatorRooms = await fetchRoomsByCreator(connection, publicKey);
      const userActiveRoom = creatorRooms.find(
        room => room.status === RoomStatus.Created
      );
      setActiveRoom(userActiveRoom || null);
      return userActiveRoom || null;
    } catch (err) {
      console.error("Error fetching active room:", err);
      setActiveRoom(null);
      return null;
    }
  }, [connection, publicKey]);

  // Fetch all open public rooms
  const fetchRooms = useCallback(async () => {
    setLoading(true);
    setError(null);
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
  }, [connection]);

  // Fetch single room by ID (searches all rooms)
  const getRoom = useCallback(async (roomId: number): Promise<RoomDisplay | null> => {
    const allRooms = await fetchAllRooms(connection);
    return allRooms.find(r => r.roomId === roomId) || null;
  }, [connection]);

  // Create room
  const createRoom = useCallback(async (
    gameType: GameType,
    entryFeeSol: number,
    maxPlayers: number
  ): Promise<number | null> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
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
      // Get next unique room ID for this creator
      const roomId = await fetchNextRoomIdForCreator(connection, publicKey);
      
      // Build transaction
      const tx = await buildCreateRoomTx(
        publicKey,
        roomId,
        gameType,
        entryFeeSol,
        maxPlayers
      );
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      let signature: string;
      
      // Use signTransaction + sendRawTransaction for better mobile wallet compatibility
      if (signTransaction) {
        try {
          const signedTx = await signTransaction(tx);
          signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
        } catch (signErr: any) {
          // Fallback to sendTransaction if signTransaction fails
          console.warn("signTransaction failed, falling back to sendTransaction:", signErr);
          signature = await sendTransaction(tx, connection);
        }
      } else {
        // Fallback for wallets that don't support signTransaction
        signature = await sendTransaction(tx, connection);
      }
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      toast({
        title: "Room created!",
        description: `Room #${roomId} created successfully`,
      });
      
      // Refresh rooms
      await fetchRooms();
      
      return roomId;
    } catch (err: any) {
      console.error("Create room error:", err);
      
      // Extract better error message
      let errorMsg = err.message || "Transaction failed";
      if (err instanceof SendTransactionError) {
        errorMsg = err.message;
      }
      
      toast({
        title: "Failed to create room",
        description: errorMsg,
        variant: "destructive",
      });
      return null;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, signTransaction, sendTransaction, toast, fetchRooms, fetchCreatorActiveRoom]);

  // Join room
  const joinRoom = useCallback(async (roomId: number, roomCreator: string): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
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
      const creatorPubkey = new PublicKey(roomCreator);
      const tx = await buildJoinRoomTx(publicKey, creatorPubkey, roomId);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      let signature: string;
      
      // Use signTransaction + sendRawTransaction for better mobile wallet compatibility
      if (signTransaction) {
        try {
          const signedTx = await signTransaction(tx);
          signature = await connection.sendRawTransaction(signedTx.serialize(), {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
          });
        } catch (signErr: any) {
          console.warn("signTransaction failed, falling back to sendTransaction:", signErr);
          signature = await sendTransaction(tx, connection);
        }
      } else {
        signature = await sendTransaction(tx, connection);
      }
      
      toast({
        title: "Transaction sent",
        description: "Waiting for confirmation...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
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
  }, [publicKey, connected, connection, signTransaction, sendTransaction, toast, fetchRooms, fetchCreatorActiveRoom]);

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
  }, [publicKey, connected, connection, sendTransaction, toast, fetchRooms]);

  // Ping room (creator presence heartbeat)
  const pingRoom = useCallback(async (roomId: number): Promise<boolean> => {
    if (!publicKey || !connected) {
      return false;
    }

    try {
      const tx = await buildPingRoomTx(publicKey, roomId);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signature = await sendTransaction(tx, connection);
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      
      console.log("Room pinged successfully");
      return true;
    } catch (err: any) {
      console.error("Ping room error:", err);
      return false;
    }
  }, [publicKey, connected, connection, sendTransaction]);

  // Cancel abandoned room (anyone can call if creator timed out)
  const cancelAbandonedRoom = useCallback(async (roomId: number, roomCreator: string, players: PublicKey[]): Promise<boolean> => {
    if (!publicKey || !connected) {
      toast({
        title: "Wallet not connected",
        description: "Please connect your wallet first",
        variant: "destructive",
      });
      return false;
    }


    setTxPending(true);
    
    try {
      const creatorPubkey = new PublicKey(roomCreator);
      const tx = await buildCancelAbandonedRoomTx(publicKey, creatorPubkey, roomId, players);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = publicKey;
      
      const signature = await sendTransaction(tx, connection);
      
      toast({
        title: "Transaction sent",
        description: "Cancelling abandoned room...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      });
      
      toast({
        title: "Room cancelled",
        description: "All players have been refunded",
      });
      
      await fetchRooms();
      return true;
    } catch (err: any) {
      console.error("Cancel abandoned room error:", err);
      toast({
        title: "Failed to cancel room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTransaction, toast, fetchRooms]);

  // Get user's SOL balance - only after wallet is connected with publicKey
  const getBalance = useCallback(async (): Promise<number> => {
    if (!connected || !publicKey) {
      console.info('[Wallet] getBalance: Not connected or no publicKey');
      return 0;
    }
    try {
      // Use 'confirmed' commitment for reliable balance
      const lamports = await connection.getBalance(publicKey, 'confirmed');
      const sol = lamports / LAMPORTS_PER_SOL;
      console.info(`[Wallet] getBalance: ${sol.toFixed(4)} SOL | Address: ${publicKey.toBase58().slice(0, 8)}...`);
      return sol;
    } catch (err) {
      console.warn('[Wallet] getBalance failed:', err);
      return 0;
    }
  }, [connected, publicKey, connection]);

  return {
    rooms,
    loading,
    error,
    txPending,
    activeRoom,
    fetchRooms,
    getRoom,
    createRoom,
    joinRoom,
    cancelRoom,
    pingRoom,
    cancelAbandonedRoom,
    getBalance,
    fetchCreatorActiveRoom,
  };
}
