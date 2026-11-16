import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CheckoutButton from "@/components/checkout-button";

const money = (c: number, cur = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: cur }).format(
    c / 100
  );

const premiumCodes = ["premium", "premium_monthly", "premium_yearly"];

export default async function FinanceiroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    { data: sub },
    { data: plans },
    { data: payments },
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan,status,current_period_end,cancel_at_period_end")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("plans")
      .select(
        "id,code,name,description,billing_interval,price_cents,currency,is_configured,features"
      )
      .eq("is_active", true)
      .order("price_cents"),
    supabase
      .from("payments")
      .select("id,amount_cents,currency,status,description,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  // Acesso Premium só deve depender do status ativo sincronizado
  // e validado no servidor após a confirmação de pagamento.
  const premiumPlan = premiumCodes.includes(sub?.plan ?? "");
  const isPremium = premiumPlan && sub?.status === "active";
  const isPending =
    premiumPlan && ["pending", "authorized"].includes(sub?.status ?? "");

  // Desligado por padrão até a integração segura de webhooks e cobranças.
  const checkoutEnabled = process.env.FITMIND_CHECKOUT_ENABLED === "true";

  const currentPlanName = isPremium
    ? sub?.plan === "premium_yearly"
      ? "FitMind AI Premium Anual"
      : sub?.plan === "premium_monthly"
        ? "FitMind AI Premium Mensal"
        : "FitMind AI Premium"
    : "Plano Gratuito";

  return (
    <main className="app-shell">
      <section
        className="main-area"
        style={{ maxWidth: 1050, margin: "0 auto", width: "100%" }}
      >
        <header className="topbar">
          <div>
            <span className="eyebrow">FITMIND AI · CONTA</span>
            <h1>Meu financeiro</h1>
          </div>
          <Link className="secondary" href="/">
            Voltar ao início
          </Link>
        </header>

        <article className="surface full-panel">
          <span className="eyebrow">SEU PLANO ATUAL</span>
          <h2>{currentPlanName}</h2>
          <p className="muted">
            Status: {isPremium ? "ativo" : isPending ? "aguardando confirmação" : "gratuito"}
            {isPremium && sub?.current_period_end
              ? ` · Período atual até ${new Date(sub.current_period_end).toLocaleDateString("pt-BR")}`
              : ""}
          </p>
          {isPending && (
            <p className="muted">
              Sua solicitação ainda não foi confirmada. O acesso Premium não é
              liberado antes da validação do pagamento.
            </p>
          )}
          {isPremium && sub?.cancel_at_period_end && (
            <p className="muted">
              Cancelamento programado para o fim do período atual.
            </p>
          )}
        </article>

        <div className="section-heading">
          <div>
            <span className="eyebrow">PLANOS DISPONÍVEIS</span>
            <h2>Escolha como evoluir</h2>
          </div>
        </div>

        <div className="stats-grid">
          {(plans ?? []).map((p) => {
            const priceReady = Boolean(p.is_configured && p.price_cents > 0);
            return (
              <article className="stat-card" key={p.id}>
                <span className="eyebrow">
                  {p.billing_interval === "year"
                    ? "ANUAL"
                    : p.billing_interval === "month"
                      ? "MENSAL"
                      : "COMECE AGORA"}
                </span>
                <h2>{p.name}</h2>
                <strong>
                  {p.is_configured
                    ? money(p.price_cents, p.currency)
                    : "Preço em configuração"}
                </strong>
                <small>{p.description}</small>
                <ul>
                  {(Array.isArray(p.features)
                    ? p.features.filter(
                        (f: unknown): f is string => typeof f === "string"
                      )
                    : []
                  ).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                {p.code === "free" ? (
                  <span className="pill">Plano gratuito</span>
                ) : p.code === "premium_monthly" || p.code === "premium_yearly" ? (
                  <CheckoutButton
                    plan={p.code}
                    disabled={!checkoutEnabled || isPremium || isPending || !priceReady}
                    label={
                      isPremium
                        ? "Premium ativo"
                        : isPending
                          ? "Aguardando confirmação"
                          : !checkoutEnabled
                            ? "Assinatura em preparação"
                            : "Assinar agora"
                    }
                  />
                ) : null}
              </article>
            );
          })}
        </div>

        {!checkoutEnabled && (
          <p className="muted small">
            As contratações serão liberadas após a validação da integração de
            pagamentos. Nenhuma cobrança pode ser iniciada nesta etapa.
          </p>
        )}

        <article className="surface full-panel">
          <span className="eyebrow">HISTÓRICO</span>
          <h2>Pagamentos</h2>
          {payments?.length ? (
            payments.map((p) => (
              <div className="exercise-row" key={p.id}>
                <div>
                  <strong>{p.description ?? "Assinatura FitMind AI"}</strong>
                  <small>
                    {new Date(p.created_at).toLocaleDateString("pt-BR")} · {p.status}
                  </small>
                </div>
                <strong>{money(p.amount_cents, p.currency)}</strong>
              </div>
            ))
          ) : (
            <p className="muted">Nenhum pagamento registrado.</p>
          )}
          <p className="muted small">
            A cobrança recorrente e o cancelamento exigem integração validada
            com o provedor de pagamento. O FitMind AI não armazena o número
            completo do cartão nem o CVV.
          </p>
        </article>
      </section>
    </main>
  );
}
