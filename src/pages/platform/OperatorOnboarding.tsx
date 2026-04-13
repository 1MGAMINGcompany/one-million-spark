import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { usePrivyLogin } from "@/hooks/usePrivyLogin";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, ExternalLink, Rocket } from "lucide-react";
import OperatorQRCode from "@/components/operator/OperatorQRCode";
import { THEME_OPTIONS } from "@/lib/operatorThemes";

const THEMES = THEME_OPTIONS.map(t => ({
  key: t.key,
  label: t.label,
  primary: t.primary,
  preview: t.isDark ? t.bg : t.bg,
  isDark: t.isDark,
}));

const SPORTS_OPTIONS = [
  "NFL", "NBA", "NHL", "Soccer", "MMA", "Boxing",
  "MLB", "Tennis", "UFC", "Cricket", "F1", "Esports",
];

const AGREEMENT_VERSION = "1.0";

const AGREEMENT_TEXT = `OPERATOR AGREEMENT — Version ${AGREEMENT_VERSION}

Effective Date: Upon acceptance during onboarding.

This Operator Agreement ("Agreement") governs your use of the 1MG platform ("Platform") as an operator. By checking the acceptance box and completing onboarding, you agree to the following terms.

1. PLATFORM ACCESS

You are granted a non-exclusive, revocable license to operate a branded prediction marketplace on the Platform. Your operator app will be accessible via a subdomain (e.g., 1mg.live/yourname). Access may be modified, suspended, or revoked at the Platform's sole discretion.

2. OPERATOR RESPONSIBILITIES

As an operator, you are responsible for:
• Managing your branded app and its public-facing content.
• Ensuring all marketing, promotions, and communications comply with applicable laws and regulations in the jurisdictions where you operate.
• Providing accurate brand information during onboarding.
• Monitoring your app for prohibited or inappropriate activity.

3. MARKETING & COMPLIANCE

You are solely responsible for ensuring that your marketing activities, advertising, and user-facing communications comply with all applicable local, state, national, and international laws. The Platform does not provide legal, regulatory, or compliance advice.

4. REVENUE DISCLAIMER

There is no guarantee of revenue, earnings, or profits from operating on the Platform. Revenue depends on user activity, market conditions, event availability, and other factors outside the Platform's control. Past performance is not indicative of future results.

5. FEES & PAYOUTS

• The Platform charges a 1.5% platform fee on each prediction transaction.
• Your operator fee (set during onboarding, 0–20%) is added on top of the platform fee.
• You retain 100% of your operator fee revenue.
• Payouts are processed according to the Platform's standard payout schedule and are subject to minimum thresholds and verification requirements.
• The Platform reserves the right to modify fee structures with reasonable notice.

6. SUSPENSION & TERMINATION

The Platform reserves the right to suspend or terminate your operator account at any time, with or without notice, for any reason, including but not limited to:
• Violation of this Agreement.
• Fraudulent, misleading, or illegal activity.
• Failure to comply with applicable laws or regulations.
• Inactivity for an extended period.
• Any conduct that the Platform determines, in its sole discretion, is harmful to the Platform, its users, or its reputation.

Upon termination, access to your operator dashboard and branded app may be immediately revoked.

7. LIMITATION OF LIABILITY

The Platform is provided "as is" without warranties of any kind, express or implied. To the maximum extent permitted by law:
• The Platform shall not be liable for any indirect, incidental, consequential, or punitive damages.
• The Platform's total liability shall not exceed the fees paid by you in the 30 days preceding the claim.
• The Platform is not responsible for losses arising from market conditions, user behavior, regulatory changes, or technical issues beyond its reasonable control.

8. PROHIBITED CONDUCT

You agree not to:
• Use the Platform for any illegal, fraudulent, or deceptive purpose.
• Manipulate markets, outcomes, or user predictions.
• Misrepresent your identity, brand, or affiliation.
• Engage in money laundering, terrorist financing, or sanctions violations.
• Scrape, reverse-engineer, or interfere with Platform systems.
• Create multiple operator accounts without authorization.
• Encourage or facilitate violations of this Agreement by users or third parties.

9. MODIFICATIONS

The Platform may update this Agreement at any time. Continued use of the Platform after changes constitutes acceptance of the updated terms. Material changes will be communicated via dashboard notification or email where possible.

10. GOVERNING LAW

This Agreement is governed by applicable law. Any disputes shall be resolved through binding arbitration or the courts of competent jurisdiction as determined by the Platform.

By accepting this Agreement, you acknowledge that you have read, understood, and agree to be bound by all terms above.`;

