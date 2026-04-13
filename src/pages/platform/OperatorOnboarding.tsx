import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { usePrivyLogin } from "@/hooks/usePrivyLogin";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ArrowLeft, Check, ExternalLink, Rocket, Wallet, Copy, Download, QrCode, Calendar, BarChart3, Link as LinkIcon } from "lucide-react";
import OperatorQRCode from "@/components/operator/OperatorQRCode";
import OperatorLogoUpload from "@/components/operator/OperatorLogoUpload";
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

const AGREEMENT_TEXT = `OPERATOR AGREEMENT v${AGREEMENT_VERSION}

This Operator Agreement ("Agreement") is entered into between 1mg.live / 1MG Live ("Platform," "we," "us," or "our") and the operator accepting this Agreement ("Operator," "you," or "your").

By checking the acceptance box and completing onboarding, you agree to be bound by this Agreement.

1. ACCESS TO THE PLATFORM

We grant you a limited, revocable, non-exclusive, non-transferable right to access and use the 1mg.live operator tools, operator dashboard, public operator app page, and related platform services solely for lawful business use in accordance with this Agreement.

This Agreement does not transfer ownership of the 1mg.live platform, software, infrastructure, liquidity integrations, admin systems, backend systems, or intellectual property to you. Your access is a permission to use the Platform, not a sale of the Platform itself.

2. OPERATOR ROLE

As an Operator, you may create, configure, brand, and manage your operator app within the features made available by the Platform. You are responsible for your own branding, promotions, communications, custom event content, and operator activity conducted through your operator account.

You are responsible for ensuring that all information you provide to the Platform is accurate and current, including your payout wallet, support email, branding materials, and any event details you publish.

3. COMPLIANCE AND LOCAL RESPONSIBILITY

You are solely responsible for understanding and complying with all laws, regulations, rules, restrictions, licensing requirements, tax obligations, advertising rules, consumer protection laws, and platform-use restrictions applicable to you, your users, your promotions, and your jurisdiction.

The Platform does not provide legal, regulatory, tax, or licensing advice. Your use of the Platform does not mean that your activity is legal in your location or in the locations of your users. You are solely responsible for determining whether your use of the Platform is lawful and appropriate.

4. NO GUARANTEE OF REVENUE OR SUCCESS

We do not guarantee traffic, users, profits, revenue, trading volume, operator earnings, business success, uptime, market availability, or any financial result from your use of the Platform.

Any revenue examples, calculators, estimates, demos, examples, or projections are for illustration only and do not constitute a promise or guarantee of actual results.

5. FEES, PAYMENTS, AND PAYOUTS

Operator app purchase fees, platform fees, and operator earnings are governed by the rules and systems in effect on the Platform at the time of use.

Unless otherwise stated in a separate written agreement:

• the Platform charges its stated platform fee, including the current 1.5% platform fee where applicable,

• the Operator retains the operator fee portion configured within the Platform, subject to the Platform's accounting, treasury, wallet, payout, and settlement systems,

• app purchase payments are final except where required by law or expressly approved by us,

• payouts and earnings may depend on proper wallet setup, successful sweeps, platform accounting, and operational status.

You are responsible for ensuring your payout wallet information is correct. We are not responsible for losses caused by an incorrect wallet address, incompatible wallet, third-party wallet failure, exchange deposit errors, user wallet errors, or unsupported chains/assets.

6. PLATFORM CONTROL, SUSPENSION, AND TERMINATION

We may suspend, restrict, disable, remove, or terminate your access to the Platform, your operator account, your operator app, specific features, or specific events at any time if we reasonably believe:

• you violated this Agreement,

• your conduct creates legal, compliance, fraud, security, reputational, or operational risk,

• you engage in abuse, manipulation, deceptive conduct, prohibited promotions, or misuse of the Platform,

• your account, app, branding, events, or user activity create risk for us, our infrastructure, or other users,

• payment obligations are not met,

• continued access is not commercially or operationally feasible.

We may also modify, limit, or discontinue parts of the Platform at any time.

7. PROHIBITED CONDUCT

You agree not to:

• use the Platform for unlawful, fraudulent, deceptive, abusive, manipulative, or unauthorized purposes,

• misrepresent your relationship to 1mg.live or mislead users about the nature of the Platform,

• post false, defamatory, infringing, obscene, abusive, or prohibited content,

• create misleading custom events or settle events dishonestly,

• attempt to exploit, disrupt, reverse engineer, scrape, overload, or interfere with the Platform,

• bypass fees, security controls, permissions, account restrictions, or admin safeguards,

• use branding, logos, names, domains, or content that infringe the rights of others,

• engage in spam, fake traffic, fake engagement, fake users, or fraudulent promotional activity.

8. OPERATOR CONTENT AND BRANDING

You retain responsibility for the branding, logos, names, descriptions, event text, and promotional materials you upload or use. You represent that you have the right to use that content.

You grant us the limited right to host, display, reproduce, process, and use your submitted content as needed to operate and display your operator app and provide Platform services to you.

We may remove or disable content that we believe violates this Agreement or creates risk.

9. THIRD-PARTY SERVICES

The Platform may rely on third-party services, including wallets, market data providers, liquidity sources, payment providers, hosting providers, analytics providers, or communication services.

We are not responsible for downtime, delays, errors, restrictions, interruptions, deplatforming, payment failures, wallet failures, market unavailability, or service changes caused by third parties.

10. LIMITATION OF LIABILITY

To the maximum extent allowed by law, the Platform and its owners, operators, affiliates, contractors, employees, and service providers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost revenue, lost data, lost business opportunities, user losses, market losses, trading losses, reputational harm, or service interruptions arising out of or related to your use of the Platform.

To the maximum extent allowed by law, our total liability arising out of or relating to this Agreement or the Platform will not exceed the total amount of fees actually paid by you to us for operator access during the three-month period immediately preceding the event giving rise to the claim.

11. INDEMNIFICATION

You agree to defend, indemnify, and hold harmless the Platform and its owners, affiliates, contractors, employees, and service providers from and against claims, liabilities, damages, losses, costs, and expenses, including reasonable legal fees, arising out of or related to:

• your use of the Platform,

• your operator app,

• your branding, content, events, and promotions,

• your violation of this Agreement,

• your violation of law, regulation, or third-party rights,

• disputes involving your users, your conduct, or your marketing.

12. MODIFICATIONS TO THE AGREEMENT

We may update this Agreement from time to time. If we make material changes, we may require acceptance of a new version before continued use of the Platform or certain features.

Your continued use of the Platform after an update becomes effective may constitute acceptance of the updated version where permitted by law.

13. GOVERNING LAW AND DISPUTES

This Agreement will be governed by the laws of the jurisdiction selected by the Platform, without regard to conflict-of-law principles.

Any dispute arising out of or relating to this Agreement or the Platform shall be resolved in the courts or dispute forum chosen by the Platform, unless otherwise required by applicable law.

14. ENTIRE AGREEMENT

This Agreement constitutes the entire agreement between you and the Platform regarding operator access and use of the Platform, except for any separate written agreement expressly entered into between you and us.

15. ACCEPTANCE

By checking the acceptance box and completing operator onboarding, you confirm that:

• you have read and understood this Agreement,

• you are legally able to accept it,

• you agree to be bound by it,

• you understand that your use of the Platform is subject to this Agreement.`;

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
          I have read and agree to the Operator Agreement.
        </label>
      </div>
    </div>
  );
}

