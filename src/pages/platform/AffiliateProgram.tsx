import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, DollarSign, Clock, Wallet, Users, Cookie, Megaphone, CheckCircle2, Copy, Check, Package, MessageSquare, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSeoMeta } from "@/components/seo/SeoMeta";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import JsonLd from "@/components/seo/JsonLd";

/**
 * 1mg.live Affiliate Program — public, indexable marketing page.
 * Pure static content. No business logic, no auth gate, no DB writes.
 * Styled to match 1mg.live brand: dark #04060c bg, blue accents, white text, sans-serif.
 */

// Affiliate applications are handled manually via email until the public Trackdesk
// signup form is available on a paid plan. Approved affiliates receive their custom
// tracking link by reply.
const AFFILIATE_EMAIL = "1mg.live.partnerships@gmail.com";
// Affiliate signups are now handled via GoAffPro self-serve portal.
const AFFILIATE_PORTAL_URL = "https://1mg.goaffpro.com";

const COMMISSION_USD = 400;
const PACKAGE_USD = 2400;
const COMMISSION_PCT = Math.round((COMMISSION_USD / PACKAGE_USD) * 100); // 16(.67)
const COOKIE_DAYS = 30;
const PAYOUT_HOURS = 48;

export default function AffiliateProgram() {
  const navigate = useNavigate();

  useSeoMeta({
    title: "1mg.live Affiliate Program | Earn $400 USDC Per Referred Operator",
    description:
      "Join the 1mg.live affiliate program and earn $400 USDC for every operator you refer. 30-day cookie, fast 48-hour USDC payouts, built for creators, agencies & sportsbook affiliates.",
    ogImage: "https://1mg.live/images/operator-app-og.png",
  });

  const handleApply = () => {
    window.open(AFFILIATE_PORTAL_URL, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="min-h-screen bg-[#04060c] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebPage",
          name: "1mg.live Affiliate Program",
          description:
            "Earn $400 USDC for every operator you refer to 1mg.live. 30-day cookie, 48-hour USDC payouts.",
          url: "https://1mg.live/affiliate",
        }}
      />

      {/* Top bar */}
      <header className="border-b border-white/5 bg-[#04060c]/80 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="text-xl font-bold tracking-tight hover:opacity-80 transition"
          >
            <span className="text-blue-400">1MG</span><span className="text-white/50">.live</span>
          </button>
          <div className="flex items-center gap-2">
            <PlatformLanguageSwitcher />
            <Button
              size="sm"
              onClick={handleApply}
              className="gap-1.5 bg-blue-600 hover:bg-blue-500 text-white border-0"
            >
              Join via GoAffPro <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 text-xs font-medium mb-6 border border-blue-500/20">
          <Megaphone className="h-3.5 w-3.5" />
          Affiliate Program
        </div>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 text-white">
          Earn <span className="text-blue-400">$400 USDC</span> per referred operator
        </h1>
        <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-8 leading-relaxed">
          Refer creators, agencies, and sports brands to launch their own branded prediction app on 1mg.live.
          You earn $400 USDC for every confirmed sale — paid in under 48 hours.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            onClick={handleApply}
            className="gap-2 text-base px-8 bg-blue-600 hover:bg-blue-500 text-white border-0"
          >
            Join via GoAffPro <ArrowRight className="h-4 w-4" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate("/buy-predictions-app")}
            className="text-base px-8 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white"
          >
            See What You're Promoting
          </Button>
        </div>
      </section>

      {/* How to apply via GoAffPro */}
      <section className="max-w-3xl mx-auto px-4 py-12">
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6 md:p-8">
          <h2 className="text-xl md:text-2xl font-bold mb-3 text-white">How to apply</h2>
          <p className="text-white/70 leading-relaxed mb-4">
            Sign up self-serve in under 2 minutes via our GoAffPro affiliate portal. You'll get
            your own tracking link, real-time dashboard, and access to marketing assets the moment
            your account is approved.
          </p>
          <Button onClick={handleApply} className="gap-2 bg-blue-600 hover:bg-blue-500 text-white border-0">
            Join via GoAffPro <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="text-xs text-white/50 mt-3">
            Sign up at{" "}
            <a
              href={AFFILIATE_PORTAL_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
            >
              1mg.goaffpro.com
            </a>
          </p>
        </div>
      </section>

      {/* Headline stats */}
      <section className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<DollarSign className="h-5 w-5" />} value={`$${COMMISSION_USD}`} label="Per Sale" />
          <StatCard icon={<Wallet className="h-5 w-5" />} value="USDC" label="Polygon Payout" />
          <StatCard icon={<Clock className="h-5 w-5" />} value={`${PAYOUT_HOURS}h`} label="Payout Speed" />
          <StatCard icon={<Cookie className="h-5 w-5" />} value={`${COOKIE_DAYS} days`} label="Cookie Window" />
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12 text-white">How it works</h2>
        <div className="grid md:grid-cols-3 gap-6">
          <Step
            num={1}
            title="Sign up on GoAffPro"
            body="Self-serve signup in under 2 minutes. Get your tracking link instantly."
          />
          <Step
            num={2}
            title="Refer operators"
            body={`Share your link with creators, agencies, and sports brands. Cookie attribution lasts ${COOKIE_DAYS} days.`}
          />
          <Step
            num={3}
            title="Get paid in USDC"
            body={`Every confirmed $${PACKAGE_USD} operator package = $${COMMISSION_USD} USDC paid to your wallet within ${PAYOUT_HOURS} hours.`}
          />
        </div>
      </section>

      {/* Who it's for */}
      <section className="max-w-5xl mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-3xl font-bold text-center mb-4 text-white">Who it's for</h2>
        <p className="text-center text-white/60 mb-12 max-w-2xl mx-auto">
          1mg.live affiliates earn the most when they have direct access to people who want to launch
          their own branded prediction app.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Audience icon={<Users className="h-5 w-5" />} title="Creators & influencers" body="Sports, crypto, esports audiences" />
          <Audience icon={<Megaphone className="h-5 w-5" />} title="Marketing agencies" body="Selling to sportsbook & gaming brands" />
          <Audience icon={<Wallet className="h-5 w-5" />} title="Crypto communities" body="DAOs, trading groups, web3 brands" />
          <Audience icon={<DollarSign className="h-5 w-5" />} title="Affiliate networks" body="Sports betting & iGaming verticals" />
        </div>
      </section>

      {/* Program details */}
      <section className="max-w-3xl mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-3xl font-bold text-center mb-12 text-white">Program details</h2>
        <div className="space-y-1">
          <DetailRow label="Commission" value={`$${COMMISSION_USD} USDC per confirmed sale (${COMMISSION_PCT}% of $${PACKAGE_USD})`} />
          <DetailRow label="Cookie duration" value={`${COOKIE_DAYS} days`} />
          <DetailRow label="Payout method" value="USDC on Polygon, sent directly to your wallet" />
          <DetailRow label="Payout timing" value={`Within ${PAYOUT_HOURS} hours of confirmed sale`} />
          <DetailRow label="Tracking" value="GoAffPro — industry-standard affiliate platform" />
          <DetailRow label="Minimum payout" value="No minimum — every sale is paid out" />
          <DetailRow label="How to apply" value="Sign up self-serve at 1mg.goaffpro.com" />
        </div>
      </section>

      {/* Affiliate Marketing Kit */}
      <section className="max-w-5xl mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-3xl font-bold text-center mb-3 text-white">Affiliate marketing kit</h2>
        <p className="text-center text-white/60 mb-12 max-w-2xl mx-auto">
          Everything you need to start promoting today. Copy, paste, and earn.
        </p>

        {/* Pitch card */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6 md:p-8 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Package className="h-5 w-5 text-blue-400" />
            <h3 className="font-semibold text-lg text-white">The pitch (memorize this)</h3>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-4 text-sm">
            <KitRow label="What it is" value="A turnkey, branded sports prediction app — operator owns it end-to-end." />
            <KitRow label="Price" value={`$${PACKAGE_USD} USDC, one-time`} />
            <KitRow label="Your commission" value={`$${COMMISSION_USD} USDC per completed sale`} />
            <KitRow label="Best buyers" value="Creators, sports influencers, marketing agencies, crypto communities, iGaming affiliates." />
            <KitRow
              label="What the buyer gets"
              value="Custom-branded predictions app, live event liquidity from Polymarket, custom event creation, operator dashboard, fast USDC payouts, no coding required."
            />
            <KitRow label="Why it converts" value="Recurring upside for the buyer, fixed flat fee, instant launch — no dev team, no licensing." />
          </div>
        </div>

        {/* Copyable outreach + social */}
        <div className="grid md:grid-cols-2 gap-6">
          <CopyBlock
            icon={<MessageSquare className="h-5 w-5 text-blue-400" />}
            title="Outreach message (DM / email)"
            text={`Hey — quick one. I came across 1mg.live: it lets creators & agencies launch their own branded sports predictions app for a one-time $${PACKAGE_USD} USDC. You own the brand, set your own fees, and tap into live Polymarket liquidity from day one. No code, live in minutes. Worth a 2-min look? https://1mg.live`}
          />
          <CopyBlock
            icon={<Share2 className="h-5 w-5 text-blue-400" />}
            title="Social post"
            text={`Launch your own branded sports predictions app in minutes.\n\n→ One-time $${PACKAGE_USD} USDC\n→ Live event liquidity\n→ Custom events + operator dashboard\n→ Fast USDC payouts\n→ No code\n\nYou own it. You brand it. You earn from it.\n\n👉 https://1mg.live`}
          />
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 py-16 border-t border-white/5">
        <h2 className="text-3xl font-bold text-center mb-12 text-white">FAQ</h2>
        <div className="space-y-4">
          <FAQ
            q="What exactly am I promoting?"
            a={`The 1mg.live Operator App — a $${PACKAGE_USD} USDC one-time package that lets anyone launch their own branded sports predictions app with live event liquidity, custom events, and an operator dashboard.`}
          />
          <FAQ
            q="How much do I earn?"
            a={`$${COMMISSION_USD} USDC per completed operator app sale (${COMMISSION_PCT}% of the $${PACKAGE_USD} package). No caps, no tiers — every confirmed sale pays the same.`}
          />
          <FAQ
            q="When do I get paid?"
            a={`USDC is sent to your Polygon wallet within ${PAYOUT_HOURS} hours after a referred buyer's purchase is confirmed on-chain.`}
          />
          <FAQ
            q="What counts as a confirmed sale?"
            a={`A confirmed sale = a buyer who clicks your tracking link, completes the $${PACKAGE_USD} USDC purchase on Polygon, and whose payment is verified on-chain.`}
          />
          <FAQ
            q="How is tracking handled?"
            a={`We use GoAffPro with a ${COOKIE_DAYS}-day cookie. As long as the buyer purchases within ${COOKIE_DAYS} days of clicking your link, the sale is attributed to you.`}
          />
          <FAQ
            q="Can I run paid ads?"
            a="Yes — paid ads are allowed except direct bidding on '1mg.live' brand keywords. Reach out if you're unsure."
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-3xl mx-auto px-4 py-20 text-center border-t border-white/5">
        <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">Ready to start earning?</h2>
        <p className="text-white/60 mb-8 text-lg">
          Apply now — most affiliates are approved within 48 hours.
        </p>
        <Button
          size="lg"
          onClick={handleApply}
          className="gap-2 text-base px-8 bg-blue-600 hover:bg-blue-500 text-white border-0"
        >
          Join via GoAffPro <ArrowRight className="h-4 w-4" />
        </Button>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center text-sm text-white/50">
          <p>
            © {new Date().getFullYear()} 1mg.live ·{" "}
            <button onClick={() => navigate("/terms")} className="hover:text-white/80 underline">Terms</button> ·{" "}
            <button onClick={() => navigate("/privacy")} className="hover:text-white/80 underline">Privacy</button>
          </p>
        </div>
      </footer>
    </div>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-center">
      <div className="text-blue-400 mx-auto w-fit mb-2">{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-white/50 uppercase tracking-wide mt-1">{label}</div>
    </div>
  );
}

