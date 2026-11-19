import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin } from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Action = "grant" | "revoke";
type PremiumPlan = "premium_monthly" | "premium_yearly";

function monthsAfter(isoDate: string, months: number): string {
  const source = new Date(isoDate);
  const targetYear = source.getUTCFullYear();
  const targetMonth = source.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const target = new Date(source.getTime());
  target.setUTCDate(1);
  target.setUTCMonth(targetMonth);
  target.setUTCDate(Math.min(source.getUTCDate(), lastDay));
  return target.toISOString();
}

export async function POST(request: NextRequest) {
  // Adicional à proteção SameSite dos cookies: esta ação aceita somente
  // pedidos disparados do próprio site, nunca de outras origens.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Faça login novamente." }, { status: 401 });
  }

  const { data: role, error: roleError } = await supabase
    .from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
  if (roleError || role?.role !== "admin") {
    return NextResponse.json({ error: "Somente administradores podem gerenciar acessos." }, { status: 403 });
  }

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const userId = data.userId;
  const action = data.action;
  const plan = data.plan;
  if (typeof userId !== "string" || !uuidPattern.test(userId) ||
      (action !== "grant" && action !== "revoke") ||
      (action === "grant" && plan !== "premium_monthly" && plan !== "premium_yearly")) {
    return NextResponse.json({ error: "Usuário ou plano inválido." }, { status: 400 });
  }

  const operation = action as Action;
  const selectedPlan: PremiumPlan | "free" = operation === "grant"
    ? plan as PremiumPlan : "free";

  try {
    // A chave de serviço só existe no servidor: nunca é enviada ao navegador.
    const admin = billingAdmin();
    const [profileResult, planResult, existingResult] = await Promise.all([
      admin.from("profiles").select("id,account_status").eq("id", userId).maybeSingle(),
      admin.from("plans").select("id,code,is_active").eq("code", selectedPlan).maybeSingle(),
      admin.from("subscriptions")
        .select("id,plan,status,provider,provider_subscription_id,current_period_end,updated_at")
        .eq("user_id", userId).maybeSingle(),
    ]);
    if (profileResult.error || planResult.error || existingResult.error) {
      throw new Error("Erro ao conferir os dados de assinatura.");
    }
    if (!profileResult.data) {
      return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
    }
    if (profileResult.data.account_status !== "active" && operation === "grant") {
      return NextResponse.json({ error: "A conta do usuário não está ativa." }, { status: 409 });
    }
    if (!planResult.data || !planResult.data.is_active) {
      return NextResponse.json({ error: "Plano indisponível." }, { status: 409 });
    }

    const previous = existingResult.data;
    // Não sobrescrever cobrança real, assinatura remota ou checkout em andamento.
    const remoteInProgress = previous && (
      Boolean(previous.provider_subscription_id) || previous.provider === "mercado_pago"
    );
    if (remoteInProgress) {
      return NextResponse.json({
        error: "Esta conta possui uma assinatura ou contratação pelo Mercado Pago. Não é permitido substituí-la manualmente.",
      }, { status: 409 });
    }
    if (operation === "revoke" && previous?.provider !== "admin") {
      return NextResponse.json({ error: "Esta conta não possui uma liberação manual para revogar." }, { status: 409 });
    }

    const now = new Date().toISOString();
    const end = operation === "grant"
      ? monthsAfter(now, selectedPlan === "premium_yearly" ? 12 : 1)
      : null;
    const changes = {
      plan: selectedPlan,
      plan_id: planResult.data.id,
      status: "active",
      provider: operation === "grant" ? "admin" : null,
      provider_status: operation === "grant" ? "manual_grant" : null,
      provider_subscription_id: null,
      current_period_end: end,
      cancel_at_period_end: false,
      updated_at: now,
    };

    if (previous) {
      // Proteção contra alteração concorrente de uma assinatura enquanto a
      // autorização manual é processada (por exemplo, um webhook de cobrança).
      const { data: changed, error: updateError } = await admin.from("subscriptions")
        .update(changes)
        .eq("id", previous.id)
        .eq("updated_at", previous.updated_at)
        .is("provider_subscription_id", null)
        .select("id").maybeSingle();
      if (updateError) throw updateError;
      if (!changed) {
        return NextResponse.json({ error: "A assinatura foi alterada por outro processo. Atualize a página." }, { status: 409 });
      }
    } else {
      if (operation === "revoke") {
        return NextResponse.json({ error: "Nenhuma assinatura encontrada." }, { status: 404 });
      }
      const { error: insertError } = await admin.from("subscriptions")
        .insert({ user_id: userId, ...changes });
      if (insertError) throw insertError;
    }

    const { error: logError } = await admin.from("admin_logs").insert({
      admin_user_id: user.id,
      target_user_id: userId,
      action: operation === "grant" ? "premium_manual_granted" : "premium_manual_revoked",
      details: {
        new_plan: selectedPlan,
        previous_plan: previous?.plan ?? "free",
        previous_provider: previous?.provider ?? null,
        current_period_end: end,
        source: "admin_panel",
      },
    });
    if (logError) console.error("Não foi possível registrar a auditoria da liberação manual", logError.code);

    return NextResponse.json({
      ok: true,
      plan: selectedPlan,
      current_period_end: end,
      ...(logError ? { warning: "Acesso atualizado, mas o registro de auditoria não foi gravado." } : {}),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Falha no gerenciamento manual de Premium", error);
    return NextResponse.json({ error: "Não foi possível atualizar a assinatura. Verifique o servidor e tente novamente." }, { status: 500 });
  }
}
