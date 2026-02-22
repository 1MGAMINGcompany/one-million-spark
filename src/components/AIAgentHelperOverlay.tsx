/**
 * AIAgentHelperOverlay — Global AI helper mascot
 *
 * Visible on ALL routes EXCEPT:
 *   /play/:roomPda  (multiplayer games vs real users)
 *   /room/:roomPda  (multiplayer lobbies)
 *
 * On /play-ai/* routes → coaching mode (strategy, game context)
 * Everywhere else     → general help (rules, wallet, platform)
 *
 * First-time visitors get an auto-opening welcome with quick-action menu.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Send, Trash2, Share2, HelpCircle, Gamepad2, Wallet, Users, BookOpen, Sparkles } from "lucide-react";
import { streamTrustAgent } from "@/lib/trustAgentClient";
import monkeyHappy from "@/assets/monkey-happy.png";
import monkeyThinking from "@/assets/monkey-thinking.png";
import monkeyWarning from "@/assets/monkey-warning.png";

// ─── Types ───
type BubbleState = "idle" | "thinking" | "warning" | "success";
type HelperMode = "strategy" | "rules" | "friend";
interface ChatMsg { role: "user" | "assistant"; content: string }

const monkeyImages: Record<BubbleState, string> = {
  idle: monkeyHappy,
  thinking: monkeyThinking,
  warning: monkeyWarning,
  success: monkeyHappy,
};

// ─── i18n dictionary (inline, fallback English) ───
const dict: Record<string, Record<string, string>> = {
  en: {
    title: "1MGAMING Helper",
    subtitleAI: "Practice vs AI",
    subtitleGeneral: "How can I help?",
    slogan: "With Strategy and Intelligence We Create WEALTH",
    welcomeGreeting: "Hey there! 👋 I'm your 1MGAMING helper monkey! I'm here to help you navigate the app and become a master player.",
    welcomeClose: "Tap any option below, or close me and tap the monkey bubble anytime you need help!",
    // Welcome quick-action items
    qAppHelp: "Help me navigate the app",
    qGameRules: "Explain game rules",
    qPlayAI: "How does Play vs AI work?",
    qWallet: "Wallet & adding funds",
    qPlayFriends: "Play with friends (free or SOL)",
    qHowItWorks: "How does everything work?",
    // AI coaching context
    intro: "Do you want strategy coaching to become a master, or do you want to learn how to play this game?",
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
    // General quick chips
    chipNavHelp: "How do I get started?",
    chipWalletHelp: "How do I connect my wallet?",
    chipGameTypes: "What games can I play?",
    chipFreePlay: "Can I play for free?",
  },
  es: { title: "1MGAMING Ayudante", subtitleAI: "Práctica vs IA", subtitleGeneral: "¿Cómo puedo ayudarte?", slogan: "Con Estrategia e Inteligencia Creamos RIQUEZA", welcomeGreeting: "¡Hola! 👋 ¡Soy tu mono ayudante de 1MGAMING! Estoy aquí para ayudarte.", welcomeClose: "¡Toca cualquier opción o ciérrame y toca la burbuja del mono cuando necesites ayuda!", qAppHelp: "Ayúdame a navegar", qGameRules: "Explica las reglas", qPlayAI: "¿Cómo funciona Jugar vs IA?", qWallet: "Wallet y fondos", qPlayFriends: "Jugar con amigos", qHowItWorks: "¿Cómo funciona todo?", intro: "¿Quieres coaching estratégico o aprender reglas?", introClose: "Siempre puedes cerrarme y tocar el mono.", strategy: "Coaching estratégico", rules: "Aprender reglas", friend: "Ayuda rápida", thinking: "Pensando...", placeholder: "Pregúntame...", clear: "Borrar", share: "Compartir", chipRules: "Reglas", chipOptions: "Opciones", chipImprove: "Mejorar", chipWrong: "¿Qué hice mal?", noContext: "Puedo ayudar más si veo las jugadas.", chipNavHelp: "¿Cómo empiezo?", chipWalletHelp: "¿Cómo conecto wallet?", chipGameTypes: "¿Qué juegos hay?", chipFreePlay: "¿Puedo jugar gratis?" },
  fr: { title: "1MGAMING Assistant", subtitleAI: "Entraînement vs IA", subtitleGeneral: "Comment puis-je aider ?", slogan: "Avec Stratégie et Intelligence Nous Créons la RICHESSE", welcomeGreeting: "Salut ! 👋 Je suis ton assistant singe 1MGAMING ! Je suis là pour t'aider.", welcomeClose: "Touche une option ou ferme-moi et touche la bulle du singe quand tu veux !", qAppHelp: "Aide-moi à naviguer", qGameRules: "Explique les règles", qPlayAI: "Comment fonctionne Jouer vs IA ?", qWallet: "Portefeuille et fonds", qPlayFriends: "Jouer avec des amis", qHowItWorks: "Comment ça marche ?", intro: "Coaching stratégique ou apprendre les règles ?", introClose: "Tu peux me fermer et toucher le singe.", strategy: "Coaching stratégique", rules: "Apprendre les règles", friend: "Aide rapide", thinking: "Réflexion...", placeholder: "Demande-moi...", clear: "Effacer", share: "Partager", chipRules: "Règles", chipOptions: "Options", chipImprove: "Améliorer", chipWrong: "Qu'ai-je fait de mal ?", noContext: "Je peux mieux aider si je vois les coups.", chipNavHelp: "Comment commencer ?", chipWalletHelp: "Comment connecter wallet ?", chipGameTypes: "Quels jeux ?", chipFreePlay: "Jouer gratuitement ?" },
  de: { title: "1MGAMING Helfer", subtitleAI: "Training vs KI", subtitleGeneral: "Wie kann ich helfen?", slogan: "Mit Strategie und Intelligenz schaffen wir REICHTUM", welcomeGreeting: "Hey! 👋 Ich bin dein 1MGAMING Helfer-Affe! Ich helfe dir gerne.", welcomeClose: "Tippe auf eine Option oder schließe mich und tippe auf die Affenblase!", qAppHelp: "Hilf mir beim Navigieren", qGameRules: "Spielregeln erklären", qPlayAI: "Wie funktioniert Spielen vs KI?", qWallet: "Wallet & Guthaben", qPlayFriends: "Mit Freunden spielen", qHowItWorks: "Wie funktioniert alles?", intro: "Strategiecoaching oder Regeln lernen?", introClose: "Du kannst mich schließen und den Affen antippen.", strategy: "Strategiecoaching", rules: "Regeln lernen", friend: "Schnelle Hilfe", thinking: "Denke nach...", placeholder: "Frag mich...", clear: "Löschen", share: "Teilen", chipRules: "Regeln", chipOptions: "Optionen", chipImprove: "Verbessern", chipWrong: "Was war falsch?", noContext: "Ich kann besser helfen, wenn ich die Züge sehe.", chipNavHelp: "Wie starte ich?", chipWalletHelp: "Wallet verbinden?", chipGameTypes: "Welche Spiele?", chipFreePlay: "Kostenlos spielen?" },
  pt: { title: "1MGAMING Ajudante", subtitleAI: "Prática vs IA", subtitleGeneral: "Como posso ajudar?", slogan: "Com Estratégia e Inteligência Criamos RIQUEZA", welcomeGreeting: "Olá! 👋 Sou seu macaco ajudante da 1MGAMING! Estou aqui para ajudar.", welcomeClose: "Toque em uma opção ou feche e toque na bolha do macaco!", qAppHelp: "Ajude-me a navegar", qGameRules: "Explique as regras", qPlayAI: "Como funciona Jogar vs IA?", qWallet: "Carteira e fundos", qPlayFriends: "Jogar com amigos", qHowItWorks: "Como tudo funciona?", intro: "Coaching estratégico ou aprender regras?", introClose: "Pode me fechar e tocar no macaco.", strategy: "Coaching estratégico", rules: "Aprender regras", friend: "Ajuda rápida", thinking: "Pensando...", placeholder: "Pergunte...", clear: "Limpar", share: "Compartilhar", chipRules: "Regras", chipOptions: "Opções", chipImprove: "Melhorar", chipWrong: "O que errei?", noContext: "Posso ajudar mais se vir as jogadas.", chipNavHelp: "Como começar?", chipWalletHelp: "Conectar carteira?", chipGameTypes: "Quais jogos?", chipFreePlay: "Jogar grátis?" },
  ar: { title: "مساعد 1MGAMING", subtitleAI: "تدريب ضد الذكاء الاصطناعي", subtitleGeneral: "كيف يمكنني مساعدتك؟", slogan: "بالاستراتيجية والذكاء نصنع الثروة", welcomeGreeting: "مرحباً! 👋 أنا قرد المساعدة في 1MGAMING!", welcomeClose: "اضغط على خيار أو أغلقني واضغط على فقاعة القرد!", qAppHelp: "ساعدني في التنقل", qGameRules: "اشرح القواعد", qPlayAI: "كيف يعمل اللعب ضد الذكاء؟", qWallet: "المحفظة والأموال", qPlayFriends: "العب مع الأصدقاء", qHowItWorks: "كيف يعمل كل شيء؟", intro: "تدريب استراتيجي أم تعلم القواعد؟", introClose: "يمكنك إغلاقي والنقر على القرد.", strategy: "تدريب استراتيجي", rules: "تعلم القواعد", friend: "مساعدة سريعة", thinking: "أفكر...", placeholder: "اسألني...", clear: "مسح", share: "مشاركة", chipRules: "القواعد", chipOptions: "الخيارات", chipImprove: "التحسن", chipWrong: "ماذا فعلت خطأ؟", noContext: "يمكنني المساعدة أكثر إذا رأيت الحركات.", chipNavHelp: "كيف أبدأ؟", chipWalletHelp: "ربط المحفظة؟", chipGameTypes: "ما الألعاب؟", chipFreePlay: "اللعب مجاناً؟" },
  zh: { title: "1MGAMING 助手", subtitleAI: "AI练习", subtitleGeneral: "需要帮助吗？", slogan: "以策略和智慧创造财富", welcomeGreeting: "嗨！👋 我是你的1MGAMING助手猴子！", welcomeClose: "点击选项或关闭我，需要时点击猴子气泡！", qAppHelp: "帮我导航", qGameRules: "解释规则", qPlayAI: "AI对战怎么玩？", qWallet: "钱包和充值", qPlayFriends: "和朋友玩", qHowItWorks: "一切怎么运作？", intro: "策略指导还是学习规则？", introClose: "可以关闭我，需要时点击猴子。", strategy: "策略指导", rules: "学习规则", friend: "快速帮助", thinking: "思考中...", placeholder: "问我...", clear: "清除", share: "分享", chipRules: "规则", chipOptions: "选项", chipImprove: "如何提高", chipWrong: "我哪里做错了？", noContext: "如果我能看到棋步我能帮更多。", chipNavHelp: "怎么开始？", chipWalletHelp: "连接钱包？", chipGameTypes: "有什么游戏？", chipFreePlay: "免费玩？" },
  it: { title: "1MGAMING Assistente", subtitleAI: "Allenamento vs IA", subtitleGeneral: "Come posso aiutarti?", slogan: "Con Strategia e Intelligenza Creiamo RICCHEZZA", welcomeGreeting: "Ciao! 👋 Sono la tua scimmia assistente 1MGAMING!", welcomeClose: "Tocca un'opzione o chiudimi e tocca la bolla della scimmia!", qAppHelp: "Aiutami a navigare", qGameRules: "Spiega le regole", qPlayAI: "Come funziona Gioca vs IA?", qWallet: "Wallet e fondi", qPlayFriends: "Gioca con amici", qHowItWorks: "Come funziona tutto?", intro: "Coaching strategico o imparare le regole?", introClose: "Puoi chiudermi e toccare la scimmia.", strategy: "Coaching strategico", rules: "Impara le regole", friend: "Aiuto veloce", thinking: "Sto pensando...", placeholder: "Chiedimi...", clear: "Cancella", share: "Condividi", chipRules: "Regole", chipOptions: "Opzioni", chipImprove: "Migliorare", chipWrong: "Cosa ho sbagliato?", noContext: "Posso aiutare di più se vedo le mosse.", chipNavHelp: "Come inizio?", chipWalletHelp: "Connettere wallet?", chipGameTypes: "Quali giochi?", chipFreePlay: "Giocare gratis?" },
  ja: { title: "1MGAMING ヘルパー", subtitleAI: "AI練習", subtitleGeneral: "お手伝いしましょうか？", slogan: "戦略と知性で富を創造する", welcomeGreeting: "こんにちは！👋 1MGAMINGヘルパーモンキーです！", welcomeClose: "オプションをタップするか、閉じてモンキーバブルをタップ！", qAppHelp: "ナビゲーションを手伝って", qGameRules: "ルールを説明して", qPlayAI: "AI対戦の仕組みは？", qWallet: "ウォレットと資金", qPlayFriends: "友達と遊ぶ", qHowItWorks: "全体の仕組みは？", intro: "戦略コーチングかルール学習か？", introClose: "閉じてモンキーをタップしてください。", strategy: "戦略コーチング", rules: "ルールを学ぶ", friend: "クイックヘルプ", thinking: "考え中...", placeholder: "何でも聞いて...", clear: "消去", share: "共有", chipRules: "ルール", chipOptions: "オプション", chipImprove: "改善方法", chipWrong: "何が悪かった？", noContext: "手を見れればもっと助けられます。", chipNavHelp: "始め方は？", chipWalletHelp: "ウォレット接続？", chipGameTypes: "どんなゲーム？", chipFreePlay: "無料で遊べる？" },
  hi: { title: "1MGAMING सहायक", subtitleAI: "AI अभ्यास", subtitleGeneral: "मैं कैसे मदद करूँ?", slogan: "रणनीति और बुद्धि से हम संपत्ति बनाते हैं", welcomeGreeting: "नमस्ते! 👋 मैं आपका 1MGAMING सहायक बंदर हूँ!", welcomeClose: "किसी विकल्प पर टैप करें या मुझे बंद करके बंदर बुलबुले पर टैप करें!", qAppHelp: "ऐप नेविगेट करने में मदद करें", qGameRules: "गेम के नियम बताएँ", qPlayAI: "AI के खिलाफ कैसे खेलें?", qWallet: "वॉलेट और फंड", qPlayFriends: "दोस्तों के साथ खेलें", qHowItWorks: "सब कैसे काम करता है?", intro: "रणनीति कोचिंग या नियम सीखना?", introClose: "मुझे बंद करें और बंदर को टैप करें।", strategy: "रणनीति कोचिंग", rules: "नियम सीखें", friend: "त्वरित मदद", thinking: "सोच रहा हूँ...", placeholder: "कुछ भी पूछें...", clear: "साफ़ करें", share: "शेयर", chipRules: "नियम", chipOptions: "विकल्प", chipImprove: "कैसे सुधारें", chipWrong: "क्या गलत किया?", noContext: "चालें देख सकूँ तो ज़्यादा मदद कर सकता हूँ।", chipNavHelp: "कैसे शुरू करूँ?", chipWalletHelp: "वॉलेट कनेक्ट?", chipGameTypes: "कौन से गेम?", chipFreePlay: "मुफ्त में खेलें?" },
};

function t(lang: string, key: string): string {
  return dict[lang]?.[key] || dict.en[key] || key;
}

// ─── No-go zones (percentage of viewport) ───
interface Rect { x: number; y: number; w: number; h: number }

function getNoGoZones(pathname: string, vw: number, vh: number): Rect[] {
  const zones: Rect[] = [];
  if (pathname.includes("chess")) {
    zones.push({ x: vw * 0.2, y: vh * 0.85, w: vw * 0.6, h: vh * 0.15 });
  } else if (pathname.includes("ludo")) {
    zones.push({ x: vw * 0.25, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 });
  } else if (pathname.includes("backgammon")) {
    zones.push({ x: vw * 0.5, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 });
  } else if (pathname.includes("dominos") || pathname.includes("checkers")) {
    zones.push({ x: vw * 0.1, y: vh * 0.85, w: vw * 0.8, h: vh * 0.15 });
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
  const snapX = x < vw / 2 ? 12 : vw - size - 12;
  let safeY = Math.max(80, Math.min(y, vh - size - 12));
  let pos = { x: snapX, y: safeY };
  if (!intersectsAny(pos.x, pos.y, size, zones)) return pos;
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

    const bg = ctx.createLinearGradient(0, 0, 0, 1080);
    bg.addColorStop(0, "#1a1a2e");
    bg.addColorStop(1, "#0f0f23");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = "#FACC15";
    ctx.lineWidth = 4;
    ctx.strokeRect(30, 30, 1020, 1020);

    ctx.fillStyle = "#FACC15";
    ctx.font = "bold 48px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("🐵 1MGAMING", 540, 120);

    ctx.fillStyle = "#aaa";
    ctx.font = "24px sans-serif";
    ctx.fillText("AI Coach Insight", 540, 170);

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

    ctx.fillStyle = "#FACC15";
    ctx.font = "italic 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("With Strategy and Intelligence We Create WEALTH", 540, 980);

    ctx.fillStyle = "#666";
    ctx.font = "20px sans-serif";
    ctx.fillText("1MGAMING.com", 540, 1040);

    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch {
    return null;
  }
}

// ─── Quick-action menu items for welcome screen ───
const WELCOME_ACTIONS = [
  { key: "qAppHelp", icon: HelpCircle },
  { key: "qGameRules", icon: BookOpen },
  { key: "qPlayAI", icon: Gamepad2 },
  { key: "qWallet", icon: Wallet },
  { key: "qPlayFriends", icon: Users },
  { key: "qHowItWorks", icon: Sparkles },
] as const;

// ─── Route helpers ───
function isMultiplayerRoute(pathname: string): boolean {
  return pathname.startsWith("/play/") || pathname.startsWith("/room/");
}
function isAIGameRoute(pathname: string): boolean {
  return pathname.startsWith("/play-ai/");
}

// ─── Main Component ───
const BUBBLE_SIZE = 60;
const FIRST_VISIT_KEY = "aihelper-welcomed";

export default function AIAgentHelperOverlay() {
  const location = useLocation();
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || "en";

  // NEVER render on multiplayer routes
  const isMultiplayer = isMultiplayerRoute(location.pathname);
  const isAIRoute = isAIGameRoute(location.pathname);

  const gameType = useMemo(() => {
    if (!isAIRoute) return "";
    return location.pathname.replace("/play-ai/", "").split("?")[0] || "chess";
  }, [location.pathname, isAIRoute]);

  // First-time visit detection
  const [isFirstVisit] = useState(() => {
    try { return !localStorage.getItem(FIRST_VISIT_KEY); } catch { return true; }
  });

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
  const welcomeTriggered = useRef(false);

  // Auto-open for first-time visitors (only once)
  useEffect(() => {
    if (isMultiplayer) return;
    if (isFirstVisit && !welcomeTriggered.current) {
      welcomeTriggered.current = true;
      // Small delay so the page renders first
      const timer = setTimeout(() => {
        setSheetOpen(true);
        try { localStorage.setItem(FIRST_VISIT_KEY, "1"); } catch {}
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isFirstVisit, isMultiplayer]);

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
    if (isMultiplayer) return;
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
  }, [isMultiplayer, location.pathname]);

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

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (d.dragging) {
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

    // Auto-set mode if not set yet
    if (!helperMode) {
      setHelperMode(isAIRoute ? "strategy" : "friend");
    }

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    setBubbleState("thinking");

    let assistantSoFar = "";

    await streamTrustAgent({
      payload: {
        lang,
        helperMode: helperMode || (isAIRoute ? "strategy" : "friend"),
        gameType: ctx?.gameType || gameType || "general",
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
  }, [isStreaming, lang, helperMode, gameType, messages, isAIRoute]);

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
      navigator.share({ files: [file], title: "1MGAMING AI Coach", text: "With Strategy and Intelligence We Create WEALTH" }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "1mgaming-insight.png";
      a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  // ─── Don't render on multiplayer routes ───
  if (isMultiplayer) return null;

  const glowColor = bubbleState === "thinking" ? "rgba(250,204,21,0.6)" : bubbleState === "success" ? "rgba(34,197,94,0.5)" : bubbleState === "warning" ? "rgba(239,68,68,0.5)" : "rgba(250,204,21,0.25)";
  const subtitle = isAIRoute ? t(lang, "subtitleAI") : t(lang, "subtitleGeneral");

  // Determine which quick chips to show based on context
  const quickChips = isAIRoute
    ? ["chipRules", "chipOptions", "chipImprove", "chipWrong"]
    : ["chipNavHelp", "chipWalletHelp", "chipGameTypes", "chipFreePlay"];

  // Show welcome menu when: no mode selected, no messages, not on AI route
  const showWelcomeMenu = !helperMode && messages.length === 0 && !isAIRoute;
  // Show AI mode picker when: no mode, no messages, on AI route
  const showAIModePicker = !helperMode && messages.length === 0 && isAIRoute;

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
            className="rounded-full overflow-hidden border-2 border-primary shadow-lg transition-shadow duration-300 bg-background/80"
            style={{
              width: BUBBLE_SIZE,
              height: BUBBLE_SIZE,
              boxShadow: `0 0 18px 5px ${glowColor}`,
            }}
          >
            <img
              src={monkeyImages[bubbleState]}
              alt="AI Helper"
              className="w-full h-full object-contain p-0.5"
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
                <div className="w-10 h-10 rounded-full overflow-hidden border border-primary bg-background/80">
                  <img src={monkeyHappy} alt="" className="w-full h-full object-contain p-0.5" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground text-sm">{t(lang, "title")}</h3>
                  <p className="text-xs text-muted-foreground">{subtitle}</p>
                </div>
              </div>
              <button onClick={() => setSheetOpen(false)} className="p-2 hover:bg-muted rounded-full">
                <X size={20} className="text-muted-foreground" />
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-[200px] max-h-[60vh]">
              {/* ── Welcome menu (non-AI pages, first interaction) ── */}
              {showWelcomeMenu && (
                <div className="space-y-4">
                  <div className="bg-muted/50 rounded-lg p-4 text-sm text-foreground">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full overflow-hidden border border-primary bg-background/80 shrink-0">
                        <img src={monkeyHappy} alt="" className="w-full h-full object-contain" />
                      </div>
                      <div>
                        <p className="font-semibold">{t(lang, "welcomeGreeting")}</p>
                      </div>
                    </div>
                    <p className="text-primary font-medium text-xs italic mb-2">
                      "{t(lang, "slogan")}"
                    </p>
                    <p className="text-muted-foreground text-xs">{t(lang, "welcomeClose")}</p>
                  </div>

                  {/* Quick-action buttons */}
                  <div className="grid grid-cols-2 gap-2">
                    {WELCOME_ACTIONS.map(({ key, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setHelperMode("friend");
                          sendMessage(t(lang, key));
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all text-left"
                      >
                        <Icon size={16} className="text-primary shrink-0" />
                        <span>{t(lang, key)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── AI mode picker (on /play-ai/* routes) ── */}
              {showAIModePicker && (
                <div className="space-y-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-foreground">
                    <p>{t(lang, "intro")}</p>
                    <p className="mt-2 text-primary font-medium text-xs italic">
                      "{t(lang, "slogan")}"
                    </p>
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
            {(helperMode || messages.length > 0) && !isStreaming && (
              <div className="px-4 py-2 flex gap-2 overflow-x-auto border-t border-border/50">
                {quickChips.map((key) => (
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
                disabled={isStreaming}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || isStreaming}
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
