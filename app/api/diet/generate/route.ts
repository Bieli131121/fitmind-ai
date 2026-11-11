import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Faça login para gerar sua sugestão alimentar." }, { status: 401 });
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "A IA ainda não está configurada. Adicione OPENAI_API_KEY nas variáveis de ambiente da Vercel e no .env.local." }, { status: 503 });
    const body = await request.json();
    const goal = String(body.goal ?? "Saúde e qualidade de vida").slice(0, 100);
    const restrictions = String(body.restrictions ?? "").slice(0, 700);
    const age = Number(body.age) || null, weight = Number(body.weight) || null, height = Number(body.height) || null;
    const meals = Math.min(6, Math.max(3, Number(body.meals) || 5));
    const prompt = `Crie uma sugestão alimentar geral, equilibrada e educativa em português do Brasil. Objetivo: ${goal}. Idade: ${age ?? "não informada"}. Peso kg: ${weight ?? "não informado"}. Altura cm: ${height ?? "não informada"}. Refeições: ${meals}. Preferências/restrições informadas pelo usuário: ${restrictions || "nenhuma informada"}. Não diagnostique nem trate doenças, não prescreva suplementos ou medicamentos, não proponha dietas extremas, jejuns, metas agressivas ou restrição calórica severa. Se idade menor que 18 ou dados insuficientes, não estime calorias/macros (use null) e recomende acompanhamento profissional. Não trate alergias/intolerâncias como validadas; destaque que devem ser confirmadas com nutricionista. Retorne SOMENTE JSON com: title (string), summary (string), daily_calories (number ou null), protein_g (number ou null), carbs_g (number ou null), fats_g (number ou null), meals (array de objetos {name:string,time:string,foods:string[]}), notes (array de strings). As quantidades/macros são estimativas e não prescrição.`;
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você é um assistente de educação alimentar. Seja prudente, não substitua profissionais de saúde e nunca apresente a resposta como prescrição clínica." },
          { role: "user", content: prompt }
        ]
      })
    });
    if (!response.ok) {
      const detail = await response.text();
      console.error("OpenAI diet generation failed:", response.status, detail.slice(0, 500));
      return NextResponse.json({ error: "O serviço de IA não respondeu. Tente novamente mais tarde." }, { status: 502 });
    }
    const result = await response.json();
    const content = result.choices?.[0]?.message?.content;
    if (!content) throw new Error("A IA retornou uma resposta vazia.");
    const diet = JSON.parse(content);
    if (!diet.title || !Array.isArray(diet.meals)) throw new Error("A resposta da IA veio em formato inválido.");
    return NextResponse.json(diet);
  } catch (error) {
    console.error("Diet generation error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao gerar sugestão." }, { status: 500 });
  }
}
