import { useParams } from "react-router-dom";
import { MultiplayerGamePlaceholder } from "@/components/MultiplayerGamePlaceholder";

const DominosGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <MultiplayerGamePlaceholder
      roomId={roomId || "unknown"}
      gameName="Dominos"
      gameType="dominos"
      maxPlayers={2}
      aiPath="/play-ai/dominos"
    />
  );
};

export default DominosGame;