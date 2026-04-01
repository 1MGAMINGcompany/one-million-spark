import { useState, useEffect, useCallback } from "react";
import { Shield, Mail, Loader2, LogOut, UserPlus, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const SESSION_KEY = "admin_session";
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

const ADMIN_REDIRECT = "https://1mgaming.com/predictions/admin";

/** Parse auth error from URL hash (e.g. #error=access_denied&error_code=otp_expired) */
function parseHashError(): { code: string; description: string } | null {
  try {
    const hash = window.location.hash;
    if (!hash || !hash.includes("error=")) return null;
    const params = new URLSearchParams(hash.substring(1));
    const code = params.get("error_code") || params.get("error") || "unknown";
    const description = (params.get("error_description") || "Authentication failed").replace(/\+/g, " ");
    return { code, description };
  } catch {
    return null;
  }
}

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
  const [step, setStep] = useState<"email" | "waiting" | "error">("email");
  const [loading, setLoading] = useState(false);
  const [hashError, setHashError] = useState<string | null>(null);

  // Auth restoration state — avoids async deadlock in onAuthStateChange
  const [authReady, setAuthReady] = useState(false);
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Manage admins state
  const [showManage, setShowManage] = useState(false);
  const [admins, setAdmins] = useState<{ wallet: string; email: string | null }[]>([]);
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [manageLoading, setManageLoading] = useState(false);

  const isPrimaryAdmin = session?.email === "morganlaurent@live.ca";

  // Detect auth errors in URL hash on mount (e.g. expired/consumed magic link)
  useEffect(() => {
    const err = parseHashError();
    if (err) {
      const msg = err.code === "otp_expired"
        ? "Login link expired or was already used. This can happen if your email provider scans links. Please request a new one."
        : err.description;
      setHashError(msg);
      setStep("error");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  // 1. Restore session on mount, then mark authReady
  useEffect(() => {
    if (session) { setAuthReady(true); return; }

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (s?.user?.email) {
        setAuthEmail(s.user.email.toLowerCase().trim());
      }
      setAuthReady(true);
    });
  }, [session]);

  // 2. Synchronous auth state listener — no async work inside callback
  useEffect(() => {
    if (session) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, authSession) => {
      if (event === "SIGNED_IN" && authSession?.user?.email) {
        setAuthEmail(authSession.user.email.toLowerCase().trim());
      }
      if (event === "SIGNED_OUT") {
        setAuthEmail(null);
      }
    });

    return () => subscription.unsubscribe();
  }, [session]);

  // 3. Verify admin status in a separate effect — safe to await here
  useEffect(() => {
    if (!authReady || !authEmail || session || verifying) return;

    setVerifying(true);

    (async () => {
      try {
        const { data: adminRows } = await supabase
          .from("prediction_admins")
          .select("wallet, email")
          .eq("email", authEmail)
          .limit(1);
        const admin = adminRows && adminRows.length > 0 ? adminRows[0] : null;

        if (admin) {
          const newSession: AdminSession = {
            email: authEmail,
            wallet: admin.wallet,
            expiresAt: Date.now() + SESSION_DURATION_MS,
          };
          storeSession(newSession);
          setSession(newSession);
          setStep("email");
          toast.success("Admin access granted!");
        } else {
          toast.error("This email is not registered as an admin.");
          supabase.auth.signOut();
        }
      } catch {
        toast.error("Failed to verify admin status.");
      } finally {
        setVerifying(false);
      }
    })();
  }, [authReady, authEmail, session, verifying]);

  const loadAdmins = useCallback(async () => {
    const { data } = await supabase
      .from("prediction_admins")
      .select("wallet, email");
    if (data) setAdmins(data as any[]);
  }, []);

  useEffect(() => {
    if (showManage && session) loadAdmins();
  }, [showManage, session, loadAdmins]);

  const handleSendMagicLink = async () => {
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

      // Send magic link — use production URL to avoid redirect allowlist issues
      const redirectUrl = window.location.hostname === "1mgaming.com"
        ? ADMIN_REDIRECT
        : `${window.location.origin}/predictions/admin`;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: false,
          emailRedirectTo: redirectUrl,
        },
      });

      if (error) throw error;

      toast.success("Login link sent to your email!");
      setStep("waiting");
    } catch (err: any) {
      toast.error(err.message || "Failed to send login link");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSession(null);
    setStep("email");
    setEmail("");
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

  // Signing in — auth restored but admin verification in progress
  if (!session && (verifying || (!authReady && !hashError))) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">Signing you in…</p>
        </div>
      </div>
    );
  }

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
                  onKeyDown={e => e.key === "Enter" && handleSendMagicLink()}
                />
              </div>
              <Button onClick={handleSendMagicLink} disabled={loading} className="w-full">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                Send Login Link
              </Button>
            </div>
          ) : step === "error" ? (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-lg bg-destructive/10 border border-destructive/30">
                <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">
                  Login link expired
                </p>
                <p className="text-sm text-muted-foreground">
                  {hashError || "The link was already used or has expired. This often happens when email providers scan links automatically."}
                </p>
              </div>
              <Button
                onClick={() => { setStep("email"); setHashError(null); }}
                className="w-full"
              >
                <Mail className="w-4 h-4 mr-2" />
                Request a new link
              </Button>
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <div className="p-4 rounded-lg bg-muted/50 border border-border">
                <Mail className="w-8 h-8 text-primary mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">
                  Check your email
                </p>
                <p className="text-sm text-muted-foreground">
                  We sent a login link to <span className="font-medium text-foreground">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-2">
                  Click the link in the email to sign in. You'll be redirected back here automatically.
                </p>
              </div>
              <button
                onClick={() => { setStep("email"); }}
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
