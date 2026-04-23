import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { usePrivySafe } from "@/hooks/usePrivySafe";
import { usePrivyWallet } from "@/hooks/usePrivyWallet";
import { usePrivyLogin } from "@/hooks/usePrivyLogin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Calendar, BarChart3, ExternalLink, Plus, DollarSign,
  TrendingUp, Edit3, Lock, Trophy, Wallet,
  Copy, Mail, Check, Save, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePolygonUSDC } from "@/hooks/usePolygonUSDC";
import OperatorEventActions from "./OperatorEventActions";
import PlatformLanguageSwitcher from "@/components/PlatformLanguageSwitcher";
import OperatorAnalyticsTab from "@/components/operator/OperatorAnalyticsTab";
import OperatorEarningsTab from "@/components/operator/OperatorEarningsTab";
import OperatorLogoUpload from "@/components/operator/OperatorLogoUpload";
import OperatorQRCode from "@/components/operator/OperatorQRCode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface OperatorData {
  id: string;
  user_id: string;
  brand_name: string;
  subdomain: string;
  logo_url: string | null;
  theme: string;
  fee_percent: number;
  status: string;
  brand_color: string | null;
  welcome_message: string | null;
  support_email: string | null;
  disabled_sports: string[];
  payout_wallet: string | null;
}

const SPORT_OPTIONS = ["Soccer", "MMA", "Boxing", "NFL", "NBA", "NHL", "MLB", "NCAA", "Tennis"];

