import { Link } from "react-router-dom";
import { helpArticles } from "@/data/helpArticles";
import { ArrowRight } from "lucide-react";

// Category map for selecting related articles
const categoryMap: Record<string, string> = {
  "connect-phantom-wallet-1mgaming": "wallet",
  "connect-solflare-wallet-1mgaming": "wallet",
  "connect-backpack-wallet-1mgaming": "wallet",
  "compare-solana-wallets-gaming": "wallet",
  "solana-skill-games-not-luck": "skill",
  "play-real-money-chess-solana": "skill",
  "ludo-skill-or-luck-competitive-strategy": "skill",
  "server-enforced-turn-timeouts-supabase-solana": "engineering",
};

function getRelated(currentSlug: string, count = 3) {
  const currentCat = categoryMap[currentSlug] || "skill";

  // Prefer same category first, then others
  const sameCategory = helpArticles.filter(
    (a) => a.slug !== currentSlug && categoryMap[a.slug] === currentCat
  );
  const other = helpArticles.filter(
    (a) => a.slug !== currentSlug && categoryMap[a.slug] !== currentCat
  );

  return [...sameCategory, ...other].slice(0, count);
}

interface Props {
  currentSlug: string;
}

const RelatedArticles = ({ currentSlug }: Props) => {
  const related = getRelated(currentSlug);
  const allArticles = helpArticles.filter((a) => a.slug !== currentSlug);
  const currentIdx = helpArticles.findIndex((a) => a.slug === currentSlug);
  const nextArticle = helpArticles[(currentIdx + 1) % helpArticles.length];

  return (
    <div className="mt-12 pt-8 border-t border-border">
      <h3 className="text-lg font-semibold text-foreground mb-4">Related Guides</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {related.map((a) => (
          <Link
            key={a.slug}
            to={`/help/${a.slug}`}
            className="rounded-lg border border-border p-4 hover:border-primary/40 transition-colors group"
          >
            <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors leading-snug">
              {a.title}
            </p>
          </Link>
        ))}
      </div>

      {nextArticle && nextArticle.slug !== currentSlug && (
        <div className="mt-6">
          <Link
            to={`/help/${nextArticle.slug}`}
            className="inline-flex items-center gap-1 text-sm text-primary/70 hover:text-primary transition-colors"
          >
            Next: {nextArticle.title} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      )}
    </div>
  );
};

export default RelatedArticles;
