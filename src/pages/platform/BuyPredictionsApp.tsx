import { ArrowRight, Check, ChevronRight, Globe, Shield, Zap, DollarSign, Users, Trophy, Smartphone, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import SeoMeta from "@/components/seo/SeoMeta";
import JsonLd from "@/components/seo/JsonLd";

const FEATURES = [
  "Your own branded predictions app",
  "Custom web address (yourname.1mg.live)",
  "Built-in digital payments (USDC)",
  "Built-in liquidity — money flows from day one",
  "Access to major sports markets worldwide",
  "Add your own custom events and markets",
  "Mobile & desktop optimized",
  "Set your own fee percentage on every trade",
  "Real-time odds and market data",
  "Automated settlement and payouts",
];

const WHO_ITS_FOR = [
  { icon: Users, title: "Sports Influencers", desc: "Turn your audience into a revenue stream with your own branded predictions platform." },
  { icon: Globe, title: "Community Leaders", desc: "Give your community a place to predict outcomes on events they care about." },
  { icon: Trophy, title: "Sports Brands", desc: "Add a predictions layer to your existing sports brand or media company." },
  { icon: BarChart3, title: "Entrepreneurs", desc: "Start a digital predictions business with zero infrastructure headaches." },
];

const SPORTS = [
  "NBA Basketball", "NFL Football", "Soccer / Premier League", "MMA / UFC",
  "Boxing", "MLB Baseball", "NHL Hockey", "Tennis", "Cricket", "Custom Events",
];

const FAQS = [
  { q: "What do I get when I buy a predictions app?", a: "You get your own fully branded predictions platform at yourname.1mg.live with built-in payments, liquidity, sports markets, and a custom fee structure. Everything is ready to go — no coding or infrastructure needed." },
  { q: "How much does it cost?", a: "The setup fee is a one-time payment of $2,400 USDC. There are no monthly fees — you earn revenue from the fees you set on every prediction made on your platform." },
  { q: "Do I need technical skills?", a: "No. Your app is fully managed. You choose your brand name, set your fee percentage, and start sharing with your audience. We handle all the technology, payments, and liquidity." },
  { q: "What is built-in liquidity?", a: "Your app is never empty. We provide active prediction markets with real money already flowing, so your users can start trading immediately without waiting for the platform to grow." },
  { q: "How do I earn money?", a: "You set a fee percentage on every prediction made through your app. Every time someone places a prediction, you automatically earn your cut." },
  { q: "Can I add my own events?", a: "Yes. In addition to the global sports markets we provide, you can create your own custom events — local fights, races, games, or anything your audience wants to predict on." },
  { q: "Is this legal?", a: "Yes. Prediction markets operate legally in most jurisdictions. They are recognized as information markets and are not classified as gambling. See our detailed guide on why prediction markets are legal." },
];

const articleJsonLd = {
  "@context": "https://schema.org",
  "@type": "Article",
  headline: "Buy Your Own Predictions App — Launch a Branded Sports Predictions Business",
  description: "Buy a white-label predictions app with built-in payments and liquidity. Start earning from sports predictions in minutes.",
  author: { "@type": "Organization", name: "1MG.live" },
  publisher: { "@type": "Organization", name: "1MG.live", url: "https://1mg.live" },
  datePublished: "2026-03-01",
  dateModified: "2026-03-29",
};

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function BuyPredictionsApp() {
  const navigate = useNavigate();
  const { ready, authenticated, login } = usePrivy();

  const handleCTA = () => {
    if (authenticated) navigate("/purchase");
    else login();
  };

  return (
    <div className="min-h-screen bg-[#04060c] text-white">
      <SeoMeta
        title="Buy a Predictions App | Start Your Own Sports Predictions Business"
        description="Buy your own branded predictions app with built-in payments and liquidity. Launch a sports predictions business in minutes — no coding required. One-time $2,400 USDC setup."
      />
      <JsonLd data={articleJsonLd} />
      <JsonLd data={faqJsonLd} />

      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-[#04060c]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <a href="/" className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">1MG</span><span className="text-white/50">.live</span>
          </a>
          <Button onClick={handleCTA} size="sm" className="bg-blue-600 hover:bg-blue-500 text-white border-0">
            Buy Now
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-28 pb-16 sm:pt-36 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-blue-400 font-semibold text-sm uppercase tracking-widest mb-4">White-Label Predictions Platform</p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6">
            Buy Your Own{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Predictions App</span>
          </h1>
          <p className="text-lg sm:text-xl text-white/50 max-w-2xl mx-auto mb-10 leading-relaxed">
            Launch a fully branded sports predictions business with built-in payments, liquidity, and real money flowing from day one. No coding. No infrastructure. Just your brand.
          </p>
          <Button onClick={handleCTA} size="lg" className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-10 h-16 border-0 rounded-xl font-bold">
            BUY NOW — $2,400 USDC <ArrowRight size={20} className="ml-2" />
          </Button>
          <p className="text-white/25 text-sm mt-4">One-time setup fee · No monthly costs · Start earning immediately</p>
        </div>
      </section>

      {/* What You Get */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">What You Get</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-3 text-white/70">
                <Check size={18} className="text-blue-400 mt-0.5 shrink-0" />
                <span className="text-sm leading-relaxed">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">How It Works</h2>
          <p className="text-white/40 text-center mb-14 max-w-lg mx-auto">Four steps to your own predictions business</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: "01", title: "Buy Your App", desc: "Pay the one-time $2,400 USDC setup fee to secure your platform." },
              { num: "02", title: "Brand It", desc: "Choose your name, set your fee percentage, and customize your look." },
              { num: "03", title: "Go Live", desc: "Your app launches at yourname.1mg.live with markets already active." },
              { num: "04", title: "Earn", desc: "Earn your fee on every prediction. Share with your audience and grow." },
            ].map((s) => (
              <div key={s.num} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 to-cyan-400" />
                <div className="text-4xl font-bold text-white/[0.06] mb-3">{s.num}</div>
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who It's For */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Who It's For</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {WHO_ITS_FOR.map((w) => (
              <div key={w.title} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6">
                <w.icon size={28} className="text-blue-400 mb-3" />
                <h3 className="text-lg font-semibold mb-2">{w.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sports Covered */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Sports &amp; Events Covered</h2>
          <p className="text-white/40 mb-10 max-w-lg mx-auto">Access global markets plus create your own custom events</p>
          <div className="flex flex-wrap gap-3 justify-center max-w-2xl mx-auto">
            {SPORTS.map((s) => (
              <span key={s} className="bg-white/[0.04] border border-white/10 rounded-full px-4 py-2 text-sm text-white/60">{s}</span>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-xl mx-auto">
          <div className="bg-gradient-to-br from-blue-600/[0.08] to-cyan-600/[0.04] border border-blue-500/15 rounded-3xl p-10 text-center">
            <h2 className="text-3xl font-bold mb-2">Simple Pricing</h2>
            <p className="text-white/40 mb-8">One payment. No subscriptions. No hidden fees.</p>
            <div className="text-5xl font-extrabold text-blue-400 mb-2">$2,400</div>
            <div className="text-white/40 text-sm mb-8">USDC · One-time setup fee</div>
            <ul className="text-left space-y-3 mb-8 max-w-xs mx-auto">
              {["Fully branded app", "Built-in liquidity", "Digital payments included", "Custom fee structure", "Lifetime access"].map((i) => (
                <li key={i} className="flex items-center gap-2 text-white/60 text-sm">
                  <Check size={16} className="text-blue-400 shrink-0" /> {i}
                </li>
              ))}
            </ul>
            <Button onClick={handleCTA} size="lg" className="w-full bg-blue-600 hover:bg-blue-500 text-white text-lg h-14 border-0 rounded-xl font-bold">
              Buy Now <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {FAQS.map((f) => (
              <div key={f.q} className="bg-white/[0.03] border border-white/5 rounded-xl p-6">
                <h3 className="font-semibold text-white/90 mb-2">{f.q}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Ready to Launch Your Predictions Business?</h2>
          <p className="text-white/40 text-lg mb-10">Buy your app today and start earning from sports predictions.</p>
          <Button onClick={handleCTA} size="lg" className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-10 h-16 border-0 rounded-xl font-bold">
            BUY NOW — $2,400 USDC <ArrowRight size={20} className="ml-2" />
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-white/25">© {new Date().getFullYear()} 1MG.live — All rights reserved</div>
          <div className="flex flex-wrap gap-6 text-sm text-white/35">
            <a href="/" className="hover:text-white/60 transition-colors">Home</a>
            <a href="/help/are-prediction-markets-legal" className="hover:text-white/60 transition-colors">Why Predictions Are Legal</a>
            <a href="/terms-of-service" className="hover:text-white/60 transition-colors">Terms</a>
            <a href="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