function AgreementStep({
  agreed,
  onToggle,
}: {
  agreed: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <label className="text-sm text-white/60">
        Please review the Operator Agreement before launching your app.
      </label>
      <ScrollArea className="h-64 w-full rounded-lg border border-white/10 bg-white/5 p-4">
        <pre className="whitespace-pre-wrap text-xs text-white/70 font-sans leading-relaxed pr-4">
          {AGREEMENT_TEXT}
        </pre>
      </ScrollArea>
      <div className="flex items-start gap-3 pt-2">
        <Checkbox
          id="agreement-checkbox"
          checked={agreed}
          onCheckedChange={(checked) => onToggle(checked === true)}
          className="mt-0.5 border-white/30 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
        />
        <label
          htmlFor="agreement-checkbox"
          className="text-sm text-white/80 cursor-pointer select-none leading-snug"
        >
          I have read and agree to the Operator Agreement
        </label>
      </div>
    </div>
  );
}

export default function OperatorOnboarding() {
  const { authenticated, getAccessToken } = usePrivySafe();
  const { login } = usePrivyLogin();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(false);

  const [brandName, setBrandName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [theme, setTheme] = useState("blue");
  const [sports, setSports] = useState<string[]>(["Soccer", "MMA", "Boxing"]);
  const [feePercent, setFeePercent] = useState(5);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

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
            <span className="text-white/40 text-sm whitespace-nowrap">
              1mg.live/
            </span>
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
          </div>
          {subdomain && (
            <p className="text-sm text-blue-400">1mg.live/{subdomain}</p>
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
                style={{ backgroundColor: t.preview }}
              >
                <div
                  className="w-8 h-8 rounded-full mx-auto mb-2"
                  style={{ backgroundColor: t.primary }}
                />
                <div className={`text-xs ${t.isDark ? "text-white/60" : "text-gray-600"}`}>
                  {t.label}
                </div>
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
              min={0}
              max={20}
              className="bg-white/5 border-white/10 text-white h-12 w-24"
            />
            <span className="text-white/40">%</span>
          </div>
          <p className="text-xs text-white/30">
            1MG charges a low 1.5% platform fee (covers gas, backend, support &amp; money flow).
            Your operator fee is added on top — you keep 100% of your fee revenue.
          </p>
          <p className="text-xs text-blue-400/80 mt-2">
            💡 Pro tip: Our demo platform charges 15%. Set your fee to 5% and you'll be 3x more competitive from day one.
          </p>
        </div>
      ),
    },
    {
      title: "Operator Agreement",
      component: (
        <AgreementStep
          agreed={agreedToTerms}
          onToggle={setAgreedToTerms}
        />
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
            agreement_version: AGREEMENT_VERSION,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create operator");
        return;
      }
      setCreated(true);
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
    if (step === 6) return agreedToTerms;
    return true;
  };

  if (created) {
    return (
      <div className="min-h-screen bg-[#06080f] text-white flex items-center justify-center px-4">
        <div className="w-full max-w-lg text-center">
          <Rocket className="w-16 h-16 mx-auto mb-6 text-blue-400" />
          <h2 className="text-3xl font-bold mb-3">Your App is Ready! 🎉</h2>
          <p className="text-white/50 mb-2">
            <span className="font-bold text-white">{brandName}</span> is now live at
          </p>
          <OperatorQRCode subdomain={subdomain} size={160} />
          <p className="text-sm text-white/40 mt-4 mb-6">
            Events from popular sports are already loaded. Share your app link or QR code to start earning!
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => window.open(`https://1mg.live/${subdomain}`, "_blank")}
              className="bg-blue-600 hover:bg-blue-500 border-0 font-bold"
            >
              Open My App <ExternalLink size={16} className="ml-1" />
            </Button>
            <Button
              onClick={() => navigate("/dashboard")}
              variant="outline"
              className="border-white/10 text-white hover:bg-white/5"
            >
              Go to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
