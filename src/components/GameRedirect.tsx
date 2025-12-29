/**
 * GameRedirect: Redirects legacy /game/:slug/:pda routes to canonical /room/:pda
 * 
 * The :slug parameter is IGNORED - game type is determined from on-chain data only.
 * This fixes the "Dominos card opens Backgammon" bug.
 */

import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

export function GameRedirect() {
  const { roomPda } = useParams<{ slug: string; roomPda: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (roomPda) {
      // Redirect to canonical route - game type determined by on-chain data
      console.log("[GameRedirect] Redirecting /game/:slug/:pda to /room/:pda", roomPda);
      navigate(`/room/${roomPda}`, { replace: true });
    }
  }, [roomPda, navigate]);

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-muted-foreground">{t("common.redirectingToGame")}</p>
      </div>
    </div>
  );
}
