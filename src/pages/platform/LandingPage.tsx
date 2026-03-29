import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Globe,
  Zap,
  Shield,
  DollarSign,
  Users,
  Trophy,
  ChevronRight,
  LogOut,
  Wallet,
  Smartphone,
  Calendar,
  Share2,
  Percent,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import { useSeoMeta } from "@/components/seo/SeoMeta";

import footballImg from "@/assets/football-1mg.png";
import basketballImg from "@/assets/basketball-1mg.png";
import soccerballImg from "@/assets/soccerball-1mg.png";
import boxingImg from "@/assets/boxinggloves-1mg.png";
import btcImg from "@/assets/btclogo-1mg.png";

/* ── Floating Background Icons ── */
const FLOAT_ICONS = [
  { src: soccerballImg, size: 60, x: 5, y: 15, delay: 0, duration: 22 },
  { src: basketballImg, size: 50, x: 88, y: 10, delay: 2, duration: 26 },
  { src: footballImg, size: 55, x: 12, y: 55, delay: 1, duration: 20 },
  { src: boxingImg, size: 48, x: 92, y: 50, delay: 3, duration: 24 },
  { src: btcImg, size: 64, x: 78, y: 25, delay: 1.5, duration: 28 },
  { src: soccerballImg, size: 36, x: 50, y: 8, delay: 4, duration: 18 },
  { src: btcImg, size: 42, x: 3, y: 80, delay: 2.5, duration: 25 },
  { src: basketballImg, size: 34, x: 70, y: 70, delay: 0.5, duration: 21 },
  { src: boxingImg, size: 30, x: 35, y: 85, delay: 3.5, duration: 23 },
  { src: footballImg, size: 38, x: 60, y: 45, delay: 5, duration: 19 },
];

