import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  billingAdmin, checkoutEnabled, expectedAmount, hasPaidAccess,
  mpApi, paymentConfigured, planId, type PlanCode,
} from "@/lib/billing/mercadopago";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!checkoutEnabled() || !paymentConfigured()) {
    return NextResponse.json({ error: "Assinaturas ainda não habilitadas." }, { status: 503 });
  }
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user?.email) return NextResponse.json({ error: "Faça login para assinar." }, { status: 401 });

  const payload: unknown = await request.json().catch(() => null);
  const code = payload && typeof payload === "object" && "plan" in payload ? payload.plan : null;
  if (code !== "premium_monthly" && code !== "premium_yearly") {
    return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
  }
  const plan = code as PlanCode;
  const admin = billingAdmin();
  let reserved = false;
  let rowId = "";
  let createdRemoteId = "";
  let requestedRemoteCreation = false;
  try {
    const siteUrl = new URL(process.env.FITMIND_SITE_URL!);
    if (siteUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
      throw new Error("FITMIND_SITE_URL deve usar HTTPS");
    }
    const [{ data: dbPlan, error: planError }, { data: existing, error: subError }] = await Promise.all([
      admin.from("plans").select("id,price_cents,currency,is_configured,is_active").eq("code", plan).maybeSingle(),
      admin.from("subscriptions")
        .select("id,plan,status,current_period_end,provider_subscription_id,cancel_at_period_end")
        .eq("user_id", user.id).maybeSingle(),
    ]);
    if (planError || subError || !dbPlan || !existing) throw new Error("Não foi possível validar a conta e o plano");
    if (!dbPlan.is_active || !dbPlan.is_configured || dbPlan.currency !== "BRL" ||
      dbPlan.price_cents !== expectedAmount(plan) * 100) {
      return NextResponse.json({ error: "Preço do plano não corresponde ao valor anunciado." }, { status: 409 });
    }
    if (hasPaidAccess(existing) || ["pending", "creating", "authorized"].includes(existing.status) ||
        (Boolean(existing.provider_subscription_id) &&
          !existing.cancel_at_period_end && existing.status !== "canceled")) {
      return NextResponse.json({ error: "Você já possui assinatura ou solicitação em andamento. Atualize o status ou cancele a anterior." }, { status: 409 });
    }

    const mpPlan = await mpApi<{
      status?: string;
      auto_recurring?: { currency_id?: string; transaction_amount?: number | string; frequency?: number; frequency_type?: string };
    }>(`/preapproval_plan/${planId(plan)}`);
    const freq = mpPlan.auto_recurring;
    const correctFrequency = plan === "premium_monthly"
      ? freq?.frequency === 1 && freq?.frequency_type === "months"
      : (freq?.frequency === 12 && freq?.frequency_type === "months") ||
        (freq?.frequency === 1 && freq?.frequency_type === "years");
    if (mpPlan.status !== "active" || !correctFrequency || freq?.currency_id !== "BRL" ||
      Number(freq?.transaction_amount) !== expectedAmount(plan)) {
      return NextResponse.json({ error: "O valor ou a recorrência do Mercado Pago não confere." }, { status: 409 });
    }

    // Reserva atomicamente a assinatura. Duas requisições simultâneas
    // não podem iniciar duas compras para a mesma conta.
    const { data: locked, error: lockError } = await admin.from("subscriptions").update({
      status: "creating", plan, plan_id: dbPlan.id,
      provider: "mercado_pago", provider_status: "creating",
      provider_subscription_id: null, cancel_at_period_end: false,
      current_period_end: null, updated_at: new Date().toISOString(),
    }).eq("id", existing.id).eq("status", existing.status)
      .eq("plan", existing.plan).select("id").maybeSingle();
    if (lockError) throw lockError;
    if (!locked) return NextResponse.json({ error: "Outra contratação está em andamento." }, { status: 409 });
    reserved = true;
    rowId = existing.id;

    requestedRemoteCreation = true;
    const created = await mpApi<{ id?: string; init_point?: string }>("/preapproval", {
      method: "POST",
      headers: { "X-Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        preapproval_plan_id: planId(plan),
        reason: `FitMind AI ${plan === "premium_monthly" ? "Premium Mensal" : "Premium Anual"}`,
        external_reference: user.id,
        payer_email: user.email,
        back_url: new URL("/financeiro?mp_return=1", siteUrl).toString(),
        status: "pending",
      }),
    });
    if (created.id) createdRemoteId = created.id;
    if (!created.id || !created.init_point) throw new Error("Mercado Pago não forneceu checkout");
    const url = new URL(created.init_point);
    const trusted = ["mercadopago.com", "mercadopago.com.br"].some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`)
    );
    if (url.protocol !== "https:" || !trusted) throw new Error("URL de pagamento inválida");
    const { error: saveError } = await admin.from("subscriptions").update({
      provider_subscription_id: created.id,
      status: "pending", provider_status: "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", rowId).eq("status", "creating");
    if (saveError) throw saveError;
    reserved = false;
    return NextResponse.json({ checkout_url: created.init_point });
  } catch (error) {
    console.error("Erro ao criar assinatura", error);
    return NextResponse.json({ error: "Não foi possível iniciar a assinatura. Tente novamente ou contate o suporte." }, { status: 502 });
  } finally {
    if (reserved && rowId) {
      // Se o MP criou a assinatura, cancela antes de liberar nova tentativa.
      // Uma falha de rede após enviar POST pode ter criado a assinatura no MP.
      // Não libera uma segunda cobrança sem saber o resultado remoto.
      let canceledRemote = !requestedRemoteCreation;
      if (createdRemoteId) {
        try {
          await mpApi(`/preapproval/${encodeURIComponent(createdRemoteId)}`, {
            method: "PUT", body: JSON.stringify({ status: "canceled" }),
          });
          canceledRemote = true;
        } catch (err) {
          console.error("Falha ao cancelar assinatura remota órfã; exige revisão manual", err);
        }
      }
      if (canceledRemote) await admin.from("subscriptions").update({
        plan: "free", status: "active", plan_id: null,
        provider_subscription_id: null, provider_status: null,
        updated_at: new Date().toISOString(),
      }).eq("id", rowId).eq("status", "creating");
    }
  }
}
