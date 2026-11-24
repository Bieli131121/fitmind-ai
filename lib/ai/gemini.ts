type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const RETRY_DELAYS_MS = [1200, 3000];
const REQUEST_TIMEOUT_MS = 12000;

export async function generateWithGemini(
  instructions: string,
  messages: ChatMessage[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");

  const primary = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite";
  const models = primary === fallback ? [primary] : [primary, fallback];
  const body = JSON.stringify({
    systemInstruction: { parts: [{ text: instructions }] },
    contents: messages.map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    })),
    generationConfig: {
      temperature: 0.35,
      responseMimeType: "application/json",
      maxOutputTokens: 8192,
    },
  });

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const isPrimary = modelIndex === 0;
    const maxAttempts = isPrimary ? RETRY_DELAYS_MS.length + 1 : 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (error) {
        // Problemas de rede e timeout sao reportados sem esconder a causa.
        console.error("Gemini transport error", model, error instanceof Error ? error.name : "Unknown");
        throw error;
      }

      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts
          ?.map((part: { text?: string }) => part.text ?? "")
          .join("");
        if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");
        console.info("Gemini response success", model);
        return text;
      }

      const errorText = (await response.text()).slice(0, 1000);
      console.error("Gemini API error status", response.status, "model", model, "attempt", attempt + 1, errorText);

      if (response.status === 503) {
        if (isPrimary && attempt < RETRY_DELAYS_MS.length) {
          await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
          continue;
        }
        if (isPrimary && models.length > 1) {
          console.warn("Gemini fallback triggered", primary, fallback);
          break;
        }
      }
      // Nao tentar outro modelo para erros 400, 401, 403 e 429.
      throw new Error(`GEMINI_API_ERROR_${response.status}`);
    }
  }

  throw new Error("GEMINI_NO_AVAILABLE_MODEL");
}