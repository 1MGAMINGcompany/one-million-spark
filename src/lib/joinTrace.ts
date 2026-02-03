// src/lib/joinTrace.ts
/**
 * Join Trace Diagnostics - instrumentation for debugging join flow issues.
 * 
 * Enabled ONLY when localStorage.debug_join === "1"
 * Produces a single JSON trace for debugging failed joins on mobile.
 * 
 * SECURITY: Automatically redacts sensitive fields (tokens, authorization, etc.)
 */

const STORAGE_KEY = "join_trace_latest";
const MAX_ENTRIES = 200;
const MAX_PREVIEW_BYTES = 500;

// Sensitive keys that should NEVER be logged
const SENSITIVE_KEYS = [
  "token",
  "session_token",
  "sessiontoken",
  "authorization",
  "bearer",
  "secret",
  "password",
  "privatekey",
  "apikey",
  "key",
  "mnemonic",
  "seed",
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[_-]/g, "");
  return SENSITIVE_KEYS.some((s) => k.includes(s));
}

/**
 * Redact sensitive fields from an object
 */
function redact(obj: unknown, depth = 0): unknown {
  if (depth > 5) return "[MAX_DEPTH]";
  
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === "string") {
    // Redact strings that look like tokens (long base58/base64)
    if (obj.length > 32 && /^[A-Za-z0-9+/=_-]+$/.test(obj)) {
      return `${obj.slice(0, 8)}...[REDACTED]`;
    }
    return obj;
  }
  
  if (typeof obj === "number" || typeof obj === "boolean") return obj;
  
  if (typeof obj === "bigint") return obj.toString();
  
  if (Array.isArray(obj)) {
    return obj.slice(0, 10).map((item) => redact(item, depth + 1));
  }
  
  if (typeof obj === "object") {
    // Handle special types
    if (obj instanceof Error) {
      return {
        message: obj.message,
        stackPreview: obj.stack?.slice(0, 300) || null,
      };
    }
    
    // Handle PublicKey-like objects
    if ("toBase58" in obj && typeof (obj as any).toBase58 === "function") {
      return (obj as any).toBase58();
    }
    
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redact(value, depth + 1);
      }
    }
    return result;
  }
  
  return String(obj);
}

/**
 * Check if join trace debugging is enabled
 */
export function isJoinTraceEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem("debug_join") === "1";
  } catch {
    return false;
  }
}

export interface JoinTraceEntry {
  t: number;
  tag: string;
  data?: unknown;
}

export interface JoinTrace {
  traceId: string;
  startedAt: number;
  entries: JoinTraceEntry[];
}

/**
 * Generate a unique trace ID for correlating join flow
 */
function generateTraceId(): string {
  const timestamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `jt_${timestamp}_${rand}`;
}

/**
 * Get or create the current trace from window
 */
function getCurrentTrace(): JoinTrace | null {
  if (typeof window === "undefined") return null;
  return (window as any).__JOIN_TRACE || null;
}

/**
 * Save trace to both window and localStorage
 */
function saveTrace(trace: JoinTrace): void {
  if (typeof window === "undefined") return;
  
  (window as any).__JOIN_TRACE = trace;
  
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trace, null, 2));
  } catch {
    // Storage full or unavailable
  }
}

/**
 * Create a new join trace session
 */
export function startJoinTrace(): string {
  if (!isJoinTraceEnabled()) return "";
  
  const traceId = generateTraceId();
  const trace: JoinTrace = {
    traceId,
    startedAt: Date.now(),
    entries: [],
  };
  
  saveTrace(trace);
  
  // Also log to console for visibility
  console.log(`[JoinTrace] Started new trace: ${traceId}`);
  
  return traceId;
}

/**
 * Log an entry to the current join trace
 */
export function traceLog(tag: string, data?: unknown): void {
  if (!isJoinTraceEnabled()) return;
  
  const trace = getCurrentTrace();
  if (!trace) return;
  
  const entry: JoinTraceEntry = {
    t: Date.now(),
    tag,
    data: redact(data),
  };
  
  trace.entries.push(entry);
  
  // Trim if too many entries
  if (trace.entries.length > MAX_ENTRIES) {
    trace.entries = trace.entries.slice(-MAX_ENTRIES);
  }
  
  saveTrace(trace);
  
  // Also log to console
  console.log(`[JoinTrace:${trace.traceId.slice(0, 12)}] ${tag}`, entry.data ?? "");
}

/**
 * Get the current trace ID (for correlation header)
 */
export function getTraceId(): string | null {
  const trace = getCurrentTrace();
  return trace?.traceId || null;
}

/**
 * Get auth headers with optional trace correlation
 * Returns just the trace header (not auth header which should be added separately)
 */
export function getTraceHeaders(): Record<string, string> {
  if (!isJoinTraceEnabled()) return {};
  
  const traceId = getTraceId();
  if (!traceId) return {};
  
  return {
    "X-Join-Trace-Id": traceId,
  };
}

/**
 * Create a safe body preview (truncated, redacted)
 */
export function safeBodyPreview(body: unknown): string {
  try {
    const redacted = redact(body);
    const json = JSON.stringify(redacted);
    if (json.length > MAX_PREVIEW_BYTES) {
      return json.slice(0, MAX_PREVIEW_BYTES) + "...[truncated]";
    }
    return json;
  } catch {
    return "[stringify error]";
  }
}

/**
 * Get the latest join trace as JSON string
 */
export function getJoinTrace(): string | null {
  if (typeof window === "undefined") return null;
  
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Clear the current join trace
 */
export function clearJoinTrace(): void {
  if (typeof window === "undefined") return;
  
  try {
    localStorage.removeItem(STORAGE_KEY);
    (window as any).__JOIN_TRACE = null;
  } catch {
    // Ignore
  }
}

/**
 * Helper to log fetch calls in join flow
 */
export function traceLogFetch(
  name: string,
  urlPath: string,
  method: string,
  hasAuthHeader: boolean
): void {
  traceLog("join.fetch", { name, urlPath, method, hasAuthHeader });
}

/**
 * Helper to log fetch results in join flow
 */
export function traceLogFetchResult(
  name: string,
  status: number | undefined,
  ok: boolean,
  body: unknown
): void {
  traceLog("join.fetch.result", {
    name,
    status,
    ok,
    bodyPreview: safeBodyPreview(body),
  });
}

/**
 * Helper to log poll results from game-session-get
 */
export function traceLogPoll(debug: {
  participantsCount?: number;
  player_sessions_count?: number;
  game_acceptances_count?: number;
  player2_wallet?: string | null;
  requiredCount?: number;
  acceptedCount?: number;
  bothAccepted?: boolean;
  elapsed?: number;
}): void {
  traceLog("join.poll", {
    participantsCount: debug.participantsCount,
    player_sessions_count: debug.player_sessions_count,
    game_acceptances_count: debug.game_acceptances_count,
    player2_wallet_present: !!debug.player2_wallet,
    requiredCount: debug.requiredCount,
    acceptedCount: debug.acceptedCount,
    bothAccepted: debug.bothAccepted,
    elapsed: debug.elapsed,
  });
}
