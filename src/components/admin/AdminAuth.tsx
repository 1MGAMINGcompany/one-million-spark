import { useState, useEffect, useCallback } from "react";
import { Shield, Mail, Loader2, LogOut, UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SESSION_KEY = "admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface AdminSession {
  email: string;
  wallet: string;
  expiresAt: number;
}

function getStoredSession(): AdminSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const session: AdminSession = JSON.parse(raw);
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function storeSession(session: AdminSession) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

interface AdminAuthProps {
  children: (props: { adminWallet: string; adminEmail: string; onLogout: () => void }) => React.ReactNode;
}

export default function AdminAuth({ children }: AdminAuthProps) {
  const [session, setSession] = useState<AdminSession | null>(getStoredSession);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // Manage admins state
  const [showManage, setShowManage] = useState(false);
  const [admins, setAdmins] = useState<{ wallet: string; email: string | null }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [manageLoading, setManageLoading] = useState(false);

  const isPrimaryAdmin = session?.email === "morganlaurent@live.ca";

  const loadAdmins = useCallback(async () => {
    const { data } = await supabase
      .from("prediction_admins")
      .select("wallet, email");
    if (data) setAdmins(data as any[]);
  }, []);

  useEffect(() => {
    if (showManage && session) loadAdmins();
  }, [showManage, session, loadAdmins]);

  const handleSendOTP = async () => {
    if (!email.trim()) { toast.error("Enter your email"); return; }
    setLoading(true);
    try {
      // Check if email exists in prediction_admins
      const { data: adminRows } = await supabase
        .from("prediction_admins")
        .select("wallet, email")
        .eq("email", email.trim().toLowerCase())
        .limit(1);
      const admin = adminRows && adminRows.length > 0 ? adminRows[0] : null;

      if (!admin) {
        toast.error("This email is not registered as an admin.");
        setLoading(false);
        return;
      }

      // Send OTP via Supabase Auth magic link (OTP mode)
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: { shouldCreateUser: false, emailRedirectTo: undefined },
      });

      if (error) throw error;

      toast.success("Verification code sent to your email!");
      setStep("otp");
    } catch (err: any) {
      toast.error(err.message || "Failed to send verification code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: otp,
        type: "email",
      });

      if (error) throw error;

      // Get admin record for wallet reference
      const { data: adminRows2 } = await supabase
        .from("prediction_admins")
        .select("wallet, email")
        .eq("email", email.trim().toLowerCase())
        .limit(1);
      const admin = adminRows2 && adminRows2.length > 0 ? adminRows2[0] : null;

      if (!admin) {
        toast.error("Admin record not found");
        setVerifying(false);
        return;
      }

      const newSession: AdminSession = {
        email: email.trim().toLowerCase(),
        wallet: admin.wallet,
        expiresAt: Date.now() + SESSION_DURATION_MS,
      };
      storeSession(newSession);
      setSession(newSession);
      toast.success("Admin access granted!");
    } catch (err: any) {
      toast.error(err.message || "Invalid verification code");
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setStep("email");
    setEmail("");
    setOtp("");
    supabase.auth.signOut();
  };

  const handleAddAdmin = async () => {
    if (!newAdminEmail.trim()) return;
    setManageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: {
          action: "addAdmin",
          wallet: session!.wallet,
          admin_email: newAdminEmail.trim().toLowerCase(),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Admin added!");
      setNewAdminEmail("");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setManageLoading(false);
    }
  };

  const handleRemoveAdmin = async (adminWallet: string) => {
    if (adminWallet === session?.wallet) { toast.error("Cannot remove yourself"); return; }
    setManageLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("prediction-admin", {
        body: {
          action: "removeAdmin",
          wallet: session!.wallet,
          target_wallet: adminWallet,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success("Admin removed");
      loadAdmins();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setManageLoading(false);
    }
  };

  // Not authenticated — show login
  if (!session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-sm mx-auto px-4">
          <div className="text-center mb-8">
            <Shield className="w-12 h-12 text-primary mx-auto mb-3" />
            <h1 className="text-xl font-bold text-foreground">Admin Access</h1>
            <p className="text-sm text-muted-foreground mt-1">Sign in with your admin email</p>
          </div>

          {step === "email" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Email</label>
                <Input
                  type="email"
                  placeholder="admin@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleSendOTP()}
                />
              </div>
              <Button onClick={handleSendOTP} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Verification Code
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground text-center">
                Enter the 6-digit code sent to <span className="font-medium text-foreground">{email}</span>
              </p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otp} onChange={setOtp}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} />
                    <InputOTPSlot index={1} />
                    <InputOTPSlot index={2} />
                    <InputOTPSlot index={3} />
                    <InputOTPSlot index={4} />
                    <InputOTPSlot index={5} />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={handleVerifyOTP} disabled={verifying || otp.length !== 6} className="w-full">
                {verifying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Verify & Sign In
              </Button>
              <button
                onClick={() => { setStep("email"); setOtp(""); }}
                className="text-xs text-muted-foreground hover:text-foreground mx-auto block"
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Authenticated — render children with admin context + manage section
  return (
    <>
      {children({ adminWallet: session.wallet, adminEmail: session.email, onLogout: handleLogout })}

      {/* Floating admin bar */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        {isPrimaryAdmin && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowManage(!showManage)}
            className="text-xs"
          >
            <UserPlus className="w-3 h-3 mr-1" />
            Manage Admins
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={handleLogout} className="text-xs text-muted-foreground">
          <LogOut className="w-3 h-3 mr-1" />
          {session.email}
        </Button>
      </div>

      {/* Manage admins modal */}
      {showManage && isPrimaryAdmin && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowManage(false)}>
          <div className="bg-background border border-border rounded-xl max-w-md w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-foreground">Manage Admins</h3>

            <div className="space-y-2">
              {admins.map(a => (
                <div key={a.wallet} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <span className="text-sm text-foreground">{a.email || a.wallet}</span>
                  {a.wallet !== session.wallet && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveAdmin(a.wallet)}
                      disabled={manageLoading}
                    >
                      <Trash2 className="w-3 h-3 text-destructive" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="new-admin@email.com"
                value={newAdminEmail}
                onChange={e => setNewAdminEmail(e.target.value)}
                className="text-sm"
              />
              <Button size="sm" onClick={handleAddAdmin} disabled={manageLoading}>
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
