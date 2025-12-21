import { useState, useCallback } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey, LAMPORTS_PER_SOL, SendTransactionError, Transaction } from "@solana/web3.js";
import { useToast } from "@/hooks/use-toast";
import { buildTxDebugInfo } from "@/components/TxDebugPanel";
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

// Debug info type for failed transactions
export interface TxDebugInfo {
  publicKey: string | null;
  feePayer: string | null;
  recentBlockhash: string | null;
  signatures: Array<{ pubkey: string; signature: string | null }>;
  errorMessage: string;
}

export function useSolanaRooms() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, connected, wallet } = useWallet();
  const { toast } = useToast();
  
  // Get the wallet adapter for signAndSendTransaction (MWA/mobile)
  const adapter = wallet?.adapter as any;
  
  const [rooms, setRooms] = useState<RoomDisplay[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txPending, setTxPending] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomDisplay | null>(null);
  const [txDebugInfo, setTxDebugInfo] = useState<TxDebugInfo | null>(null);

  // Clear debug info
  const clearTxDebug = useCallback(() => {
    setTxDebugInfo(null);
  }, []);

  // Helper: Send transaction using best available method
  const sendTx = useCallback(async (tx: Transaction): Promise<string> => {
    // Use signAndSendTransaction if available (best for MWA/mobile)
    if (adapter?.signAndSendTransaction) {
      console.log("[Tx] Using adapter.signAndSendTransaction (MWA)");
      const result = await adapter.signAndSendTransaction(tx);
      // Result can be { signature: string } or string depending on adapter
      return typeof result === 'string' ? result : result.signature;
    }
    
    // Fallback to sendTransaction from useWallet
    console.log("[Tx] Using sendTransaction fallback");
    return await sendTransaction(tx, connection);
  }, [adapter, sendTransaction, connection]);

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
    setTxDebugInfo(null);
    
    let tx: Transaction | null = null;
    
    try {
      // Get next unique room ID for this creator
      const roomId = await fetchNextRoomIdForCreator(connection, publicKey);
      
      // Build transaction (ONLY creates tx and adds instructions - no feePayer/blockhash)
      tx = await buildCreateRoomTx(
        publicKey,
        roomId,
        gameType,
        entryFeeSol,
        maxPlayers
      );
      
      // Set feePayer and recentBlockhash BEFORE signing
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      
      console.log("[CreateRoom] Tx prepared:", {
        feePayer: tx.feePayer?.toBase58(),
        blockhash: blockhash.slice(0, 12),
        signers: tx.signatures.map(s => ({ 
          pk: s.publicKey.toBase58().slice(0, 8), 
          signed: !!s.signature 
        })),
      });
      
      // Send using best available method
      const signature = await sendTx(tx);
      
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
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchCreatorActiveRoom()]);
      
      return roomId;
    } catch (err: any) {
      console.error("Create room error:", err);
      
      // Build and set debug info
      setTxDebugInfo(buildTxDebugInfo(tx, publicKey?.toBase58() || null, err));
      
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
  }, [publicKey, connected, connection, sendTx, toast, fetchRooms, fetchCreatorActiveRoom]);

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
    setTxDebugInfo(null);
    
    let tx: Transaction | null = null;
    
    try {
      const creatorPubkey = new PublicKey(roomCreator);
      
      // Build transaction (ONLY creates tx and adds instructions - no feePayer/blockhash)
      tx = await buildJoinRoomTx(publicKey, creatorPubkey, roomId);
      
      // Set feePayer and recentBlockhash BEFORE signing
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      
      console.log("[JoinRoom] Tx prepared:", {
        feePayer: tx.feePayer?.toBase58(),
        blockhash: blockhash.slice(0, 12),
        signers: tx.signatures.map(s => ({ 
          pk: s.publicKey.toBase58().slice(0, 8), 
          signed: !!s.signature 
        })),
      });
      
      // Send using best available method
      const signature = await sendTx(tx);
      
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
      
      // Refresh rooms and active room state
      await Promise.all([fetchRooms(), fetchCreatorActiveRoom()]);
      return true;
    } catch (err: any) {
      console.error("Join room error:", err);
      
      // Build and set debug info
      setTxDebugInfo(buildTxDebugInfo(tx, publicKey?.toBase58() || null, err));
      
      toast({
        title: "Failed to join room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTx, toast, fetchRooms, fetchCreatorActiveRoom]);

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
    setTxDebugInfo(null);
    
    let tx: Transaction | null = null;
    
    try {
      // Build transaction
      tx = await buildCancelRoomTx(publicKey, roomId);
      
      // Set feePayer and recentBlockhash BEFORE signing
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      
      // Send using best available method
      const signature = await sendTx(tx);
      
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
        title: "Room cancelled",
        description: `Room #${roomId} has been cancelled`,
      });
      
      setActiveRoom(null);
      await fetchRooms();
      return true;
    } catch (err: any) {
      console.error("Cancel room error:", err);
      
      // Build and set debug info
      setTxDebugInfo(buildTxDebugInfo(tx, publicKey?.toBase58() || null, err));
      
      toast({
        title: "Failed to cancel room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTx, toast, fetchRooms]);

  // Ping room (creator presence heartbeat)
  const pingRoom = useCallback(async (roomId: number): Promise<boolean> => {
    if (!publicKey || !connected) {
      return false;
    }

    let tx: Transaction | null = null;
    
    try {
      tx = await buildPingRoomTx(publicKey, roomId);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      
      const signature = await sendTx(tx);
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      console.log("Room pinged successfully");
      return true;
    } catch (err: any) {
      console.error("Ping room error:", err);
      return false;
    }
  }, [publicKey, connected, connection, sendTx]);

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
    setTxDebugInfo(null);
    
    let tx: Transaction | null = null;
    
    try {
      const creatorPubkey = new PublicKey(roomCreator);
      tx = await buildCancelAbandonedRoomTx(publicKey, creatorPubkey, roomId, players);
      
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      tx.feePayer = publicKey;
      tx.recentBlockhash = blockhash;
      
      const signature = await sendTx(tx);
      
      toast({
        title: "Transaction sent",
        description: "Cancelling abandoned room...",
      });
      
      await connection.confirmTransaction({
        signature,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed');
      
      toast({
        title: "Room cancelled",
        description: "All players have been refunded",
      });
      
      await fetchRooms();
      return true;
    } catch (err: any) {
      console.error("Cancel abandoned room error:", err);
      
      // Build and set debug info
      setTxDebugInfo(buildTxDebugInfo(tx, publicKey?.toBase58() || null, err));
      
      toast({
        title: "Failed to cancel room",
        description: err.message || "Transaction failed",
        variant: "destructive",
      });
      return false;
    } finally {
      setTxPending(false);
    }
  }, [publicKey, connected, connection, sendTx, toast, fetchRooms]);

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
    txDebugInfo,
    clearTxDebug,
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
