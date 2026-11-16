import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const PLAN_IDS = {
  premium_monthly: "5f123e4e9e4645e881dd66a2f911d4d4",
  premium_yearly: "09694d3aea0241d288ece1c2f2c4cb96",
} as const;

type PlanCode = keyof typeof PLAN_IDS;

export async function POST(request: NextRequest) {
  // Impede contratações reais enquanto o webhook e a validação de
  // pagamentos não tiverem sido concluídos, mesmo por chamadas diretas.
  if (process.env.FITMIND_CHECKOUT_ENABLED !== "true") {
    return NextResponse.json(
      { error: "A contratação Premium ainda está em preparação." },
      { status: 503 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Faça login para assinar." },
        { status: 401 }
      );
    }

    const body: unknown = await request.json().catch(() => null);
    const planCode =
      body && typeof body === "object" && "plan" in body
        ? body.plan
        : null;

    if (planCode !== "premium_monthly" && planCode !== "premium_yearly") {
      return NextResponse.json({ error: "Plano inválido." }, { status: 400 });
    }

    const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!token || token === "[SENSITIVE]") {
      return NextResponse.json(
        { error: "Mercado Pago não configurado." },
        { status: 503 }
      );
    }

    const [{ data: dbPlan, error: planError }, { data: existing, error: subError }] =
      await Promise.all([
        supabase
          .from("plans")
          .select("code,price_cents,currency,is_active,is_configured")
          .eq("code", planCode)
          .maybeSingle(),
        supabase
          .from("subscriptions")
          .select("plan,status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    if (planError || subError) {
      return NextResponse.json(
        { error: "Não foi possível validar a assinatura." },
        { status: 503 }
      );
    }

    const expectedPrice = planCode === "premium_monthly" ? 1500 : 15000;
    if (
      !dbPlan?.is_active ||
      !dbPlan?.is_configured ||
      dbPlan.currency !== "BRL" ||
      dbPlan.price_cents !== expectedPrice
    ) {
      return NextResponse.json(
        { error: "Plano indisponível ou com preço divergente." },
        { status: 409 }
      );
    }

    if (
      existing &&
      ["premium", "premium_monthly", "premium_yearly"].includes(existing.plan) &&
      ["pending", "authorized", "active"].includes(existing.status ?? "")
    ) {
      return NextResponse.json(
        { error: "Já existe uma assinatura Premium ativa ou em andamento." },
        { status: 409 }
      );
    }

    const planId = PLAN_IDS[planCode as PlanCode];

    // O plano no Mercado Pago também precisa ter preço, moeda,
    // periodicidade e status conferidos antes de permitir cobranças reais.
    const mpPlanResponse = await fetch(
      `https://api.mercadopago.com/preapproval_plan/${planId}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }
    );
    if (!mpPlanResponse.ok) {
      return NextResponse.json(
        { error: "Não foi possível verificar o plano no Mercado Pago." },
        { status: 502 }
      );
    }
    const mpPlan = await mpPlanResponse.json();
    const recurrence = mpPlan?.auto_recurring;
    const validPeriod =
      planCode === "premium_monthly"
        ? recurrence?.frequency === 1 && recurrence?.frequency_type === "months"
        : (recurrence?.frequency === 12 && recurrence?.frequency_type === "months") ||
          (recurrence?.frequency === 1 && recurrence?.frequency_type === "years");

    if (
      mpPlan?.status !== "active" ||
      recurrence?.currency_id !== "BRL" ||
      Number(recurrence?.transaction_amount) !== expectedPrice / 100 ||
      !validPeriod
    ) {
      return NextResponse.json(
        { error: "O plano do Mercado Pago não corresponde ao valor anunciado." },
        { status: 409 }
      );
    }

    const response = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        preapproval_plan_id: planId,
        reason:
          planCode === "premium_monthly"
            ? "FitMind AI Premium Mensal"
            : "FitMind AI Premium Anual",
        external_reference: user.id,
        payer_email: user.email,
        back_url: "https://fitmind-ai-alpha.vercel.app/financeiro",
        status: "pending",
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.error("Mercado Pago checkout HTTP:", response.status);
      return NextResponse.json(
        { error: "Não foi possível iniciar a assinatura." },
        { status: 502 }
      );
    }

    const result = await response.json();
    if (typeof result.init_point !== "string") {
      return NextResponse.json(
        { error: "Link de assinatura indisponível." },
        { status: 502 }
      );
    }
    try {
      const link = new URL(result.init_point);
      const domain = link.hostname.toLowerCase();
      const trusted = ["mercadopago.com", "mercadopago.com.br"].some(
        (allowed) => domain === allowed || domain.endsWith(`.${allowed}`)
      );
      if (link.protocol !== "https:" || !trusted) throw new Error("Invalid URL");
    } catch {
      return NextResponse.json(
        { error: "Link de assinatura inválido." },
        { status: 502 }
      );
    }
    return NextResponse.json({ checkout_url: result.init_point });
  } catch (error) {
    console.error("Erro no checkout:", error);
    return NextResponse.json(
      { error: "Erro interno ao iniciar assinatura." },
      { status: 500 }
    );
  }
}
