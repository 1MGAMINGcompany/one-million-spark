import { useParams } from "react-router-dom";
import { MultiplayerGamePlaceholder } from "@/components/MultiplayerGamePlaceholder";

const BackgammonGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <MultiplayerGamePlaceholder
      roomId={roomId || "unknown"}
      gameName="Backgammon"
      gameType="backgammon"
      maxPlayers={2}
      aiPath="/play-ai/backgammon"
    />
  );
};

export default BackgammonGame;