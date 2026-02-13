import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ExternalLink, Gamepad2 } from "lucide-react";

const ArticleCTA = () => (
  <div className="mt-12 rounded-xl border border-primary/30 bg-card/60 backdrop-blur-sm p-6 md:p-8">
    <h3 className="text-xl font-bold text-primary mb-2">Ready to play?</h3>
    <p className="text-foreground/60 text-sm mb-5">
      Connect your Solana wallet and start competing in skill-based games for real SOL.
    </p>
    <div className="flex flex-wrap gap-3">
      <Button asChild variant="gold" size="sm">
        <Link to="/room-list"><ExternalLink className="w-4 h-4 mr-1" /> Open 1MGAMING</Link>
      </Button>
      <Button asChild variant="outline" size="sm">
        <Link to="/room-list">Connect Wallet</Link>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link to="/play-ai/chess"><Gamepad2 className="w-4 h-4 mr-1" /> Play Chess</Link>
      </Button>
      <Button asChild variant="secondary" size="sm">
        <Link to="/play-ai/backgammon"><Gamepad2 className="w-4 h-4 mr-1" /> Play Backgammon</Link>
      </Button>
    </div>
  </div>
);

export default ArticleCTA;
