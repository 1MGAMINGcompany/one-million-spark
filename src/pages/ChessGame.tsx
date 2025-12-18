import { useParams } from "react-router-dom";
import { MultiplayerGamePlaceholder } from "@/components/MultiplayerGamePlaceholder";

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <MultiplayerGamePlaceholder
      roomId={roomId || "unknown"}
      gameName="Chess"
      gameType="chess"
      maxPlayers={2}
      aiPath="/play-ai/chess"
    />
  );
};

export default ChessGame;