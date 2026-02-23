/**
 * Trust Agent Client — calls the trust-agent edge function for AI coaching.
 * Supports SSE streaming for token-by-token responses.
 */

const TRUST_AGENT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trust-agent`;

export interface TrustAgentPayload {
  lang: string;
  helperMode: string;
  gameType: string;
  question: string;
  moveHistory?: any[];
  messages?: { role: string; content: string }[];
  moveCount?: number;
  gamePhase?: string;
  gameResult?: string;
}

/**
 * Stream a response from the trust-agent.
 */
export async function streamTrustAgent({
  payload,
  onDelta,
  onDone,
  onError,
}: {
  payload: TrustAgentPayload;
  onDelta: (text: string) => void;
  onDone: () => void;
  onError: (error: string) => void;
}) {
  try {
    const resp = await fetch(TRUST_AGENT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: "Request failed" }));
      onError(errBody.error || `Error ${resp.status}`);
      return;
    }

    if (!resp.body) {
      onError("No response body");
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);

        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line.startsWith(":") || line.trim() === "") continue;
        if (!line.startsWith("data: ")) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === "[DONE]") {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch {
          buffer = line + "\n" + buffer;
          break;
        }
      }
    }

    // Final flush
    if (buffer.trim()) {
      for (let raw of buffer.split("\n")) {
        if (!raw) continue;
        if (raw.endsWith("\r")) raw = raw.slice(0, -1);
        if (!raw.startsWith("data: ")) continue;
        const jsonStr = raw.slice(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onDelta(content);
        } catch { /* ignore */ }
      }
    }

    onDone();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Network error");
  }
}

/**
 * Returns a friendly message when helper is disabled (non-AI routes).
 */
export function getHelperDisabledMessage(lang: string): string {
  const messages: Record<string, string> = {
    en: "Sorry — I can't help while you're playing a real person or playing for SOL. That would be unfair. But I can help you practice vs AI!",
    es: "Lo siento — no puedo ayudar mientras juegas contra una persona real o por SOL. ¡Pero puedo ayudarte a practicar contra la IA!",
    fr: "Désolé — je ne peux pas aider quand vous jouez contre un vrai joueur ou pour du SOL. Mais je peux vous aider à pratiquer contre l'IA !",
    de: "Entschuldigung — ich kann nicht helfen, wenn du gegen eine echte Person oder um SOL spielst. Aber ich kann dir beim Üben gegen die KI helfen!",
    pt: "Desculpe — não posso ajudar enquanto você joga contra uma pessoa real ou por SOL. Mas posso ajudar a praticar contra a IA!",
    ar: "عذراً — لا أستطيع المساعدة أثناء لعبك ضد شخص حقيقي أو مقابل SOL. لكن يمكنني مساعدتك في التدرب ضد الذكاء الاصطناعي!",
    zh: "抱歉——你在与真人对战或玩SOL时我无法帮助。但我可以帮你练习AI对战！",
    it: "Scusa — non posso aiutarti mentre giochi contro una persona reale o per SOL. Ma posso aiutarti ad allenarti contro l'IA!",
    ja: "ごめんなさい — 実際の相手との対戦中やSOLプレイ中はお手伝いできません。でもAI練習のお手伝いはできます！",
    hi: "माफ़ करें — जब आप किसी असली व्यक्ति के खिलाफ या SOL के लिए खेल रहे हैं तो मैं मदद नहीं कर सकता। लेकिन AI के खिलाफ अभ्यास में मदद कर सकता हूँ!",
  };
  return messages[lang] || messages.en;
}
