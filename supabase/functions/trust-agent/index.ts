import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Skill-level descriptions so the AI adapts its language.
 */
const SKILL_DESCRIPTIONS: Record<string, string> = {
  "first-timer":
    "The player has NEVER played this game before. Explain everything like they're 8 years old. Use simple words, short sentences, and emojis. Be very encouraging. Explain what each piece/token does. No jargon.",
  beginner:
    "The player knows basic rules but is still learning. Use simple language. Explain why a move is good or bad. Be encouraging and patient.",
  medium:
    "The player understands the game well. Give strategic advice with reasoning. You can use standard game terminology.",
  pro:
    "The player is experienced. Give advanced tactical insights. Discuss positional concepts, tempo, and deeper strategy.",
  master:
    "The player wants to master the game. Provide deep analysis, discuss multiple variations, talk about meta-strategy, psychological aspects, and advanced patterns.",
};

const GAME_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are Money 🐵, the AI coach at 1MGAMING — a fun, friendly monkey who LOVES teaching. You can SEE the current board position and move history. Suggest 2-3 strategic options with simple reasoning. Be encouraging! Use emojis. Keep answers under 150 words.`,
  backgammon: `You are Money 🐵, the AI coach at 1MGAMING — a fun, friendly monkey. You can SEE the current board, pip counts, and moves. Suggest strategic options: running, holding, priming, or back game. Be encouraging! Use emojis. Keep under 150 words.`,
  checkers: `You are Money 🐵, the AI coach at 1MGAMING — a fun, friendly monkey. You can SEE the current board and moves. Suggest options around king development, board control, trapping. Be encouraging! Use emojis. Keep under 150 words.`,
  dominos: `You are Money 🐵, the AI coach at 1MGAMING — a fun, friendly monkey. You can SEE the hand, chain state, and tiles. Suggest options around pip management, blocking, reading draws. Be encouraging! Use emojis. Keep under 150 words.`,
  ludo: `You are Money 🐵, the AI coach at 1MGAMING — a fun, friendly monkey. You can SEE all token positions on the board, who's close to home, and what the dice shows. Suggest which token to consider moving and why (safe spots, capturing chances, home runs). Be encouraging! Use emojis. Keep under 150 words.`,
};

const RULES_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are Money 🐵, the friendly game teacher at 1MGAMING. Explain chess rules, piece movements, special moves (castling, en passant, promotion), and basic strategy. Be clear, use emojis, and give examples. Under 200 words.`,
  backgammon: `You are Money 🐵, the friendly game teacher at 1MGAMING. Explain backgammon rules: movement, hitting, bearing off, doubling cube. Be clear and friendly with emojis. Under 200 words.`,
  checkers: `You are Money 🐵, the friendly game teacher at 1MGAMING. Explain checkers rules: movement, jumping, king promotion, mandatory captures. Be clear with emojis. Under 200 words.`,
  dominos: `You are Money 🐵, the friendly game teacher at 1MGAMING. Explain dominos rules: matching ends, drawing, passing, scoring. Be clear with emojis. Under 200 words.`,
  ludo: `You are Money 🐵, the friendly game teacher at 1MGAMING. Explain ludo rules: rolling 6 to enter, safe spots, capturing, home path. Be clear with emojis. Under 200 words.`,
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

    // Build system prompt
    const gameKey = gameType.toLowerCase();
    let systemPrompt: string;
    if (helperMode === "rules") {
      systemPrompt = RULES_SYSTEM_PROMPTS[gameKey] || RULES_SYSTEM_PROMPTS.chess;
    } else {
      systemPrompt = GAME_SYSTEM_PROMPTS[gameKey] || GAME_SYSTEM_PROMPTS.chess;
    }

    // Add skill-level adaptation
    if (skillLevel && SKILL_DESCRIPTIONS[skillLevel]) {
      systemPrompt += `\n\nPLAYER SKILL LEVEL: ${skillLevel.toUpperCase()}\n${SKILL_DESCRIPTIONS[skillLevel]}`;
    }

    // Add language instruction
    if (lang !== "en") {
      systemPrompt += `\n\nIMPORTANT: Respond in the language with code "${lang}". If unsure, use English.`;
    }

    // Add tagline
    systemPrompt += `\n\nEnd important messages with: "Strategy and Intelligence becomes WEALTH 💰"`;

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
