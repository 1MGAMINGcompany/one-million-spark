/**
 * Leaderboard Page
 * Tabs: Skill Games | Predictions | Combined
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/hooks/useWallet';
import SkillGameBoard from '@/components/leaderboard/SkillGameBoard';
import CachedLeaderboard from '@/components/leaderboard/CachedLeaderboard';

const SPECIAL_TABS = ['predictions', 'combined'];

export default function Leaderboard() {
  const { game } = useParams<{ game: string }>();
  const navigate = useNavigate();
  const { isConnected, address: connectedWallet } = useWallet();

  const [isAdmin, setIsAdmin] = useState(false);

  const gameType = game?.toLowerCase() || 'chess';
  const activeTab = SPECIAL_TABS.includes(gameType) ? gameType : 'skills';

  useEffect(() => {
    if (!connectedWallet) {
      setIsAdmin(false);
      return;
    }
    supabase
      .from('prediction_admins')
      .select('wallet')
      .eq('wallet', connectedWallet)
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [connectedWallet]);

  return (
    <div className="container max-w-3xl py-8 px-4">
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          if (v === 'skills') navigate('/leaderboard/chess');
          else navigate(`/leaderboard/${v}`);
        }}
      >
        <TabsList className="w-full mb-4">
          <TabsTrigger value="skills" className="flex-1">Skill Games</TabsTrigger>
          <TabsTrigger value="predictions" className="flex-1">Predictions</TabsTrigger>
          <TabsTrigger value="combined" className="flex-1">Combined</TabsTrigger>
        </TabsList>

        <TabsContent value="skills">
          <SkillGameBoard
            gameType={gameType}
            connectedWallet={connectedWallet}
            isConnected={isConnected}
          />
        </TabsContent>

        <TabsContent value="predictions">
          <CachedLeaderboard
            category="predictions"
            connectedWallet={connectedWallet}
            isConnected={isConnected}
            isAdmin={isAdmin}
            showTimeFilter
          />
        </TabsContent>

        <TabsContent value="combined">
          <CachedLeaderboard
            category="combined"
            connectedWallet={connectedWallet}
            isConnected={isConnected}
            isAdmin={isAdmin}
            showTimeFilter={false}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
