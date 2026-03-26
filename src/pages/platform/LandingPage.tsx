import { useEffect, useRef, useState } from "react";
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
  Percent,
  Headphones,
  Fuel,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";

import footballImg from "@/assets/football-1mg.png";
import basketballImg from "@/assets/basketball-1mg.png";
import soccerballImg from "@/assets/soccerball-1mg.png";
import boxingImg from "@/assets/boxinggloves-1mg.png";
import hockeyImg from "@/assets/hockeystick-1mg.png";
import mmaImg from "@/assets/mmagloves-1mg.png";
import golfImg from "@/assets/golfclub-1mg.png";

/* ── Floating Sport Icons ── */
const FLOAT_ICONS = [
  { src: footballImg, alt: "Football", size: 48, x: 8, y: 20, delay: 0, duration: 18 },
  { src: basketballImg, alt: "Basketball", size: 44, x: 85, y: 15, delay: 2, duration: 20 },
  { src: soccerballImg, alt: "Soccer", size: 52, x: 15, y: 70, delay: 4, duration: 16 },
  { src: boxingImg, alt: "Boxing", size: 46, x: 90, y: 65, delay: 1, duration: 22 },
  { src: hockeyImg, alt: "Hockey", size: 40, x: 75, y: 40, delay: 3, duration: 19 },
  { src: mmaImg, alt: "MMA", size: 42, x: 5, y: 45, delay: 5, duration: 17 },
  { src: golfImg, alt: "Golf", size: 38, x: 50, y: 10, delay: 2.5, duration: 21 },
];

