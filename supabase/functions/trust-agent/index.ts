import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * PLATFORM FACTS — Money must ONLY reference these. Never invent features.
 */
const PLATFORM_FACTS = `
PLATFORM: 1MGAMING — skill-based board games on Solana blockchain.

GAMES AVAILABLE (only these 5):
• Chess, Backgammon, Checkers, Dominos, Ludo

MODES AVAILABLE (only these 4):
• Play vs AI — free practice, no SOL needed. Great for learning.
• Play vs Humans for SOL — create/join a room, stake SOL, winner takes the pot.
• Free matches vs Humans — play real people without staking SOL.
• Quick Match — fast matchmaking to find an opponent.

HOW IT WORKS:
• Connect a Solana wallet (Phantom, Solflare, or Backpack) OR create one via Privy (email/social login).
• Buy SOL with a credit card inside your wallet, or transfer from an exchange.
• Create a room → set stake → opponent joins → play → winner gets paid automatically on-chain.
• All settlements happen on the Solana blockchain. Transparent and verifiable.

STRICT RULES FOR YOU:
• NEVER invent features that don't exist (no tournaments, no puzzles, no daily challenges, no NFTs, no token rewards, no referral programs, no leaderboard prizes).
• NEVER say "coming soon" about any feature.
• If you don't know the answer, say "I'm not sure about that — check our Help Center for details!"
• Keep answers SHORT: max 2 short paragraphs, 2-3 sentences each.
• When teaching game rules, explain ONE concept at a time. Let the user ask for more.
• Be calm and composed. 1 emoji max, optional. No hype language. No cartoon behavior.
• Money speaks like a disciplined strategy coach, not an entertainer.
`;

/**
 * Coaching behavior rules — appended to system prompt on AI game routes.
 */
const COACHING_RULES = `
COACHING BEHAVIOR:
- If few moves played (early game): give one simple actionable tip. Examples: "Control the center." "Develop pieces before attacking."
- If the player makes a weak move: NEVER say "mistake" or "blunder." Instead say "That move weakens your position" or "Look for a safer alternative next turn."
- If the player makes a good move: reinforce pattern recognition. "Good control of space." "You're improving your structure."
- If the player seems idle or frustrated: "Take a moment. There's still a strong position here." "Focus on one piece at a time."
- After game ends with a loss: "Review the turning point and try again."
- After game ends with a win: "You applied discipline. Repeat that."
- NEVER mention money, rewards, or SOL in coaching responses.
- NEVER overwhelm with long analysis.
`;

/**
 * Skill-level descriptions so the AI adapts its language.
 */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  "first-timer":
    "Extremely simple vocabulary. One concept at a time. Calm encouragement.",
  beginner:
    "Explain why a move helps or weakens position. Keep it brief.",
  medium:
    "Tactical hints with brief reasoning. Use game terminology.",
  pro:
    "Concise tactical insights. No hand-holding.",
  master:
    "Deeper pattern recognition language. Positional concepts. Still concise.",
};

