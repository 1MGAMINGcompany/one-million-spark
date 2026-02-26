/**
 * AIAgentHelperOverlay — Global AI helper mascot "Money"
 *
 * Visible on ALL routes EXCEPT:
 *   /play/:roomPda  (multiplayer games vs real users)
 *   /room/:roomPda  (multiplayer lobbies)
 *
 * On /play-ai/* routes → compact bottom panel (max 4 lines, scrollable)
 *   with board-aware coaching + skill level picker
 * Everywhere else → full bottom sheet
 *
 * Interaction: TOUCH 500ms to open, HOLD 800ms+ to drag.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { X, Send, Trash2, Share2, HelpCircle, Gamepad2, Wallet, Users, BookOpen, Sparkles, Copy, Coins, Zap } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { streamTrustAgent } from "@/lib/trustAgentClient";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/hooks/usePresenceHeartbeat";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import monkeyHappy from "@/assets/monkey-happy.png";
import monkeyThinking from "@/assets/monkey-thinking.png";
import monkeyWarning from "@/assets/monkey-warning.png";

// ─── Types ───
type BubbleState = "idle" | "thinking" | "warning" | "success";
type HelperMode = "strategy" | "rules" | "friend";
type SkillLevel = "first-timer" | "beginner" | "medium" | "pro" | "master";
interface ChatMsg { role: "user" | "assistant"; content: string }

// Special assistant message type for local cards
interface LocalCard {
  type: "howItWorks" | "walletHelp";
}

const monkeyImages: Record<BubbleState, string> = {
  idle: monkeyHappy,
  thinking: monkeyThinking,
  warning: monkeyWarning,
  success: monkeyHappy,
};

// ─── i18n dictionary ───
const dict: Record<string, Record<string, string>> = {
  en: {
    title: "Money – AI Helper",
    subtitleAI: "Practice vs AI",
    subtitleGeneral: "How can I help?",
    slogan: "With Strategy and Intelligence We Create WEALTH",
    welcomeGreeting: "Hello! I am Money, your AI helper. Do you want me to help you?",
    welcomeYes: "Yes, help me!",
    welcomeNo: "No thanks",
    assistGreeting: "How can I assist you?",
    qAppHelp: "Help me navigate the app",
    qGameRules: "Explain game rules",
    qPlayAI: "How does Play vs AI work?",
    qWallet: "Wallet & adding funds",
    qPlayFriends: "Play with friends (free or SOL)",
    qHowItWorks: "How does everything work?",
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
    chipSuggest: "Suggest a move",
    noContext: "I can help more if I can see the moves — try again after making a move.",
    chipNavHelp: "How do I get started?",
    chipWalletHelp: "How do I connect my wallet?",
    chipGameTypes: "What games can I play?",
    chipFreePlay: "Can I play for free?",
    skillQuestion: "What's your experience level?",
    skillFirstTimer: "🐣 First timer",
    skillBeginner: "🌱 Beginner",
    skillMedium: "⚡ Intermediate",
    skillPro: "🏆 Pro",
    skillMaster: "👑 Want to master it",
    // New keys (A-E)
    onboardingPrompt: "Want to start with a free game or play for real SOL?",
    btnPlayFree: "Play Free",
    btnQuickMatch: "Quick Match",
    howStep1: "Play free to learn",
    howStep2: "Add SOL to your wallet",
    howStep3: "Quick Match to play real opponents",
    walletHelpLine: "Your wallet address is ready. Fund it to play for real SOL.",
    btnCopyAddress: "Copy My Address",
    btnAddFunds: "Go to Add Funds",
    pvpBlocked: "Money is not available in real matches to keep games fair.",
    btnGotIt: "Got it",
    nudgeText: "Need help? Tap Money 🐒",
    nudgeDismiss: "Got it",
    nudgePlayFree: "Play Free Now",
    nudgeAskMoney: "Ask Money",
  },
  es: { title: "Money – Ayudante IA", nudgePlayFree: "Jugar Gratis Ya", nudgeAskMoney: "Preguntar a Money", subtitleAI: "Práctica vs IA", subtitleGeneral: "¿Cómo puedo ayudarte?", slogan: "Con Estrategia e Inteligencia Creamos RIQUEZA", welcomeGreeting: "¡Hola! Soy Money, tu ayudante de IA. ¿Quieres que te ayude?", welcomeYes: "¡Sí, ayúdame!", welcomeNo: "No gracias", assistGreeting: "¿En qué puedo ayudarte?", qAppHelp: "Ayúdame a navegar", qGameRules: "Explica las reglas", qPlayAI: "¿Cómo funciona Jugar vs IA?", qWallet: "Wallet y fondos", qPlayFriends: "Jugar con amigos", qHowItWorks: "¿Cómo funciona todo?", intro: "¿Quieres coaching estratégico o aprender reglas?", introClose: "Siempre puedes cerrarme y tocar al mono.", strategy: "Coaching estratégico", rules: "Aprender reglas", friend: "Ayuda rápida", thinking: "Pensando...", placeholder: "Pregúntame...", clear: "Borrar", share: "Compartir", chipRules: "Reglas", chipOptions: "Opciones", chipImprove: "Mejorar", chipWrong: "¿Qué hice mal?", chipSuggest: "Sugiere jugada", noContext: "Puedo ayudar más si veo las jugadas.", chipNavHelp: "¿Cómo empiezo?", chipWalletHelp: "¿Cómo conecto wallet?", chipGameTypes: "¿Qué juegos hay?", chipFreePlay: "¿Puedo jugar gratis?", skillQuestion: "¿Cuál es tu nivel?", skillFirstTimer: "🐣 Primera vez", skillBeginner: "🌱 Principiante", skillMedium: "⚡ Intermedio", skillPro: "🏆 Pro", skillMaster: "👑 Quiero dominar", onboardingPrompt: "¿Quieres empezar con un juego gratis o jugar por SOL real?", btnPlayFree: "Jugar Gratis", btnQuickMatch: "Partida Rápida", howStep1: "Juega gratis para aprender", howStep2: "Añade SOL a tu wallet", howStep3: "Partida Rápida para jugar contra rivales reales", walletHelpLine: "Tu dirección de wallet está lista. Fóndala para jugar por SOL real.", btnCopyAddress: "Copiar Mi Dirección", btnAddFunds: "Ir a Añadir Fondos", pvpBlocked: "Money no está disponible en partidas reales para mantener el juego justo.", btnGotIt: "Entendido", nudgeText: "¿Necesitas ayuda? Toca a Money 🐒", nudgeDismiss: "Entendido" },
  fr: { title: "Money – Assistant IA", nudgePlayFree: "Jouer Gratuit", nudgeAskMoney: "Demander à Money", subtitleAI: "Entraînement vs IA", subtitleGeneral: "Comment puis-je aider ?", slogan: "Avec Stratégie et Intelligence Nous Créons la RICHESSE", welcomeGreeting: "Bonjour ! Je suis Money, votre assistant IA. Voulez-vous que je vous aide ?", welcomeYes: "Oui, aidez-moi !", welcomeNo: "Non merci", assistGreeting: "Comment puis-je vous aider ?", qAppHelp: "Aide-moi à naviguer", qGameRules: "Explique les règles", qPlayAI: "Comment fonctionne Jouer vs IA ?", qWallet: "Portefeuille et fonds", qPlayFriends: "Jouer avec des amis", qHowItWorks: "Comment ça marche ?", intro: "Coaching stratégique ou apprendre les règles ?", introClose: "Tu peux me fermer et toucher le singe.", strategy: "Coaching stratégique", rules: "Apprendre les règles", friend: "Aide rapide", thinking: "Réflexion...", placeholder: "Demande-moi...", clear: "Effacer", share: "Partager", chipRules: "Règles", chipOptions: "Options", chipImprove: "Améliorer", chipWrong: "Qu'ai-je fait de mal ?", chipSuggest: "Suggérer un coup", noContext: "Je peux mieux aider si je vois les coups.", chipNavHelp: "Comment commencer ?", chipWalletHelp: "Comment connecter wallet ?", chipGameTypes: "Quels jeux ?", chipFreePlay: "Jouer gratuitement ?", skillQuestion: "Quel est votre niveau ?", skillFirstTimer: "🐣 Première fois", skillBeginner: "🌱 Débutant", skillMedium: "⚡ Intermédiaire", skillPro: "🏆 Pro", skillMaster: "👑 Devenir maître", onboardingPrompt: "Vous voulez commencer par un jeu gratuit ou jouer pour du vrai SOL ?", btnPlayFree: "Jouer Gratuit", btnQuickMatch: "Match Rapide", howStep1: "Jouez gratuitement pour apprendre", howStep2: "Ajoutez du SOL à votre portefeuille", howStep3: "Match Rapide pour jouer contre de vrais adversaires", walletHelpLine: "Votre adresse de portefeuille est prête. Alimentez-la pour jouer en SOL.", btnCopyAddress: "Copier Mon Adresse", btnAddFunds: "Ajouter des Fonds", pvpBlocked: "Money n'est pas disponible en match réel pour garder le jeu équitable.", btnGotIt: "Compris", nudgeText: "Besoin d'aide ? Touchez Money 🐒", nudgeDismiss: "Compris" },
  de: { title: "Money – KI-Helfer", nudgePlayFree: "Gratis Spielen", nudgeAskMoney: "Money Fragen", subtitleAI: "Training vs KI", subtitleGeneral: "Wie kann ich helfen?", slogan: "Mit Strategie und Intelligenz schaffen wir REICHTUM", welcomeGreeting: "Hallo! Ich bin Money, dein KI-Helfer. Soll ich dir helfen?", welcomeYes: "Ja, hilf mir!", welcomeNo: "Nein danke", assistGreeting: "Wie kann ich dir helfen?", qAppHelp: "Hilf mir beim Navigieren", qGameRules: "Spielregeln erklären", qPlayAI: "Wie funktioniert Spielen vs KI?", qWallet: "Wallet & Guthaben", qPlayFriends: "Mit Freunden spielen", qHowItWorks: "Wie funktioniert alles?", intro: "Strategiecoaching oder Regeln lernen?", introClose: "Du kannst mich schließen und den Affen antippen.", strategy: "Strategiecoaching", rules: "Regeln lernen", friend: "Schnelle Hilfe", thinking: "Denke nach...", placeholder: "Frag mich...", clear: "Löschen", share: "Teilen", chipRules: "Regeln", chipOptions: "Optionen", chipImprove: "Verbessern", chipWrong: "Was war falsch?", chipSuggest: "Zug vorschlagen", noContext: "Ich kann besser helfen, wenn ich die Züge sehe.", chipNavHelp: "Wie starte ich?", chipWalletHelp: "Wallet verbinden?", chipGameTypes: "Welche Spiele?", chipFreePlay: "Kostenlos spielen?", skillQuestion: "Was ist dein Level?", skillFirstTimer: "🐣 Erstes Mal", skillBeginner: "🌱 Anfänger", skillMedium: "⚡ Mittel", skillPro: "🏆 Profi", skillMaster: "👑 Meister werden", onboardingPrompt: "Willst du mit einem kostenlosen Spiel starten oder um echtes SOL spielen?", btnPlayFree: "Gratis Spielen", btnQuickMatch: "Schnelles Match", howStep1: "Spiel kostenlos zum Lernen", howStep2: "Füge SOL zu deinem Wallet hinzu", howStep3: "Schnelles Match gegen echte Gegner", walletHelpLine: "Deine Wallet-Adresse ist bereit. Lade sie auf, um um SOL zu spielen.", btnCopyAddress: "Adresse Kopieren", btnAddFunds: "Guthaben Aufladen", pvpBlocked: "Money ist in echten Matches nicht verfügbar, um das Spiel fair zu halten.", btnGotIt: "Verstanden", nudgeText: "Hilfe nötig? Tippe auf Money 🐒", nudgeDismiss: "Verstanden" },
  pt: { title: "Money – Ajudante IA", nudgePlayFree: "Jogar Grátis Já", nudgeAskMoney: "Perguntar ao Money", subtitleAI: "Prática vs IA", subtitleGeneral: "Como posso ajudar?", slogan: "Com Estratégia e Inteligência Criamos RIQUEZA", welcomeGreeting: "Olá! Sou o Money, seu ajudante de IA. Quer que eu te ajude?", welcomeYes: "Sim, me ajude!", welcomeNo: "Não obrigado", assistGreeting: "Como posso te ajudar?", qAppHelp: "Ajude-me a navegar", qGameRules: "Explique as regras", qPlayAI: "Como funciona Jogar vs IA?", qWallet: "Carteira e fundos", qPlayFriends: "Jogar com amigos", qHowItWorks: "Como tudo funciona?", intro: "Coaching estratégico ou aprender regras?", introClose: "Pode me fechar e tocar no macaco.", strategy: "Coaching estratégico", rules: "Aprender regras", friend: "Ajuda rápida", thinking: "Pensando...", placeholder: "Pergunte...", clear: "Limpar", share: "Compartilhar", chipRules: "Regras", chipOptions: "Opções", chipImprove: "Melhorar", chipWrong: "O que errei?", chipSuggest: "Sugerir jogada", noContext: "Posso ajudar mais se vir as jogadas.", chipNavHelp: "Como começar?", chipWalletHelp: "Conectar carteira?", chipGameTypes: "Quais jogos?", chipFreePlay: "Jogar grátis?", skillQuestion: "Qual seu nível?", skillFirstTimer: "🐣 Primeira vez", skillBeginner: "🌱 Iniciante", skillMedium: "⚡ Intermediário", skillPro: "🏆 Pro", skillMaster: "👑 Quero dominar", onboardingPrompt: "Quer começar com um jogo grátis ou jogar por SOL real?", btnPlayFree: "Jogar Grátis", btnQuickMatch: "Partida Rápida", howStep1: "Jogue grátis para aprender", howStep2: "Adicione SOL à sua carteira", howStep3: "Partida Rápida para jogar contra oponentes reais", walletHelpLine: "Seu endereço de carteira está pronto. Carregue-o para jogar por SOL real.", btnCopyAddress: "Copiar Meu Endereço", btnAddFunds: "Ir para Adicionar Fundos", pvpBlocked: "Money não está disponível em partidas reais para manter o jogo justo.", btnGotIt: "Entendi", nudgeText: "Precisa de ajuda? Toque no Money 🐒", nudgeDismiss: "Entendi" },
  ar: { title: "Money – مساعد الذكاء", nudgePlayFree: "العب مجاناً الآن", nudgeAskMoney: "اسأل Money", subtitleAI: "تدريب ضد الذكاء الاصطناعي", subtitleGeneral: "كيف يمكنني مساعدتك؟", slogan: "بالاستراتيجية والذكاء نصنع الثروة", welcomeGreeting: "مرحباً! أنا Money، مساعدك الذكي. هل تريدني أن أساعدك؟", welcomeYes: "نعم، ساعدني!", welcomeNo: "لا شكراً", assistGreeting: "كيف يمكنني مساعدتك؟", qAppHelp: "ساعدني في التنقل", qGameRules: "اشرح القواعد", qPlayAI: "كيف يعمل اللعب ضد الذكاء؟", qWallet: "المحفظة والأموال", qPlayFriends: "العب مع الأصدقاء", qHowItWorks: "كيف يعمل كل شيء؟", intro: "تدريب استراتيجي أم تعلم القواعد؟", introClose: "يمكنك إغلاقي والنقر على القرد.", strategy: "تدريب استراتيجي", rules: "تعلم القواعد", friend: "مساعدة سريعة", thinking: "أفكر...", placeholder: "اسألني...", clear: "مسح", share: "مشاركة", chipRules: "القواعد", chipOptions: "الخيارات", chipImprove: "التحسن", chipWrong: "ماذا فعلت خطأ؟", chipSuggest: "اقترح حركة", noContext: "يمكنني المساعدة أكثر إذا رأيت الحركات.", chipNavHelp: "كيف أبدأ؟", chipWalletHelp: "ربط المحفظة؟", chipGameTypes: "ما الألعاب؟", chipFreePlay: "اللعب مجاناً؟", skillQuestion: "ما مستواك؟", skillFirstTimer: "🐣 أول مرة", skillBeginner: "🌱 مبتدئ", skillMedium: "⚡ متوسط", skillPro: "🏆 محترف", skillMaster: "👑 أريد الإتقان", onboardingPrompt: "تريد البدء بلعبة مجانية أو اللعب بـ SOL حقيقي؟", btnPlayFree: "العب مجاناً", btnQuickMatch: "مباراة سريعة", howStep1: "العب مجاناً للتعلم", howStep2: "أضف SOL إلى محفظتك", howStep3: "مباراة سريعة للعب ضد خصوم حقيقيين", walletHelpLine: "عنوان محفظتك جاهز. موّله للعب بـ SOL حقيقي.", btnCopyAddress: "نسخ عنواني", btnAddFunds: "إضافة أموال", pvpBlocked: "Money غير متاح في المباريات الحقيقية للحفاظ على اللعب العادل.", btnGotIt: "فهمت", nudgeText: "تحتاج مساعدة؟ اضغط على Money 🐒", nudgeDismiss: "فهمت" },
  zh: { title: "Money – AI助手", nudgePlayFree: "免费玩", nudgeAskMoney: "问Money", subtitleAI: "AI练习", subtitleGeneral: "需要帮助吗？", slogan: "以策略和智慧创造财富", welcomeGreeting: "你好！我是Money，你的AI助手。需要我帮助你吗？", welcomeYes: "好的，帮帮我！", welcomeNo: "不用了谢谢", assistGreeting: "我能帮你什么？", qAppHelp: "帮我导航", qGameRules: "解释规则", qPlayAI: "AI对战怎么玩？", qWallet: "钱包和充值", qPlayFriends: "和朋友玩", qHowItWorks: "一切怎么运作？", intro: "策略指导还是学习规则？", introClose: "可以关闭我，需要时点击猴子。", strategy: "策略指导", rules: "学习规则", friend: "快速帮助", thinking: "思考中...", placeholder: "问我...", clear: "清除", share: "分享", chipRules: "规则", chipOptions: "选项", chipImprove: "如何提高", chipWrong: "我哪里做错了？", chipSuggest: "建议走法", noContext: "如果我能看到棋步我能帮更多。", chipNavHelp: "怎么开始？", chipWalletHelp: "连接钱包？", chipGameTypes: "有什么游戏？", chipFreePlay: "免费玩？", skillQuestion: "你的水平？", skillFirstTimer: "🐣 第一次", skillBeginner: "🌱 初学者", skillMedium: "⚡ 中级", skillPro: "🏆 高手", skillMaster: "👑 想精通", onboardingPrompt: "想先玩免费游戏还是用真正的SOL对战？", btnPlayFree: "免费玩", btnQuickMatch: "快速匹配", howStep1: "免费游戏学习", howStep2: "给钱包充SOL", howStep3: "快速匹配与真人对战", walletHelpLine: "你的钱包地址已就绪。充值后即可用SOL对战。", btnCopyAddress: "复制我的地址", btnAddFunds: "去充值", pvpBlocked: "为保持比赛公平，Money在真人对战中不可用。", btnGotIt: "知道了", nudgeText: "需要帮助？点击Money 🐒", nudgeDismiss: "知道了" },
  it: { title: "Money – Assistente IA", nudgePlayFree: "Gioca Gratis Ora", nudgeAskMoney: "Chiedi a Money", subtitleAI: "Allenamento vs IA", subtitleGeneral: "Come posso aiutarti?", slogan: "Con Strategia e Intelligenza Creiamo RICCHEZZA", welcomeGreeting: "Ciao! Sono Money, il tuo assistente IA. Vuoi che ti aiuti?", welcomeYes: "Sì, aiutami!", welcomeNo: "No grazie", assistGreeting: "Come posso aiutarti?", qAppHelp: "Aiutami a navigare", qGameRules: "Spiega le regole", qPlayAI: "Come funziona Gioca vs IA?", qWallet: "Wallet e fondi", qPlayFriends: "Gioca con amici", qHowItWorks: "Come funziona tutto?", intro: "Coaching strategico o imparare le regole?", introClose: "Puoi chiudermi e toccare la scimmia.", strategy: "Coaching strategico", rules: "Impara le regole", friend: "Aiuto veloce", thinking: "Sto pensando...", placeholder: "Chiedimi...", clear: "Cancella", share: "Condividi", chipRules: "Regole", chipOptions: "Opzioni", chipImprove: "Migliorare", chipWrong: "Cosa ho sbagliato?", chipSuggest: "Suggerisci mossa", noContext: "Posso aiutare di più se vedo le mosse.", chipNavHelp: "Come inizio?", chipWalletHelp: "Connettere wallet?", chipGameTypes: "Quali giochi?", chipFreePlay: "Giocare gratis?", skillQuestion: "Qual è il tuo livello?", skillFirstTimer: "🐣 Prima volta", skillBeginner: "🌱 Principiante", skillMedium: "⚡ Intermedio", skillPro: "🏆 Pro", skillMaster: "👑 Voglio padroneggiare", onboardingPrompt: "Vuoi iniziare con un gioco gratuito o giocare per SOL vero?", btnPlayFree: "Gioca Gratis", btnQuickMatch: "Partita Rapida", howStep1: "Gioca gratis per imparare", howStep2: "Aggiungi SOL al tuo wallet", howStep3: "Partita Rapida per sfidare avversari reali", walletHelpLine: "Il tuo indirizzo wallet è pronto. Ricaricalo per giocare con SOL.", btnCopyAddress: "Copia Il Mio Indirizzo", btnAddFunds: "Vai ad Aggiungere Fondi", pvpBlocked: "Money non è disponibile nelle partite reali per mantenere il gioco equo.", btnGotIt: "Capito", nudgeText: "Serve aiuto? Tocca Money 🐒", nudgeDismiss: "Capito" },
  ja: { title: "Money – AIヘルパー", nudgePlayFree: "無料で遊ぶ", nudgeAskMoney: "Moneyに聞く", subtitleAI: "AI練習", subtitleGeneral: "お手伝いしましょうか？", slogan: "戦略と知性で富を創造する", welcomeGreeting: "こんにちは！私はMoney、あなたのAIヘルパーです。お手伝いしましょうか？", welcomeYes: "はい、お願いします！", welcomeNo: "いいえ、結構です", assistGreeting: "何かお手伝いできますか？", qAppHelp: "ナビゲーションを手伝って", qGameRules: "ルールを説明して", qPlayAI: "AI対戦の仕組みは？", qWallet: "ウォレットと資金", qPlayFriends: "友達と遊ぶ", qHowItWorks: "全体の仕組みは？", intro: "戦略コーチングかルール学習か？", introClose: "閉じてモンキーをタップしてください。", strategy: "戦略コーチング", rules: "ルールを学ぶ", friend: "クイックヘルプ", thinking: "考え中...", placeholder: "何でも聞いて...", clear: "消去", share: "共有", chipRules: "ルール", chipOptions: "オプション", chipImprove: "改善方法", chipWrong: "何が悪かった？", chipSuggest: "手を提案", noContext: "手を見れればもっと助けられます。", chipNavHelp: "始め方は？", chipWalletHelp: "ウォレット接続？", chipGameTypes: "どんなゲーム？", chipFreePlay: "無料で遊べる？", skillQuestion: "あなたのレベルは？", skillFirstTimer: "🐣 初めて", skillBeginner: "🌱 初心者", skillMedium: "⚡ 中級", skillPro: "🏆 プロ", skillMaster: "👑 マスターしたい", onboardingPrompt: "無料ゲームから始める？それともSOLで本気対戦？", btnPlayFree: "無料で遊ぶ", btnQuickMatch: "クイックマッチ", howStep1: "無料で遊んで覚える", howStep2: "ウォレットにSOLを追加", howStep3: "クイックマッチで本気対戦", walletHelpLine: "ウォレットアドレスは準備完了。SOLを入金して対戦しましょう。", btnCopyAddress: "アドレスをコピー", btnAddFunds: "入金する", pvpBlocked: "フェアプレイのため、対人戦ではMoneyは利用できません。", btnGotIt: "了解", nudgeText: "ヘルプが必要？Moneyをタップ 🐒", nudgeDismiss: "了解" },
  hi: { title: "Money – AI सहायक", nudgePlayFree: "मुफ्त खेलें अभी", nudgeAskMoney: "Money से पूछें", subtitleAI: "AI अभ्यास", subtitleGeneral: "मैं कैसे मदद करूँ?", slogan: "रणनीति और बुद्धि से हम संपत्ति बनाते हैं", welcomeGreeting: "नमस्ते! मैं Money हूँ, आपका AI सहायक। क्या आप चाहते हैं कि मैं आपकी मदद करूँ?", welcomeYes: "हाँ, मदद करो!", welcomeNo: "नहीं धन्यवाद", assistGreeting: "मैं आपकी कैसे मदद कर सकता हूँ?", qAppHelp: "ऐप नेविगेट करने में मदद करें", qGameRules: "गेम के नियम बताएँ", qPlayAI: "AI के खिलाफ कैसे खेलें?", qWallet: "वॉलेट और फंड", qPlayFriends: "दोस्तों के साथ खेलें", qHowItWorks: "सब कैसे काम करता है?", intro: "रणनीति कोचिंग या नियम सीखना?", introClose: "मुझे बंद करें और बंदर को टैप करें।", strategy: "रणनीति कोचिंग", rules: "नियम सीखें", friend: "त्वरित मदद", thinking: "सोच रहा हूँ...", placeholder: "कुछ भी पूछें...", clear: "साफ़ करें", share: "शेयर", chipRules: "नियम", chipOptions: "विकल्प", chipImprove: "कैसे सुधारें", chipWrong: "क्या गलत किया?", chipSuggest: "चाल सुझाएं", noContext: "चालें देख सकूँ तो ज़्यादा मदद कर सकता हूँ।", chipNavHelp: "कैसे शुरू करूँ?", chipWalletHelp: "वॉलेट कनेक्ट?", chipGameTypes: "कौन से गेम?", chipFreePlay: "मुफ्त में खेलें?", skillQuestion: "आपका स्तर क्या है?", skillFirstTimer: "🐣 पहली बार", skillBeginner: "🌱 शुरुआती", skillMedium: "⚡ मध्यम", skillPro: "🏆 प्रो", skillMaster: "👑 मास्टर बनना है", onboardingPrompt: "मुफ्त गेम से शुरू करें या असली SOL के लिए खेलें?", btnPlayFree: "मुफ्त खेलें", btnQuickMatch: "क्विक मैच", howStep1: "सीखने के लिए मुफ्त खेलें", howStep2: "अपने वॉलेट में SOL जोड़ें", howStep3: "क्विक मैच से असली विरोधियों से खेलें", walletHelpLine: "आपका वॉलेट पता तैयार है। SOL से खेलने के लिए फंड करें।", btnCopyAddress: "मेरा पता कॉपी करें", btnAddFunds: "फंड जोड़ें", pvpBlocked: "खेल को निष्पक्ष रखने के लिए असली मैचों में Money उपलब्ध नहीं है।", btnGotIt: "समझ गया", nudgeText: "मदद चाहिए? Money को टैप करें 🐒", nudgeDismiss: "समझ गया" },
};

function tr(lang: string, key: string): string {
  return dict[lang]?.[key] || dict.en[key] || key;
}

// ─── No-go zones ───
interface Rect { x: number; y: number; w: number; h: number }

function getNoGoZones(pathname: string, vw: number, vh: number): Rect[] {
  const zones: Rect[] = [];
  if (pathname.includes("chess")) zones.push({ x: vw * 0.2, y: vh * 0.85, w: vw * 0.6, h: vh * 0.15 });
  else if (pathname.includes("ludo")) zones.push({ x: vw * 0.25, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 });
  else if (pathname.includes("backgammon")) zones.push({ x: vw * 0.5, y: vh * 0.8, w: vw * 0.5, h: vh * 0.2 });
  else if (pathname.includes("dominos") || pathname.includes("checkers")) zones.push({ x: vw * 0.1, y: vh * 0.85, w: vw * 0.8, h: vh * 0.15 });
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
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const bg = ctx.createLinearGradient(0, 0, 0, 1080);
    bg.addColorStop(0, "#1a1a2e"); bg.addColorStop(1, "#0f0f23");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1080, 1080);
    ctx.strokeStyle = "#FACC15"; ctx.lineWidth = 4; ctx.strokeRect(30, 30, 1020, 1020);
    ctx.fillStyle = "#FACC15"; ctx.font = "bold 48px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Money – 1MGAMING", 540, 120);
    ctx.fillStyle = "#aaa"; ctx.font = "24px sans-serif"; ctx.fillText("AI Helper Insight", 540, 170);
    ctx.fillStyle = "#ffffff"; ctx.font = "28px sans-serif"; ctx.textAlign = "left";
    const words = text.split(" "); let line = ""; let y = 260; const maxW = 940;
    for (const word of words) {
      const test = line + word + " ";
      if (ctx.measureText(test).width > maxW) { ctx.fillText(line.trim(), 70, y); line = word + " "; y += 40; if (y > 900) { ctx.fillText("...", 70, y); break; } } else { line = test; }
    }
    if (y <= 900) ctx.fillText(line.trim(), 70, y);
    ctx.fillStyle = "#FACC15"; ctx.font = "italic 26px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("With Strategy and Intelligence We Create WEALTH", 540, 980);
    ctx.fillStyle = "#666"; ctx.font = "20px sans-serif"; ctx.fillText("1MGAMING.com", 540, 1040);
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), "image/png"));
  } catch { return null; }
}

// ─── Quick-action menu items (simplified to 3) ───
const WELCOME_ACTIONS = [
  { key: "qGameRules", icon: BookOpen },
  { key: "qHowItWorks", icon: Sparkles },
  { key: "qAppHelp", icon: HelpCircle },
] as const;

// ─── Proactive context tips per game type ───
const GAME_TIPS: Record<string, string> = {
  chess: "Tap a piece to see where it can move",
  ludo: "Tap the dice to roll, then tap a piece to move",
  checkers: "Tap a piece, then tap where to jump",
  backgammon: "Tap the dice to roll, then tap a checker to move",
  dominos: "Tap a tile from your hand to play it",
};

const SKILL_LEVELS: { key: SkillLevel; labelKey: string }[] = [
  { key: "first-timer", labelKey: "skillFirstTimer" },
  { key: "beginner", labelKey: "skillBeginner" },
  { key: "medium", labelKey: "skillMedium" },
  { key: "pro", labelKey: "skillPro" },
  { key: "master", labelKey: "skillMaster" },
];

// ─── Nudge pages ───
const NUDGE_PAGES = ["/", "/quick-match", "/add-funds", "/room-list"];
const NUDGE_KEY = "aihelper-nudge-dismissed";
const AUTOSHEET_KEY = "aihelper-autosheet-dismissed";

// ─── Route helpers ───
function isMultiplayerRoute(pathname: string): boolean {
  return pathname.startsWith("/play/") || pathname.startsWith("/room/");
}
function isAIGameRoute(pathname: string): boolean {
  return pathname.startsWith("/play-ai/");
}

// ─── Analytics ───
function trackMonkey(event: string, context: string, lang: string, metadata?: string) {
  try {
    supabase.functions.invoke("live-stats", {
      body: { action: "track_monkey", sessionId: getSessionId(), event, page: context, game: lang, difficulty: metadata || null },
    }).catch(() => {});
  } catch {}
}

// ─── Main Component ───
const BUBBLE_SIZE = 64;
const FIRST_VISIT_KEY = "aihelper-welcomed";
const SESSION_OPENED_KEY = "aihelper-session-opened";
const HIDDEN_KEY = "aihelper-hidden";
const DRAG_THRESHOLD = 12;
const TAP_MAX_MS = 300;

export default function AIAgentHelperOverlay() {
  const location = useLocation();
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const lang = i18n.language?.slice(0, 2) || "en";
  const isMobile = useIsMobile();

  const isMultiplayer = isMultiplayerRoute(location.pathname);
  const isAIRoute = isAIGameRoute(location.pathname);

  const gameType = useMemo(() => {
    if (!isAIRoute) return "";
    return location.pathname.replace("/play-ai/", "").split("?")[0] || "chess";
  }, [location.pathname, isAIRoute]);

  const pageContext = useMemo(() => {
    if (isAIRoute) return `ai-${gameType}`;
    const p = location.pathname;
    if (p === "/") return "home";
    return p.replace(/^\//, "").split("/")[0] || "home";
  }, [location.pathname, isAIRoute, gameType]);

  // First-time visit (persists forever)
  const [isFirstVisit] = useState(() => {
    try { return !localStorage.getItem(FIRST_VISIT_KEY); } catch { return true; }
  });

  // Session tracking
  const [hasOpenedThisSession, setHasOpenedThisSession] = useState(() => {
    try { return !!sessionStorage.getItem(SESSION_OPENED_KEY); } catch { return false; }
  });

  // Hidden state (persisted)
  const [hidden, setHidden] = useState(() => {
    try { return localStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; }
  });

  // Local card state (for intercepted actions C & D)
  const [localCard, setLocalCard] = useState<LocalCard | null>(null);

  // State
  const [sheetOpen, setSheetOpen] = useState(false);
  const [bubbleState, setBubbleState] = useState<BubbleState>("idle");
  const [skillLevel, setSkillLevel] = useState<SkillLevel | null>(() => {
    try { return (localStorage.getItem("aihelper-skill") as SkillLevel) || null; } catch { return null; }
  });
  const [helperMode, setHelperMode] = useState<HelperMode | null>(() => {
    try { return (localStorage.getItem("aihelper-mode") as HelperMode) || null; } catch { return null; }
  });
  const [messages, setMessages] = useState<ChatMsg[]>(() => {
    try { const saved = localStorage.getItem("aihelper-chat"); return saved ? JSON.parse(saved) : []; } catch { return []; }
  });
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const welcomeTriggered = useRef(false);

  // ─── (A) Proactive Nudge ───
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    if (isMultiplayer || hidden || sheetOpen) return;
    if (!NUDGE_PAGES.includes(location.pathname)) { setShowNudge(false); return; }

    // Check 24h cooldown
    try {
      const dismissed = localStorage.getItem(NUDGE_KEY);
      if (dismissed && Date.now() - Number(dismissed) < 24 * 60 * 60 * 1000) return;
    } catch {}

    let fired = false;
    const fire = () => {
      if (fired || sheetOpen) return;
      fired = true;
      setShowNudge(true);
      cleanup();
    };

    const timer = setTimeout(fire, 2000);
    const onInteract = () => fire();
    window.addEventListener("scroll", onInteract, { once: true, passive: true });
    window.addEventListener("click", onInteract, { once: true });

    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("scroll", onInteract);
      window.removeEventListener("click", onInteract);
    };

    return cleanup;
  }, [location.pathname, isMultiplayer, hidden, sheetOpen]);

  const dismissNudge = useCallback(() => {
    setShowNudge(false);
    try { localStorage.setItem(NUDGE_KEY, String(Date.now())); } catch {}
    trackMonkey("nudge_dismissed", pageContext, lang);
  }, [pageContext, lang]);

  const nudgePillRef = useRef<HTMLDivElement>(null);


  // Mark session opened
  useEffect(() => {
    if (sheetOpen && !hasOpenedThisSession) {
      setHasOpenedThisSession(true);
      try { sessionStorage.setItem(SESSION_OPENED_KEY, "1"); } catch {}
    }
  }, [sheetOpen]);

  // Bubble position
  const [pos, setPos] = useState<{ x: number; y: number }>(() => {
    try { const saved = localStorage.getItem("aihelper-pos"); if (saved) return JSON.parse(saved); } catch {}
    return { x: typeof window !== "undefined" ? window.innerWidth - BUBBLE_SIZE - 16 : 300, y: typeof window !== "undefined" ? window.innerHeight - 200 : 400 };
  });

  // Drag state
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number; startTime: number; dragging: boolean }>({
    startX: 0, startY: 0, startPosX: 0, startPosY: 0, startTime: 0, dragging: false,
  });

  // Persist chat/mode/pos/skill
  useEffect(() => { try { localStorage.setItem("aihelper-chat", JSON.stringify(messages)); } catch {} }, [messages]);
  useEffect(() => { if (helperMode) try { localStorage.setItem("aihelper-mode", helperMode); } catch {} }, [helperMode]);
  useEffect(() => { try { localStorage.setItem("aihelper-pos", JSON.stringify(pos)); } catch {} }, [pos]);
  useEffect(() => { if (skillLevel) try { localStorage.setItem("aihelper-skill", skillLevel); } catch {} }, [skillLevel]);

  // Scroll to bottom
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, sheetOpen]);

  // Handle no-go zones on resize
  useEffect(() => {
    if (isMultiplayer) return;
    const handler = () => {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const zones = getNoGoZones(location.pathname, vw, vh);
      setPos((p) => clampToSafe(p.x, p.y, BUBBLE_SIZE, vw, vh, zones));
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    handler();
    return () => { window.removeEventListener("resize", handler); window.removeEventListener("orientationchange", handler); };
  }, [isMultiplayer, location.pathname]);

  // ─── Anti-rage-quit idle nudge (AI routes only, once per session) ───
  const idleNudgeFired = useRef(false);
  useEffect(() => {
    if (!isAIRoute || idleNudgeFired.current) return;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      if (idleNudgeFired.current) return;
      timer = setTimeout(() => {
        if (sheetOpen || idleNudgeFired.current) return;
        idleNudgeFired.current = true;
        setMessages((prev) => [...prev, { role: "assistant", content: "Take a moment. There's still a strong position here." }]);
        setSheetOpen(true);
        trackMonkey("idle_nudge", pageContext, lang);
      }, 20000);
    };

    resetTimer();
    window.addEventListener("pointerdown", resetTimer);
    window.addEventListener("keydown", resetTimer);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("pointerdown", resetTimer);
      window.removeEventListener("keydown", resetTimer);
    };
  }, [isAIRoute, sheetOpen, pageContext, lang]);

  // ─── Post-game completion message ───
  const lastGameResult = useRef<string>("");
  useEffect(() => {
    if (!isAIRoute) return;
    const check = () => {
      const ctx = (window as any).__AI_HELPER_CONTEXT__;
      const result = ctx?.gameResult || "";
      if (result && result !== lastGameResult.current) {
        lastGameResult.current = result;
        if (result === "win") {
          setMessages((prev) => [...prev, { role: "assistant", content: "You applied discipline. Repeat that." }]);
        } else if (result === "loss") {
          setMessages((prev) => [...prev, { role: "assistant", content: "Review the turning point and try again." }]);
        }
        setSheetOpen(true);
      }
    };
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [isAIRoute]);

  // ─── Simplified pointer: tap to open, move >12px to drag ───
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y, startTime: Date.now(), dragging: false };
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (d.startTime === 0) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const dist = Math.abs(dx) + Math.abs(dy);

    if (dist > DRAG_THRESHOLD) {
      d.dragging = true;
      setPos({ x: d.startPosX + dx, y: d.startPosY + dy });
    }
  }, []);

  const onPointerUp = useCallback(() => {
    const d = dragRef.current;
    if (d.dragging) {
      const vw = window.innerWidth; const vh = window.innerHeight;
      const zones = getNoGoZones(location.pathname, vw, vh);
      setPos((p) => clampToSafe(p.x, p.y, BUBBLE_SIZE, vw, vh, zones));
    } else {
      setSheetOpen(true);
      trackMonkey("bubble_open", pageContext, lang);
    }
    dragRef.current = { ...d, startTime: 0, dragging: false };
  }, [location.pathname, pageContext, lang]);

  // Get board context for AI routes
  const getBoardContext = useCallback(() => {
    const ctx = (window as any).__AI_HELPER_CONTEXT__;
    if (!ctx) return null;
    return {
      gameType: ctx.gameType || gameType,
      moveHistory: ctx.moveHistory || [],
      position: ctx.position || "",
      turn: ctx.turn || "",
      boardSummary: ctx.boardSummary || "",
      moveCount: ctx.moveCount || 0,
      gamePhase: ctx.gamePhase || "",
      gameResult: ctx.gameResult || "",
    };
  }, [gameType]);

  // Send message
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const boardCtx = getBoardContext();
    const moveHistory = boardCtx?.moveHistory || [];

    if (!helperMode) {
      setHelperMode(isAIRoute ? "strategy" : "friend");
    }

    const userMsg: ChatMsg = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);
    trackMonkey("message_sent", pageContext, lang, text.trim().slice(0, 50));
    setBubbleState("thinking");

    let assistantSoFar = "";

    await streamTrustAgent({
      payload: {
        lang,
        helperMode: helperMode || (isAIRoute ? "strategy" : "friend"),
        gameType: boardCtx?.gameType || gameType || "general",
        question: text.trim(),
        moveHistory,
        messages: [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, content: m.content })),
        ...(boardCtx ? { boardState: boardCtx.position, boardSummary: boardCtx.boardSummary, currentTurn: boardCtx.turn } : {}),
        ...(skillLevel ? { skillLevel } : {}),
        ...(boardCtx?.moveCount ? { moveCount: boardCtx.moveCount } : {}),
        ...(boardCtx?.gamePhase ? { gamePhase: boardCtx.gamePhase } : {}),
        ...(boardCtx?.gameResult ? { gameResult: boardCtx.gameResult } : {}),
      } as any,
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
  }, [isStreaming, lang, helperMode, gameType, messages, isAIRoute, skillLevel, getBoardContext]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setHelperMode(null);
    setSkillLevel(null);
    setLocalCard(null);
    trackMonkey("chat_cleared", pageContext, lang);
    try { localStorage.removeItem("aihelper-chat"); localStorage.removeItem("aihelper-mode"); localStorage.removeItem("aihelper-skill"); } catch {}
  }, [pageContext, lang]);

  const shareMessage = useCallback(async (text: string) => {
    trackMonkey("share_tapped", pageContext, lang);
    const blob = await generateShareImage(text);
    if (!blob) return;
    const file = new File([blob], "1mgaming-insight.png", { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: "Money – 1MGAMING AI", text: "With Strategy and Intelligence We Create WEALTH" }).catch(() => {});
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = "1mgaming-insight.png"; a.click();
      URL.revokeObjectURL(url);
    }
  }, []);

  // ─── (E) Listen for "aihelper-show" — PvP toast or normal open ───
  useEffect(() => {
    const handler = () => {
      if (isMultiplayerRoute(location.pathname)) {
        // PvP route: show toast, don't open Money
        toast(tr(lang, "pvpBlocked"), {
          action: {
            label: tr(lang, "btnGotIt"),
            onClick: () => {},
          },
          duration: 5000,
        });
        trackMonkey("pvp_blocked_toast", pageContext, lang);
        return;
      }
      setHidden(false);
      try { localStorage.removeItem(HIDDEN_KEY); } catch {}
      setSheetOpen(true);
      trackMonkey("navbar_show", pageContext, lang);
    };
    window.addEventListener("aihelper-show", handler);
    return () => window.removeEventListener("aihelper-show", handler);
  }, [pageContext, lang, location.pathname]);

  // Hide helper
  const hideHelper = useCallback(() => {
    setHidden(true);
    setSheetOpen(false);
    try { localStorage.setItem(HIDDEN_KEY, "1"); } catch {}
    trackMonkey("hidden", pageContext, lang);
  }, [pageContext, lang]);

  // ─── (C) Intercept "How it works" ───
  const handleHowItWorks = useCallback(() => {
    trackMonkey("assist_action", pageContext, lang, "qHowItWorks");
    setLocalCard({ type: "howItWorks" });
  }, [pageContext, lang]);

  // ─── (D) Intercept "Wallet help" ───
  const handleWalletHelp = useCallback(() => {
    trackMonkey("assist_action", pageContext, lang, "qWallet");
    // Try to get wallet address from global context
    const walletAddress = (window as any).__PRIVY_WALLET_ADDRESS__ || null;
    if (!walletAddress) {
      // No wallet — fall back to AI response
      setHelperMode("friend");
      sendMessage(tr(lang, "qWallet"));
      return;
    }
    setLocalCard({ type: "walletHelp" });
  }, [pageContext, lang, sendMessage]);

  const copyWalletAddress = useCallback(async () => {
    const walletAddress = (window as any).__PRIVY_WALLET_ADDRESS__ || "";
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      toast.success("Address copied!");
      trackMonkey("wallet_copied", pageContext, lang);
    } catch {
      toast.error("Could not copy address");
    }
  }, [pageContext, lang]);

  if (isMultiplayer || hidden) return null;

  const glowColor = bubbleState === "thinking" ? "rgba(250,204,21,0.6)" : bubbleState === "success" ? "rgba(34,197,94,0.5)" : bubbleState === "warning" ? "rgba(239,68,68,0.5)" : "rgba(250,204,21,0.25)";
  const subtitle = isAIRoute ? tr(lang, "subtitleAI") : tr(lang, "subtitleGeneral");

  const quickChips = isAIRoute
    ? ["chipRules", "chipSuggest"]
    : ["chipNavHelp", "chipGameTypes"];

  // ── Flow logic ──
  const showAssistMenu = !helperMode && messages.length === 0 && !isAIRoute && !localCard;
  const showSkillPicker = isAIRoute && !skillLevel && messages.length === 0;
  const showAIModePicker = isAIRoute && skillLevel && !helperMode && messages.length === 0;
  const showChatUI = (helperMode || messages.length > 0) && !localCard;

  return (
    <>
      {/* ─── (1) Action-Based Nudge Pill ─── */}
      {showNudge && !sheetOpen && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={dismissNudge} />
          <div
            ref={nudgePillRef}
            className="fixed z-[45] animate-in slide-in-from-bottom duration-300"
            style={{
              left: pos.x > window.innerWidth / 2 ? pos.x - 200 : pos.x + BUBBLE_SIZE + 8,
              top: pos.y + BUBBLE_SIZE / 2 - 20,
            }}
          >
            <div className="bg-card border border-border rounded-xl px-3 py-2.5 shadow-lg flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNudge();
                  navigate("/play-ai");
                  trackMonkey("nudge_play_free", pageContext, lang);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors whitespace-nowrap"
              >
                {tr(lang, "nudgePlayFree")}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNudge();
                  setSheetOpen(true);
                  trackMonkey("nudge_ask_money", pageContext, lang);
                }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
              >
                {tr(lang, "nudgeAskMoney")}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); dismissNudge(); }}
                className="p-1 hover:bg-muted rounded-full transition-colors ml-0.5"
              >
                <X size={14} className="text-muted-foreground" />
              </button>
            </div>
          </div>
        </>
      )}


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
              boxShadow: `0 0 18px 5px ${glowColor}`,
              background: "#ffffff",
            }}
          >
             <img
              src={monkeyImages[bubbleState]}
              alt="Money – AI Helper"
              className="w-full h-full object-contain rounded-full pointer-events-none"
              draggable={false}
            />
          </div>
          {bubbleState === "thinking" && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-primary rounded-full animate-pulse" />
          )}
        </div>
      )}

      {/* Panel — compact on AI routes, popover on desktop, bottom sheet on mobile */}
      {sheetOpen && (
        <div
          className={`fixed z-[10000] ${
            isAIRoute
              ? "bottom-0 left-0 right-0"
              : isMobile
                ? "inset-0 flex flex-col justify-end"
                : "bottom-4 right-4"
          }`}
          onClick={() => isMobile && !isAIRoute && setSheetOpen(false)}
        >
          {/* Backdrop only on mobile non-AI routes */}
          {!isAIRoute && isMobile && <div className="absolute inset-0 bg-black/50" />}

          <div
            className={`relative bg-background flex flex-col animate-in slide-in-from-bottom duration-300 ${
              isAIRoute
                ? "rounded-t-xl max-h-[40vh] border-t border-primary/30"
                : isMobile
                  ? "rounded-t-2xl max-h-[85vh] border-t border-primary/30"
                  : "w-[380px] max-h-[520px] rounded-xl border border-primary/30 shadow-2xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-3 ${isAIRoute ? "py-1.5" : "py-3"} border-b border-primary/20`}>
              <div className="flex items-center gap-2">
                <div className={`rounded-full overflow-hidden border border-primary ${isAIRoute ? "w-7 h-7" : "w-10 h-10"}`} style={{ background: "#ffffff" }}>
                  <img src={monkeyHappy} alt="Money" className="w-full h-full object-cover" />
                </div>
                <div>
                  <h3 className={`font-bold text-foreground ${isAIRoute ? "text-xs" : "text-sm"}`}>{tr(lang, "title")}</h3>
                  {!isAIRoute && <p className="text-xs text-muted-foreground">{subtitle}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={hideHelper} className="p-1.5 hover:bg-muted rounded-full" title="Hide Money">
                  <span className="text-[10px] text-muted-foreground font-medium">Hide</span>
                </button>
                <button onClick={() => { setSheetOpen(false); setLocalCard(null); }} className="p-1.5 hover:bg-muted rounded-full">
                  <X size={isAIRoute ? 16 : 20} className="text-muted-foreground" />
                </button>
              </div>
            </div>

            {/* Chat Area — scrollable, compact on AI routes */}
            <div className={`flex-1 overflow-y-auto px-3 py-2 space-y-2 ${isAIRoute ? "min-h-[60px] max-h-[20vh]" : "min-h-[200px] max-h-[60vh]"}`}>

              {/* ── (C) "How it works" local card ── */}
              {localCard?.type === "howItWorks" && (
                <div className="space-y-3">
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Sparkles size={16} className="text-primary" />
                      <span>{tr(lang, "qHowItWorks")}</span>
                    </div>
                    <ol className="space-y-1.5 text-xs text-foreground pl-1">
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">1</span>{tr(lang, "howStep1")}</li>
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">2</span>{tr(lang, "howStep2")}</li>
                      <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center shrink-0">3</span>{tr(lang, "howStep3")}</li>
                    </ol>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <button onClick={() => { navigate("/play-ai"); setSheetOpen(false); setLocalCard(null); }} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all">
                      <Gamepad2 size={14} className="text-primary shrink-0" />
                      {tr(lang, "btnPlayFree")}
                    </button>
                    <button onClick={() => { navigate("/add-funds"); setSheetOpen(false); setLocalCard(null); }} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all">
                      <Coins size={14} className="text-primary shrink-0" />
                      {tr(lang, "btnAddFunds")}
                    </button>
                    <button onClick={() => { navigate("/quick-match"); setSheetOpen(false); setLocalCard(null); }} className="flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all">
                      <Zap size={14} className="text-primary shrink-0" />
                      {tr(lang, "btnQuickMatch")}
                    </button>
                  </div>
                  <button onClick={() => setLocalCard(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full text-center">
                    ← Back
                  </button>
                </div>
              )}

              {/* ── (D) Wallet help local card ── */}
              {localCard?.type === "walletHelp" && (
                <div className="space-y-3">
                  <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Wallet size={16} className="text-primary" />
                      <span>{tr(lang, "qWallet")}</span>
                    </div>
                    <p className="text-xs text-foreground">{tr(lang, "walletHelpLine")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={copyWalletAddress} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all">
                      <Copy size={14} className="text-primary shrink-0" />
                      {tr(lang, "btnCopyAddress")}
                    </button>
                    <button onClick={() => { navigate("/add-funds"); setSheetOpen(false); setLocalCard(null); }} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all">
                      <Coins size={14} className="shrink-0" />
                      {tr(lang, "btnAddFunds")}
                    </button>
                  </div>
                  <button onClick={() => setLocalCard(null)} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full text-center">
                    ← Back
                  </button>
                </div>
              )}

              {/* ── (B) Onboarding menu — replaces old greeting ── */}
              {showAssistMenu && (
                <div className="space-y-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-sm text-foreground">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full overflow-hidden border border-primary shrink-0" style={{ background: "#ffffff" }}>
                        <img src={monkeyHappy} alt="Money" className="w-full h-full object-cover" />
                      </div>
                      <p className="font-medium">{tr(lang, "onboardingPrompt")}</p>
                    </div>
                    {/* Two primary navigation buttons */}
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <button
                        onClick={() => { trackMonkey("onboard_play_free", pageContext, lang); navigate("/play-ai"); setSheetOpen(false); }}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold border border-border bg-muted/50 text-foreground hover:border-primary hover:bg-primary/10 transition-all"
                      >
                        <Gamepad2 size={16} className="text-primary" />
                        {tr(lang, "btnPlayFree")}
                      </button>
                      <button
                        onClick={() => { trackMonkey("onboard_quick_match", pageContext, lang); navigate("/quick-match"); setSheetOpen(false); }}
                        className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                      >
                        <Zap size={16} />
                        {tr(lang, "btnQuickMatch")}
                      </button>
                    </div>
                  </div>
                  {/* Quick-action buttons — intercept howItWorks and wallet locally */}
                  <div className="grid grid-cols-2 gap-2">
                    {WELCOME_ACTIONS.map(({ key, icon: Icon }) => (
                      <button
                        key={key}
                        onClick={() => {
                          if (key === "qHowItWorks") { handleHowItWorks(); return; }
                          trackMonkey("assist_action", pageContext, lang, key);
                          setHelperMode("friend");
                          sendMessage(tr(lang, key));
                        }}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-all text-left"
                      >
                        <Icon size={16} className="text-primary shrink-0" />
                        <span>{tr(lang, key)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Skill level picker (AI routes, first step) ── */}
              {showSkillPicker && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">{tr(lang, "skillQuestion")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_LEVELS.map(({ key, labelKey }) => (
                      <button
                        key={key}
                        onClick={() => {
                          trackMonkey("skill_selected", pageContext, lang, key);
                          setSkillLevel(key);
                        }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium border border-border bg-muted/30 text-foreground hover:border-primary hover:bg-primary/10 transition-colors"
                      >
                        {tr(lang, labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ── AI mode picker (after skill level) ── */}
              {showAIModePicker && (
                <div className="space-y-2">
                  <p className="text-sm text-foreground">{tr(lang, "intro")}</p>
                  <div className="flex flex-wrap gap-2">
                    {(["strategy", "rules", "friend"] as HelperMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => { trackMonkey("mode_selected", pageContext, lang, mode); setHelperMode(mode); }}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          mode === "strategy" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/50 text-foreground border-border hover:border-primary"
                        }`}
                      >{tr(lang, mode)}</button>
                    ))}
                  </div>
                </div>
              )}

              {/* Messages */}
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-3 py-1.5 text-xs ${
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/50 text-foreground"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.role === "assistant" && !isStreaming && (
                      <button onClick={() => shareMessage(msg.content)} className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary">
                        <Share2 size={10} /> {tr(lang, "share")}
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {isStreaming && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  {tr(lang, "thinking")}
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Quick chips */}
            {showChatUI && !isStreaming && (
              <div className="px-3 py-1.5 flex gap-1.5 overflow-x-auto border-t border-border/50">
                {quickChips.map((key) => (
                  <button
                    key={key}
                    onClick={() => { trackMonkey("chip_tapped", pageContext, lang, key); sendMessage(tr(lang, key)); }}
                    className="shrink-0 px-2.5 py-1 rounded-full text-[10px] border border-border bg-muted/30 text-foreground hover:border-primary transition-colors"
                  >{tr(lang, key)}</button>
                ))}
              </div>
            )}

            {/* Input */}
            <div className={`px-3 ${isAIRoute ? "py-1.5" : "py-3"} border-t border-border/50 flex items-center gap-2`}>
              <button onClick={clearChat} className="p-1.5 text-muted-foreground hover:text-destructive" title={tr(lang, "clear")}>
                <Trash2 size={14} />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage(input)}
                placeholder={tr(lang, "placeholder")}
                className={`flex-1 bg-muted/30 border border-border rounded-full px-3 ${isAIRoute ? "py-1 text-xs" : "py-2 text-sm"} text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary`}
                disabled={isStreaming}
              />
              <button onClick={() => sendMessage(input)} disabled={!input.trim() || isStreaming} className="p-1.5 text-primary disabled:text-muted-foreground">
                <Send size={isAIRoute ? 14 : 18} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
