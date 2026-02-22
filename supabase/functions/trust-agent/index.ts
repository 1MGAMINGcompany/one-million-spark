import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GAME_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are 1MGAMING's chess coach — a streetwise Solana monkey in gold sneakers. You analyze chess positions and move history. NEVER give exact moves like "play Nf3". Instead present 2-3 strategic options with reasoning. Be encouraging but real. Keep answers concise (max 150 words). Use chess terminology the player's level can handle.`,
  backgammon: `You are 1MGAMING's backgammon coach — a streetwise Solana monkey in gold sneakers. You analyze backgammon positions, pip counts, and move history. NEVER give exact moves. Present strategic options: running game, holding game, priming, back game. Be encouraging. Keep concise (max 150 words).`,
  checkers: `You are 1MGAMING's checkers coach — a streetwise Solana monkey in gold sneakers. You analyze checker positions and move history. NEVER give exact moves. Present options around king development, board control, trapping strategies. Be encouraging. Keep concise (max 150 words).`,
  dominos: `You are 1MGAMING's dominos coach — a streetwise Solana monkey in gold sneakers. You analyze domino hands, chain state, and remaining tiles. NEVER say exactly which tile to play. Present options around pip management, blocking, and reading opponent draws. Be encouraging. Keep concise (max 150 words).`,
  ludo: `You are 1MGAMING's ludo coach — a streetwise Solana monkey in gold sneakers. You analyze ludo board state and token positions. NEVER say exactly which token to move. Present options around safe spots, capturing opportunities, and home-run strategy. Be encouraging. Keep concise (max 150 words).`,
};

const RULES_SYSTEM_PROMPTS: Record<string, string> = {
  chess: `You are 1MGAMING's chess teacher. Explain chess rules, piece movements, special moves (castling, en passant, promotion), and basic strategy concepts. Be clear, friendly, and use examples. Keep answers under 200 words.`,
  backgammon: `You are 1MGAMING's backgammon teacher. Explain rules: movement, hitting, bearing off, doubling cube concepts. Be clear and friendly. Under 200 words.`,
  checkers: `You are 1MGAMING's checkers teacher. Explain rules: movement, jumping, king promotion, mandatory captures. Be clear and friendly. Under 200 words.`,
  dominos: `You are 1MGAMING's dominos teacher. Explain rules: matching ends, drawing, passing, scoring. Be clear and friendly. Under 200 words.`,
  ludo: `You are 1MGAMING's ludo teacher. Explain rules: rolling 6 to enter, safe spots, capturing, home path. Be clear and friendly. Under 200 words.`,
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
    } = body;

    // Server-side enforcement: reject non-AI requests
    if (body.vsHuman || body.playForSol) {
      return new Response(
        JSON.stringify({
          error: "Helper is only available for Play vs AI mode.",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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

    // Add language instruction
    if (lang !== "en") {
      systemPrompt += `\n\nIMPORTANT: Respond in the language with code "${lang}". If unsure, use English.`;
    }

    // Add tagline
    systemPrompt += `\n\nEnd important messages with: "Strategy and Intelligence becomes WEALTH 💰"`;

    // Build context from move history
    let contextMessage = "";
    if (moveHistory && moveHistory.length > 0) {
      const historyStr = Array.isArray(moveHistory) ? moveHistory.join(", ") : String(moveHistory);
      contextMessage = `\n\n[Current game context - ${gameKey} move history: ${historyStr}]`;
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
