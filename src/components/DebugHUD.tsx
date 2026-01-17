import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useWallet as useSolanaWallet } from "@solana/wallet-adapter-react";
import { useWallet as useAppWallet } from "@/hooks/useWallet";
import { dbg, getDbg, clearDbg, isDebugEnabled } from "@/lib/debugLog";

function summarizeEl(el: Element | null) {
  if (!el) return null;

  const anyEl = el as any;
  const className =
    typeof anyEl.className === "string" ? anyEl.className : undefined;

  return {
    tag: el.tagName,
    id: (el as HTMLElement).id || undefined,
    className: className?.slice(0, 100), // Truncate long classnames
    role: el.getAttribute("role") || undefined,
    ariaModal: el.getAttribute("aria-modal") || undefined,
    dataState: el.getAttribute("data-state") || undefined,
    dataOverlay: el.getAttribute("data-overlay") || undefined,
    radixPortal: !!el.closest("[data-radix-portal]"),
  };
}

export default function DebugHUD() {
  const enabled = isDebugEnabled();
  const location = useLocation();

  const sol = useSolanaWallet();
  const app = useAppWallet();

  const [tick, setTick] = useState(0);
  const [topEl, setTopEl] = useState<ReturnType<typeof summarizeEl>>(null);
  const [openRadixCount, setOpenRadixCount] = useState(0);

  const logs = useMemo(() => getDbg(), [tick]);

  // Log route changes
  useEffect(() => {
    if (!enabled) return;

    dbg("route", {
      path: location.pathname,
      search: location.search,
      hash: location.hash,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search, location.hash, enabled]);

  // Log wallet adapter state changes
  useEffect(() => {
    if (!enabled) return;

    dbg("wallet.adapter", {
      connected: sol.connected,
      connecting: sol.connecting,
      disconnecting: sol.disconnecting,
      publicKey: sol.publicKey?.toBase58?.() ?? null,
      adapter: sol.wallet?.adapter?.name ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    sol.connected,
    sol.connecting,
    sol.disconnecting,
    sol.publicKey?.toBase58?.(),
    sol.wallet?.adapter?.name,
  ]);

  // Log app wallet state changes
  useEffect(() => {
    if (!enabled) return;
    dbg("wallet.app", {
      connected: app?.isConnected ?? null,
      address: app?.address ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, app?.isConnected, app?.address]);

  // Heartbeat + top-element inspector
  useEffect(() => {
    if (!enabled) return;

    const id = window.setInterval(() => {
      setTick((t) => t + 1);

      const el = document.elementFromPoint(
        window.innerWidth / 2,
        window.innerHeight / 2
      );
      const summary = summarizeEl(el);

      // count open radix portals
      const openCount = document.querySelectorAll(
        '[data-radix-portal] [data-state="open"]'
      ).length;

      setOpenRadixCount(openCount);

      // only log when it changes to avoid spam
      const key = JSON.stringify(summary);
      const prevKey = JSON.stringify(topEl);
      if (key !== prevKey) {
        setTopEl(summary);
        dbg("topElement.center", summary);
        dbg("radix.openCount", { openCount });
      }
    }, 500);

    return () => window.clearInterval(id);
  }, [enabled, topEl]);

  if (!enabled) return null;

  const copyLogs = async () => {
    const payload = JSON.stringify(getDbg(), null, 2);
    await navigator.clipboard.writeText(payload);
    dbg("hud.copyLogs", { bytes: payload.length });
    alert("Copied debug logs to clipboard");
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: 8,
        left: 8,
        zIndex: 99999,
        background: "rgba(0,0,0,0.9)",
        color: "#0f0",
        fontSize: 10,
        fontFamily: "monospace",
        padding: 8,
        borderRadius: 6,
        maxWidth: 320,
        maxHeight: "50vh",
        overflow: "auto",
        pointerEvents: "auto",
      }}
    >
      <div style={{ marginBottom: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ color: "#ff0" }}>Debug HUD</strong>
          <span style={{ color: "#888" }}>Route: {location.pathname}</span>
        </div>
        <div style={{ color: "#888" }}>Radix open: {openRadixCount}</div>
        <div style={{ marginTop: 4, display: "flex", gap: 4 }}>
          <button onClick={copyLogs} style={{ padding: "4px 8px", fontSize: 10 }}>
            Copy logs
          </button>
          <button onClick={() => window.location.reload()} style={{ padding: "4px 8px", fontSize: 10 }}>
            Reload
          </button>
          <button onClick={() => { clearDbg(); setTick((t) => t + 1); }} style={{ padding: "4px 8px", fontSize: 10 }}>
            Clear
          </button>
        </div>
      </div>

      <div style={{ borderTop: "1px solid #333", paddingTop: 6, marginTop: 6 }}>
        <div style={{ color: "#ff0", marginBottom: 4 }}>Top element (center)</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", color: "#0ff" }}>
          {JSON.stringify(topEl, null, 2)}
        </pre>
      </div>

      <div style={{ borderTop: "1px solid #333", paddingTop: 6, marginTop: 6 }}>
        <div style={{ color: "#ff0", marginBottom: 4 }}>Last logs</div>
        <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 9 }}>
          {JSON.stringify(logs.slice(-12), null, 2)}
        </pre>
      </div>
    </div>
  );
}
