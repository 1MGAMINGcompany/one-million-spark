import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Flag, Handshake, Timer } from "lucide-react";
import { useRoom, formatEntryFee, formatRoom, usePlayersOf } from "@/hooks/useRoomManager";
import { usePolPrice } from "@/hooks/usePolPrice";
import { GameSyncStatus } from "@/components/GameSyncStatus";
import { GameChat, useChatMessages } from "@/components/GameChat";
import { FinishGameButton } from "@/components/FinishGameButton";
import { useGameSync, useTurnTimer, DominoMove } from "@/hooks/useGameSync";
import { useWebRTCSync, GameMessage } from "@/hooks/useWebRTCSync";
import { useTimeoutForfeit } from "@/hooks/useTimeoutForfeit";
import { useWallet } from "@/hooks/useWallet";
import DominoTile3D from "@/components/DominoTile3D";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { MobileAppPrompt } from "@/components/MobileAppPrompt";

const initialPlayerHand = [
  [6, 6], [5, 4], [3, 2], [1, 0], [4, 4], [2, 1], [6, 3]
];

const initialBoardTiles = [
  { tile: [5, 5] as [number, number] },
  { tile: [5, 3] as [number, number] },
  { tile: [3, 1] as [number, number] },
];

const DominosGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { formatUsd } = usePolPrice();
  const { address } = useWallet();
  const { toast } = useToast();
  const { t } = useTranslation();
  
  const roomIdBigInt = roomId ? BigInt(roomId) : undefined;
  const { data: roomData } = useRoom(roomIdBigInt);
  const { data: players } = usePlayersOf(roomIdBigInt);
  const room = roomData ? formatRoom(roomData) : null;
  
  const isCreator = room && address && room.creator.toLowerCase() === address.toLowerCase();
  const isRoomFull = room && (players?.length || 0) >= room.maxPlayers;
  
  const [playerHand, setPlayerHand] = useState(initialPlayerHand);
  const [boardTiles, setBoardTiles] = useState(initialBoardTiles);
  const [selectedTile, setSelectedTile] = useState<number | null>(null);
  const [gameEnded, setGameEnded] = useState(false);

  // Chat messages
  const { messages: chatMessages, sendMessage: addChatMessage, receiveMessage } = useChatMessages(address);

  const entryFeeFormatted = room ? formatEntryFee(room.entryFee) : "...";
  const prizePool = room ? (parseFloat(entryFeeFormatted) * room.maxPlayers * 0.95).toFixed(3) : "...";

  const handleOpponentMove = useCallback((move: DominoMove) => {
    setBoardTiles(prev => [...prev, { tile: move.tile }]);
  }, []);

  const handleOpponentResign = useCallback(() => {
    setGameEnded(true);
    toast({ title: t('game.opponentResigned'), description: t('game.youWin') });
  }, [toast, t]);

  // Handle WebRTC messages
  const handleWebRTCMessage = useCallback((message: GameMessage) => {
    switch (message.type) {
      case "move":
        if (message.payload) handleOpponentMove(message.payload as DominoMove);
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

  // WebRTC P2P sync (primary)
  const {
    isConnected: webrtcConnected,
    isPushEnabled,
    sendMove: webrtcSendMove,
    sendResign: webrtcSendResign,
    sendDrawOffer: webrtcSendDrawOffer,
    sendChat: webrtcSendChat,
    reconnect: webrtcReconnect,
    peerAddress,
  } = useWebRTCSync({
    roomId: roomId || "",
    players: (players as string[]) || [],
    onMessage: handleWebRTCMessage,
    enabled: !!players && players.length >= 2,
  });

  // Fallback BroadcastChannel sync
  const {
    gameState,
    isConnected: bcConnected,
    opponentConnected: bcOpponentConnected,
    isMyTurn,
    sendMove: bcSendMove,
    sendResign: bcSendResign,
    sendDrawOffer: bcSendDrawOffer,
  } = useGameSync({
    roomId: roomId || "",
    gameType: "dominos",
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6 bg-card border border-border rounded-lg p-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('gameAI.dominos')} – {t('game.room')} #{roomId}</h1>
            <p className="text-sm text-muted-foreground">{t('game.prizePool')}: {prizePool} POL {room && `(~${formatUsd(parseFloat(prizePool))})`}</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="px-2 py-1 bg-primary/20 text-primary rounded">{isMyTurn ? t('game.yourTurn') : t('game.opponentsTurn')}</span>
            <span className="text-muted-foreground">{remainingTime}s {t('game.remaining')}</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 flex flex-col gap-4">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">{t('game.opponentsHand')}</p>
              <div className="flex gap-1 justify-center">
                {[1,2,3,4,5,6,7].map((i) => (
                  <div key={i} className="w-8 h-16 bg-gradient-to-br from-zinc-800 to-zinc-900 border border-primary/30 rounded" />
                ))}
              </div>
            </div>

            <div className="aspect-[2/1] bg-gradient-to-br from-emerald-900/50 to-emerald-950/70 border border-primary/20 rounded-lg flex items-center justify-center p-4 overflow-hidden">
              <div className="flex gap-1">
                {boardTiles.map((t, i) => (
                  <DominoTile3D key={i} left={t.tile[0]} right={t.tile[1]} />
                ))}
              </div>
            </div>

            <div className="mt-4">
              <p className="text-sm text-muted-foreground mb-2">{t('game.yourHand')}</p>
              <div className="flex gap-2 justify-center flex-wrap">
                {playerHand.map((tile, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedTile(selectedTile === i ? null : i)}
                    className={`cursor-pointer transition-transform ${selectedTile === i ? 'scale-110 -translate-y-2' : 'hover:scale-105'}`}
                  >
                    <DominoTile3D left={tile[0]} right={tile[1]} isSelected={selectedTile === i} />
                  </div>
                ))}
              </div>
            </div>
            
            {/* Chat Button - below board */}
            <GameChat
              roomId={roomId || ""}
              playerAddress={address}
              onSendMessage={handleSendChat}
              messages={chatMessages}
            />
          </div>

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

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.gameStatus')}</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('game.yourTiles')}:</span><span className="text-foreground font-medium">{playerHand.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('game.opponentTiles')}:</span><span className="text-foreground font-medium">7</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('game.drawPile')}:</span><span className="text-foreground font-medium">14</span></div>
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t('game.moveHistory')}</h3>
              <div className="h-32 overflow-y-auto space-y-1 text-sm">
                <div className="text-muted-foreground">1. {t('game.youPlayed')} [5|5]</div>
                <div className="text-muted-foreground">2. {t('game.opponentPlayed')} [5|3]</div>
                <div className="text-muted-foreground">3. {t('game.youPlayed')} [3|1]</div>
              </div>
            </div>

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

            <div className="space-y-2">
              <Button variant="outline" className="w-full" disabled>{t('game.drawFromPile')}</Button>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-2"><Handshake size={16} />{t('game.offerDraw')}</Button>
                <Button variant="outline" className="flex-1 gap-2 text-destructive hover:text-destructive"><Flag size={16} />{t('game.resign')}</Button>
              </div>
            </div>

            {/* Finish Game & Pay Winner - Only visible to creator when game ends */}
            {gameEnded && (
              <FinishGameButton
                roomId={roomIdBigInt || BigInt(0)}
                isCreator={!!isCreator}
                isRoomFull={!!isRoomFull}
                onGameFinished={() => navigate("/")}
              />
            )}
          </div>
        </div>

        <div className="flex justify-center mt-8">
          <Button variant="outline" size="lg" asChild>
            <Link to="/"><Home size={18} className="mr-2" />{t('game.returnToLobby')}</Link>
          </Button>
        </div>

        <div className="mt-8 bg-card border border-border rounded-lg p-6">
          <h3 className="text-lg font-semibold text-foreground mb-4">{t('game.howItWorks')}</h3>
          <ul className="space-y-2 text-muted-foreground text-sm">
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{t('game.dominosWinCondition')}</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{t('game.dominosMoveRules')}</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{t('game.entryFeesHeld')}</li>
            <li className="flex items-start gap-2"><span className="text-primary mt-0.5">•</span>{t('game.winnerReceives')}</li>
          </ul>
        </div>
      </div>
      <MobileAppPrompt />
    </div>
  );
};

export default DominosGame;
