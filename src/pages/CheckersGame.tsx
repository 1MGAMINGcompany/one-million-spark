import { useParams } from "react-router-dom";
import { MultiplayerGamePlaceholder } from "@/components/MultiplayerGamePlaceholder";

const CheckersGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <MultiplayerGamePlaceholder
      roomId={roomId || "unknown"}
      gameName="Checkers"
      gameType="checkers"
      maxPlayers={2}
      aiPath="/play-ai/checkers"
    />
  );
};

export default CheckersGame;