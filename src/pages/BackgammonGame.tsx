import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake, Dices, Timer } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom, usePlayersOf } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { GameChat, useChatMessages } from "@/components/GameChat";
import { useGameSync, useTurnTimer, BackgammonMove } from "@/hooks/useGameSync";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTimeoutForfeit } from "@/hooks/useTimeoutForfeit";
import { useWallet } from "@/hooks/useWallet";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

// Die component for multiplayer
const Die3D = ({ value, color = "ivory" }: { value: number; color?: "ivory" | "obsidian" }) => {
  const pipPositions: Record<number, number[][]> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [0, 2], [2, 0], [2, 2]],
    5: [[0, 0], [0, 2], [1, 1], [2, 0], [2, 2]],
    6: [[0, 0], [0, 2], [1, 0], [1, 2], [2, 0], [2, 2]],
  };
  
  const bgColor = color === "ivory" 
    ? "bg-gradient-to-br from-amber-50 to-amber-100" 
    : "bg-gradient-to-br from-zinc-800 to-zinc-900";
  const pipColor = color === "ivory" ? "bg-zinc-900" : "bg-primary";
  
  return (
    <div className={`relative w-12 h-12 ${bgColor} rounded-lg shadow-lg border border-primary/30`}>
      <div className="absolute inset-1 grid grid-cols-3 grid-rows-3 gap-0.5 p-1">
        {[0, 1, 2].map(row => 
          [0, 1, 2].map(col => {
            const hasPip = pipPositions[value]?.some(([r, c]) => r === row && c === col);
            return (
              <div key={`${row}-${col}`} className="flex items-center justify-center">
                {hasPip && <div className={`w-2 h-2 ${pipColor} rounded-full shadow-sm`} />}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

const BackgammonGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const { data: players } = usePlayersOf(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const [dice, setDice] = useState<[number, number]>([4, 2]);
  const [usedDice, setUsedDice] = useState<boolean[]>([false, false]);
  const [gameEnded, setGameEnded] = useState(false);

  // Chat messages
  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  // Placeholder board state
  const [board] = useState(() => {
    const b: number[] = new Array(24).fill(0);
    b[0] = 2; b[5] = -5; b[7] = -3; b[11] = 5;
    b[12] = -5; b[16] = 3; b[18] = 5; b[23] = -2;
    return b;
  });

  const handleOpponentMove = useCallback((move: BackgammonMove) => {
    console.log("Opponent move:", move);
  }, []);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    toast({ title: t('game.opponentResigned'), description: t('game.youWin') });
  }, [toast, t]);

  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    switch (message.type) {
      case "move":
        if (message.payload) handleOpponentMove(message.payload as BackgammonMove);
        break;
      case "resign":
        handleOpponentResign();
        break;
      case "draw_offer":
        toast({ title: t('game.drawOffered'), description: t('game.drawOfferedDescription') });
        break;
      case "chat":
        if (message.payload && message.sender) {
          receiveMessage(message.payload, message.sender);
        }
        break;
    }
  }, [handleOpponentMove, handleOpponentResign, receiveMessage, toast]);

  const {
    isConnected: webrtcConnected,
    isPushEnabled,
    sendChat: webrtcSendChat,
    reconnect: webrtcReconnect,
    peerAddress,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: (players as string[]) || [],
    onMessage: handleWebRTCMessage,
    enabled: !!players && players.length >= 2,
  });

  const {
    gameState,
    isConnected: bcConnected,
    opponentConnected: bcOpponentConnected,
    isMyTurn,
  } = useGameSync({
    roomId: roomId || "",
    gameType: "backgammon",
    onOpponentMove: handleOpponentMove as any,
    onGameEnd: () => setGameEnded(true),
    onOpponentResign: handleOpponentResign,
  });

  const isConnected = webrtcConnected || bcConnected;
  const opponentConnected = webrtcConnected || bcOpponentConnected;
  const opponentAddress = peerAddress || gameState?.players.find(p => p.toLowerCase() !== address?.toLowerCase());

  const remainingTime = useTurnTimer(
    isMyTurn,
    gameState?.turnTimeSeconds || 300,
    gameState?.turnStartedAt || Date.now(),
    () => toast({ title: t('game.timesUp'), variant: "destructive" })
  );

  // Timeout forfeit logic
  const {
    canClaimTimeout,
    isClaiming,
    claimTimeoutVictory,
  } = useTimeoutForfeit({
    roomId: roomIdBigInt || BigInt(0),
    opponentAddress,
    isMyTurn,
    turnTimeSeconds: gameState?.turnTimeSeconds || 300,
    turnStartedAt: gameState?.turnStartedAt || Date.now(),
    gameEnded,
    onTimeoutClaimed: () => setGameEnded(true),
  });

  const handleClaimTimeout = useCallback(() => {
    if (address) claimTimeoutVictory(address);
  }, [address, claimTimeoutVictory]);

  const handleRollDice = () => {
    if (!isMyTurn && gameState?.status === "playing") {
      toast({ title: t('game.notYourTurn'), variant: "destructive" });
      return;
    }
    const d1 = Math.floor(Math.random() * 6) + 1;
    const d2 = Math.floor(Math.random() * 6) + 1;
    setDice([d1, d2]);
    setUsedDice([false, false]);
  };

  // Handle sending chat message
  const handleSendChat = useCallback((text: string) => {
    addChatMessage(text);
    if (webrtcConnected) {
      webrtcSendChat(text);
    }
  }, [addChatMessage, webrtcConnected, webrtcSendChat]);

  return (
    <div className="min-h-screen bg-background px-4 py-6">
      <div className="max-w-6xl mx-auto">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">
              {t('gameAI.backgammon')} – {t('game.room')} #{roomId}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('game.prizePool')}: {prizePool} POL {room && `(~${formatUsd(parseFloat(prizePool))})`}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 bg-primary/20 text-primary rounded">{isMyTurn ? t('game.yourTurn') : t('game.opponentsTurn')}</span>
            <span className="text-muted-foreground">{remainingTime}s {t('game.remaining')}</span>
          </div>
        </div>

        {/* Main Layout */}
        <div className="flex flex-col lg:flex-row gap-6">
          {/* LEFT COLUMN - Game Board */}
          <div className="flex-1">
            {/* Backgammon Board */}
            <div className="relative bg-gradient-to-br from-amber-900/80 to-amber-950 border-4 border-primary/40 rounded-lg overflow-hidden">
              {/* Board frame */}
              <div className="flex">
                {/* Left side (points 13-24 top, 12-1 bottom) */}
                <div className="flex-1 p-2">
                  {/* Top row - opponent's home */}
                  <div className="flex justify-around mb-2">
                    {[12, 13, 14, 15, 16, 17].map(i => (
                      <div key={`top-${i}`} className="flex flex-col items-center">
                        <div className={`w-8 h-24 ${i % 2 === 0 ? 'bg-primary/60' : 'bg-amber-200/60'} clip-triangle-down rounded-t`} />
                        <div className="flex flex-col gap-0.5 mt-1">
                          {Array.from({ length: Math.abs(board[i]) }).map((_, j) => (
                            <div key={j} className={`w-6 h-6 rounded-full ${board[i] > 0 ? 'bg-primary' : 'bg-zinc-800 border border-primary/50'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Bottom row - your home */}
                  <div className="flex justify-around mt-2">
                    {[11, 10, 9, 8, 7, 6].map(i => (
                      <div key={`bot-${i}`} className="flex flex-col-reverse items-center">
                        <div className={`w-8 h-24 ${i % 2 === 0 ? 'bg-primary/60' : 'bg-amber-200/60'} clip-triangle-up rounded-b`} />
                        <div className="flex flex-col-reverse gap-0.5 mb-1">
                          {Array.from({ length: Math.abs(board[i]) }).map((_, j) => (
                            <div key={j} className={`w-6 h-6 rounded-full ${board[i] > 0 ? 'bg-primary' : 'bg-zinc-800 border border-primary/50'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bar (center) */}
                <div className="w-8 bg-amber-800/80 flex flex-col items-center justify-center gap-2">
                  <div className="text-xs text-muted-foreground transform -rotate-90">BAR</div>
                </div>

                {/* Right side */}
                <div className="flex-1 p-2">
                  {/* Top row */}
                  <div className="flex justify-around mb-2">
                    {[18, 19, 20, 21, 22, 23].map(i => (
                      <div key={`top-${i}`} className="flex flex-col items-center">
                        <div className={`w-8 h-24 ${i % 2 === 0 ? 'bg-primary/60' : 'bg-amber-200/60'} clip-triangle-down rounded-t`} />
                        <div className="flex flex-col gap-0.5 mt-1">
                          {Array.from({ length: Math.abs(board[i]) }).map((_, j) => (
                            <div key={j} className={`w-6 h-6 rounded-full ${board[i] > 0 ? 'bg-primary' : 'bg-zinc-800 border border-primary/50'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Bottom row */}
                  <div className="flex justify-around mt-2">
                    {[5, 4, 3, 2, 1, 0].map(i => (
                      <div key={`bot-${i}`} className="flex flex-col-reverse items-center">
                        <div className={`w-8 h-24 ${i % 2 === 0 ? 'bg-primary/60' : 'bg-amber-200/60'} clip-triangle-up rounded-b`} />
                        <div className="flex flex-col-reverse gap-0.5 mb-1">
                          {Array.from({ length: Math.abs(board[i]) }).map((_, j) => (
                            <div key={j} className={`w-6 h-6 rounded-full ${board[i] > 0 ? 'bg-primary' : 'bg-zinc-800 border border-primary/50'}`} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Dice Area */}
            <div className="mt-4 flex items-center justify-center gap-8">
              <div className="flex gap-3">
                <div className={usedDice[0] ? "opacity-30" : ""}>
                  <Die3D value={dice[0]} color="ivory" />
                </div>
                <div className={usedDice[1] ? "opacity-30" : ""}>
                  <Die3D value={dice[1]} color="ivory" />
                </div>
              </div>
              <Button onClick={handleRollDice} className="gap-2">
                <Dices size={18} />
                {t('gameAI.rollDice')}
              </Button>
            </div>

            {/* Chat Button - below board */}
            <GameChat
              roomId={roomId || ""}
              playerAddress={address}
              onSendMessage={handleSendChat}
              messages={chatMessages}
            />
          </div>

          {/* RIGHT COLUMN - Info Panels */}
          <div className="w-full lg:w-72 space-y-4">
            <GameSyncStatus
              isConnected={isConnected}
              opponentConnected={opponentConnected}
              isMyTurn={isMyTurn}
              remainingTime={remainingTime}
              playerAddress={address}
              opponentAddress={opponentAddress}
              connectionType={webrtcConnected ? "webrtc" : bcConnected ? "broadcast" : "none"}
              isPushEnabled={isPushEnabled}
              onReconnect={webrtcReconnect}
            />

            {/* Game Status */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.gameStatus')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('game.yourCheckers')}:</span>
                  <span className="text-foreground font-medium">15 {t('game.onBoard')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('game.opponent')}:</span>
                  <span className="text-foreground font-medium">15 {t('game.onBoard')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('game.borneOff')}:</span>
                  <span className="text-foreground font-medium">0 / 0</span>
                </div>
              </div>
            </div>

            {/* Move History */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.moveHistory')}</h3>
              <div className="h-32 overflow-y-auto space-y-1 text-sm">
                <div className="text-muted-foreground">1. {t('game.youRolled')} [4, 2]: 24→20, 13→11</div>
                <div className="text-muted-foreground">2. {t('game.opponentRolled')} [6, 5]: 1→12</div>
                <div className="text-muted-foreground">3. {t('game.youRolled')} [3, 3]: ...</div>
              </div>
            </div>

            {/* Pip Count */}
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.pipCount')}</h3>
              <div className="flex justify-between text-sm">
                <div className="text-center">
                  <div className="text-lg font-bold text-primary">167</div>
                  <div className="text-muted-foreground text-xs">{t('game.you')}</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-foreground">167</div>
                  <div className="text-muted-foreground text-xs">{t('game.opponent')}</div>
                </div>
              </div>
            </div>

            {/* Claim Timeout Button */}
            {canClaimTimeout && !gameEnded && (
              <Button
                onClick={handleClaimTimeout}
                disabled={isClaiming}
                className="w-full gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <Timer size={16} />
                {isClaiming ? t('game.claimingVictory') : t('game.claimTimeoutVictory')}
              </Button>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 gap-2">
                <Handshake size={16} />
                {t('game.offerDraw')}
              </Button>
              <Button variant="outline" className="flex-1 gap-2 text-destructive hover:text-destructive">
                <Flag size={16} />
                {t('game.resign')}
              </Button>
            </div>
          </div>
        </div>

        {/* Back to Lobby */}
        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/">
              <Home size={18} className="mr-2" />
              {t('game.returnToLobby')}
            </Link>
          </Button>
        </div>

        {/* Game Info Box */}
        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t('game.howItWorks')}</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.backgammonWinCondition')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.backgammonMoveRules')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.entryFeesHeld')}
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {t('game.winnerReceives')}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default BackgammonGame;