export default function OperatorDashboard() {
  const { t } = useTranslation();
  const { authenticated, getAccessToken, user } = usePrivySafe();
  const { walletAddress } = usePrivyWallet();
  const { login } = usePrivyLogin();
  const navigate = useNavigate();
  const [operator, setOperator] = useState<OperatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<any[]>([]);
  const [fights, setFights] = useState<any[]>([]);
  const [revenue, setRevenue] = useState<{ total: number; count: number }>({ total: 0, count: 0 });

  const [showNewEvent, setShowNewEvent] = useState(false);
  const [newTeamA, setNewTeamA] = useState("");
  const [newTeamB, setNewTeamB] = useState("");
  const [newSport, setNewSport] = useState("Soccer");
  const [newDate, setNewDate] = useState("");
  const [newFeatured, setNewFeatured] = useState(false);
  const [creating, setCreating] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [dashTab, setDashTab] = useState<"overview" | "analytics" | "earnings" | "events" | "settings">("overview");

  // Settings state
  const [brandColor, setBrandColor] = useState("");
  const [welcomeMsg, setWelcomeMsg] = useState("");
  const [supportEmail, setSupportEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [disabledSports, setDisabledSports] = useState<string[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [appPaused, setAppPaused] = useState(false);
  const [togglingPause, setTogglingPause] = useState(false);
  const [showPauseConfirm, setShowPauseConfirm] = useState(false);

  // Fee editing state (in Settings)
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState("");
  const [savingFee, setSavingFee] = useState(false);

  // Event editing state
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editSport, setEditSport] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editFeatured, setEditFeatured] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);

  const contactEmail = user?.email?.address || user?.google?.email || null;

  useEffect(() => {
    if (!authenticated) return;
    fetchOperator();
  }, [authenticated]);

  const fetchOperator = async () => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "get_my_operator" }),
        }
      );
      const data = await res.json();
      if (data.operator) {
        const op = data.operator;
        // Detect incomplete onboarding (purchased but never configured)
        if (op.subdomain?.startsWith("pending-") || op.brand_name === "My App") {
          navigate("/onboarding");
          return;
        }
        setOperator(op);
        setBrandColor(op.brand_color || "#4F46E5");
        setWelcomeMsg(op.welcome_message || "");
        setSupportEmail(op.support_email || "");
        setLogoUrl(op.logo_url || "");
        setDisabledSports(op.disabled_sports || []);
        setAppPaused(op.status === "paused");
        fetchEvents(op.id);
        fetchFights(op.id);
        fetchRevenue(op.id);
      } else {
        navigate("/onboarding");
      }
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("operator_events")
      .select("*")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false });
    setEvents(data || []);
  };

  const fetchFights = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("prediction_fights")
      .select("id, title, status, winner, operator_event_id, pool_a_usd, pool_b_usd, shares_a, shares_b")
      .eq("operator_id", operatorId)
      .order("created_at", { ascending: false });
    setFights(data || []);
  };

  const fetchRevenue = async (operatorId: string) => {
    const { data } = await (supabase as any)
      .from("operator_revenue")
      .select("operator_fee_usdc, entry_amount_usdc")
      .eq("operator_id", operatorId);
    if (data) {
      const total = data.reduce((s: number, r: any) => s + Number(r.operator_fee_usdc || 0), 0);
      setRevenue({ total, count: data.length });
    }
  };

  const { usdc_balance: walletBalance } = usePolygonUSDC();

  const updateFeePercent = async () => {
    const val = Number(feeInput);
    if (isNaN(val) || val < 0 || val > 20) {
      toast.error(t("operator.dashboard.feeValidation"));
      return;
    }
    setSavingFee(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "update_operator", fee_percent: val }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(t("operator.dashboard.feeUpdated"));
        setOperator(prev => prev ? { ...prev, fee_percent: val } : prev);
        setEditingFee(false);
      } else {
        toast.error(json.error || t("operator.dashboard.failedToUpdateFee"));
      }
    } catch {
    } finally {
      setSavingFee(false);
    }
  };

  const createEvent = async () => {
    setCreating(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({
            action: "create_event",
            title: `${newTeamA} vs ${newTeamB}`,
            team_a: newTeamA,
            team_b: newTeamB,
            sport: newSport,
            event_date: newDate || null,
            is_featured: newFeatured,
          }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error(t("operator.dashboard.eventCreateFailed"), { description: data.error });
      } else {
        toast.success(t("operator.dashboard.eventCreated"));
      }
      setShowNewEvent(false);
      setNewTeamA("");
      setNewTeamB("");
      setNewDate("");
      setNewFeatured(false);
      if (operator) {
        fetchEvents(operator.id);
        fetchFights(operator.id);
      }
    } catch {
    } finally {
      setCreating(false);
    }
  };

  const handleEventAction = async (action: string, eventId: string, extra?: any) => {
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action, event_id: eventId, ...extra }),
        }
      );
      const data = await res.json();
      if (data.error) {
        toast.error(t("operator.dashboard.actionFailed"), { description: data.error });
      } else {
        toast.success(
          action === "close_event" ? t("operator.dashboard.predictionsClosed") :
          action === "settle_event" ? t("operator.dashboard.eventSettled") :
          t("operator.dashboard.updated")
        );
      }
      if (operator) {
        fetchEvents(operator.id);
        fetchFights(operator.id);
        fetchRevenue(operator.id);
      }
    } catch (err: any) {
      toast.error(t("operator.dashboard.actionFailed"), { description: err.message });
    }
  };

  const saveSettings = async () => {
    setSavingSettings(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({
            action: "update_operator",
            brand_color: brandColor,
            welcome_message: welcomeMsg,
            support_email: supportEmail,
            logo_url: logoUrl || null,
            disabled_sports: disabledSports,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(t("operator.dashboard.settingsSaved"));
        setOperator(prev => prev ? { ...prev, brand_color: brandColor, welcome_message: welcomeMsg, support_email: supportEmail, logo_url: logoUrl || null, disabled_sports: disabledSports } : prev);
      } else {
        toast.error(json.error || t("operator.dashboard.failedToSave"));
      }
    } catch {
      toast.error(t("operator.dashboard.failedToSave"));
    } finally {
      setSavingSettings(false);
    }
  };

  const togglePause = async () => {
    setTogglingPause(true);
    const newStatus = appPaused ? "active" : "paused";
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({ action: "update_operator", status: newStatus }),
        }
      );
      const json = await res.json();
      if (json.success) {
        setAppPaused(!appPaused);
        setOperator(prev => prev ? { ...prev, status: newStatus } : prev);
        toast.success(newStatus === "paused" ? t("operator.dashboard.appPausedToast") : t("operator.dashboard.appResumedToast"));
      } else {
        toast.error(json.error || t("operator.dashboard.failedToTogglePause"));
      }
    } catch {
      toast.error(t("operator.dashboard.failedToTogglePause"));
    } finally {
      setTogglingPause(false);
    }
  };

  const saveEventEdit = async (eventId: string) => {
    setSavingEvent(true);
    try {
      const token = await getAccessToken();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/operator-manage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-privy-token": token || "" },
          body: JSON.stringify({
            action: "update_event",
            event_id: eventId,
            sport: editSport,
            event_date: editDate || undefined,
            is_featured: editFeatured,
          }),
        }
      );
      const json = await res.json();
      if (json.success) {
        toast.success(t("operator.dashboard.eventUpdated"));
        setEditingEventId(null);
        if (operator) { fetchEvents(operator.id); fetchFights(operator.id); }
      } else {
        toast.error(json.error || t("operator.dashboard.failedToUpdateEvent"));
      }
    } catch {
      toast.error(t("operator.dashboard.failedToUpdateEvent"));
    } finally {
      setSavingEvent(false);
    }
  };

  const copyAppLink = () => {
    if (!operator) return;
    navigator.clipboard.writeText(`https://1mg.live/${operator.subdomain}`);
    setLinkCopied(true);
    toast.success(t("operator.dashboard.linkCopied"));
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-4">{t("operator.dashboard.loginRequired")}</h2>
          <Button onClick={login} className="platform-blue-button border-0">{t("operator.dashboard.connectWallet")}</Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return <div className="min-h-screen bg-background text-foreground flex items-center justify-center"><div className="text-muted-foreground">{t("operator.dashboard.loading")}</div></div>;
  }

  if (!operator) return null;

  return (
    <div className="min-h-screen bg-[#06080f] text-white">
      <nav className="border-b border-white/5 bg-[#06080f]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <h1 className="font-bold text-lg">{operator.brand_name}</h1>
          <div className="flex items-center gap-3">
            <PlatformLanguageSwitcher />
            <Button
              size="sm"
              onClick={() => navigate(`/${operator.subdomain}`)}
              className="platform-blue-button gap-1.5 border-0 text-xs font-bold"
            >
              <ExternalLink size={14} />
              {t("operator.dashboard.viewApp", "View App")}
            </Button>
            <a
              href={`https://1mg.live/${operator.subdomain}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 flex items-center gap-1 hover:text-blue-300"
            >
              1mg.live/{operator.subdomain} <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Tab bar */}
        <div className="flex gap-1 mb-6 bg-white/[0.03] p-1 rounded-lg w-fit overflow-x-auto">
          {(["overview", "earnings", "events", "analytics", "settings"] as const).map(tab => (
            <button key={tab} onClick={() => setDashTab(tab)} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${dashTab === tab ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"}`}>
              {t(`operator.dashboard.tab${tab.charAt(0).toUpperCase() + tab.slice(1)}`)}
            </button>
          ))}
        </div>

        {/* ─── ANALYTICS TAB ─── */}
        {dashTab === "analytics" && (
          <OperatorAnalyticsTab operatorId={operator.id} feePercent={operator.fee_percent} />
        )}

        {/* ─── EARNINGS TAB ─── */}
        {dashTab === "earnings" && (
          <OperatorEarningsTab
            operatorId={operator.id}
            operatorUserId={operator.user_id}
            loggedInUserId={user?.id || ""}
            walletAddress={walletAddress}
            getAccessToken={getAccessToken}
          />
        )}

        {/* ─── SETTINGS TAB ─── */}
        {dashTab === "settings" && (
          <div className="space-y-6">

            {/* Section 1: App Status */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-sm">{t("operator.dashboard.appStatus")}</h3>
                  <p className="text-xs text-white/40 mt-1">
                    {appPaused ? t("operator.dashboard.appPausedDesc") : t("operator.dashboard.appLiveDesc")}
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (appPaused) {
                      togglePause(); // Resume immediately, no confirmation needed
                    } else {
                      setShowPauseConfirm(true); // Show confirmation before pausing
                    }
                  }}
                  disabled={togglingPause}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    appPaused
                      ? "bg-green-600 hover:bg-green-500 text-white"
                      : "bg-red-600/80 hover:bg-red-500 text-white"
                  }`}
                >
                  {togglingPause ? "..." : appPaused ? t("operator.dashboard.resumeApp") : t("operator.dashboard.pauseApp")}
                </button>
              </div>
            </div>

            {/* Pause Confirmation Dialog */}
            <AlertDialog open={showPauseConfirm} onOpenChange={setShowPauseConfirm}>
              <AlertDialogContent className="bg-[#0d1117] border-white/10 text-white">
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2">
                    <AlertTriangle size={18} className="text-yellow-400" />
                    {t("operator.dashboard.pauseConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-white/50">
                    {t("operator.dashboard.pauseConfirmDesc")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="border-white/10 text-white hover:bg-white/5">
                    {t("operator.dashboard.cancel")}
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => { setShowPauseConfirm(false); togglePause(); }}
                    className="bg-red-600 hover:bg-red-500 text-white border-0"
                  >
                    {t("operator.dashboard.pauseConfirmAction")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {/* Section 2: Branding */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-4">
              <h3 className="font-semibold text-sm">{t("operator.dashboard.branding")}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <OperatorLogoUpload
                    value={logoUrl}
                    onChange={setLogoUrl}
                    operatorId={operator.id}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">{t("operator.dashboard.brandColor")}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="w-10 h-10 rounded border border-white/10 bg-transparent cursor-pointer" />
                    <Input value={brandColor} onChange={e => setBrandColor(e.target.value)} placeholder="#4F46E5" className="bg-white/5 border-white/10 text-white text-sm w-28" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-white/40 block mb-1">{t("operator.dashboard.welcomeMessage")}</label>
                  <Input value={welcomeMsg} onChange={e => setWelcomeMsg(e.target.value.slice(0, 500))} placeholder={t("operator.dashboard.welcomeMsgPlaceholder")} className="bg-white/5 border-white/10 text-white text-sm" />
                  <p className="text-[10px] text-white/20 mt-1">{welcomeMsg.length}/500</p>
                </div>
              </div>
            </div>

            {/* Section 3: Fee % */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
              <h3 className="font-semibold text-sm mb-3">{t("operator.dashboard.operatorFee")}</h3>
              {editingFee ? (
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={20}
                    step={0.5}
                    value={feeInput}
                    onChange={(e) => setFeeInput(e.target.value)}
                    className="bg-white/5 border-white/10 text-white w-24 h-9 text-sm"
                  />
                  <span className="text-white/60 text-sm">%</span>
                  <Button size="sm" onClick={updateFeePercent} disabled={savingFee} className="bg-emerald-600 hover:bg-emerald-500 border-0 text-xs gap-1">
                    <Save size={14} /> {savingFee ? t("operator.dashboard.saving") : t("operator.dashboard.save")}
                  </Button>
                  <button onClick={() => setEditingFee(false)} className="text-white/30 hover:text-white/60 text-xs">{t("operator.dashboard.cancel")}</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold">{operator.fee_percent}%</span>
                  <button onClick={() => { setFeeInput(String(operator.fee_percent)); setEditingFee(true); }} className="text-white/30 hover:text-white/60">
                    <Edit3 size={14} />
                  </button>
                </div>
              )}
              <p className="text-[10px] text-white/30 mt-2">{t("operator.dashboard.feeRange")}</p>
            </div>

            {/* Section 4: Sports Visibility */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm">{t("operator.dashboard.sportsVisibility")}</h3>
              <p className="text-xs text-white/40">{t("operator.dashboard.sportsVisibilityDesc")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {SPORT_OPTIONS.map(sport => {
                  const isDisabled = disabledSports.includes(sport);
                  return (
                    <button
                      key={sport}
                      onClick={() => {
                        setDisabledSports(prev =>
                          prev.includes(sport) ? prev.filter(s => s !== sport) : [...prev, sport]
                        );
                      }}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isDisabled
                          ? "bg-white/[0.02] text-white/20 border border-white/5"
                          : "bg-emerald-600/20 text-emerald-400 border border-emerald-500/20"
                      }`}
                    >
                      {isDisabled ? "❌" : "✅"} {sport}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section 5: Support / Contact */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-3">
              <h3 className="font-semibold text-sm">{t("operator.dashboard.supportContact")}</h3>
              <div>
                <label className="text-xs text-white/40 block mb-1">{t("operator.dashboard.supportEmailLabel")}</label>
                <Input value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder={t("operator.dashboard.supportEmailPlaceholder")} className="bg-white/5 border-white/10 text-white text-sm" />
                <p className="text-[10px] text-white/20 mt-1">{t("operator.dashboard.supportEmailHelp")}</p>
              </div>
              {contactEmail && (
                <div className="text-xs text-white/40 flex items-center gap-1">
                  <Mail size={12} /> {t("operator.dashboard.yourAccount")}: {contactEmail}
                </div>
              )}
            </div>

            {/* Section 6: Domain */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 space-y-2">
              <h3 className="font-semibold text-sm">{t("operator.dashboard.domain")}</h3>
              <div className="flex items-center gap-2">
                <code className="text-sm text-blue-400 font-mono">1mg.live/{operator.subdomain}</code>
                <a
                  href={`https://1mg.live/${operator.subdomain}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/30 hover:text-white/60"
                >
                  <ExternalLink size={14} />
                </a>
              </div>
              <p className="text-[10px] text-white/20">{t("operator.dashboard.customDomainsSoon")}</p>
            </div>

            {/* Save all settings */}
            <Button
              onClick={saveSettings}
              disabled={savingSettings}
              className="platform-blue-button border-0"
            >
              <Save size={16} /> {savingSettings ? t("operator.dashboard.saving") : t("operator.dashboard.saveSettings")}
            </Button>
          </div>
        )}

        {/* ─── EVENTS TAB ─── */}
        {dashTab === "events" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{t("operator.dashboard.yourEvents")}</h2>
              <Button onClick={() => setShowNewEvent(true)} size="sm" className="platform-blue-button border-0">
                <Plus size={16} /> {t("operator.dashboard.newEvent")}
              </Button>
            </div>

            {showNewEvent && (
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input value={newTeamA} onChange={(e) => setNewTeamA(e.target.value)} placeholder={t("operator.dashboard.teamFighterA")} className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                  <Input value={newTeamB} onChange={(e) => setNewTeamB(e.target.value)} placeholder={t("operator.dashboard.teamFighterB")} className="bg-white/5 border-white/10 text-white placeholder:text-white/20" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <select value={newSport} onChange={(e) => setNewSport(e.target.value)} className="bg-white/5 border border-white/10 text-white rounded-md h-10 px-3 text-sm">
                    {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <Input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="bg-white/5 border-white/10 text-white" />
                </div>
                <label className="flex items-center gap-2 text-sm text-white/60 cursor-pointer">
                  <input type="checkbox" checked={newFeatured} onChange={e => setNewFeatured(e.target.checked)} className="rounded" />
                  {t("operator.dashboard.featuredEvent")}
                </label>
                <div className="flex gap-2">
                  <Button onClick={createEvent} disabled={!newTeamA || !newTeamB || creating} className="platform-blue-button border-0">
                    {creating ? t("operator.dashboard.creating") : t("operator.dashboard.createGoLive")}
                  </Button>
                  <Button onClick={() => setShowNewEvent(false)} variant="outline" className="border-white/10 text-white hover:bg-white/5">{t("operator.dashboard.cancel")}</Button>
                </div>
                <p className="text-[10px] text-white/20">{t("operator.dashboard.eventsGoLive")}</p>
              </div>
            )}

            {events.length === 0 ? (
              <div className="bg-white/[0.02] border border-dashed border-white/10 rounded-xl p-12 text-center text-white/30">
                {t("operator.dashboard.noEventsYet")}
              </div>
            ) : (
              <div className="space-y-3">
                {events.map((ev: any) => {
                  const fight = fights.find((f: any) => f.operator_event_id === ev.id);
                  const isEditing = editingEventId === ev.id;
                  return (
                    <div key={ev.id}>
                      <OperatorEventActions
                        event={ev}
                        fight={fight}
                        onAction={handleEventAction}
                      />
                      {ev.status !== "settled" && (
                        <div className="mt-1">
                          {isEditing ? (
                            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] text-white/40">{t("operator.dashboard.sport")}</label>
                                  <select value={editSport} onChange={e => setEditSport(e.target.value)} className="w-full bg-white/5 border border-white/10 text-white rounded-md h-8 px-2 text-xs">
                                    {SPORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                  </select>
                                </div>
                                <div>
                                  <label className="text-[10px] text-white/40">{t("operator.dashboard.dateTime")}</label>
                                  <Input type="datetime-local" value={editDate} onChange={e => setEditDate(e.target.value)} className="bg-white/5 border-white/10 text-white h-8 text-xs" />
                                </div>
                              </div>
                              <label className="flex items-center gap-2 text-xs text-white/40 cursor-pointer">
                                <input type="checkbox" checked={editFeatured} onChange={e => setEditFeatured(e.target.checked)} className="rounded" />
                                {t("operator.dashboard.featured")}
                              </label>
                              <div className="flex gap-2">
                                <Button size="sm" onClick={() => saveEventEdit(ev.id)} disabled={savingEvent} className="platform-blue-button border-0 text-xs h-7">
                                  {savingEvent ? t("operator.dashboard.saving") : t("operator.dashboard.save")}
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => setEditingEventId(null)} className="border-white/10 text-white hover:bg-white/5 text-xs h-7">{t("operator.dashboard.cancel")}</Button>
                              </div>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                setEditingEventId(ev.id);
                                setEditSport(ev.sport || "Soccer");
                                setEditDate(ev.event_date ? new Date(ev.event_date).toISOString().slice(0, 16) : "");
                                setEditFeatured(ev.is_featured || false);
                              }}
                              className="text-[10px] text-white/20 hover:text-white/50 mt-1 flex items-center gap-1"
                            >
                              <Edit3 size={10} /> {t("operator.dashboard.editEvent")}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ─── OVERVIEW TAB ─── */}
        {dashTab === "overview" && (
          <>
            {/* Paused banner */}
            {appPaused && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                <Lock size={16} className="text-red-400 shrink-0" />
                <div>
                  <div className="text-sm font-medium text-red-400">{t("operator.dashboard.appPausedBanner")}</div>
                  <div className="text-xs text-white/40">{t("operator.dashboard.appPausedBannerDesc")}</div>
                </div>
              </div>
            )}
            {/* Payout wallet warning */}
            {!operator.payout_wallet && (
              <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4 flex items-center gap-3">
                <Wallet size={16} className="text-yellow-400 shrink-0" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-yellow-300">{t("operator.dashboard.payoutNotSet")}</div>
                  <div className="text-xs text-white/40">{t("operator.dashboard.payoutNotSetDesc")}</div>
                </div>
                <Button size="sm" onClick={() => setDashTab("earnings")} className="platform-blue-button border-0 text-xs whitespace-nowrap">
                  {t("operator.dashboard.setWallet")}
                </Button>
              </div>
            )}

            {/* App Details */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mb-6">
              <div className="flex items-center gap-4 mb-4">
                {/* Logo preview */}
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {operator.logo_url ? (
                    <img src={operator.logo_url} alt="" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                  ) : (
                    <span className="text-lg font-bold text-white/20">{operator.brand_name.charAt(0)}</span>
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-lg">{operator.brand_name}</h3>
                  <a
                    href={`https://1mg.live/${operator.subdomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-400 flex items-center gap-1 hover:text-blue-300"
                  >
                    1mg.live/{operator.subdomain} <ExternalLink size={12} />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <Button onClick={copyAppLink} size="sm" variant="outline" className="border-white/10 text-white hover:bg-white/5 text-xs gap-1.5">
                  {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                  {t("operator.dashboard.copyLink")}
                </Button>
                <span className={`text-xs px-2 py-1 rounded-full ${operator.status === "active" ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                  {operator.status}
                </span>
              </div>
              <div className="border-t border-white/5 pt-4">
                <p className="text-xs text-white/40 mb-3">Share your app</p>
                <OperatorQRCode subdomain={operator.subdomain} size={140} />
              </div>
            </div>

            {/* Key Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><TrendingUp size={14} /> {t("operator.dashboard.predictions")}</div>
                <div className="text-xl font-bold">{revenue.count}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><DollarSign size={14} /> {t("operator.dashboard.volume")}</div>
                <div className="text-xl font-bold">${fights.reduce((s: number, f: any) => s + (f.pool_a_usd || 0) + (f.pool_b_usd || 0), 0).toFixed(0)}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><DollarSign size={14} /> {t("operator.dashboard.earned")}</div>
                <div className="text-xl font-bold text-green-400">${revenue.total.toFixed(2)}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Wallet size={14} /> {t("operator.dashboard.walletLabel")}</div>
                <div className="text-xl font-bold text-emerald-400">${walletBalance != null ? walletBalance.toFixed(2) : "—"}</div>
                <div className="text-[10px] text-white/20 mt-0.5">{t("operator.dashboard.connectedWallet")}</div>
              </div>
            </div>

            {/* Most Popular Event */}
            {fights.length > 0 && (() => {
              const top = [...fights].sort((a: any, b: any) => ((b.pool_a_usd || 0) + (b.pool_b_usd || 0)) - ((a.pool_a_usd || 0) + (a.pool_b_usd || 0)))[0] as any;
              if (!top) return null;
              const pool = (top.pool_a_usd || 0) + (top.pool_b_usd || 0);
              return (
                <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4 mb-6">
                  <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Trophy size={14} /> {t("operator.dashboard.mostPopularEvent")}</div>
                  <div className="text-sm font-bold text-white">{top.title || "—"}</div>
                  <div className="text-xs text-white/40 mt-0.5">${pool.toFixed(0)} total pool • {top.shares_a + top.shares_b} {t("operator.dashboard.predictions").toLowerCase()}</div>
                </div>
              );
            })()}

            {/* Quick Stats Row */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><Calendar size={14} /> {t("operator.dashboard.events")}</div>
                <div className="text-xl font-bold">{events.length}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
                <div className="flex items-center gap-2 text-white/40 mb-1 text-xs"><BarChart3 size={14} /> {t("operator.dashboard.feeRate")}</div>
                <div className="text-xl font-bold">{operator.fee_percent}%</div>
              </div>
            </div>

            {/* Earnings CTA */}
            {revenue.total > 0 && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-emerald-400">{t("operator.dashboard.totalEarningsLabel")}</div>
                  <div className="text-2xl font-bold text-emerald-300">${revenue.total.toFixed(2)}</div>
                  <div className="text-xs text-white/30 mt-0.5">{t("operator.dashboard.earningsSentToPayout")}</div>
                </div>
                <Button onClick={() => setDashTab("earnings")} className="bg-emerald-600 hover:bg-emerald-500 border-0">
                  {t("operator.dashboard.viewEarnings")}
                </Button>
              </div>
            )}

            {/* Support footer */}
            <div className="mt-6 text-[10px] text-white/20 flex items-center gap-1">
              <Mail size={10} /> {t("operator.dashboard.support")}: <a href="mailto:1mgaming@proton.me" className="text-blue-400/60 hover:text-blue-400">1mgaming@proton.me</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