const CHECKLIST_ITEMS = [
  { icon: LinkIcon, label: "Copy your app link and share it", key: "link" },
  { icon: QrCode, label: "Download your QR code for promotions", key: "qr" },
  { icon: Wallet, label: "Confirm your payout wallet in Settings", key: "wallet" },
  { icon: Calendar, label: "Create your first custom event", key: "event" },
  { icon: BarChart3, label: "Check your earnings in the Dashboard", key: "earnings" },
];

export default function OperatorOnboarding() {
  const { authenticated, getAccessToken } = usePrivySafe();
  const { login } = usePrivyLogin();
  const { walletAddress } = usePrivyWallet();
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
  const [payoutWallet, setPayoutWallet] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Pre-fill payout wallet with Privy EVM wallet when available
  useState(() => {
    if (walletAddress && !payoutWallet) {
      setPayoutWallet(walletAddress);
    }
  });

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
            Upload or link your logo (optional — you can add this later)
          </label>
          <OperatorLogoUpload
            value={logoUrl}
            onChange={setLogoUrl}
            operatorId="onboarding"
          />
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
      title: "Payout Wallet",
      component: (
        <div className="space-y-4">
          <label className="text-sm text-white/60">
            Where should your earnings be sent?
          </label>
          <Input
            value={payoutWallet}
            onChange={(e) => setPayoutWallet(e.target.value.trim())}
            placeholder="0x... (Polygon wallet address)"
            className="bg-white/5 border-white/10 text-white h-12 placeholder:text-white/20 font-mono text-sm"
          />
          <div className="bg-yellow-500/5 border border-yellow-500/10 rounded-xl p-3">
            <p className="text-xs text-yellow-300/80 leading-relaxed">
              <Wallet size={12} className="inline mr-1 -mt-0.5" />
              <strong>Important:</strong> This is the wallet where your fee revenue (USDC.e on Polygon) will be automatically sent. Make sure it's a wallet you control. You can update this later in Settings.
            </p>
          </div>
          {walletAddress && payoutWallet !== walletAddress && (
            <button
              onClick={() => setPayoutWallet(walletAddress)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              Use my connected wallet ({walletAddress.slice(0, 6)}...{walletAddress.slice(-4)})
            </button>
          )}
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
            payout_wallet: payoutWallet || null,
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
    if (step === 7) return agreedToTerms;
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

          {/* Post-launch checklist */}
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mt-6 text-left">
            <h3 className="text-sm font-semibold text-white/80 mb-3">What to do next</h3>
            <div className="space-y-3">
              {CHECKLIST_ITEMS.map((item) => (
                <div key={item.key} className="flex items-center gap-3 text-sm text-white/60">
                  <item.icon size={16} className="text-blue-400 shrink-0" />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
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
