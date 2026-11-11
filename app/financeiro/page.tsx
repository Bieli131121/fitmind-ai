
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
        .select("id,amount_cents,currency,status,description,created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  const planRows = (plans ?? []) as Plan[];
  const paymentRows = (payments ?? []) as Payment[];

  return (
    <main
      className="app-shell"
      style={{
        display: "block",
        width: "100%",
        minHeight: "100vh",
        boxSizing: "border-box",
      }}
    >
      <section
        className="main-area"
        style={{
          width: "100%",
          maxWidth: 1400,
          minWidth: 0,
          margin: "0 auto",
          padding: "32px clamp(16px, 4vw, 48px)",
          boxSizing: "border-box",
        }}
      >
        <header
          className="topbar"
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 20,
            flexWrap: "wrap",
          }}
        >
          <div>
            <span className="eyebrow">FITMIND AI · CONTA</span>
            <h1>Meu financeiro</h1>
            <p className="muted">
              Gerencie seu plano e acompanhe seus pagamentos.
            </p>
          </div>

          <Link className="secondary" href="/">
            Voltar ao início
          </Link>
        </header>

        <article
          className="surface full-panel"
          style={{
            width: "100%",
            marginTop: 28,
            boxSizing: "border-box",
          }}
        >
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

        <div
          className="section-heading"
          style={{ width: "100%", marginTop: 32 }}
        >
          <div>
            <span className="eyebrow">PLANOS DISPONÍVEIS</span>
            <h2>Escolha como evoluir</h2>
          </div>
        </div>

        <div
          className="stats-grid"
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            marginTop: 20,
          }}
        >
          {planRows.map((p) => (
            <article
              className="stat-card"
              key={p.id}
              style={{
                minWidth: 0,
                boxSizing: "border-box",
                padding: 24,
              }}
            >
              <span className="eyebrow">
                {p.billing_interval === "year"
                  ? "ANUAL"
                  : p.billing_interval === "month"
                    ? "MENSAL"
                    : "COMECE AGORA"}
              </span>

              <h2>{p.name}</h2>

              <strong style={{ fontSize: 24, display: "block", marginTop: 12 }}>
                {p.is_configured
                  ? money(p.price_cents, p.currency)
                  : "Preço em configuração"}
              </strong>

              {p.description && (
                <p className="muted">{p.description}</p>
              )}

              <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
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

        <article
          className="surface full-panel"
          style={{
            width: "100%",
            marginTop: 28,
            boxSizing: "border-box",
          }}
        >
          <span className="eyebrow">HISTÓRICO</span>
          <h2>Pagamentos</h2>

          {paymentRows.length ? (
            paymentRows.map((p) => (
              <div className="exercise-row" key={p.id}>
                <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
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

          <p className="muted small" style={{ marginTop: 24 }}>
            A cobrança recorrente, troca de plano e cancelamento dependem
            da integração segura com o provedor de pagamento. O FitMind AI
            não armazena número completo de cartão nem CVV.
          </p>
        </article>
      </section>
    </main>
  );
}
