import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  Crown,
  LayoutDashboard,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { billingAdmin } from "@/lib/billing/mercadopago";
import AdminPremiumManager from "@/components/admin-premium-manager";
import styles from "./admin.module.css";

const money = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(cents / 100);

const date = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date(value));

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));

const statusLabels: Record<string, string> = {
  active: "Ativa",
  suspended: "Suspensa",
  blocked: "Bloqueada",
  pending: "Pendente",
  approved: "Aprovado",
  rejected: "Rejeitado",
  refunded: "Reembolsado",
  cancelled: "Cancelado",
  charged_back: "Contestado",
};

const shortId = (id: string) => `${id.slice(0, 8)}…`;

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) redirect("/login");

  const { data: role, error: roleError } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (roleError || role?.role !== "admin") redirect("/");

  // Leitura administrativa de assinaturas: as políticas RLS permitem que
  // usuários comuns consultem apenas a própria assinatura.
  let serviceClient: ReturnType<typeof billingAdmin> | null = null;
  try { serviceClient = billingAdmin(); } catch { /* Aviso exibido abaixo. */ }

  const [userResult, planResult, paymentResult] = await Promise.all([
    supabase.from("profiles").select("id,full_name,account_status,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("plans").select("id,code,name,price_cents,currency,is_active,is_configured").order("price_cents"),
    supabase.from("payments").select("id,user_id,amount_cents,currency,status,created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  const users = userResult.data ?? [];
  const plans = planResult.data ?? [];
  const payments = paymentResult.data ?? [];
  const total = payments.filter((payment) => payment.status === "approved")
    .reduce((sum, payment) => sum + payment.amount_cents, 0);

  const [premiumResult, subscriptionsResult, identityResult] = serviceClient
    ? await Promise.all([
        serviceClient.from("subscriptions").select("id", { count: "exact", head: true })
          .in("plan", ["premium", "premium_monthly", "premium_yearly"])
          .eq("status", "active").gt("current_period_end", new Date().toISOString()),
        users.length ? serviceClient.from("subscriptions")
          .select("user_id,plan,status,provider,current_period_end")
          .in("user_id", users.map((user) => user.id)) : Promise.resolve({ data: [], error: null }),
        serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      ])
    : [null, null, null];

  const subscriptionByUser = new Map((subscriptionsResult?.data ?? []).map((sub) => [sub.user_id, sub]));
  const emailById = new Map((identityResult?.data?.users ?? []).map((u) => [u.id, u.email ?? null]));
  const hasReadErrors = Boolean(userResult.error || planResult.error || paymentResult.error ||
    !serviceClient || premiumResult?.error || subscriptionsResult?.error || identityResult?.error);

  return (
    <main className={styles.adminPage}>
      <div className={styles.ambientGlow} aria-hidden="true" />
      <div className={styles.container}>
        <header className={styles.header}>
          <Link href="/" className={styles.logo} aria-label="FitMind AI — início">
            <span className={styles.logoIcon}><LayoutDashboard size={20} strokeWidth={2.2} /></span>
            <span>FitMind <span className={styles.logoAccent}>AI</span></span>
          </Link>
          <nav className={styles.nav} aria-label="Navegação administrativa">
            <span className={styles.activeNav}>Administração</span>
            <Link href="/financeiro" className={styles.navLink}>Financeiro</Link>
            <Link href="/" className={styles.exitLink}><ArrowLeft size={15} /> <span>Voltar ao app</span></Link>
          </nav>
        </header>

        <section className={styles.intro} aria-labelledby="admin-title">
          <div className={styles.introText}>
            <div className={styles.kicker}><ShieldCheck size={14} /> ÁREA RESTRITA · FITMIND AI</div>
            <h1 id="admin-title">Painel <span>administrativo</span></h1>
            <p>Acompanhe os alunos, as assinaturas e os registros financeiros em um só lugar.</p>
          </div>
          <div className={styles.securityChip}><ShieldCheck size={16} /> Acesso de administrador</div>
        </section>

        {hasReadErrors && (
          <div className={styles.warning} role="status">
            Alguns dados não puderam ser carregados. Verifique as permissões de leitura no Supabase.
          </div>
        )}

        <section className={styles.summary} aria-label="Indicadores gerais">
          <article className={styles.metricCard}>
            <div className={styles.metricTop}><span>Usuários listados</span><span className={styles.metricIcon}><UsersRound size={20} /></span></div>
            <strong>{userResult.error ? "—" : users.length.toLocaleString("pt-BR")}</strong>
            <small>Últimos 100 cadastros</small>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricTop}><span>Assinantes Premium</span><span className={styles.metricIcon}><Crown size={20} /></span></div>
            <strong>{premiumResult?.error || !premiumResult ? "—" : (premiumResult.count ?? 0).toLocaleString("pt-BR")}</strong>
            <small>Assinaturas ativas e vigentes</small>
          </article>
          <article className={styles.metricCard}>
            <div className={styles.metricTop}><span>Pagamentos aprovados</span><span className={styles.metricIcon}><CircleDollarSign size={20} /></span></div>
            <strong className={styles.currencyMetric}>{paymentResult.error ? "—" : money(total)}</strong>
            <small>Soma dos 50 registros recentes</small>
          </article>
        </section>

        <AdminPremiumManager users={users.map((user) => {
          const subscription = subscriptionByUser.get(user.id);
          return {
            id: user.id,
            name: user.full_name?.trim() || "Usuário sem nome",
            email: emailById.get(user.id) ?? null,
            plan: subscription?.plan ?? null,
            status: subscription?.status ?? null,
            provider: subscription?.provider ?? null,
            currentPeriodEnd: subscription?.current_period_end ?? null,
          };
        })} />

        <div className={styles.contentGrid}>
          <section className={styles.panel} aria-labelledby="users-heading">
            <div className={styles.panelHead}>
              <div>
                <span className={styles.sectionTag}><UsersRound size={14} /> ALUNOS</span>
                <h2 id="users-heading">Contas cadastradas</h2>
                <p>Cadastros mais recentes da plataforma</p>
              </div>
              <span className={styles.counter}>{users.length} exibidos</span>
            </div>
            <div className={styles.usersList}>
              {users.length === 0 ? (
                <p className={styles.emptyState}>Nenhuma conta disponível para exibição.</p>
              ) : users.map((user) => {
                const name = user.full_name?.trim() || "Usuário sem nome";
                const accountStatus = user.account_status || "active";
                return (
                  <div className={styles.userRow} key={user.id}>
                    <span className={styles.avatar} aria-hidden="true">{name.charAt(0).toLocaleUpperCase("pt-BR")}</span>
                    <div className={styles.userInfo}>
                      <strong title={name}>{name}</strong>
                      <span title={user.id}>ID {shortId(user.id)} <span aria-hidden="true">·</span> {date(user.created_at)}</span>
                    </div>
                    <span className={`${styles.status} ${accountStatus === "active" ? styles.statusSuccess : accountStatus === "suspended" ? styles.statusPending : styles.statusDanger}`}>
                      {statusLabels[accountStatus] ?? accountStatus}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className={styles.panel} aria-labelledby="plans-heading">
            <div className={styles.panelHead}>
              <div>
                <span className={styles.sectionTag}><Crown size={14} /> ASSINATURAS</span>
                <h2 id="plans-heading">Planos e preços</h2>
                <p>Configuração comercial atual</p>
              </div>
              <Link href="/financeiro" className={styles.iconLink} aria-label="Abrir financeiro"><ArrowUpRight size={19} /></Link>
            </div>
            <div className={styles.plansList}>
              {plans.length === 0 ? (
                <p className={styles.emptyState}>Nenhum plano disponível para exibição.</p>
              ) : plans.map((plan) => (
                <div className={styles.planRow} key={plan.id}>
                  <span className={`${styles.planSymbol} ${plan.code !== "free" ? styles.premiumSymbol : ""}`} aria-hidden="true">
                    {plan.code === "free" ? <CheckCircle2 size={19} /> : <Crown size={19} />}
                  </span>
                  <div className={styles.planInfo}>
                    <strong>{plan.name}</strong>
                    <span>{plan.code === "premium_monthly" ? "Cobrança mensal" : plan.code === "premium_yearly" ? "Cobrança anual" : "Acesso gratuito"}</span>
                  </div>
                  <div className={styles.planAmount}>
                    <strong>{plan.is_configured ? money(plan.price_cents, plan.currency) : "Não definido"}</strong>
                    <span className={plan.is_active && plan.is_configured ? styles.planActive : styles.planInactive}>
                      {plan.is_active ? (plan.is_configured ? "Ativo" : "Não configurado") : "Inativo"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.planFooter}><ShieldCheck size={16} /> Premium também pode ser concedido manualmente pelo administrador, sem gerar cobrança ou pagamento.</div>
          </section>
        </div>

        <section className={`${styles.panel} ${styles.paymentsPanel}`} aria-labelledby="payments-heading">
          <div className={styles.panelHead}>
            <div>
              <span className={styles.sectionTag}><CreditCard size={14} /> TRANSAÇÕES</span>
              <h2 id="payments-heading">Pagamentos recentes</h2>
              <p>Até 50 movimentações registradas</p>
            </div>
            <Link href="/financeiro" className={styles.viewAll}>Abrir financeiro <ArrowUpRight size={15} /></Link>
          </div>
          {payments.length === 0 ? (
            <div className={styles.emptyPayments}>
              <span><CalendarDays size={23} /></span>
              <strong>Nenhuma transação registrada</strong>
              <p>Os pagamentos aparecerão aqui após serem registrados no sistema.</p>
            </div>
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead><tr><th>Conta</th><th>Data</th><th>Status</th><th>Valor</th></tr></thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id}>
                      <td><span className={styles.accountCode}>#{shortId(payment.user_id)}</span></td>
                      <td>{dateTime(payment.created_at)}</td>
                      <td><span className={`${styles.status} ${payment.status === "approved" ? styles.statusSuccess : payment.status === "pending" ? styles.statusPending : styles.statusDanger}`}>
                        {statusLabels[payment.status] ?? payment.status}
                      </span></td>
                      <td className={styles.amountCell}>{money(payment.amount_cents, payment.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <footer className={styles.footer}>FitMind AI <span>·</span> Painel administrativo <span>·</span> Acesso restrito</footer>
      </div>
    </main>
  );
}
