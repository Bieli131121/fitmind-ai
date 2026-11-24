type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const RETRY_DELAYS_MS = [1200, 3000];

export async function generateWithGemini(
  instructions: string,
  messages: ChatMessage[]
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY_NOT_CONFIGURED");

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
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

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body,
      signal: AbortSignal.timeout(20000),
    });

    if (response.ok) {
      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts
        ?.map((part: { text?: string }) => part.text ?? "")
        .join("");
      if (!text) throw new Error("GEMINI_EMPTY_RESPONSE");
      return text;
    }

    const errorText = (await response.text()).slice(0, 1000);
    console.error("Gemini API error status", response.status, "attempt", attempt + 1, errorText);

    // Erros 503 sao geralmente temporarios; nao repetir 400/403/404 ou 429.
    if (response.status !== 503 || attempt === RETRY_DELAYS_MS.length) {
      throw new Error(`GEMINI_API_ERROR_${response.status}`);
    }
    await new Promise<void>((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  throw new Error("GEMINI_UNKNOWN_ERROR");
}