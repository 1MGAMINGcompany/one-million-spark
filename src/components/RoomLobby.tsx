// src/components/RoomLobby.tsx
import { useEffect, useMemo, useState } from "react";
import { useRoom, useRoomEvents, useRoomManager, gameName } from "../hooks/useRoomManager";
import { GAME_CATALOG } from "@/contracts/roomManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Coins, Gamepad2 } from "lucide-react";

function RoomRow({ id }: { id: bigint }) {
  const room = useRoom(id);

  const r = useMemo(() => {
    const v = room.data as any;
    if (!v) return null;
    return {
      id: v[0] as bigint,
      creator: v[1] as `0x${string}`,
      entryFeeWei: v[2] as bigint,
      maxPlayers: Number(v[3]),
      isPrivate: Boolean(v[4]),
      platformFeeBps: Number(v[5]),
      gameId: Number(v[6]),
      playerCount: Number(v[7]),
      isOpen: Boolean(v[8]),
    };
  }, [room.data]);

  const { joinRoom, cancelRoom, address, formatEntryFee, isPending } =
    useRoomManager();

  if (!r) return null;

  return (
    <Card className="border-primary/20 bg-card/50 backdrop-blur">
      <CardContent className="p-4">
        <div className="grid grid-cols-6 gap-4 items-center">
          <div className="font-mono text-primary">#{r.id.toString()}</div>
          <div className="text-sm text-muted-foreground font-mono">
            {r.creator.slice(0, 6)}...{r.creator.slice(-4)}
          </div>
          <div className="flex items-center gap-1">
            <Coins className="w-4 h-4 text-primary" />
            <span>{formatEntryFee(r.entryFeeWei)} POL</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span>{r.playerCount}/{r.maxPlayers}</span>
          </div>
          <div className="flex items-center gap-1">
            <Gamepad2 className="w-4 h-4 text-muted-foreground" />
            <span>{gameName(r.gameId)}</span>
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              onClick={() => joinRoom(r.id, r.entryFeeWei)}
              disabled={!r.isOpen || isPending}
              size="sm"
              className="bg-primary hover:bg-primary/90"
            >
              Join
            </Button>
            <Button
              onClick={() => cancelRoom(r.id)}
              disabled={address?.toLowerCase() !== r.creator.toLowerCase() || isPending}
              size="sm"
              variant="destructive"
            >
              Cancel
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function RoomLobby() {
  const { openRoomIds, createRoom, isPending, isConfirming, isConfirmed } =
    useRoomManager();

  const [entryFeeEth, setEntryFeeEth] = useState("1");
  const [maxPlayers, setMaxPlayers] = useState(2);
  const [isPrivate, setIsPrivate] = useState(false);
  const [platformFeeBps] = useState(500);
  const [gameId, setGameId] = useState(1);

  const ids = useMemo(() => {
    const v = openRoomIds.data as any;
    if (!v) return [] as bigint[];
    return v as bigint[];
  }, [openRoomIds.data]);

  useRoomEvents(() => {
    openRoomIds.refetch();
  });

  useEffect(() => {
    if (isConfirmed) openRoomIds.refetch();
  }, [isConfirmed]);

  const handleCreate = () => {
    createRoom({ entryFeeEth, maxPlayers, isPrivate, platformFeeBps, gameId });
  };

  return (
    <div className="grid gap-6">
      {/* Create Room Form */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-primary">Create Room</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="entryFee">Entry Fee (POL)</Label>
              <Input
                id="entryFee"
                value={entryFeeEth}
                onChange={(e) => setEntryFeeEth(e.target.value)}
                placeholder="1"
                className="border-primary/30 focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxPlayers">Max Players</Label>
              <Input
                id="maxPlayers"
                type="number"
                min={2}
                max={8}
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="border-primary/30 focus:border-primary"
              />
            </div>

            <div className="space-y-2">
              <Label>Game</Label>
              <Select value={String(gameId)} onValueChange={(v) => setGameId(Number(v))}>
                <SelectTrigger className="border-primary/30 focus:border-primary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAME_CATALOG.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <Switch
                checked={isPrivate}
                onCheckedChange={setIsPrivate}
              />
              <Label>Private Room</Label>
            </div>
          </div>

          <Button
            onClick={handleCreate}
            disabled={isPending || isConfirming}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isPending ? "Sending..." : isConfirming ? "Confirming..." : "Create Room"}
          </Button>

          {isConfirmed && (
            <p className="text-center text-sm text-green-500">Room created successfully!</p>
          )}
        </CardContent>
      </Card>

      {/* Open Rooms List */}
      <Card className="border-primary/30 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-primary">Open Rooms</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Header */}
          <div className="grid grid-cols-6 gap-4 px-4 py-2 text-sm font-semibold text-muted-foreground border-b border-border/50 mb-4">
            <div>ID</div>
            <div>Creator</div>
            <div>Fee</div>
            <div>Players</div>
            <div>Game</div>
            <div className="text-right">Actions</div>
          </div>

          {ids.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No open rooms available</p>
          ) : (
            <div className="grid gap-3">
              {ids.map((id) => (
                <RoomRow key={id.toString()} id={id} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