function FloatingIcons() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {FLOAT_ICONS.map((ic, i) => (
        <img
          key={i}
          src={ic.src}
          alt={ic.alt}
          className="absolute opacity-[0.18] select-none object-contain"
          style={{
            left: `${ic.x}%`,
            top: `${ic.y}%`,
            width: ic.size,
            height: ic.size,
            animation: `floatOrbit ${ic.duration}s ease-in-out ${ic.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Animated Counter ── */
function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting && !started) setStarted(true); },
      { threshold: 0.3 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [started]);

  useEffect(() => {
    if (!started) return;
    const step = Math.max(1, Math.floor(target / 40));
    const id = setInterval(() => {
      setCount((c) => {
        const next = c + step;
        if (next >= target) { clearInterval(id); return target; }
        return next;
      });
    }, 30);
    return () => clearInterval(id);
  }, [started, target]);

  return <div ref={ref} className="text-3xl sm:text-4xl font-bold text-blue-400 mb-2">{count}{suffix}</div>;
}

/* ── Phone Mockup ── */
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[220px] sm:w-[260px] perspective-[1200px]">
      <div
        className="relative rounded-[2rem] border-2 border-white/10 bg-[#0d1117] p-3 shadow-2xl shadow-blue-500/10"
        style={{ transform: "rotateY(-8deg) rotateX(4deg)" }}
      >
        {/* Notch */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full" />
        {/* Screen */}
        <div className="rounded-[1.4rem] bg-gradient-to-b from-[#0a0f1a] to-[#06080f] p-4 pt-8 min-h-[340px] sm:min-h-[400px] overflow-hidden">
          <div className="text-center mb-4">
            <div className="text-xs text-blue-400 font-bold mb-1">fightnight.1mg.live</div>
            <div className="text-[10px] text-white/40">Your branded app</div>
          </div>
          {/* Mini prediction cards */}
          {[
            { a: "Lakers", b: "Celtics", odds: "52% / 48%" },
            { a: "Canelo", b: "Benavidez", odds: "61% / 39%" },
          ].map((m) => (
            <div key={m.a} className="bg-white/[0.04] rounded-xl p-3 mb-2 border border-white/5">
              <div className="flex justify-between text-[10px] text-white/70 mb-1">
                <span>{m.a}</span><span>{m.b}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: "55%" }} />
              </div>
              <div className="text-[9px] text-white/30 mt-1 text-center">{m.odds}</div>
            </div>
          ))}
          <div className="mt-3 bg-blue-600/20 border border-blue-500/20 rounded-lg p-2 text-center">
            <span className="text-[10px] text-blue-300 font-medium">Place Prediction →</span>
          </div>
        </div>
      </div>
      {/* Glow */}
      <div className="absolute -inset-4 bg-blue-500/5 rounded-[3rem] blur-2xl -z-10" />
    </div>
  );
}

/* ── Scrolling Sports Ticker ── */
const TICKER_SPORTS = [
  "🏈 NFL", "🏀 NBA", "🏒 NHL", "⚽ Soccer", "🥊 Boxing", "🥋 MMA",
  "⚾ MLB", "🎾 Tennis", "🏎️ F1", "🏏 Cricket", "⛳ Golf", "🏆 UFC",
  "🏈 NFL", "🏀 NBA", "🏒 NHL", "⚽ Soccer", "🥊 Boxing", "🥋 MMA",
];

function SportsTicker() {
  return (
    <div className="overflow-hidden py-6 border-y border-white/5 bg-white/[0.01]">
      <div className="flex animate-ticker whitespace-nowrap gap-8">
        {TICKER_SPORTS.map((s, i) => (
          <span key={i} className="text-white/30 text-sm font-medium shrink-0">{s}</span>
        ))}
      </div>
    </div>
  );
}

/* ── Data ── */
const FEATURES = [
  { icon: Globe, title: "Your Subdomain", desc: "yourname.1mg.live — your brand, your audience" },
  { icon: Zap, title: "Instant Setup", desc: "Go live in minutes with full branding control" },
  { icon: Shield, title: "Built-in Liquidity", desc: "Powered by global prediction markets — no liquidity sourcing needed" },
  { icon: DollarSign, title: "Revenue Share", desc: "Set your own fee % on every prediction — added on top of the 1% platform fee" },
  { icon: Percent, title: "Only 1% Platform Fee", desc: "We cover gas fees, 24/7 support, backend infrastructure, and all sports money flow" },
  { icon: Trophy, title: "Custom Events", desc: "Create events for local teams, home games — share with friends & family" },
];

const STEPS = [
  { num: "01", title: "Buy Access", desc: "One-time $2,400 USDC payment on Polygon to unlock the platform" },
  { num: "02", title: "Brand It", desc: "Choose your name, colors, logo, and subdomain" },
  { num: "03", title: "Launch", desc: "Your predictions app is live — start earning from day one" },
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

  const handleBuyNow = () => {
    if (authenticated) {
      navigate("/purchase");
    } else {
      login();
    }
  };

  const handleCreateAccount = () => {
    if (authenticated) {
      navigate("/purchase");
    } else {
      login();
    }
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes floatOrbit {
          0% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(12px, -18px) scale(1.1); }
          100% { transform: translate(-8px, 10px) scale(0.95); }
        }
        @keyframes ticker {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-ticker { animation: ticker 30s linear infinite; }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(59,130,246,0.3), 0 0 60px rgba(59,130,246,0.1); }
          50% { box-shadow: 0 0 30px rgba(59,130,246,0.5), 0 0 80px rgba(59,130,246,0.2); }
        }
        .btn-glow { animation: pulseGlow 3s ease-in-out infinite; }
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-mesh {
          background: linear-gradient(-45deg, #06080f, #0a1628, #0f1a2e, #060d18, #0a0f1a);
          background-size: 400% 400%;
          animation: gradientShift 20s ease infinite;
        }
      `}</style>

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
      <section className="pt-28 pb-16 sm:pt-32 sm:pb-20 px-4 sm:px-6 relative overflow-hidden gradient-mesh">
        <FloatingIcons />
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/8 via-transparent to-[#06080f]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left — Text */}
            <div className="text-center lg:text-left">
              <div className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-full px-4 py-1.5 mb-6 text-sm text-blue-300">
                <Star size={14} /> White-Label Predictions Platform
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
                Your Brand.{" "}
                <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  Your Predictions App.
                </span>
              </h1>
              <p className="text-lg text-white/50 max-w-xl mb-4 leading-relaxed">
                Launch your own branded predictions app. Create events for local teams,
                home games, or major sports. Share with friends &amp; family — winners share the pool.
              </p>
              <p className="text-sm text-white/30 mb-8">
                Only 1% platform fee — we cover gas, support, backend &amp; money flow.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <Button
                  onClick={handleBuyNow}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-8 h-14 border-0 btn-glow"
                >
                  BUY NOW — $2,400 USDC <ArrowRight size={20} />
                </Button>
                <Button
                  onClick={handleCreateAccount}
                  variant="outline"
                  size="lg"
                  className="border-white/10 text-white hover:bg-white/5 text-lg px-8 h-14"
                >
                  CREATE ACCOUNT
                </Button>
              </div>
            </div>
            {/* Right — Phone */}
            <div className="hidden lg:block">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Sports Ticker ── */}
      <SportsTicker />

      {/* ── Use Case Section ── */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Build Your Daily Income</h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            Create events with your local teams and share with friends and family.
            Everyone predicts, winners share the pool. It's the best app for predictions —
            build your own daily income stream.
          </p>
          {/* Subdomain Preview */}
          <div className="inline-block bg-white/[0.03] border border-white/10 rounded-xl p-4 px-6">
            <div className="flex items-center gap-2 text-sm mb-2">
              <div className="flex gap-1">
                <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
              </div>
              <div className="bg-white/5 rounded px-3 py-0.5 text-white/40 font-mono text-xs">
                fightnight.1mg.live
              </div>
            </div>
            <p className="text-white/30 text-xs">Your brand. Your rules. Your revenue.</p>
          </div>
        </div>
      </section>

      {/* ── What Is This? ── */}
      <section className="py-16 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">What You Get</h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto">
              We handle the technology. You build the brand.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:border-blue-500/30 transition-colors group"
              >
                <f.icon size={24} className="text-blue-400 mb-4 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Built-in Liquidity ── */}
      <section className="py-16 px-4 sm:px-6 bg-gradient-to-b from-blue-600/5 to-transparent">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Built-in Liquidity</h2>
          <p className="text-white/50 text-lg max-w-2xl mx-auto mb-10">
            Every prediction on your platform is backed by real market liquidity.
            No need to source your own.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
              <AnimatedCounter target={1} suffix="B+" />
              <div className="text-white/50 text-sm">Market Liquidity</div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
              <div className="text-3xl sm:text-4xl font-bold text-blue-400 mb-2">24/7</div>
              <div className="text-white/50 text-sm">Always Available</div>
            </div>
            <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
              <AnimatedCounter target={100} suffix="+" />
              <div className="text-white/50 text-sm">Sports Events</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Sports Ticker (repeat) ── */}
      <SportsTicker />

      {/* ── How It Works ── */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-14">
            How It Works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <div key={s.num} className="text-center">
                <div className="text-5xl font-bold text-blue-500/20 mb-4">{s.num}</div>
                <h3 className="text-xl font-semibold mb-2">{s.title}</h3>
                <p className="text-white/50 text-sm">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Fee Transparency ── */}
      <section className="py-16 px-4 sm:px-6 border-t border-white/5">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-10">
            Transparent Fees
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-center">
              <Fuel size={24} className="text-blue-400 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Gas Fees Covered</h3>
              <p className="text-white/40 text-xs">We pay all transaction fees</p>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-center">
              <Headphones size={24} className="text-blue-400 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">24/7 Support</h3>
              <p className="text-white/40 text-xs">Full backend &amp; user support</p>
            </div>
            <div className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 text-center">
              <Shield size={24} className="text-blue-400 mx-auto mb-3" />
              <h3 className="font-semibold mb-1">Money Flow</h3>
              <p className="text-white/40 text-xs">We handle all sports money flow</p>
            </div>
          </div>
          <p className="text-center text-white/30 text-sm mt-6">
            Only 1% platform fee on every prediction — your fee is added on top.
          </p>
        </div>
      </section>

      {/* ── What You Get List ── */}
      <section className="py-16 px-4 sm:px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Everything Included
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              "Your own subdomain (yourname.1mg.live)",
              "Full branding control (logo, colors, theme)",
              "Operator dashboard to manage events",
              "Set your own fee percentage",
              "Platform events auto-included",
              "Create custom local events & home games",
              "Built-in wallet & payments",
              "Pool-based predictions — winners share the pool",
              "Share events with friends & family",
              "Build your daily income stream",
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-white/70">
                <ChevronRight size={16} className="text-blue-400 mt-1 shrink-0" />
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
          <p className="text-white/50 text-lg mb-3">
            Join the next generation of prediction platforms.
          </p>
          <p className="text-white/30 text-sm mb-8">
            One-time $2,400 USDC • Only 1% platform fee on predictions
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleBuyNow}
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-8 h-14 border-0 btn-glow"
            >
              BUY NOW — $2,400 USDC <ArrowRight size={20} />
            </Button>
            <Button
              onClick={handleCreateAccount}
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
