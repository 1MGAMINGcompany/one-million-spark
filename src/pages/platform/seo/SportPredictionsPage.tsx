import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSeoMeta } from "@/components/seo/SeoMeta";
import JsonLd from "@/components/seo/JsonLd";
import FAQSection from "@/components/seo/FAQSection";
import { getSportConfig, SPORT_SLUGS, SPORT_CONFIGS } from "./sportConfigs";

const SITE_URL = "https://1mg.live";

interface SportFight {
  id: string;
  title: string | null;
  fighter_a_name: string | null;
  fighter_b_name: string | null;
  event_name: string | null;
  event_date: string | null;
  category: string | null;
  polymarket_slug: string | null;
  price_a: number | null;
  price_b: number | null;
  status: string | null;
  visibility: string | null;
}

const FIGHT_SELECT =
  "id, title, fighter_a_name, fighter_b_name, event_name, event_date, category, polymarket_slug, price_a, price_b, status, visibility";

/** Match a fight against a sport's filter terms (case-insensitive). */
function fightMatchesSport(fight: SportFight, terms: string[]): boolean {
  const haystack = [
    fight.polymarket_slug ?? "",
    fight.category ?? "",
    fight.event_name ?? "",
    fight.title ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "TBD";
  try {
    return new Date(dateStr).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "TBD";
  }
}

function formatProbability(price: number | null): string {
  if (price == null || Number.isNaN(price)) return "—";
  return `${Math.round(price * 100)}%`;
}

const SportPredictionsPage = () => {
  const { sport } = useParams<{ sport: string }>();
  const config = getSportConfig(sport);

  // Always call useSeoMeta — values are inert if config is null.
  const seoTitle = config
    ? `${config.h1} | 1MG.live`
    : "Sport Not Yet Covered | 1MG.live";
  const seoDescription = config
    ? `${config.heroIntro.slice(0, 150)}…`
    : "This sport isn't yet available on 1MG.live. Browse our supported sports for live prediction markets.";
  const canonicalPath = config
    ? `/predictions/sport/${config.slug}`
    : "/predictions/sport";

  useSeoMeta({
    title: seoTitle,
    description: seoDescription,
    path: canonicalPath,
    ogType: "website",
  });

  const [fights, setFights] = useState<SportFight[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!config) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { data, error } = await (supabase as any)
          .from("prediction_fights")
          .select(FIGHT_SELECT)
          .in("visibility", ["flagship", "platform", "all"])
          .not(
            "status",
            "in",
            '("settled","cancelled","confirmed","result_selected","refund_pending","refunds_processing","refunds_complete")',
          )
          .gt("event_date", new Date(Date.now() - 86400000).toISOString())
          .order("event_date", { ascending: true })
          .limit(200);

        if (cancelled) return;
        if (error) {
          console.error("[SportPredictionsPage] fetch error", error);
          setFights([]);
          return;
        }
        const all = (data ?? []) as SportFight[];
        const filtered = all.filter((f) => fightMatchesSport(f, config.polymarketCategories));
        setFights(filtered.slice(0, 12));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [config]);

  const sportsEventJsonLd = useMemo(() => {
    if (!config || !fights || fights.length === 0) return null;
    return {
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: `${config.displayName} Prediction Markets`,
      itemListElement: fights.slice(0, 10).map((f, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        item: {
          "@type": "SportsEvent",
          name: f.title || `${f.fighter_a_name ?? ""} vs ${f.fighter_b_name ?? ""}`.trim(),
          startDate: f.event_date ?? undefined,
          sport: config.displayName,
          url: `${SITE_URL}/predictions/sport/${config.slug}`,
        },
      })),
    };
  }, [config, fights]);

  if (!config) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white">
        <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
          <h1 className="text-3xl font-bold text-blue-400 mb-4">Sport not yet covered</h1>
          <p className="text-white/60 mb-8">
            We don't have a dedicated landing page for "{sport}" yet. Browse our supported sports below.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {SPORT_SLUGS.map((s) => (
              <Link
                key={s}
                to={`/predictions/sport/${s}`}
                className="px-4 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white/80 hover:border-blue-400/40 transition-colors text-sm"
              >
                {SPORT_CONFIGS[s].displayName}
              </Link>
            ))}
          </div>
          <Link to="/" className="text-blue-400 hover:text-blue-300 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    );
  }

  const otherSports = SPORT_SLUGS.filter((s) => s !== config.slug).map((s) => SPORT_CONFIGS[s]);

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      {sportsEventJsonLd && <JsonLd data={sportsEventJsonLd} />}

      <div className="container mx-auto px-4 py-10 max-w-4xl">
        {/* Breadcrumb-ish back link */}
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-white/40 hover:text-blue-400 transition-colors mb-6"
        >
          <ChevronLeft size={16} /> Home
        </Link>

        {/* HERO */}
        <header className="mb-12">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-4">
            {config.h1}
          </h1>
          <p className="text-white/60 text-lg leading-relaxed max-w-2xl">
            {config.heroIntro}
          </p>
        </header>

        {/* LIVE EVENTS */}
        <section className="mb-16">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-2xl font-semibold text-blue-400">
              Live {config.displayName} markets
            </h2>
            <Link
              to="/demo"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors inline-flex items-center gap-1"
            >
              View all {config.displayName} markets <ArrowRight size={14} />
            </Link>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-white/50 py-8">
              <Loader2 className="animate-spin" size={16} /> Loading {config.displayName} markets…
            </div>
          )}

          {!loading && fights && fights.length === 0 && (
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 text-white/50">
              No live {config.displayName} markets right now. New markets open daily — check back soon.
            </div>
          )}

          {!loading && fights && fights.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {fights.map((f) => (
                <div
                  key={f.id}
                  className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-blue-400/30 transition-colors"
                >
                  <div className="text-xs text-white/40 mb-2">{formatDate(f.event_date)}</div>
                  <div className="font-medium mb-3 text-white/90 text-sm leading-snug">
                    {f.title || `${f.fighter_a_name ?? ""} vs ${f.fighter_b_name ?? ""}`}
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex flex-col">
                      <span className="text-white/60">{f.fighter_a_name ?? "A"}</span>
                      <span className="text-blue-400 font-semibold">{formatProbability(f.price_a)}</span>
                    </div>
                    <div className="text-white/30">vs</div>
                    <div className="flex flex-col text-right">
                      <span className="text-white/60">{f.fighter_b_name ?? "B"}</span>
                      <span className="text-blue-400 font-semibold">{formatProbability(f.price_b)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <FAQSection
            items={config.faqItems}
            heading={`Frequently asked: ${config.displayName} prediction markets`}
          />
        </section>

        {/* INTERNAL LINKS */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold text-blue-400 mb-4">Other sports</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {otherSports.map((s) => (
              <Link
                key={s.slug}
                to={`/predictions/sport/${s.slug}`}
                className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-blue-400/30 transition-colors"
              >
                <div className="font-semibold text-white/90 text-sm">{s.displayName} predictions</div>
                <div className="text-xs text-white/40 mt-1">Live markets & forecasts</div>
              </Link>
            ))}
            <Link
              to="/"
              className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-blue-400/30 transition-colors"
            >
              <div className="font-semibold text-white/90 text-sm">All prediction markets</div>
              <div className="text-xs text-white/40 mt-1">Browse the full catalog</div>
            </Link>
            <Link
              to="/buy-predictions-app"
              className="bg-white/[0.03] border border-white/5 rounded-xl p-4 hover:border-blue-400/30 transition-colors"
            >
              <div className="font-semibold text-white/90 text-sm">Launch your own platform</div>
              <div className="text-xs text-white/40 mt-1">For creators & operators</div>
            </Link>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-gradient-to-br from-blue-600/[0.08] to-cyan-600/[0.04] border border-blue-500/15 rounded-2xl p-8 text-center mb-12">
          <h2 className="text-2xl font-bold mb-3">
            Sign in to make your first {config.displayName} prediction
          </h2>
          <p className="text-white/50 mb-6 max-w-md mx-auto text-sm">
            Open an account in seconds and trade the {config.displayName} markets you've researched.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 transition-colors text-white font-semibold px-6 py-3 rounded-xl"
          >
            Get started <ArrowRight size={16} />
          </Link>
        </section>
      </div>
    </div>
  );
};

export default SportPredictionsPage;
