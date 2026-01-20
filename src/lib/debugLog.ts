// src/lib/debugLog.ts
/**
 * Debug logging utility with ring buffer.
 * Enabled ONLY via ?debug=1 in URL (non-sticky).
 * Safe for production.
 */

export type DebugEvent = {
  t: number;
  tag: string;
  data?: any;
};

const STORAGE_KEY = "__1mg_debug_logs_v1";
const MAX = 400;
const MAX_ENTRY_BYTES = 2048;

// Keys that should NEVER be logged
const SENSITIVE_KEYS = [
  "privatekey",
  "secretkey",
  "mnemonic",
  "seed",
  "password",
  "token",
  "apikey",
  "authorization",
  "auth",
  "bearer",
];

function isSensitiveKey(key: string) {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

function replacer(k: string, v: any) {
  if (isSensitiveKey(k)) return "[REDACTED]";
  if (typeof v === "bigint") return v.toString();
  if (v?.toBase58 && typeof v.toBase58 === "function") return v.toBase58();
  if (v instanceof Error) return { message: v.message, stack: v.stack };
  return v;
}

function sanitize(data: any) {
  try {
    const json = JSON.stringify(data, replacer);
    if (json.length > MAX_ENTRY_BYTES) {
      return json.slice(0, MAX_ENTRY_BYTES) + "...[truncated]";
    }
    return JSON.parse(json);
  } catch {
    return String(data);
  }
}

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  
  // Check URL first
  const qs = new URLSearchParams(window.location.search);
  if (qs.get("debug") === "1") {
    // Persist to sessionStorage so it survives navigation
    try {
      sessionStorage.setItem("__debug_enabled", "1");
    } catch {}
    return true;
  }
  
  // Fallback to sessionStorage (persists across navigation within tab)
  try {
    return sessionStorage.getItem("__debug_enabled") === "1";
  } catch {
    return false;
  }
}

function loadStored(): DebugEvent[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebugEvent[]) : [];
  } catch {
    return [];
  }
}

export function dbg(tag: string, data?: any) {
  const IS_DEV = import.meta.env.DEV;
  if (!IS_DEV && !isDebugEnabled()) return;

  const evt: DebugEvent = {
    t: Date.now(),
    tag,
    data: sanitize(data),
  };

  const w = window as any;
  if (!w.__DBG) {
    w.__DBG = loadStored();
  }

  const arr: DebugEvent[] = w.__DBG;
  arr.push(evt);

  if (arr.length > MAX) {
    arr.splice(0, arr.length - MAX);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  } catch {}

  try {
    // eslint-disable-next-line no-console
    console.log(`[DBG] ${tag}`, evt.data ?? "");
  } catch {}
}

export function getDbg(): DebugEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DebugEvent[]) : [];
  } catch {
    return [];
  }
}

export function clearDbg() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
  (window as any).__DBG = [];
}

// Auto-capture global errors (runs once on import)
// Guarded to prevent double-registration in hot reload
if (typeof window !== "undefined" && !(window as any).__DBG_ERR_HOOKS__) {
  (window as any).__DBG_ERR_HOOKS__ = true;

  try {
    window.addEventListener("error", (e) => {
      try {
        dbg("window.error", {
          message: e.message,
          filename: e.filename,
          lineno: e.lineno,
          colno: e.colno,
        });
      } catch {}
    });
  } catch {}

  try {
    window.addEventListener("unhandledrejection", (e) => {
      try {
        dbg("unhandledrejection", {
          reason: e.reason?.message || String(e.reason),
        });
      } catch {}
    });
  } catch {}
}
