import { Link } from "react-router-dom";
import { useEffect } from "react";
import { helpArticles } from "@/data/helpArticles";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";

const HelpCenter = () => {
  useEffect(() => {
    document.title = "Help & Guides | 1M Gaming";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) {
      meta.setAttribute("content", "1MGAMING help center and guides. Learn how to connect Solana wallets, understand skill-based gaming, and start playing chess, backgammon, and more for real SOL.");
    }
  }, []);

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <header className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
          1MGAMING Help & Guides
        </h1>
        <p className="text-foreground/70 text-lg max-w-2xl mx-auto leading-relaxed">
          1MGAMING is a Solana-based skill gaming platform where you compete in chess, backgammon, checkers, dominos, and ludo for real SOL. No RNG, no luck — just pure strategy. We support Phantom, Solflare, and Backpack wallets.
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {helpArticles.map((article) => (
          <Link key={article.slug} to={`/help/${article.slug}`} className="group">
            <Card className="h-full flex flex-col">
              <CardHeader className="flex-1">
                <CardTitle className="text-lg leading-snug group-hover:text-primary transition-colors">
                  {article.title}
                </CardTitle>
                <CardDescription className="mt-2">
                  {article.cardDescription}
                </CardDescription>
              </CardHeader>
              <div className="px-6 pb-4">
                <span className="text-sm text-primary/70 group-hover:text-primary flex items-center gap-1 transition-colors">
                  Read guide <ArrowRight className="w-3 h-3" />
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="text-center mt-12">
        <Link to="/" className="text-primary hover:text-primary/80 transition-colors text-sm">
          ← Back to 1MGAMING
        </Link>
      </div>
    </div>
  );
};

export default HelpCenter;
