import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicKey, Connection } from "@solana/web3.js";
import { useWallet } from "@solana/wallet-adapter-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Search, RefreshCw } from "lucide-react";
import { PROGRAM_ID, RoomStatus, GAME_TYPE_NAMES, STATUS_NAMES, parseRoomAccount, roomToDisplay, getRoomPDA, getVaultPDA, fetchAllRooms, isOpenStatus } from "@/lib/solana-program";
import { getSolanaEndpoint } from "@/lib/solana-config";

const BUILD_VERSION = "2024-01-22-v3";
const RPC_ENDPOINT = getSolanaEndpoint();

export default function DebugJoinRoom() {
  const navigate = useNavigate();
  const { publicKey } = useWallet();
  const [creatorInput, setCreatorInput] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [roomData, setRoomData] = useState<any>(null);
  const [pdaInfo, setPdaInfo] = useState<{ roomPda: string; vaultPda: string } | null>(null);
  const [allRoomsCount, setAllRoomsCount] = useState<number | null>(null);
  const [allRoomsData, setAllRoomsData] = useState<any[]>([]);

  const connection = new Connection(RPC_ENDPOINT, "confirmed");

  const lookupRoom = async () => {
    setLoading(true);
    setError(null);
    setRoomData(null);
    setPdaInfo(null);

    try {
      console.log("[DebugJoinRoom] lookupRoom called", { creatorInput, roomIdInput });
      
      const creator = new PublicKey(creatorInput);
      const roomId = parseInt(roomIdInput, 10);

      // Derive PDAs
      const [roomPda] = getRoomPDA(creator, roomId);
      const [vaultPda] = getVaultPDA(roomPda);

      console.log("[DebugJoinRoom] Derived PDAs:", {
        roomPda: roomPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
      });

      setPdaInfo({
        roomPda: roomPda.toBase58(),
        vaultPda: vaultPda.toBase58(),
      });

      // Fetch account info
      console.log("[DebugJoinRoom] Fetching account info...");
      const accountInfo = await connection.getAccountInfo(roomPda);

      if (!accountInfo) {
        setError("Room account not found on-chain");
        console.log("[DebugJoinRoom] Account not found");
        return;
      }

      console.log("[DebugJoinRoom] Account found, size:", accountInfo.data.length);

      // Parse room data
      const parsed = parseRoomAccount(accountInfo.data as Buffer);
      if (!parsed) {
        setError("Failed to parse room account data");
        return;
      }

      const display = roomToDisplay(parsed, roomPda);
      console.log("[DebugJoinRoom] Parsed room:", display);
      setRoomData({ ...display, raw: parsed });

    } catch (err: any) {
      console.error("[DebugJoinRoom] Error:", err);
      setError(err.message || "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllRoomsDebug = async () => {
    setLoading(true);
    setError(null);
    setAllRoomsCount(null);
    setAllRoomsData([]);

    try {
      console.log("[DebugJoinRoom] fetchAllRoomsDebug called");
      console.log("[DebugJoinRoom] RPC:", RPC_ENDPOINT);
      console.log("[DebugJoinRoom] Program ID:", PROGRAM_ID.toBase58());

      const rooms = await fetchAllRooms(connection);
      console.log("[DebugJoinRoom] fetchAllRooms returned:", rooms.length);
      
      setAllRoomsCount(rooms.length);
      setAllRoomsData(rooms);
    } catch (err: any) {
      console.error("[DebugJoinRoom] fetchAllRooms error:", err);
      setError(err.message || "Failed to fetch rooms");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">Debug Room Lookup</h1>
          <Badge variant="outline" className="ml-auto">
            Build: {BUILD_VERSION}
          </Badge>
        </div>

        {/* Connection Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Connection Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            <p><strong>RPC:</strong> {RPC_ENDPOINT}</p>
            <p><strong>Program ID:</strong> {PROGRAM_ID.toBase58()}</p>
            <p><strong>Your Wallet:</strong> {publicKey?.toBase58() || "Not connected"}</p>
          </CardContent>
        </Card>

        {/* Fetch All Rooms */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fetch All Rooms (Debug)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={fetchAllRoomsDebug} disabled={loading} className="w-full">
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Fetch All Rooms
            </Button>
            
            {allRoomsCount !== null && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium">Found {allRoomsCount} room(s)</p>
              </div>
            )}

            {allRoomsData.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {allRoomsData.map((room, i) => (
                  <div key={i} className="p-2 bg-muted/50 rounded text-xs font-mono">
                    <p>Room #{room.roomId} | {GAME_TYPE_NAMES[room.gameType] || room.gameType}</p>
                    <p>Status: {STATUS_NAMES[room.status] || room.status} | Players: {room.playerCount}/{room.maxPlayers}</p>
                    <p>Creator: {room.creator?.slice(0, 8)}...</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Lookup Specific Room */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Lookup Specific Room</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-xs text-muted-foreground">Creator Public Key</label>
              <Input
                value={creatorInput}
                onChange={(e) => setCreatorInput(e.target.value)}
                placeholder="Base58 public key..."
                className="font-mono text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Room ID</label>
              <Input
                type="number"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="1"
                className="font-mono"
              />
            </div>
            <Button onClick={lookupRoom} disabled={loading || !creatorInput} className="w-full">
              <Search className="h-4 w-4 mr-2" />
              Lookup Room
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Card className="border-destructive">
            <CardContent className="pt-4">
              <p className="text-sm text-destructive">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* PDA Info */}
        {pdaInfo && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Derived PDAs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs font-mono break-all">
              <p><strong>Room PDA:</strong> {pdaInfo.roomPda}</p>
              <p><strong>Vault PDA:</strong> {pdaInfo.vaultPda}</p>
            </CardContent>
          </Card>
        )}

        {/* Room Data */}
        {roomData && (
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-sm text-primary">Room Found!</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Game:</span>
                  <span className="ml-2 font-medium">{GAME_TYPE_NAMES[roomData.gameType] || roomData.gameType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className="ml-2" variant={isOpenStatus(roomData.status) ? "default" : "secondary"}>
                    {STATUS_NAMES[roomData.status] || roomData.status}
                  </Badge>
                </div>
                <div>
                  <span className="text-muted-foreground">Players:</span>
                  <span className="ml-2 font-medium">{roomData.playerCount} / {roomData.maxPlayers}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Entry Fee:</span>
                  <span className="ml-2 font-medium">{roomData.entryFee} SOL</span>
                </div>
              </div>

              <div className="text-xs font-mono bg-muted p-2 rounded overflow-x-auto">
                <pre>{JSON.stringify(roomData.raw, null, 2)}</pre>
              </div>

              <Button 
                onClick={() => navigate(`/room/${pdaInfo?.roomPda}`)}
                className="w-full"
                disabled={!pdaInfo?.roomPda}
              >
                Go to Room Page
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
