import { createClient as createAdminClient } from "@supabase/supabase-js";

export type PlanCode = "premium_monthly" | "premium_yearly";
export type MPSubscription = {
  id: string;
  status: string;
  external_reference?: string | null;
  preapproval_plan_id?: string | null;
  next_payment_date?: string | null;
  date_created?: string | null;
};
type Invoice = {
  id: string | number;
  preapproval_id?: string;
  currency_id?: string;
  transaction_amount?: string | number;
  debit_date?: string;
  payment?: { id?: number | string; status?: string };
};
type MPPayment = {
  id: string | number;
  status: string;
  currency_id: string;
  transaction_amount: number;
  date_approved?: string | null;
  date_created?: string | null;
};

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  provider_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
};

export function billingAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase admin não configurado");
  return createAdminClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function planId(plan: PlanCode) {
  return plan === "premium_monthly"
    ? process.env.MERCADOPAGO_PLAN_MONTHLY_ID || "5f123e4e9e4645e881dd66a2f911d4d4"
    : process.env.MERCADOPAGO_PLAN_YEARLY_ID || "09694d3aea0241d288ece1c2f2c4cb96";
}
export function planFromMpId(id: string | null | undefined): PlanCode | null {
  if (id === planId("premium_monthly")) return "premium_monthly";
  if (id === planId("premium_yearly")) return "premium_yearly";
  return null;
}
export function expectedAmount(plan: PlanCode) {
  return plan === "premium_monthly" ? 15 : 150;
}
export function checkoutEnabled() {
  return process.env.FITMIND_CHECKOUT_ENABLED === "true";
}
export function paymentConfigured() {
  return Boolean(
    process.env.MERCADOPAGO_ACCESS_TOKEN &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.MERCADOPAGO_WEBHOOK_SECRET &&
    process.env.MERCADOPAGO_WEBHOOK_SECRET.length >= 16 &&
    process.env.FITMIND_SITE_URL
  );
}

