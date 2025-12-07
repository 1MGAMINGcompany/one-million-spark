import { useParams } from "react-router-dom";

const ChessGame = () => {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-foreground mb-4">Chess Game Room</h1>
        <p className="text-muted-foreground">Room ID: {roomId}</p>
      </div>
    </div>
  );
};

export default ChessGame;
