import { useLogin } from "@privy-io/react-auth";
import { useRef } from "react";
import { toast } from "sonner";
import { dbg } from "@/lib/debugLog";
import { getPrivyAppId } from "@/lib/privyConfig";

const noopLogin = () => {
  console.warn("[usePrivyLogin] Privy not configured — login() is a no-op");
  toast.error("Authentication is not configured for this build.");
};

export function usePrivyLogin() {
  const appId = getPrivyAppId();
  if (!appId) {
    return { login: noopLogin };
  }
  return usePrivyLoginInner();
}

function usePrivyLoginInner() {
  const loginTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLoginTimeout = () => {
    if (loginTimeoutRef.current) {
      clearTimeout(loginTimeoutRef.current);
      loginTimeoutRef.current = null;
    }
  };

  const { login } = useLogin({
    onComplete: ({ user, isNewUser }) => {
      clearLoginTimeout();
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
      clearLoginTimeout();
      const code = typeof error === "string" ? error : (error as any)?.code ?? String(error);
      dbg("privy:login:error", {
        code,
        errorRaw: String(error),
        origin: window.location.origin,
        hostname: window.location.hostname,
        path: window.location.pathname,
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
    });

    clearLoginTimeout();
    loginTimeoutRef.current = setTimeout(() => {
      loginTimeoutRef.current = null;
      toast.error("Login dialog didn't appear. Check domain configuration or try again.");
      dbg("privy:login:timeout", {
        origin: window.location.origin,
        hostname: window.location.hostname,
      });
    }, 5000);

    login();
  };

  return { login: loginWithDebug };
}
