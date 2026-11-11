
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

interface AdminUser {
  id: string;
  full_name: string | null;
  account_status: string | null;
  created_at: string;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  price_cents: number;
  currency: string;
  is_active: boolean;
  is_configured: boolean;
}

interface Payment {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  created_at: string;
}

const money = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: role } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (role?.role !== "admin") redirect("/");

  const [
    { data: users },
    { data: plans },
    { data: payments },
    { count: premium },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,account_status,created_at")
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("plans")
      .select("id,code,name,price_cents,currency,is_active,is_configured")
      .order("price_cents"),

    supabase
      .from("payments")
      .select("id,user_id,amount_cents,currency,status,created_at")
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("plan", "premium")
      .eq("status", "active"),
  ]);

  const userRows = (users ?? []) as AdminUser[];
  const planRows = (plans ?? []) as Plan[];
  const paymentRows = (payments ?? []) as Payment[];

  const total = paymentRows
    .filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);

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
            <span className="eyebrow">FITMIND AI · CONTROLE</span>
            <h1>Painel administrativo</h1>
          </div>

          <Link className="secondary" href="/">
            Voltar ao app
          </Link>
        </header>

        <div
          className="stats-grid"
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 16,
            marginTop: 28,
          }}
        >
          <article className="stat-card">
            <span>Usuários listados</span>
            <strong>{userRows.length}</strong>
            <small>Últimos 100 cadastros</small>
          </article>

          <article className="stat-card">
            <span>Assinantes Premium ativos</span>
            <strong>{premium ?? 0}</strong>
            <small>Assinaturas atuais</small>
          </article>

          <article className="stat-card">
            <span>Pagamentos aprovados</span>
            <strong>{money(total)}</strong>
            <small>Soma dos 50 registros recentes</small>
          </article>
        </div>

        <article
          className="surface full-panel"
          style={{ width: "100%", marginTop: 24, boxSizing: "border-box" }}
        >
          <span className="eyebrow">GESTÃO DE USUÁRIOS</span>
          <h2>Contas cadastradas</h2>

          {userRows.map((u) => (
            <div className="exercise-row" key={u.id}>
              <div style={{ minWidth: 0, overflowWrap: "anywhere" }}>
                <strong>{u.full_name || "Sem nome cadastrado"}</strong>
                <small>
                  {u.id} ·{" "}
                  {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </small>
              </div>
              <span className="pill">
                {u.account_status ?? "Sem status"}
              </span>
            </div>
          ))}
        </article>

        <article
          className="surface full-panel"
          style={{ width: "100%", marginTop: 24, boxSizing: "border-box" }}
        >
          <span className="eyebrow">PLANOS E PREÇOS</span>
          <h2>Configuração comercial</h2>
          <p className="muted">
            Os valores estão em centavos e ainda não foram definidos. A edição
            segura de preços e o checkout serão ativados na próxima etapa.
          </p>

          {planRows.map((p) => (
            <div className="exercise-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.code} · {p.is_active ? "Ativo" : "Inativo"}
                </small>
              </div>
              <strong>
                {p.is_configured
                  ? money(p.price_cents, p.currency)
                  : "Preço não definido"}
              </strong>
            </div>
          ))}
        </article>

        <article
          className="surface full-panel"
          style={{ width: "100%", marginTop: 24, boxSizing: "border-box" }}
        >
          <span className="eyebrow">FINANCEIRO</span>
          <h2>Transações recentes</h2>

          {paymentRows.length ? (
            paymentRows.map((p) => (
              <div className="exercise-row" key={p.id}>
                <div>
                  <strong>{p.status}</strong>
                  <small>
                    {new Date(p.created_at).toLocaleString("pt-BR")} · Conta{" "}
                    {p.user_id.slice(0, 8)}…
                  </small>
                </div>
                <strong>{money(p.amount_cents, p.currency)}</strong>
              </div>
            ))
          ) : (
            <p className="muted">Nenhuma transação registrada.</p>
          )}
        </article>
      </section>
    </main>
  );
}
