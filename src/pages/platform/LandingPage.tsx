import {
  ArrowRight,
  Globe,
  Zap,
  Shield,
  DollarSign,
  Users,
  Trophy,
  Star,
  ChevronRight,
  LogOut,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

const SPORTS = [
  "NFL", "NBA", "NHL", "Soccer", "MMA", "Boxing",
  "MLB", "Tennis", "Golf", "Cricket", "F1", "UFC",
];

const FEATURES = [
  { icon: Globe, title: "Your Subdomain", desc: "yourname.1mg.live — your brand, your audience" },
  { icon: Zap, title: "Instant Setup", desc: "Go live in minutes with full branding control" },
  { icon: Shield, title: "Built-in Liquidity", desc: "Powered by global prediction markets — no liquidity sourcing needed" },
  { icon: DollarSign, title: "Revenue Share", desc: "Set your own fee % on every prediction" },
  { icon: Users, title: "Platform Events", desc: "Major sports events automatically available" },
  { icon: Trophy, title: "Custom Events", desc: "Add your own local events and fights" },
];

const STEPS = [
  { num: "01", title: "Buy Access", desc: "One-time $2,400 USDC payment to unlock the platform" },
  { num: "02", title: "Brand It", desc: "Choose your name, colors, logo, and subdomain" },
  { num: "03", title: "Launch", desc: "Your predictions app is live — start earning" },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { ready, authenticated, login, logout, user } = usePrivy();

  const evmWallet = user?.linkedAccounts?.find(
    (a: any) => a.type === "wallet" && a.chainType === "ethereum"
  ) as any;
  const walletAddress = evmWallet?.address;
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : null;

  const handleGetStarted = () => {
    if (authenticated) {
      navigate("/onboarding");
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 bg-[#06080f]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">1MG</span>
            <span className="text-white/60">.live</span>
          </div>
          <div className="flex items-center gap-3">
            {ready && authenticated && shortAddress ? (
              <>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/5"
                >
                  Dashboard
                </Button>
                <div className="flex items-center gap-1.5 text-sm text-white/70 bg-white/[0.05] px-3 py-1.5 rounded-lg border border-white/10">
                  <Wallet size={14} className="text-blue-400" />
                  <span className="font-mono text-xs">{shortAddress}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={logout}
                  className="h-8 w-8 text-white/40 hover:text-red-400"
                  title="Sign Out"
                >
                  <LogOut size={16} />
                </Button>
              </>
            ) : ready ? (
              <Button
                onClick={login}
                size="sm"
                className="bg-blue-600 hover:bg-blue-500 text-white border-0"
              >
                Sign In
              </Button>
            ) : null}
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="pt-32 pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-transparent to-transparent" />
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-8 text-sm text-blue-300">
            <Star size={14} /> White-Label Predictions Platform
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-6">
            Your Brand.{" "}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
              Your Digital Predictions App.
            </span>
          </h1>
          <p className="text-lg sm:text-xl text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed">
            Launch your own branded predictions app with digital payments,
            built-in liquidity, and major sports ready to go.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-8 h-14 border-0 shadow-lg shadow-blue-600/20"
            >
              BUY NOW — $2,400 USDC <ArrowRight size={20} />
            </Button>
            <Button
              onClick={handleGetStarted}
              variant="outline"
              size="lg"
              className="border-white/10 text-white hover:bg-white/5 text-lg px-8 h-14"
            >
              CREATE ACCOUNT
            </Button>
          </div>
        </div>
      </section>

      {/* ── What Is This? ── */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What Is This?</h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              We handle the technology. You build the brand. Get your own
              predictions app with your logo, your colors, and your audience —
              powered by our infrastructure.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:border-blue-500/30 transition-colors"
              >
                <f.icon size={24} className="text-blue-400 mb-4" />
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built-in Liquidity ── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-blue-600/5 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built-in Liquidity</h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-8">
            Every prediction on your platform is backed by real market
            liquidity. No need to source your own — we connect directly to
            global prediction markets.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { value: "$1B+", label: "Market Liquidity" },
              { value: "24/7", label: "Always Available" },
              { value: "100+", label: "Sports Events" },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white/[0.03] rounded-xl p-6 border border-white/5"
              >
                <div className="text-3xl font-bold text-blue-400 mb-2">
                  {s.value}
                </div>
                <div className="text-white/50 text-sm">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Major Sports ── */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Major Sports Ready
          </h2>
          <p className="text-white/50 text-lg mb-10">
            All major sports events are automatically available in your app.
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            {SPORTS.map((s) => (
              <span
                key={s}
                className="bg-white/[0.05] border border-white/10 rounded-full px-5 py-2 text-sm font-medium hover:border-blue-500/30 transition-colors"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works ── */}
      <section className="py-20 px-4 sm:px-6 bg-gradient-to-b from-transparent via-blue-600/5 to-transparent">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-16">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.num} className="text-center">
                <div className="text-5xl font-bold text-blue-500/20 mb-4">
                  {s.num}
                </div>
                <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What You Get ── */}
      <section className="py-20 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            What You Get
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Your own subdomain (yourname.1mg.live)",
              "Full branding control (logo, colors, theme)",
              "Operator dashboard to manage events",
              "Set your own fee percentage",
              "Platform events auto-included",
              "Create custom local events",
              "Built-in wallet & payments",
              "Real-time market data",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-white/70">
                <ChevronRight
                  size={16}
                  className="text-blue-400 mt-1 shrink-0"
                />
                <span className="text-sm">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="py-20 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-blue-600/10 to-cyan-600/5 border border-blue-500/20 rounded-3xl p-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ready to Launch?
          </h2>
          <p className="text-white/50 text-lg mb-8">
            Join the next generation of prediction platforms.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleGetStarted}
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-8 h-14 border-0"
            >
              BUY NOW — $2,400 USDC <ArrowRight size={20} />
            </Button>
            <Button
              onClick={handleGetStarted}
              variant="outline"
              size="lg"
              className="border-white/10 text-white hover:bg-white/5 text-lg px-8 h-14"
            >
              CREATE ACCOUNT
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-white/30">
            © {new Date().getFullYear()} 1MG.live — All rights reserved
          </div>
          <div className="flex flex-wrap gap-6 text-sm text-white/40">
            <a href="#" className="hover:text-white/60 transition-colors">Contact</a>
            <a href="#" className="hover:text-white/60 transition-colors">How it works</a>
            <a href="#" className="hover:text-white/60 transition-colors">Legal &amp; Availability</a>
            <a href="/terms-of-service" className="hover:text-white/60 transition-colors">Terms</a>
            <a href="/privacy-policy" className="hover:text-white/60 transition-colors">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
