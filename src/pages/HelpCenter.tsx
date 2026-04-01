import { Link } from "react-router-dom";
import { helpArticles } from "@/data/helpArticles";
import { ArrowRight } from "lucide-react";
import { useSeoMeta } from "@/components/seo/SeoMeta";
import JsonLd from "@/components/seo/JsonLd";
import PlatformStatus from "@/components/seo/PlatformStatus";

const SITE_URL = "https://1mgaming.com";

const skillSlugs = [
  "skill-games-not-luck",
  "play-real-money-chess",
  "ludo-skill-or-luck-competitive-strategy",
];
const predictionSlugs = [
  "what-are-prediction-markets",
  "are-prediction-markets-legal",
  "prediction-markets-growth-2025",
  "how-to-place-a-prediction",
  "how-prediction-payouts-work",
  "what-is-liquidity-prediction-markets",
];

const skillArticles = helpArticles.filter((a) => skillSlugs.includes(a.slug));
const predictionArticles = helpArticles.filter((a) => predictionSlugs.includes(a.slug));

const ArticleGrid = ({ articles, title }: { articles: typeof helpArticles; title: string }) => (
  <section className="mb-10">
    <h2 className="text-xl font-semibold text-blue-400 mb-4">{title}</h2>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {articles.map((article) => (
        <Link key={article.slug} to={`/help/${article.slug}`} className="group">
          <div className="h-full flex flex-col rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm transition-all duration-300 hover:border-blue-500/30 hover:bg-white/[0.07]">
            <div className="flex-1 p-6">
              <h3 className="text-lg font-semibold leading-snug text-white group-hover:text-blue-400 transition-colors">
                {article.title}
              </h3>
              <p className="mt-2 text-sm text-white/50">
                {article.cardDescription}
              </p>
            </div>
            <div className="px-6 pb-4">
              <span className="text-sm text-blue-400/70 group-hover:text-blue-400 flex items-center gap-1 transition-colors">
                Read guide <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  </section>
);

const HelpCenter = () => {
  useSeoMeta({
    title: "Help & Guides | 1MGAMING — Skill Gaming & Prediction Markets",
    description: "1MGAMING help center: learn about skill-based gaming, prediction markets, and start playing chess, backgammon, checkers, dominos, and ludo for real stakes.",
    path: "/help",
  });

  const collectionPageJsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "1MGAMING Help & Guides",
    description: "Help center and guides for the 1MGAMING skill gaming and prediction markets platform.",
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
    description: "Skill-based gaming and prediction markets platform — chess, backgammon, checkers, dominos, ludo, and real-world event predictions.",
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        <JsonLd data={collectionPageJsonLd} />
        <JsonLd data={orgJsonLd} />

        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-blue-400 mb-4">
            1MGAMING Help & Guides
          </h1>
          <p className="text-white/60 text-lg max-w-2xl mx-auto leading-relaxed">
            1MGAMING is a skill-based gaming and prediction markets platform where you compete in chess, backgammon, checkers, dominos, and ludo for real stakes — and trade on the outcomes of real-world events. No RNG, no luck — just pure strategy and informed predictions.
          </p>
        </header>

        <ArticleGrid title="Skill Games" articles={skillArticles} />
        <ArticleGrid title="Prediction Markets" articles={predictionArticles} />

        <PlatformStatus />

        <div className="text-center mt-12">
          <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors text-sm">
            ← Back to 1MGAMING
          </Link>
        </div>
      </div>
    </div>
  );
};

export default HelpCenter;