function Step({ num, title, body }: { num: number; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
      <div className="w-8 h-8 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold mb-4 border border-blue-500/20">
        {num}
      </div>
      <h3 className="font-semibold text-lg mb-2 text-white">{title}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{body}</p>
    </div>
  );
}

function Audience({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <div className="text-blue-400 mb-3">{icon}</div>
      <h3 className="font-semibold mb-1 text-white">{title}</h3>
      <p className="text-xs text-white/60">{body}</p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-3 border-b border-white/5 last:border-0">
      <div className="flex items-center gap-2 text-sm font-medium text-white/60">
        <CheckCircle2 className="h-4 w-4 text-blue-400" />
        {label}
      </div>
      <div className="text-sm sm:text-right text-white/90">{value}</div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="font-semibold mb-2 text-white">{q}</h3>
      <p className="text-sm text-white/60 leading-relaxed">{a}</p>
    </div>
  );
}

function KitRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-blue-400 mb-1">{label}</div>
      <div className="text-sm text-white/80 leading-relaxed">{value}</div>
    </div>
  );
}

function CopyBlock({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — non-blocking */
    }
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-white">{title}</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleCopy}
          className="gap-1.5 h-8 bg-transparent border-white/10 text-white hover:bg-white/5 hover:text-white"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="text-sm text-white/70 whitespace-pre-wrap font-sans leading-relaxed flex-1">
        {text}
      </pre>
    </div>
  );
}