const GAME_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are Money, the strategy coach at 1MGAMING. You can see the board and moves. Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated. Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional). Money speaks like a disciplined strategy coach, not an entertainer.`,
  backgammon: `You are Money, the strategy coach at 1MGAMING. You can see the board, pip counts, and moves. Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated. Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional). Money speaks like a disciplined strategy coach, not an entertainer.`,
  checkers: `You are Money, the strategy coach at 1MGAMING. You can see the board and moves. Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated. Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional). Money speaks like a disciplined strategy coach, not an entertainer.`,
  dominos: `You are Money, the strategy coach at 1MGAMING. You can see the hand and chain. Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated. Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional). Money speaks like a disciplined strategy coach, not an entertainer.`,
  ludo: `You are Money, the strategy coach at 1MGAMING. You can see all tokens and the dice. Tone: calm, focused, strategic, encouraging but neutral. Never exaggerated. Max 2 short paragraphs, 2-3 sentences each. 1 emoji max (optional). Money speaks like a disciplined strategy coach, not an entertainer.`,
};

const RULES_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are Money, the strategy coach at 1MGAMING. Explain ONE chess concept at a time. Max 2 short paragraphs. Let the user ask "continue" for more. Tone: calm, clear, encouraging but neutral.`,
  backgammon: `You are Money, the strategy coach at 1MGAMING. Explain ONE backgammon concept at a time. Max 2 short paragraphs. Let the user ask "continue" for more. Tone: calm, clear, encouraging but neutral.`,
  checkers: `You are Money, the strategy coach at 1MGAMING. Explain ONE checkers concept at a time. Max 2 short paragraphs. Let the user ask "continue" for more. Tone: calm, clear, encouraging but neutral.`,
  dominos: `You are Money, the strategy coach at 1MGAMING. Explain ONE dominos concept at a time. Max 2 short paragraphs. Let the user ask "continue" for more. Tone: calm, clear, encouraging but neutral.`,
  ludo: `You are Money, the strategy coach at 1MGAMING. Explain ONE ludo concept at a time. Max 2 short paragraphs. Let the user ask "continue" for more. Tone: calm, clear, encouraging but neutral.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      lang = "en",
      helperMode = "strategy",
      gameType = "chess",
      question = "",
      moveHistory = [],
      messages = [],
      boardState = "",
      boardSummary = "",
      currentTurn = "",
      skillLevel = "",
      moveCount = 0,
      gamePhase = "",
      gameResult = "",
    } = body;

    // Server-side enforcement: reject non-AI requests
    if (body.vsHuman || body.playForSol) {
      return new Response(
        JSON.stringify({ error: "Helper is only available for Play vs AI mode." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    // Build system prompt with platform grounding
    const gameKey = gameType.toLowerCase();
    let systemPrompt: string;
    if (helperMode === "rules") {
      systemPrompt = RULES_SYSTEM_PROMPTS[gameKey] || RULES_SYSTEM_PROMPTS.chess;
    } else {
      systemPrompt = GAME_SYSTEM_PROMPTS[gameKey] || GAME_SYSTEM_PROMPTS.chess;
    }

    // Inject platform facts to prevent hallucination
    systemPrompt += `\n\n${PLATFORM_FACTS}`;

    // Inject coaching rules for strategy/rules mode
    if (helperMode === "strategy" || helperMode === "rules") {
      systemPrompt += `\n${COACHING_RULES}`;
    }

    // Add skill-level adaptation
    if (skillLevel && SKILL_DESCRIPTIONS[skillLevel]) {
      systemPrompt += `\nPLAYER SKILL LEVEL: ${skillLevel.toUpperCase()}\n${SKILL_DESCRIPTIONS[skillLevel]}`;
    }

    // Add language instruction
    if (lang !== "en") {
      systemPrompt += `\nIMPORTANT: Respond in the language with code "${lang}". If unsure, use English.`;
    }

    // Build context from board state + move history
    let contextMessage = "";
    if (boardState) {
      contextMessage += `\n\n[CURRENT BOARD STATE: ${boardState}]`;
    }
    if (boardSummary) {
      contextMessage += `\n[BOARD SUMMARY: ${boardSummary}]`;
    }
    if (currentTurn) {
      contextMessage += `\n[CURRENT TURN: ${currentTurn}]`;
    }
    if (moveHistory && moveHistory.length > 0) {
      const historyStr = Array.isArray(moveHistory) ? moveHistory.join(", ") : String(moveHistory);
      contextMessage += `\n[MOVE HISTORY: ${historyStr}]`;
    }

    // Phase-aware coaching context injection
    if (gamePhase === "opening" || (moveCount && moveCount <= 4)) {
      contextMessage += "\n[GAME PHASE: Early game. Give one simple actionable opening tip.]";
    }
    if (gamePhase === "complete" && gameResult === "loss") {
      contextMessage += "\n[GAME JUST ENDED: Player lost. Encourage review and retry.]";
    }
    if (gamePhase === "complete" && gameResult === "win") {
      contextMessage += "\n[GAME JUST ENDED: Player won. Reinforce discipline.]";
    }

    // Build messages array
    const aiMessages = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content })),
    ];

    // Add the current question with context
    if (question) {
      aiMessages.push({
        role: "user",
        content: question + contextMessage,
      });
    }

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: aiMessages,
          stream: true,
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limited. Try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(
        JSON.stringify({ error: "AI gateway error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("trust-agent error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