function FloatingIcons() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden>
      {FLOAT_ICONS.map((ic, i) => (
        <img
          key={i}
          src={ic.src}
          alt=""
          className="absolute select-none object-contain"
          style={{
            left: `${ic.x}%`,
            top: `${ic.y}%`,
            width: ic.size,
            height: ic.size,
            opacity: 0.12,
            filter: "blur(1px)",
            animation: `floatOrbit ${ic.duration}s ease-in-out ${ic.delay}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Phone Mockup ── */
function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[240px] sm:w-[280px]">
      <div
        className="relative rounded-[2.2rem] border-2 border-white/10 bg-[#0d1117] p-3 shadow-2xl"
        style={{
          boxShadow: "0 0 60px rgba(59,130,246,0.15), 0 20px 40px rgba(0,0,0,0.4)",
          transform: "rotateY(-6deg) rotateX(3deg)",
        }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full" />
        <div className="rounded-[1.6rem] bg-gradient-to-b from-[#0a0f1a] to-[#060810] p-4 pt-8 min-h-[360px] sm:min-h-[420px] overflow-hidden">
          <div className="text-center mb-5">
            <div className="text-xs text-blue-400 font-bold mb-1">yourname.1mg.live</div>
            <div className="text-[10px] text-white/30">Your branded app</div>
          </div>
          {[
            { a: "Lakers", b: "Celtics", pct: "52%" },
            { a: "Canelo", b: "Benavidez", pct: "61%" },
            { a: "Chiefs", b: "Eagles", pct: "48%" },
          ].map((m) => (
            <div key={m.a} className="bg-white/[0.04] rounded-xl p-3 mb-2.5 border border-white/5">
              <div className="flex justify-between text-[10px] text-white/60 mb-1.5">
                <span>{m.a}</span><span>{m.b}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full" style={{ width: m.pct }} />
              </div>
              <div className="text-[9px] text-white/25 mt-1 text-center">{m.pct} market probability</div>
            </div>
          ))}
          <div className="mt-3 bg-blue-600/20 border border-blue-500/20 rounded-lg p-2.5 text-center">
            <span className="text-[10px] text-blue-300 font-semibold">Place Prediction →</span>
          </div>
        </div>
      </div>
      <div className="absolute -inset-6 bg-blue-500/8 rounded-[3rem] blur-3xl -z-10" />
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

  return <div ref={ref} className="text-4xl sm:text-5xl font-bold text-blue-400 mb-2">{count}{suffix}</div>;
}

export default function LandingPage() {
  const { t } = useTranslation();
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
    if (authenticated) navigate("/purchase");
    else login();
  };

  const handleCreateAccount = () => {
    if (authenticated) navigate("/purchase");
    else login();
  };

  const STEPS = [
    {
      icon: DollarSign, num: "01",
      title: t("platform.howItWorks.step1Title"),
      desc: t("platform.howItWorks.step1Desc"),
      accent: "from-blue-500 to-cyan-400",
    },
    {
      icon: Calendar, num: "02",
      title: t("platform.howItWorks.step2Title"),
      desc: t("platform.howItWorks.step2Desc"),
      sub: t("platform.howItWorks.step2Sub"),
      accent: "from-cyan-400 to-emerald-400",
    },
    {
      icon: Share2, num: "03",
      title: t("platform.howItWorks.step3Title"),
      desc: t("platform.howItWorks.step3Desc"),
      accent: "from-emerald-400 to-yellow-400",
    },
    {
      icon: Percent, num: "04",
      title: t("platform.howItWorks.step4Title"),
      desc: t("platform.howItWorks.step4Desc"),
      accent: "from-yellow-400 to-orange-400",
    },
  ];

  const WHAT_YOU_GET = [
    t("platform.whatYouGet.item1"),
    t("platform.whatYouGet.item2"),
    t("platform.whatYouGet.item3"),
    t("platform.whatYouGet.item4"),
    t("platform.whatYouGet.item5"),
    t("platform.whatYouGet.item6"),
    t("platform.whatYouGet.item7"),
    t("platform.whatYouGet.item8"),
  ];

  return (
    <div className="min-h-screen bg-[#04060c] text-white relative">
      {/* ── CSS ── */}
      <style>{`
        @keyframes floatOrbit {
          0%   { transform: translate(0, 0) scale(1) rotate(0deg); }
          50%  { transform: translate(15px, -20px) scale(1.08) rotate(8deg); }
          100% { transform: translate(-10px, 12px) scale(0.94) rotate(-4deg); }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(59,130,246,0.4), 0 0 60px rgba(59,130,246,0.15); }
          50%      { box-shadow: 0 0 35px rgba(59,130,246,0.6), 0 0 90px rgba(59,130,246,0.25); }
        }
        .btn-glow { animation: pulseGlow 2.5s ease-in-out infinite; }
        @keyframes gradientMesh {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .gradient-mesh {
          background: linear-gradient(-45deg, #04060c, #0a1a30, #0c1425, #060d18, #04060c);
          background-size: 400% 400%;
          animation: gradientMesh 25s ease infinite;
        }
      `}</style>

      <FloatingIcons />

      {/* ── Navbar ── */}
      <nav className="fixed top-0 w-full z-50 bg-[#04060c]/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight">
            <span className="text-blue-400">1MG</span>
            <span className="text-white/50">.live</span>
          </div>
          <div className="flex items-center gap-3">
            <PlatformLanguageSwitcher />
            {ready && authenticated && shortAddress ? (
              <>
                <Button
                  onClick={() => navigate("/dashboard")}
                  variant="ghost"
                  size="sm"
                  className="text-white/70 hover:text-white hover:bg-white/5"
                >
                  {t("platform.nav.dashboard")}
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
                {t("platform.nav.signIn")}
              </Button>
            ) : null}
          </div>
        </div>
      </nav>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="pt-28 pb-20 sm:pt-36 sm:pb-28 px-4 sm:px-6 relative overflow-hidden gradient-mesh">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/[0.06] via-transparent to-[#04060c]" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">
            {/* Left */}
            <div className="text-center lg:text-left">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.08] mb-6">
                {t("platform.hero.title")}{" "}
                <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">
                  {t("platform.hero.titleHighlight")}
                </span>
              </h1>
              <p className="text-lg sm:text-xl text-white/50 max-w-xl mb-3 leading-relaxed mx-auto lg:mx-0">
                {t("platform.hero.subtitle")}
              </p>
              <p className="text-base text-white/40 max-w-lg mb-10 mx-auto lg:mx-0">
                {t("platform.hero.subtitleSmall")}
              </p>

              {/* CTA */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-8">
                <Button
                  onClick={handleBuyNow}
                  size="lg"
                  className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-10 h-16 border-0 btn-glow rounded-xl font-bold"
                >
                  {t("platform.cta.buyNow")} <ArrowRight size={20} className="ml-2" />
                </Button>
                <Button
                  onClick={handleCreateAccount}
                  variant="outline"
                  size="lg"
                  className="border-white/10 text-white hover:bg-white/5 text-lg px-10 h-16 rounded-xl font-bold"
                >
                  {t("platform.cta.createAccount")}
                </Button>
              </div>

              {/* Trust */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center lg:justify-start text-sm text-white/30">
                <span className="flex items-center gap-1.5"><Shield size={14} className="text-blue-400/60" /> {t("platform.trust.weHandlePayments")}</span>
                <span className="flex items-center gap-1.5"><Zap size={14} className="text-blue-400/60" /> {t("platform.trust.builtInLiquidity")}</span>
                <span className="flex items-center gap-1.5"><Globe size={14} className="text-blue-400/60" /> {t("platform.trust.fullBackend")}</span>
              </div>
              <p className="text-xs text-white/20 mt-3 text-center lg:text-left">{t("platform.trust.youFocus")}</p>
            </div>

            {/* Right — Phone */}
            <div className="hidden lg:flex justify-center">
              <PhoneMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS — 4 STEPS ═══════════════ */}
      <section className="py-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">{t("platform.howItWorks.title")}</h2>
          <p className="text-white/40 text-center mb-14 max-w-lg mx-auto">{t("platform.howItWorks.subtitle")}</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {STEPS.map((s) => (
              <div
                key={s.num}
                className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 hover:border-blue-500/20 transition-all group relative overflow-hidden"
              >
                <div className={`absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r ${s.accent}`} />
                <div className="text-4xl font-bold text-white/[0.06] mb-3">{s.num}</div>
                <s.icon size={28} className="text-blue-400 mb-3 group-hover:scale-110 transition-transform" />
                <h3 className="text-lg font-semibold mb-2">{s.title}</h3>
                <p className="text-white/45 text-sm leading-relaxed">{s.desc}</p>
                {s.sub && (
                  <p className="text-blue-400/60 text-xs mt-3 leading-relaxed">{s.sub}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ BUILT-IN MONEY FLOW ═══════════════ */}
      <section className="py-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-br from-blue-600/[0.08] to-cyan-600/[0.04] border border-blue-500/15 rounded-3xl p-10 sm:p-14 text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-6">{t("platform.moneyFlow.title")}</h2>
            <p className="text-white/50 text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
              {t("platform.moneyFlow.desc")}
            </p>
            <p className="text-lg sm:text-xl font-semibold text-white/80 mb-4">
              {t("platform.moneyFlow.noZero")}
            </p>
            <div className="inline-block bg-blue-500/10 border border-blue-400/20 rounded-xl px-6 py-3 mb-10">
              <p className="text-blue-300 font-medium text-sm sm:text-base">
                💰 {t("platform.moneyFlow.dayOne")}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mt-4">
              <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
                <AnimatedCounter target={1} suffix="B+" />
                <div className="text-white/40 text-sm">{t("platform.moneyFlow.liquidity")}</div>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
                <div className="text-4xl sm:text-5xl font-bold text-blue-400 mb-2">24/7</div>
                <div className="text-white/40 text-sm">{t("platform.moneyFlow.alwaysActive")}</div>
              </div>
              <div className="bg-white/[0.03] rounded-xl p-6 border border-white/5">
                <AnimatedCounter target={100} suffix="+" />
                <div className="text-white/40 text-sm">{t("platform.moneyFlow.sportsEvents")}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ WHAT YOU GET ═══════════════ */}
      <section className="py-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">{t("platform.whatYouGet.title")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
            {WHAT_YOU_GET.map((item, i) => (
              <div key={i} className="flex items-start gap-3 text-white/70">
                <ChevronRight size={16} className="text-blue-400 mt-1 shrink-0" />
                <span className="text-sm leading-relaxed">{item}</span>
              </div>
            ))}
          </div>
          <p className="text-center text-white/25 text-xs max-w-md mx-auto">
            {t("platform.whatYouGet.customEvents")}
          </p>
        </div>
      </section>

      {/* ═══════════════ FINAL CTA ═══════════════ */}
      <section className="py-24 px-4 sm:px-6 relative z-10">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">{t("platform.cta.readyToStart")}</h2>
          <p className="text-white/40 text-lg mb-10">
            {t("platform.cta.readyDesc")}
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button
              onClick={handleBuyNow}
              size="lg"
              className="bg-blue-600 hover:bg-blue-500 text-white text-lg px-10 h-16 border-0 btn-glow rounded-xl font-bold"
            >
              {t("platform.cta.buyNow")} <ArrowRight size={20} className="ml-2" />
            </Button>
            <Button
              onClick={handleCreateAccount}
              variant="outline"
              size="lg"
              className="border-white/10 text-white hover:bg-white/5 text-lg px-10 h-16 rounded-xl font-bold"
            >
              {t("platform.cta.createAccount")}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-white/5 py-10 px-4 sm:px-6 relative z-10">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
            <div className="text-sm text-white/25">
              {t("platform.footer.rights", { year: new Date().getFullYear() })}
            </div>
            <div className="flex flex-wrap gap-6 text-sm text-white/35">
              <a href="/buy-predictions-app" className="hover:text-white/60 transition-colors">{t("platform.footer.buyApp")}</a>
              <a href="/help/are-prediction-markets-legal" className="hover:text-white/60 transition-colors">{t("platform.footer.whyLegal")}</a>
              <a href="mailto:1mgaming@proton.me" className="hover:text-white/60 transition-colors">{t("platform.footer.contact")}</a>
              <a href="/terms-of-service" className="hover:text-white/60 transition-colors">{t("platform.footer.terms")}</a>
              <a href="/privacy-policy" className="hover:text-white/60 transition-colors">{t("platform.footer.privacy")}</a>
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 text-xs text-white/20">
            <Mail size={12} />
            <a href="mailto:1mgaming@proton.me" className="hover:text-white/40 transition-colors">1mgaming@proton.me</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
