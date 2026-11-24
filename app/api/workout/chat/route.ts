import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { generateWithGemini } from "@/lib/ai/gemini";

type Suggestion = {
  name: string;
  objective: string;
  days: { day_name: string; exercises: { name: string; catalog_id: string; sets: number; reps: string; rest_seconds: number }[] }[];
};

type HistoryRow = { id: string; role: "user" | "assistant"; content: string; plan: Suggestion | null; created_at: string };

const MAX_USER_CHARS = 1200;
const MAX_DAILY_FREE = 10;
const MAX_DAILY_PREMIUM = 40;
const BAD_RESPONSE = "NÃ£o consegui estruturar esse treino. PeÃ§a para eu montar novamente, informando quantos dias por semana deseja treinar.";

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");
const sanitizeJsonResponse = (raw: string) => raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

function validatePlan(raw: unknown, catalog: { id: string; name: string }[]): Suggestion | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (typeof value.name !== "string" || typeof value.objective !== "string" || !Array.isArray(value.days) || value.days.length < 1 || value.days.length > 7) return null;
  const known = new Map(catalog.map(ex => [normalize(ex.name), ex]));
  const days: Suggestion["days"] = [];
  const usedDays = new Set<string>();

  for (const item of value.days) {
    if (!item || typeof item !== "object") return null;
    const day = item as Record<string, unknown>;
    if (typeof day.day_name !== "string" || !Array.isArray(day.exercises) || day.exercises.length < 1 || day.exercises.length > 12) return null;

    const dayName = day.day_name.slice(0, 45).trim();
    if (!dayName || usedDays.has(normalize(dayName))) return null;
    usedDays.add(normalize(dayName));

    const exercises: Suggestion["days"][number]["exercises"] = [];
    for (const e of day.exercises) {
      if (!e || typeof e !== "object") return null;
      const ex = e as Record<string, unknown>;
      if (typeof ex.name !== "string" || typeof ex.reps !== "string") return null;

      const match = known.get(normalize(ex.name));
      const sets = Number(ex.sets);
      const rest = Number(ex.rest_seconds);
      if (!match || !Number.isInteger(sets) || sets < 1 || sets > 6 || !Number.isInteger(rest) || rest < 30 || rest > 240 || !ex.reps.trim() || ex.reps.length > 32) return null;

      exercises.push({ name: match.name, catalog_id: match.id, sets, reps: ex.reps.trim(), rest_seconds: rest });
    }

    days.push({ day_name: dayName, exercises });
  }

  return { name: value.name.slice(0, 100).trim(), objective: value.objective.slice(0, 100).trim(), days };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return fail("Entre na sua conta para abrir o personal com IA.", 401);

    const { data, error } = await supabase
      .from("workout_ai_messages")
      .select("id,role,content,plan,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error) return fail("NÃ£o foi possÃ­vel carregar o chat. Execute primeiro a migration SQL do chat.", 503);
    return NextResponse.json({ messages: ((data ?? []) as HistoryRow[]).reverse() });
  } catch {
    return fail("Erro ao carregar a conversa.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return fail("FaÃ§a login para conversar com a IA.", 401);
    if (!process.env.GEMINI_API_KEY) return fail("A IA ainda nÃ£o foi configurada no servidor. Adicione GEMINI_API_KEY Ã  Vercel.", 503);
    if (Number(request.headers.get("content-length") ?? 0) > 6000) return fail("Mensagem muito longa.", 413);

    const body = await request.json().catch(() => null);
    if (!body || typeof body.message !== "string" || !body.message.trim() || body.message.length > MAX_USER_CHARS) {
      return fail("Escreva uma mensagem de atÃ© 1.200 caracteres.", 400);
    }

    const message = body.message.trim();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [
      { data: subscription },
      { data: role },
      { count, error: countError },
      { data: history, error: historyError },
      { data: profile },
      { data: catalog, error: catalogError },
    ] = await Promise.all([
      supabase.from("subscriptions").select("plan,status,current_period_end").eq("user_id", user.id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle(),
      supabase.from("workout_ai_messages").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("role", "user").gte("created_at", since),
      supabase.from("workout_ai_messages").select("role,content,plan").eq("user_id", user.id).order("created_at", { ascending: false }).limit(12),
      supabase.from("profiles").select("age,weight_kg,height_cm,goal").eq("id", user.id).maybeSingle(),
      supabase.from("exercises").select("id,name,muscle_group,equipment").order("name").limit(800),
    ]);

    if (countError || historyError) return fail("Chat nÃ£o configurado no banco. Execute a migration SQL antes de usar.", 503);
    if (catalogError || !catalog?.length) return fail("NÃ£o foi possÃ­vel consultar a biblioteca de exercÃ­cios do FitMind AI.", 503);

    const premium = Boolean(
      subscription &&
      ["premium", "premium_monthly", "premium_yearly"].includes(subscription.plan) &&
      subscription.status === "active" &&
      subscription.current_period_end &&
      new Date(subscription.current_period_end).getTime() > Date.now()
    );

    const limit = role?.role === "admin" ? 60 : premium ? MAX_DAILY_PREMIUM : MAX_DAILY_FREE;
    if ((count ?? 0) >= limit) {
      return fail(`VocÃª atingiu o limite de ${limit} mensagens nas Ãºltimas 24 horas. Retorne quando o limite for renovado.`, 429);
    }

    const list = (catalog as { id: string; name: string; muscle_group: string; equipment: string | null }[])
      .map(ex => `${ex.name} (${ex.muscle_group}${ex.equipment ? ", " + ex.equipment : ""})`)
      .join("\n");

    const instructions = `VocÃª Ã© o Personal AI do FitMind AI, um assistente educacional de treino fÃ­sico. Responda em portuguÃªs do Brasil, com simpatia e objetividade. FaÃ§a perguntas sobre objetivo, experiÃªncia, dias por semana, equipamentos disponÃ­veis, tempo por treino, preferÃªncias, limitaÃ§Ãµes fÃ­sicas e possÃ­veis dores antes de montar um plano, se essas informaÃ§Ãµes estiverem faltando. NÃ£o presuma lesÃµes ou diagnÃ³sticos. Se houver dor importante ou condiÃ§Ã£o de saÃºde, oriente avaliaÃ§Ã£o profissional antes de prescrever exercÃ­cios. NÃ£o prometa resultados garantidos. Ao ter informaÃ§Ãµes suficientes, gere um programa realista, equilibrado e progressivo, 1 a 6 dias por semana e respeite os exercÃ­cios que o aluno nÃ£o quer fazer. Use APENAS nomes da biblioteca a seguir, exatamente como escritos, inclusive acentos. Nunca sugira atividades perigosas ou inadequadas a menores; para menores, peÃ§a orientaÃ§Ã£o profissional. Pode atualizar um plano gerado anteriormente conforme os pedidos do usuÃ¡rio.
Perfil informado pelo aluno: ${JSON.stringify(profile ?? {})}. Perfil Ã© contexto, nÃ£o substitui o que ele disser no chat.
Biblioteca disponÃ­vel:\n${list}\n
Retorne sempre um objeto JSON VÃLIDO com chaves "reply" (mensagem curta em portuguÃªs) e "plan" (null enquanto estiver perguntando, ou um objeto quando propor um treino). O plano deve ter formato: {"name":"nome do plano", "objective":"objetivo", "days":[{"day_name":"Segunda", "exercises":[{"name":"NOME EXATO DA BIBLIOTECA", "sets":3, "reps":"8-12", "rest_seconds":90}]}]}. Use atÃ© 7 dias, atÃ© 12 exercÃ­cios por dia, descanso entre 30 e 240 segundos. NÃ£o inclua dados de calendÃ¡rio. Quando alterar o treino, retorne o plano INTEIRO atualizado, nÃ£o somente as mudanÃ§as.`;

    const orderedHistory = ((history ?? []) as { role: "user" | "assistant"; content: string; plan: Suggestion | null }[]).reverse();
    const messages = orderedHistory.map(h => ({
      role: h.role,
      content: h.role === "assistant" && h.plan
        ? `${h.content}\nPlano que vocÃª sugeriu: ${JSON.stringify(h.plan).slice(0, 8500)}`
        : h.content,
    }));

    let raw = "";
    try {
      raw = await generateWithGemini(instructions, [...messages, { role: "user", content: message }]);
    } catch (error) {
      const code = error instanceof Error ? error.message : "UNKNOWN";
      if (code === "GEMINI_API_KEY_NOT_CONFIGURED") {
        return fail("A IA ainda nÃ£o foi configurada no servidor. Adicione GEMINI_API_KEY Ã  Vercel.", 503);
      }
      if (typeof code === "string" && code.startsWith("GEMINI_API_ERROR_")) {
        console.error("Workout AI Gemini error", code);
        return fail("A IA estÃ¡ indisponÃ­vel no momento. Tente novamente mais tarde.", 502);
      }
      throw error;
    }

    const parsed = JSON.parse(sanitizeJsonResponse(raw)) as { reply?: unknown; plan?: unknown };
    let reply = typeof parsed.reply === "string" ? parsed.reply.trim().slice(0, 3000) : "";
    if (!reply) reply = BAD_RESPONSE;

    const plan = parsed.plan ? validatePlan(parsed.plan, catalog) : null;
    if (parsed.plan && !plan) reply += `\n\n${BAD_RESPONSE}`;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceRoleKey) return fail("Servidor nao configurado para salvar as conversas da IA.", 503);

    const adminDb = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error: writeError } = await adminDb.from("workout_ai_messages").insert([
      { user_id: user.id, role: "user", content: message, plan: null },
      { user_id: user.id, role: "assistant", content: reply, plan },
    ]);

    if (writeError) return fail("NÃ£o foi possÃ­vel salvar a conversa. Verifique a migration SQL do chat.", 503);

    const { data: latest } = await supabase
      .from("workout_ai_messages")
      .select("id,role,content,plan,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(2);

    return NextResponse.json({
      messages: ((latest ?? []) as HistoryRow[]).reverse(),
      remaining: Math.max(0, limit - (count ?? 0) - 1),
    });
  } catch (error) {
    console.error("Workout AI route error", error instanceof Error ? error.message : "Unknown");
    return fail("NÃ£o foi possÃ­vel processar sua mensagem. Tente novamente.", 500);
  }
}