import { ArrowRight, Rocket, Eye } from "lucide-react";

const ArticleCTA = () => {
  return (
    <div className="mt-12 rounded-xl border border-blue-500/20 bg-white/5 backdrop-blur-sm p-6 md:p-8">
      <h3 className="text-xl font-bold text-white mb-2">Ready to launch your predictions app?</h3>
      <p className="text-white/50 text-sm mb-5">
        Start earning from sports predictions in minutes — no code, no setup, just launch.
      </p>
      <div className="flex flex-wrap gap-3">
        <a
          href="https://1mg.live"
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
          style={{ background: "linear-gradient(135deg, #2563eb, #3b82f6)" }}
        >
          <Rocket className="w-4 h-4" /> Buy Your App — $2,400
        </a>
        <a
          href="/demo"
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-400 hover:bg-blue-500/20 transition-colors"
        >
          <Eye className="w-4 h-4" /> Live Demo
        </a>
        <a
          href="/help"
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
        >
          More Guides <ArrowRight className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
};

export default ArticleCTA;
