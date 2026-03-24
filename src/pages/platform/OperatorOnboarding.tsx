import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePrivy } from "@privy-io/react-auth";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";

const THEMES = [
  { key: "blue", label: "Blue + White", primary: "#3b82f6", bg: "#0a0f1a" },
  { key: "gold", label: "Gold + Black", primary: "#d4a017", bg: "#0a0a0a" },
  { key: "red", label: "Red + White", primary: "#ef4444", bg: "#0a0a0f" },
];

const SPORTS_OPTIONS = [
  "NFL", "NBA", "NHL", "Soccer", "MMA", "Boxing",
  "MLB", "Tennis", "UFC", "Cricket", "F1",
];

export default function OperatorOnboarding() {
  const { authenticated, login, getAccessToken } = usePrivy();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [brandName, setBrandName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [theme, setTheme] = useState("blue");
  const [sports, setSports] = useState<string[]>(["Soccer", "MMA", "Boxing"]);
  const [feePercent, setFeePercent] = useState(5);

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-bold mb-4">Connect to Get Started</h2>
          <p className="text-white/50 mb-6">
            Log in with your wallet to create your operator account.
          </p>
          <Button
            onClick={login}
            className="bg-blue-600 hover:bg-blue-500 border-0"
          >
            Connect Wallet
          </Button>
        </div>
      </div>
    );
  }

  const steps = [
    {
      title: "Brand Name",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            What's your brand called?
          </label>
          <Input
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder="e.g. FightNight Predictions"
            className="bg-white/5 border-white/10 text-white h-12 placeholder:text-white/20"
          />
        </div>
      ),
    },
    {
      title: "Subdomain",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Choose your subdomain
          </label>
          <div className="flex items-center gap-2">
            <Input
              value={subdomain}
              onChange={(e) =>
                setSubdomain(
                  e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                )
              }
              placeholder="yourname"
              className="bg-white/5 border-white/10 text-white h-12 placeholder:text-white/20"
            />
            <span className="text-white/40 text-sm whitespace-nowrap">
              .1mg.live
            </span>
          </div>
          {subdomain && (
            <p className="text-sm text-blue-400">{subdomain}.1mg.live</p>
          )}
        </div>
      ),
    },
    {
      title: "Logo",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Logo URL (optional — you can add this later)
          </label>
          <Input
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
            className="bg-white/5 border-white/10 text-white h-12 placeholder:text-white/20"
          />
          {logoUrl && (
            <img
              src={logoUrl}
              alt="Logo preview"
              className="h-16 w-16 object-contain rounded-lg bg-white/5 p-2"
            />
          )}
        </div>
      ),
    },
    {
      title: "Theme",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Choose your color theme
          </label>
          <div className="grid grid-cols-3 gap-4">
            {THEMES.map((t) => (
              <button
                key={t.key}
                onClick={() => setTheme(t.key)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  theme === t.key ? "border-blue-500" : "border-white/10"
                }`}
                style={{ backgroundColor: t.bg }}
              >
                <div
                  className="w-8 h-8 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: t.primary }}
                />
                <div className="text-xs text-white/60">{t.label}</div>
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Sports",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Which sports do you want to feature?
          </label>
          <div className="flex flex-wrap gap-2">
            {SPORTS_OPTIONS.map((s) => (
              <button
                key={s}
                onClick={() =>
                  setSports((prev) =>
                    prev.includes(s)
                      ? prev.filter((x) => x !== s)
                      : [...prev, s]
                  )
                }
                className={`px-4 py-2 rounded-full text-sm transition-all ${
                  sports.includes(s)
                    ? "bg-blue-600 text-white"
                    : "bg-white/5 text-white/50 border border-white/10"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Fee %",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Your commission on each prediction
          </label>
          <div className="flex items-center gap-4">
            <Input
              type="number"
              value={feePercent}
              onChange={(e) => setFeePercent(Number(e.target.value))}
              min={1}
              max={20}
              className="bg-white/5 border-white/10 text-white h-12 w-24"
            />
            <span className="text-white/40">%</span>
          </div>
          <p className="text-xs text-white/30">
            Platform takes 2% base fee. Your fee is added on top.
          </p>
        </div>
      ),
    },
  ];

  const handleCreate = async () => {
    setLoading(true);
    setError("");
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-privy-token": token || "",
          },
          body: JSON.stringify({
            action: "create_operator",
            brand_name: brandName,
            subdomain,
            logo_url: logoUrl || null,
            theme,
            fee_percent: feePercent,
            allowed_sports: sports,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create operator");
        return;
      }
      navigate("/dashboard");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const isStepValid = () => {
    if (step === 0) return brandName.trim().length >= 2;
    if (step === 1) return subdomain.trim().length >= 3;
    if (step === 4) return sports.length > 0;
    return true;
  };

  return (
    <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4">
      <div className="w-full max-w-lg">
        {/* Progress bar */}
        <div className="flex gap-1 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-blue-500" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        <h2 className="text-2xl font-bold mb-2">{steps[step].title}</h2>
        <p className="text-white/40 text-sm mb-8">
          Step {step + 1} of {steps.length}
        </p>

        {steps[step].component}

        {error && <p className="text-red-400 text-sm mt-4">{error}</p>}

        <div className="flex gap-4 mt-8">
          {step > 0 && (
            <Button
              onClick={() => setStep((s) => s - 1)}
              variant="outline"
              className="border-white/10 text-white hover:bg-white/5"
            >
              <ArrowLeft size={16} /> Back
            </Button>
          )}
          {step < steps.length - 1 ? (
            <Button
              onClick={() => setStep((s) => s + 1)}
              disabled={!isStepValid()}
              className="bg-blue-600 hover:bg-blue-500 border-0 ml-auto"
            >
              Next <ArrowRight size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleCreate}
              disabled={loading || !isStepValid()}
              className="bg-blue-600 hover:bg-blue-500 border-0 ml-auto"
            >
              {loading ? "Creating..." : "Launch"} <Check size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
