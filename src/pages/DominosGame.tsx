import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Home, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useWallet } from "@/hooks/useWallet";

const DominosGame = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();

  return (
    <div className="container max-w-4xl py-8 px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate("/room-list")}>
        <Home className="mr-2 h-4 w-4" /> Back to Rooms
      </Button>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="text-2xl font-cinzel flex items-center gap-3">
            <Construction className="h-6 w-6 text-primary" />
            Dominos - Room #{roomId}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              Multiplayer Dominos with SOL entry fees will be available soon.
            </p>
            <Button variant="outline" onClick={() => navigate("/play-ai/dominos")}>
              Play vs AI (Free)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default DominosGame;
