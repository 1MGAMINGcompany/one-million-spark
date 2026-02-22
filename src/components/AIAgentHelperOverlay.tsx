/**
 * AIAgentHelperOverlay — Draggable floating bubble + bottom sheet chat
 * ONLY renders on /play-ai/* routes.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Send, Trash2, Share2 } from "lucide-react";
import { streamTrustAgent } from "@/lib/trustAgentClient";
import monkeyIdle from "@/assets/monkey-idle.png";
import monkeyThinking from "@/assets/monkey-thinking.png";
import monkeyWarning from "@/assets/monkey-warning.png";
import monkeySuccess from "@/assets/monkey-success.png";

// ─── Types ───
type BubbleState = "idle" | "thinking" | "warning" | "success";
type HelperMode = "strategy" | "rules" | "friend";
interface ChatMsg { role: "user" | "assistant"; content: string }

const monkeyImages: Record<BubbleState, string> = {
  idle: monkeyIdle,
  thinking: monkeyThinking,
  warning: monkeyWarning,
  success: monkeySuccess,
};

// ─── i18n dictionary (inline, fallback English) ───
const dict: Record<string, Record<string, string>> = {
  en: {
    title: "1MGAMING Helper",
    subtitle: "Practice vs AI",
    intro: "Do you want strategy coaching to become a master, or do you want to learn how to play this game? Strategy and Intelligence becomes WEALTH.",
    introClose: "You can always close me and tap the monkey when you need help.",
    strategy: "Strategy coaching",
    rules: "Learn rules",
    friend: "Quick help",
    thinking: "Thinking...",
    placeholder: "Ask me anything...",
    clear: "Clear chat",
    share: "Share",
    chipRules: "Explain rules",
    chipOptions: "Show options",
    chipImprove: "How to improve",
    chipWrong: "What did I do wrong?",
    noContext: "I can help more if I can see the moves — try again after making a move.",
  },
  es: { title: "1MGAMING Ayudante", subtitle: "Práctica vs IA", intro: "¿Quieres coaching estratégico para convertirte en un maestro, o quieres aprender a jugar? La Estrategia y la Inteligencia se convierten en RIQUEZA.", introClose: "Siempre puedes cerrarme y tocar el mono cuando necesites ayuda.", strategy: "Coaching estratégico", rules: "Aprender reglas", friend: "Ayuda rápida", thinking: "Pensando...", placeholder: "Pregúntame lo que quieras...", clear: "Borrar chat", share: "Compartir", chipRules: "Explicar reglas", chipOptions: "Mostrar opciones", chipImprove: "Cómo mejorar", chipWrong: "¿Qué hice mal?", noContext: "Puedo ayudar más si veo las jugadas — intenta después de hacer un movimiento." },
  fr: { title: "1MGAMING Assistant", subtitle: "Entraînement vs IA", intro: "Voulez-vous un coaching stratégique ou apprendre les règles du jeu ? La Stratégie et l'Intelligence deviennent RICHESSE.", introClose: "Vous pouvez me fermer et toucher le singe quand vous avez besoin d'aide.", strategy: "Coaching stratégique", rules: "Apprendre les règles", friend: "Aide rapide", thinking: "Réflexion...", placeholder: "Demandez-moi n'importe quoi...", clear: "Effacer le chat", share: "Partager", chipRules: "Expliquer les règles", chipOptions: "Montrer les options", chipImprove: "Comment m'améliorer", chipWrong: "Qu'ai-je fait de mal ?", noContext: "Je peux mieux vous aider si je vois les coups — réessayez après un coup." },
  de: { title: "1MGAMING Helfer", subtitle: "Training vs KI", intro: "Möchtest du strategisches Coaching oder die Spielregeln lernen? Strategie und Intelligenz werden zu REICHTUM.", introClose: "Du kannst mich schließen und den Affen antippen, wenn du Hilfe brauchst.", strategy: "Strategiecoaching", rules: "Regeln lernen", friend: "Schnelle Hilfe", thinking: "Denke nach...", placeholder: "Frag mich alles...", clear: "Chat löschen", share: "Teilen", chipRules: "Regeln erklären", chipOptions: "Optionen zeigen", chipImprove: "Wie verbessern", chipWrong: "Was war falsch?", noContext: "Ich kann besser helfen, wenn ich die Züge sehe — versuche es nach einem Zug." },
  pt: { title: "1MGAMING Ajudante", subtitle: "Prática vs IA", intro: "Quer coaching estratégico ou aprender as regras? Estratégia e Inteligência se tornam RIQUEZA.", introClose: "Pode me fechar e tocar no macaco quando precisar de ajuda.", strategy: "Coaching estratégico", rules: "Aprender regras", friend: "Ajuda rápida", thinking: "Pensando...", placeholder: "Pergunte-me qualquer coisa...", clear: "Limpar chat", share: "Compartilhar", chipRules: "Explicar regras", chipOptions: "Mostrar opções", chipImprove: "Como melhorar", chipWrong: "O que eu errei?", noContext: "Posso ajudar mais se vir as jogadas — tente depois de fazer um movimento." },
  ar: { title: "مساعد 1MGAMING", subtitle: "تدريب ضد الذكاء الاصطناعي", intro: "هل تريد تدريباً استراتيجياً أم تعلم قواعد اللعبة؟ الاستراتيجية والذكاء يصبحان ثروة.", introClose: "يمكنك إغلاقي والنقر على القرد عندما تحتاج مساعدة.", strategy: "تدريب استراتيجي", rules: "تعلم القواعد", friend: "مساعدة سريعة", thinking: "أفكر...", placeholder: "اسألني أي شيء...", clear: "مسح المحادثة", share: "مشاركة", chipRules: "شرح القواعد", chipOptions: "عرض الخيارات", chipImprove: "كيف أتحسن", chipWrong: "ماذا فعلت خطأ؟", noContext: "يمكنني المساعدة أكثر إذا رأيت الحركات — حاول بعد حركة." },
  zh: { title: "1MGAMING 助手", subtitle: "AI练习", intro: "你想要策略指导成为高手，还是想学习游戏规则？策略和智慧成为财富。", introClose: "你可以随时关闭我，需要帮助时点击猴子。", strategy: "策略指导", rules: "学习规则", friend: "快速帮助", thinking: "思考中...", placeholder: "问我任何问题...", clear: "清除聊天", share: "分享", chipRules: "解释规则", chipOptions: "显示选项", chipImprove: "如何提高", chipWrong: "我哪里做错了？", noContext: "如果我能看到棋步我能帮更多 — 走一步后再试。" },
  it: { title: "1MGAMING Assistente", subtitle: "Allenamento vs IA", intro: "Vuoi coaching strategico o imparare le regole? Strategia e Intelligenza diventano RICCHEZZA.", introClose: "Puoi chiudermi e toccare la scimmia quando hai bisogno.", strategy: "Coaching strategico", rules: "Impara le regole", friend: "Aiuto veloce", thinking: "Sto pensando...", placeholder: "Chiedimi qualsiasi cosa...", clear: "Cancella chat", share: "Condividi", chipRules: "Spiega regole", chipOptions: "Mostra opzioni", chipImprove: "Come migliorare", chipWrong: "Cosa ho sbagliato?", noContext: "Posso aiutare di più se vedo le mosse — riprova dopo una mossa." },
  ja: { title: "1MGAMING ヘルパー", subtitle: "AI練習", intro: "戦略コーチングでマスターになりたいですか？それともゲームのルールを学びたいですか？戦略と知性は富になります。", introClose: "閉じて、助けが必要な時にモンキーをタップしてください。", strategy: "戦略コーチング", rules: "ルールを学ぶ", friend: "クイックヘルプ", thinking: "考え中...", placeholder: "何でも聞いてください...", clear: "チャットを消去", share: "共有", chipRules: "ルール説明", chipOptions: "オプション表示", chipImprove: "改善方法", chipWrong: "何が悪かった？", noContext: "手を見れればもっと助けられます — 一手指してからお試しを。" },
  hi: { title: "1MGAMING सहायक", subtitle: "AI अभ्यास", intro: "क्या आप मास्टर बनने के लिए रणनीति कोचिंग चाहते हैं, या गेम के नियम सीखना चाहते हैं? रणनीति और बुद्धि धन बनती है।", introClose: "मुझे बंद करें और जब मदद चाहिए तो बंदर को टैप करें।", strategy: "रणनीति कोचिंग", rules: "नियम सीखें", friend: "त्वरित मदद", thinking: "सोच रहा हूँ...", placeholder: "मुझसे कुछ भी पूछें...", clear: "चैट साफ़ करें", share: "शेयर करें", chipRules: "नियम समझाएँ", chipOptions: "विकल्प दिखाएँ", chipImprove: "कैसे सुधारें", chipWrong: "मैंने क्या गलत किया?", noContext: "अगर मैं चालें देख सकूँ तो ज़्यादा मदद कर सकता हूँ — एक चाल के बाद फिर कोशिश करें।" },
};

function t(lang: string, key: string): string {
  return dict[lang]?.[key] || dict.en[key] || key;
}

// ─── No-go zones (percentage of viewport) ───
interface Rect { x: number; y: number; w: number; h: number }

function getNoGoZones(pathname: string, vw: number, vh: number): Rect[] {
  const zones: Rect[] = [];
  if (pathname.includes("chess")) {
    zones.push({ x: vw * 0.2, y: vh * 0.85, w: vw * 0.6, h: vh * 0.15 }); // bottom controls
  } else if (pathname.includes("ludo")) {
    zones.push({ x: vw * 0.25, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 }); // dice area
  } else if (pathname.includes("backgammon")) {
    zones.push({ x: vw * 0.5, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 }); // roll/double
  } else if (pathname.includes("dominos") || pathname.includes("checkers")) {
    zones.push({ x: vw * 0.1, y: vh * 0.85, w: vw * 0.8, h: vh * 0.15 }); // bottom bar
  }
  return zones;
}

function intersectsAny(x: number, y: number, size: number, zones: Rect[]): boolean {
  for (const z of zones) {
    if (x + size > z.x && x < z.x + z.w && y + size > z.y && y < z.y + z.h) return true;
  }
  return false;
}

function clampToSafe(x: number, y: number, size: number, vw: number, vh: number, zones: Rect[]): { x: number; y: number } {
  // Snap to edge
  const snapX = x < vw / 2 ? 12 : vw - size - 12;
  let safeY = Math.max(80, Math.min(y, vh - size - 12));
  let pos = { x: snapX, y: safeY };
  if (!intersectsAny(pos.x, pos.y, size, zones)) return pos;
  // Try moving up/down
  for (let offset = 0; offset < vh; offset += 20) {
    if (safeY - offset >= 80 && !intersectsAny(snapX, safeY - offset, size, zones)) return { x: snapX, y: safeY - offset };
    if (safeY + offset < vh - size && !intersectsAny(snapX, safeY + offset, size, zones)) return { x: snapX, y: safeY + offset };
  }
  return { x: snapX, y: 80 };
}

// ─── Share image generator ───
async function generateShareImage(text: string): Promise<Blob | null> {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Background
    const bg = ctx.createLinearGradient(0, 0, 0, 1080);
    bg.addColorStop(0, "#1a1a2e");
    bg.addColorStop(1, "#0f0f23");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1080);

    // Gold border
    ctx.strokeStyle = "#FACC15";
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, 1020, 1020);

    // Header
    ctx.fillStyle = "#FACC15";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐵 1MGAMING", 540, 120);

    // Subtitle
    ctx.fillStyle = "#aaa";
    ctx.font = "24px sans-serif";
    ctx.fillText("AI Coach Insight", 540, 170);

    // Main text
    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "left";
    const words = text.split(" ");
    let line = "";
    let y = 260;
    const maxW = 940;
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxW) {
        ctx.fillText(line.trim(), 70, y);
        line = word + " ";
        y += 40;
        if (y > 900) { ctx.fillText("...", 70, y); break; }
      } else {
        line = test;
      }
    }
    if (y <= 900) ctx.fillText(line.trim(), 70, y);

    // Tagline
    ctx.fillStyle = "#FACC15";
    ctx.font = "italic 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Strategy and Intelligence becomes WEALTH", 540, 980);

    // Footer
    ctx.fillStyle = "#666";
    ctx.font = "20px sans-serif";
    ctx.fillText("Practice vs AI • 1MGAMING.com", 540, 1040);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

// ─── Main Component ───
const BUBBLE_SIZE = 56;

export default function AIAgentHelperOverlay() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || "en";

  // Only render on AI routes
  const isAIRoute = location.pathname.startsWith("/play-ai/");
  const gameType = useMemo(() => {
    const seg = location.pathname.replace("/play-ai/", "").split("?")[0];
    return seg || "chess";
  }, [location.pathname]);

  // State
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bubbleState, setBubbleState] = useState<BubbleState>("idle");
  const [helperMode, setHelperMode] = useState<HelperMode | null>(() => {
    try { return (localStorage.getItem("aihelper-mode") as HelperMode) || null; } catch { return null; }
  });
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try {
      const saved = localStorage.getItem("aihelper-chat");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Bubble position
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try {
      const saved = localStorage.getItem("aihelper-pos");
      if (saved) return JSON.parse(saved);
    } catch {}
    return { x: typeof window !== "undefined" ? window.innerWidth - BUBBLE_SIZE - 16 : 300, y: typeof window !== "undefined" ? window.innerHeight - 200 : 400 };
  });

  // Drag state
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; dragging: boolean }>({ startX: 0, startY: 0, startPosX: 0, startPosY: 0, dragging: false });

  // Persist chat
  useEffect(() => {
    try { localStorage.setItem("aihelper-chat", JSON.stringify(messages)); } catch {}
  }, [messages]);

  // Persist mode
  useEffect(() => {
    if (helperMode) try { localStorage.setItem("aihelper-mode", helperMode); } catch {}
  }, [helperMode]);

  // Persist pos
  useEffect(() => {
    try { localStorage.setItem("aihelper-pos", JSON.stringify(pos)); } catch {}
  }, [pos]);

  // Scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sheetOpen]);

  // Handle no-go zones on resize
  useEffect(() => {
    if (!isAIRoute) return;
    const handler = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const zones = getNoGoZones(location.pathname, vw, vh);
      setPos((p) => clampToSafe(p.x, p.y, BUBBLE_SIZE, vw, vh, zones));
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    handler();
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, [isAIRoute, location.pathname]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y, dragging: false };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.dragging && Math.abs(dx) + Math.abs(dy) > 5) d.dragging = true;
    if (d.dragging) {
      setPos({ x: d.startPosX + dx, y: d.startPosY + dy });
    }
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.dragging) {
      // Snap to edge
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const zones = getNoGoZones(location.pathname, vw, vh);
      const newPos = clampToSafe(pos.x, pos.y, BUBBLE_SIZE, vw, vh, zones);
      setPos(newPos);
    } else {
      setSheetOpen(true);
    }
    dragRef.current.dragging = false;
  }, [pos, location.pathname]);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const ctx = (window as any).__AI_HELPER_CONTEXT__;
    const moveHistory = ctx?.moveHistory || [];

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setBubbleState("thinking");

    let assistantSoFar = "";

    await streamTrustAgent({
      payload: {
        lang,
        helperMode: helperMode || "strategy",
        gameType: ctx?.gameType || gameType,
        question: text.trim(),
        moveHistory,
        messages: [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, content: m.content })),
      },
      onDelta: (chunk) => {
        assistantSoFar += chunk;
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant") {
            return prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: assistantSoFar } : m));
          }
          return [...prev, { role: "assistant", content: assistantSoFar }];
        });
      },
      onDone: () => {
        setIsStreaming(false);
        setBubbleState("success");
        setTimeout(() => setBubbleState("idle"), 2000);
      },
      onError: (err) => {
        setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${err}` }]);
        setIsStreaming(false);
        setBubbleState("warning");
        setTimeout(() => setBubbleState("idle"), 3000);
      },
    });
  }, [isStreaming, lang, helperMode, gameType, messages]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setHelperMode(null);
    try { localStorage.removeItem("aihelper-chat"); localStorage.removeItem("aihelper-mode"); } catch {}
  }, []);

  const shareMessage = useCallback(async (text: string) => {
    const blob = await generateShareImage(text);
    if (!blob) return;
    const file = new File([blob], "1mgaming-insight.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: "1MGAMING AI Coach", text: "Strategy and Intelligence becomes WEALTH" }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "1mgaming-insight.png";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  // Don't render on non-AI routes
  if (!isAIRoute) return null;

  const glowColor = bubbleState === "thinking" ? "rgba(250,204,21,0.6)" : bubbleState === "success" ? "rgba(34,197,94,0.5)" : bubbleState === "warning" ? "rgba(239,68,68,0.5)" : "rgba(250,204,21,0.2)";

  return (
    <>
      {/* Floating Bubble */}
      {!sheetOpen && (
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          style={{
            position: "fixed",
            left: pos.x,
            top: pos.y,
            width: BUBBLE_SIZE,
            height: BUBBLE_SIZE,
            zIndex: 9999,
            touchAction: "none",
            cursor: "grab",
          }}
          className="select-none"
        >
          <div
            className="rounded-full overflow-hidden border-2 border-primary shadow-lg transition-shadow duration-300"
            style={{
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              boxShadow: `0 0 16px 4px ${glowColor}`,
            }}
          >
            <img
              src={monkeyImages[bubbleState]}
              alt="AI Helper"
              className="w-full h-full object-cover"
              draggable={false}
            />
          </div>
          {bubbleState === "thinking" && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full animate-pulse" />
          )}
        </div>
      )}

      {/* Bottom Sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-[10000] flex flex-col justify-end" onClick={() => setSheetOpen(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50" />

          {/* Sheet */}
          <div
            className="relative bg-background border-t border-primary/30 rounded-t-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-primary/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden border border-primary">
                  <img src={monkeyIdle} alt="" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">{t(lang, "title")}</h3>
                  <p className="text-xs text-muted-foreground">{t(lang, "subtitle")}</p>
                </div>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-2 hover:bg-muted rounded-full">
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[60vh]">
              {/* First run: mode selection */}
              {!helperMode && messages.length === 0 && (
                <div className="space-y-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-foreground">
                    <p>{t(lang, "intro")}</p>
                    <p className="mt-2 text-muted-foreground text-xs">{t(lang, "introClose")}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["strategy", "rules", "friend"] as HelperMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setHelperMode(mode)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          mode === "strategy"
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-muted/50 text-foreground border-border hover:border-primary"
                        }`}
                      >
                        {t(lang, mode)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/50 text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "assistant" && !isStreaming && (
                      <button
                        onClick={() => shareMessage(msg.content)}
                        className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                      >
                        <Share2 size={12} /> {t(lang, "share")}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isStreaming && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  {t(lang, "thinking")}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick chips */}
            {helperMode && !isStreaming && (
              <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-border/50">
                {["chipRules", "chipOptions", "chipImprove", "chipWrong"].map((key) => (
                  <button
                    key={key}
                    onClick={() => sendMessage(t(lang, key))}
                    className="shrink-0 px-3 py-1 rounded-full text-xs border border-border bg-muted/30 text-foreground hover:border-primary transition-colors"
                  >
                    {t(lang, key)}
                  </button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="px-4 py-3 border-t border-border/50 flex items-center gap-2">
              <button onClick={clearChat} className="p-2 text-muted-foreground hover:text-destructive" title={t(lang, "clear")}>
                <Trash2 size={16} />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                placeholder={t(lang, "placeholder")}
                className="flex-1 bg-muted/30 border border-border rounded-full px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                disabled={!helperMode || isStreaming}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming || !helperMode}
                className="p-2 text-primary disabled:text-muted-foreground"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
