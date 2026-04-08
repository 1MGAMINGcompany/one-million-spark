import { useLogin } from "@privy-io/react-auth";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";

export function usePrivyLogin() {
  const { login } = useLogin({
    onComplete: ({ user, isNewUser }) => {
      dbg("privy:login:complete", {
        userId: user.id,
        isNewUser,
        origin: window.location.origin,
        path: window.location.pathname,
        linkedAccounts: user.linkedAccounts?.length ?? 0,
      });
      console.log("[Privy] Login complete", {
        userId: user.id,
        isNewUser,
        origin: window.location.origin,
        path: window.location.pathname,
      });
    },
    onError: (error) => {
      const code = typeof error === "string" ? error : (error as any)?.code ?? String(error);
      dbg("privy:login:error", {
        code,
        errorRaw: String(error),
        origin: window.location.origin,
        hostname: window.location.hostname,
        path: window.location.pathname,
        appId: import.meta.env.VITE_PRIVY_APP_ID ?? "(fallback)",
      });
      console.error("[Privy] Login error:", {
        code,
        error,
        origin: window.location.origin,
        path: window.location.pathname,
        hostname: window.location.hostname,
      });

      switch (code) {
        case "allowlist_rejected":
          toast.error("This domain is not authorized for login. Please contact support.");
          break;
        case "disallowed_login_method":
          toast.error("This login method is not enabled. Try email instead.");
          break;
        case "exited_auth_flow":
          // User closed modal voluntarily — no toast
          break;
        case "client_request_timeout":
          toast.error("Connection timeout. Please check your internet and try again.");
          break;
        case "unknown_connect_error":
        case "oauth_unexpected":
        case "unknown_auth_error":
          toast.error("Login failed — possible domain or cookie issue. Please try again or contact support.");
          break;
        default:
          toast.error("Login failed. Please try again.");
          break;
      }
    },
  });

  const loginWithDebug = () => {
    dbg("privy:login:attempt", {
      origin: window.location.origin,
      hostname: window.location.hostname,
      path: window.location.pathname,
      appId: import.meta.env.VITE_PRIVY_APP_ID ?? "(fallback)",
    });
    console.log("[Auth] Login attempt from:", {
      origin: window.location.origin,
      path: window.location.pathname,
      hostname: window.location.hostname,
    });
    login();
  };

  return { login: loginWithDebug };
}