export async function mpApi<T>(path: string, init?: RequestInit): Promise<T> {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) throw new Error("Mercado Pago não configurado");
  const response = await fetch(`https://api.mercadopago.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) {
    console.error("Mercado Pago respondeu", response.status, path.split("?")[0]);
    throw new Error(`Falha ao consultar o Mercado Pago (${response.status})`);
  }
  return (await response.json()) as T;
}

function validId(value: string) {
  return /^[a-zA-Z0-9_-]{1,100}$/.test(value);
}
export async function mpSubscription(id: string) {
  if (!validId(id)) throw new Error("ID de assinatura inválido");
  return mpApi<MPSubscription>(`/preapproval/${encodeURIComponent(id)}`);
}

function addMonthsUTC(dateIso: string, months: number): string | null {
  const input = new Date(dateIso);
  if (!Number.isFinite(input.getTime())) return null;
  const day = input.getUTCDate();
  const first = new Date(input.getTime());
  first.setUTCDate(1);
  first.setUTCMonth(first.getUTCMonth() + months);
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(day, last));
  return first.toISOString();
}
function isFuture(date: string | null) {
  return date !== null && new Date(date).getTime() > Date.now();
}
export function hasPaidAccess(sub: {
  plan?: string | null;
  status?: string | null;
  current_period_end?: string | null;
} | null | undefined): boolean {
  return Boolean(
    sub &&
    ["premium", "premium_monthly", "premium_yearly"].includes(sub.plan ?? "") &&
    sub.status === "active" &&
    isFuture(sub.current_period_end ?? null)
  );
}

// Não confia em notificações: só concede acesso com assinatura vinculada
// à conta, plano esperado e pagamento aprovado validado pela API do MP.
export async function reconcileSubscription(subscriptionId: string, expectedUserId?: string) {
  const mp = await mpSubscription(subscriptionId);
  const admin = billingAdmin();
  const { data: local, error: localError } = await admin
    .from("subscriptions")
    .select("id,user_id,plan,status,provider_subscription_id,current_period_end,cancel_at_period_end")
    .eq("provider_subscription_id", subscriptionId)
    .maybeSingle();
  if (localError) throw localError;
  if (!local) throw new Error("Assinatura não vinculada a usuário local");
  const row = local as SubscriptionRow;
  if (expectedUserId && row.user_id !== expectedUserId) throw new Error("Usuário não autorizado");
  const plan = planFromMpId(mp.preapproval_plan_id);
  if (!plan || mp.external_reference !== row.user_id) {
    throw new Error("Titular ou plano da assinatura não confere");
  }
  const { data: dbPlan, error: dbPlanError } = await admin
    .from("plans").select("id,price_cents,currency")
    .eq("code", plan).maybeSingle();
  if (dbPlanError || !dbPlan || dbPlan.currency !== "BRL" ||
    dbPlan.price_cents !== expectedAmount(plan) * 100) {
    throw new Error("Configuração do plano divergente");
  }

  const invoices = await mpApi<{ results?: Invoice[] }>(
    `/authorized_payments/search?preapproval_id=${encodeURIComponent(mp.id)}&limit=100`
  );
  const positive: Array<{ payment: MPPayment; date: string }> = [];
  // Considera faturas recentes para evitar dezenas de chamadas durante um webhook.
  const recent = [...(invoices.results ?? [])].sort((a, b) =>
    Date.parse(b.debit_date || "1970-01-01") - Date.parse(a.debit_date || "1970-01-01")
  ).slice(0, 8);
  for (const invoice of recent) {
    if (
      invoice.preapproval_id !== mp.id ||
      !invoice.payment?.id ||
      invoice.currency_id !== "BRL" ||
      Number(invoice.transaction_amount) !== expectedAmount(plan)
    ) continue;
    const paymentId = String(invoice.payment.id);
    if (!/^\d{1,30}$/.test(paymentId)) continue;
    const payment = await mpApi<MPPayment>(`/v1/payments/${paymentId}`);
    if (payment.currency_id !== "BRL" ||
      Number(payment.transaction_amount) !== expectedAmount(plan)) continue;
    const statusMap: Record<string, string> = {
      approved: "approved", rejected: "rejected", refunded: "refunded",
      charged_back: "charged_back", cancelled: "cancelled", canceled: "cancelled",
      pending: "pending", in_process: "pending", authorized: "pending",
    };
    const status = statusMap[payment.status] || "pending";
    const paidDate = payment.date_approved || invoice.debit_date || payment.date_created;
    if (status === "approved" && paidDate && !Number.isNaN(Date.parse(paidDate))) {
      positive.push({ payment, date: paidDate });
    }
    const { error: paymentError } = await admin.from("payments").upsert({
      user_id: row.user_id,
      subscription_id: row.id,
      plan_id: dbPlan.id,
      provider: "mercado_pago",
      provider_payment_id: paymentId,
      amount_cents: dbPlan.price_cents,
      currency: "BRL",
      status,
      description: `FitMind AI ${plan === "premium_yearly" ? "Premium Anual" : "Premium Mensal"}`,
      paid_at: paidDate && !Number.isNaN(Date.parse(paidDate)) &&
        ["approved", "refunded", "charged_back"].includes(status) ? paidDate : null,
    }, { onConflict: "provider_payment_id" });
    if (paymentError) throw paymentError;
  }
  positive.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  const paidThrough = positive.length
    ? addMonthsUTC(positive[0].date, plan === "premium_yearly" ? 12 : 1)
    : null;
  const canceled = mp.status === "cancelled" || mp.status === "canceled";
  const available = (mp.status === "authorized" || canceled) && isFuture(paidThrough);
  const status = available ? "active" : canceled ? "canceled" : "pending";
  const { error: updateError } = await admin.from("subscriptions").update({
    plan,
    plan_id: dbPlan.id,
    status,
    provider: "mercado_pago",
    provider_status: mp.status,
    cancel_at_period_end: canceled,
    current_period_end: paidThrough,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id).eq("provider_subscription_id", mp.id);
  if (updateError) throw updateError;
  return { status, plan, paidThrough, cancelAtPeriodEnd: canceled };
}
