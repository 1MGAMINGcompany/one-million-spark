import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { getDbg, clearDbg, isDebugEnabled } from "@/lib/debugLog";

type Pos = { x: number; y: number };
const POS_KEY = "__debughud_pos_v2";
const MIN_KEY = "__debughud_min_v2";

export default function DebugHUD() {
  const enabled = isDebugEnabled();
  const location = useLocation();

  const [tick, setTick] = useState(0);
  const logs = useMemo(() => getDbg(), [tick]);

  const [minimized, setMinimized] = useState(() => {
    try {
      return localStorage.getItem(MIN_KEY) === "1";
    } catch {
      return false;
    }
  });

  const [pos, setPos] = useState<Pos>(() => {
    try {
      const raw = localStorage.getItem(POS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return { x: 8, y: 8 }; // top-left by default (won't block your main buttons)
  });

  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const persist = (p: Pos) => {
    try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch {}
  };

  const persistMin = (m: boolean) => {
    try { localStorage.setItem(MIN_KEY, m ? "1" : "0"); } catch {}
  };

  useEffect(() => {
    if (!enabled) return;

    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const next = { x: Math.max(0, e.clientX - offset.current.x), y: Math.max(0, e.clientY - offset.current.y) };
      setPos(next);
    };

    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      persist(pos);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [enabled, pos]);

  if (!enabled) return null;

  const copyLogs = async () => {
    const payload = JSON.stringify(getDbg(), null, 2);
    await navigator.clipboard.writeText(payload);
    alert("Copied debug logs to clipboard");
  };

  const onDragStart = (e: React.PointerEvent) => {
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    // ensures dragging works reliably on mobile
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const toggleMin = () => {
    const next = !minimized;
    setMinimized(next);
    persistMin(next);
  };

  return (
    // Outer wrapper does NOT block the app
    <div
      style={{
        position: "fixed",
        left: pos.x,
        top: pos.y,
        zIndex: 2147483647,
        pointerEvents: "none", // KEY: let clicks pass through
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 11,
      }}
    >
      {/* Inner panel is clickable */}
      <div
        style={{
          pointerEvents: "auto", // clickable
          background: "rgba(0,0,0,0.85)",
          color: "#fff",
          border: "1px solid rgba(255,255,255,0.25)",
          borderRadius: 10,
          width: minimized ? 140 : 320,
          maxWidth: "90vw",
          overflow: "hidden",
        }}
      >
        {/* Drag bar (works on touch) */}
        <div
          onPointerDown={onDragStart}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "6px 10px",
            background: "rgba(255,255,0,0.15)",
            cursor: "grab",
            touchAction: "none", // needed for mobile drag
          }}
        >
          <span style={{ fontWeight: 600, color: "#ff0" }}>HUD • {location.pathname}</span>
          <button onClick={toggleMin} style={{ padding: "2px 8px", fontSize: 10 }}>
            {minimized ? "Open" : "Min"}
          </button>
        </div>

        {minimized ? (
          <div style={{ display: "flex", gap: 4, padding: 6 }}>
            <button onClick={copyLogs} style={{ padding: "6px 8px", flex: 1 }}>Copy</button>
            <button onClick={() => { clearDbg(); setTick((t) => t + 1); }} style={{ padding: "6px 8px", flex: 1 }}>Clear</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 4, padding: "6px 10px" }}>
              <button onClick={copyLogs} style={{ padding: "6px 8px", flex: 1 }}>Copy logs</button>
              <button onClick={() => window.location.reload()} style={{ padding: "6px 8px", flex: 1 }}>Reload</button>
              <button onClick={() => { clearDbg(); setTick((t) => t + 1); }} style={{ padding: "6px 8px", flex: 1 }}>Clear</button>
            </div>

            <div style={{ padding: "4px 10px", borderTop: "1px solid #333" }}>
              <div style={{ color: "#888", marginBottom: 2 }}>Tip: Drag from the top bar.</div>
              <div style={{ color: "#0ff" }}>Route: {location.pathname}</div>
            </div>

            <pre style={{ margin: 0, padding: 10, maxHeight: 180, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 9, borderTop: "1px solid #333" }}>
              {JSON.stringify(logs.slice(-12), null, 2)}
            </pre>
          </>
        )}
      </div>
    </div>
  );
}
