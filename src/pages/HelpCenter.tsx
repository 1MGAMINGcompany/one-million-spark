import { Link } from "react-router-dom";
import { helpArticles } from "@/data/helpArticles";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowRight } from "lucide-react";
import { useSeoMeta } from "@/components/seo/SeoMeta";
import JsonLd from "@/components/seo/JsonLd";
import PlatformStatus from "@/components/seo/PlatformStatus";

const SITE_URL = "https://1mgaming.com";

const walletSlugs = [
  "connect-phantom-wallet-1mgaming",
  "connect-solflare-wallet-1mgaming",
  "connect-backpack-wallet-1mgaming",
  "compare-solana-wallets-gaming",
];
const skillSlugs = [
  "solana-skill-games-not-luck",
  "play-real-money-chess-solana",
];
const engineeringSlugs = [
  "server-enforced-turn-timeouts-supabase-solana",
];

const walletArticles = helpArticles.filter((a) => walletSlugs.includes(a.slug));
const skillArticles = helpArticles.filter((a) => skillSlugs.includes(a.slug));
const engineeringArticles = helpArticles.filter((a) => engineeringSlugs.includes(a.slug));

const ArticleGrid = ({ articles, title }: { articles: typeof helpArticles; title: string }) => (
  <section className="mb-10">
    <h2 className="text-xl font-semibold text-foreground mb-4">{title}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {articles.map((article) => (
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
  </section>
);

const HelpCenter = () => {
  useSeoMeta({
    title: "Help & Guides | 1MGAMING — Solana Skill Gaming",
    description: "1MGAMING help center: connect Solana wallets, learn skill-based gaming, and start playing chess, backgammon, checkers, dominos, and ludo for real SOL.",
    path: "/help",
  });

  const collectionPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "1MGAMING Help & Guides",
    description: "Help center and guides for 1MGAMING Solana skill gaming platform.",
    url: `${SITE_URL}/help`,
    isPartOf: {
      "@type": "WebSite",
      name: "1MGAMING",
      url: SITE_URL,
    },
  };

  const orgJsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "1MGAMING",
    url: SITE_URL,
    description: "Solana-based skill gaming platform — chess, backgammon, checkers, dominos, and ludo for real SOL.",
  };

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <JsonLd data={collectionPageJsonLd} />
      <JsonLd data={orgJsonLd} />

      <header className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-primary mb-4">
          1MGAMING Help & Guides
        </h1>
        <p className="text-foreground/70 text-lg max-w-2xl mx-auto leading-relaxed">
          1MGAMING is a Solana-based skill gaming platform where you compete in chess, backgammon, checkers, dominos, and ludo for real SOL. No RNG, no luck — just pure strategy. We support Phantom, Solflare, and Backpack wallets.
        </p>
      </header>

      <ArticleGrid title="Wallet Guides" articles={walletArticles} />
      <ArticleGrid title="Skill Games" articles={skillArticles} />
      {/* Engineering section hidden intentionally */}

      <PlatformStatus />

      <div className="text-center mt-12">
        <Link to="/" className="text-primary hover:text-primary/80 transition-colors text-sm">
          ← Back to 1MGAMING
        </Link>
      </div>
    </div>
  );
};

export default HelpCenter;
