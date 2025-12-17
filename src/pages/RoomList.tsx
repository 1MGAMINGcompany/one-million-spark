import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Construction, Wallet } from "lucide-react";
import { useWallet } from "@/hooks/useWallet";
import { WalletRequired } from "@/components/WalletRequired";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBackgroundMusic } from "@/hooks/useBackgroundMusic";

export default function RoomList() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isConnected, address } = useWallet();

  // Enable background music
  useBackgroundMusic();

  if (!isConnected) {
    return <WalletRequired message="Connect your Solana wallet to browse game rooms." />;
  }

  return (
    <div className="container max-w-4xl py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-cinzel">{t("roomList.title")}</h1>
        <Button onClick={() => navigate("/create-room")}>
          {t("roomList.createRoom")}
        </Button>
      </div>

      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Construction className="h-5 w-5 text-primary" />
            Public Rooms
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <Construction className="h-16 w-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Solana Integration Coming Soon</h3>
            <p className="text-muted-foreground mb-4">
              We're migrating to Solana! Browse and join rooms with SOL entry fees soon.
            </p>
            <p className="text-sm text-muted-foreground">
              Connected: {address?.slice(0, 8)}...{address?.slice(-4)}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
