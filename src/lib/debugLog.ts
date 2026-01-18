// src/lib/debugLog.ts
/**
 * Debug logging utility with persistent ring buffer.
 * Enabled via ?debug=1 in URL or localStorage.__debug=1
 */

export type DebugEvent = {
  t: number;
  tag: string;
  data?: any;
};

const STORAGE_KEY = "__1mg_debug_logs_v1";
const MAX = 400;

function replacer(_k: string, v: any) {
  if (typeof v === "bigint") return v.toString();
  if (v?.toBase58 && typeof v.toBase58 === "function") return v.toBase58();
  if (v instanceof Error) return { message: v.message, stack: v.stack };
  return v;
}

function sanitize(data: any) {
  try {
    return JSON.parse(JSON.stringify(data, replacer));
  } catch {
    return String(data);
  }
}

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const qs = new URLSearchParams(window.location.search);
  const enabled = qs.get("debug") === "1" || localStorage.getItem("__debug") === "1";
  if (enabled) localStorage.setItem("__debug", "1"); // sticky once enabled
  return enabled;
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
  if (!isDebugEnabled()) return;

  const evt: DebugEvent = { t: Date.now(), tag, data: sanitize(data) };

  const w = window as any;

  // IMPORTANT: On first log in a fresh page session, LOAD existing logs
  if (!w.__DBG) {
    w.__DBG = loadStored();
  }

  const arr: DebugEvent[] = w.__DBG;

  arr.push(evt);
  if (arr.length > MAX) arr.splice(0, arr.length - MAX);

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
