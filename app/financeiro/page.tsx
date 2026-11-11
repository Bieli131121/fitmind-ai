
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  billing_interval: string;
  price_cents: number;
  currency: string;
  is_configured: boolean;
  features: string[] | null;
}

interface Payment {
  id: string;
  amount_cents: number;
  currency: string;
  status: string;
  description: string | null;
  created_at: string;
}

const money = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);

export default async function FinanceiroPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: sub }, { data: plans }, { data: payments }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan,status,current_period_end,cancel_at_period_end")
        .eq("user_id", user.id)
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
        .select(
          "id,amount_cents,currency,status,description,created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const planRows = (plans ?? []) as Plan[];
  const paymentRows = (payments ?? []) as Payment[];

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
          <h2>
            {sub?.plan === "premium"
              ? "FitMind AI Premium"
              : "Plano Gratuito"}
          </h2>

          <p className="muted">
            Status: {sub?.status ?? "ativo"}
            {sub?.current_period_end
              ? ` · Renovação: ${new Date(
                  sub.current_period_end
                ).toLocaleDateString("pt-BR")}`
              : ""}
          </p>

          {sub?.cancel_at_period_end && (
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
          {planRows.map((p) => (
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
                {(Array.isArray(p.features) ? p.features : []).map(
                  (feature) => (
                    <li key={feature}>{feature}</li>
                  )
                )}
              </ul>

              {p.code === "free" && (
                <span className="pill">Plano gratuito</span>
              )}
            </article>
          ))}
        </div>

        <article className="surface full-panel">
          <span className="eyebrow">HISTÓRICO</span>
          <h2>Pagamentos</h2>

          {paymentRows.length ? (
            paymentRows.map((p) => (
              <div className="exercise-row" key={p.id}>
                <div>
                  <strong>
                    {p.description ?? "Assinatura FitMind AI"}
                  </strong>
                  <small>
                    {new Date(p.created_at).toLocaleDateString("pt-BR")} ·{" "}
                    {p.status}
                  </small>
                </div>
                <strong>{money(p.amount_cents, p.currency)}</strong>
              </div>
            ))
          ) : (
            <p className="muted">
              Seus pagamentos aparecerão aqui quando a cobrança estiver
              integrada.
            </p>
          )}

          <p className="muted small">
            A cobrança recorrente, troca de plano e cancelamento dependem
            da integração segura com o provedor de pagamento. O FitMind AI
            não armazena número completo de cartão nem CVV.
          </p>
        </article>
      </section>
    </main>
  );
}
