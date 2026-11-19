import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CheckoutButton from "@/components/checkout-button";
import SubscriptionActions from "@/components/subscription-actions";
import { hasPaidAccess, checkoutEnabled as billingCheckoutEnabled, paymentConfigured } from "@/lib/billing/mercadopago";
import styles from "./financeiro.module.css";

const formatMoney = (cents: number, currency = "BRL") =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
  }).format(cents / 100);

const premiumCodes = ["premium", "premium_monthly", "premium_yearly"];

const paymentStatusLabels: Record<string, string> = {
  approved: "Aprovado",
  authorized: "Autorizado",
  pending: "Pendente",
  rejected: "Recusado",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  refunded: "Reembolsado",
  in_process: "Em análise",
};

export default async function FinanceiroPage() {
  const supabase = await createClient();
  // Validação segura do token sem solicitar o perfil ao Auth Server em cada visita.
  const { data: auth, error: authError } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (authError || !userId) redirect("/login");

  const [{ data: sub }, { data: plans }, { data: payments }] =
    await Promise.all([
      supabase
        .from("subscriptions")
        .select("plan,status,current_period_end,cancel_at_period_end,provider_subscription_id,provider")
        .eq("user_id", userId)
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
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  // Premium exige um período vigente: pode vir de pagamento confirmado
  // pelo servidor ou de liberação manual feita pelo administrador.
  const premiumPlan = premiumCodes.includes(sub?.plan ?? "");
  const isPremium = hasPaidAccess(sub);
  const manualPremium = isPremium && sub?.provider === "admin";
  const isPending =
    premiumPlan && ["pending", "creating", "authorized"].includes(sub?.status ?? "");
  const checkoutEnabled = billingCheckoutEnabled() && paymentConfigured();

  const currentPlanName = isPremium
    ? sub?.plan === "premium_yearly"
      ? "Premium Anual"
      : sub?.plan === "premium_monthly"
        ? "Premium Mensal"
        : "Premium"
    : isPending
      ? "Premium em confirmação"
      : "Plano Gratuito";

  const periodEnd =
    isPremium && sub?.current_period_end
      ? new Date(sub.current_period_end).toLocaleDateString("pt-BR")
      : null;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div className={styles.headerCopy}>
            <span className={styles.eyebrow}>FITMIND AI / SUA CONTA</span>
            <h1>Meu financeiro</h1>
            <p>Seu plano, suas assinaturas e seus pagamentos em um só lugar.</p>
          </div>
          <Link className={styles.backLink} href="/">
            <ArrowLeft size={17} aria-hidden="true" />
            Voltar ao painel
          </Link>
        </header>

        <section className={styles.currentPlan} aria-labelledby="current-plan-title">
          <div className={styles.currentPlanMain}>
            <div className={styles.currentIcon} aria-hidden="true">
              <Wallet size={22} />
            </div>
            <div className={styles.currentPlanText}>
              <span className={styles.eyebrow}>SEU PLANO ATUAL</span>
              <h2 id="current-plan-title">{currentPlanName}</h2>
              <p>
                {manualPremium
                  ? "Acesso Premium liberado pela administração, sem cobrança recorrente."
                  : isPremium
                    ? "Sua assinatura Premium está ativa."
                  : isPending
                    ? "Sua solicitação está aguardando confirmação do pagamento."
                    : "Aproveite os recursos gratuitos e conheça nossos planos Premium."}
              </p>
            </div>
          </div>
          <div className={styles.currentPlanAside}>
            <span
              className={`${styles.status} ${
                isPremium
                  ? styles.statusActive
                  : isPending
                    ? styles.statusPending
                    : styles.statusFree
              }`}
            >
              {isPremium ? (
                <CheckCircle2 size={15} aria-hidden="true" />
              ) : isPending ? (
                <Clock3 size={15} aria-hidden="true" />
              ) : (
                <ShieldCheck size={15} aria-hidden="true" />
              )}
              {isPremium ? "Ativo" : isPending ? "Em confirmação" : "Gratuito"}
            </span>
            {periodEnd && (
              <span className={styles.period}>
                <CalendarDays size={15} aria-hidden="true" />
                Período até {periodEnd}
              </span>
            )}
          </div>
        </section>

        <SubscriptionActions
          hasSubscription={Boolean(sub?.provider_subscription_id)}
          cancelable={Boolean(sub?.provider_subscription_id && !sub?.cancel_at_period_end)}
        />

        {isPremium && sub?.cancel_at_period_end && (
          <p className={styles.inlineNotice}>
            O cancelamento da sua assinatura está programado para o fim do
            período atual.
          </p>
        )}

        <section className={styles.plansSection} aria-labelledby="plans-title">
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.eyebrow}>ESCOLHA O SEU CAMINHO</span>
              <h2 id="plans-title">Planos disponíveis</h2>
            </div>
            <p>Escolha a opção que combina com os seus objetivos.</p>
          </div>

          <div className={styles.plansGrid}>
            {(plans ?? []).map((plan) => {
              const isFree = plan.code === "free";
              const isPaidPlan =
                plan.code === "premium_monthly" ||
                plan.code === "premium_yearly";
              const priceReady = Boolean(
                plan.is_configured && plan.price_cents > 0
              );
              const features: string[] = Array.isArray(plan.features)
                ? plan.features.filter(
                    (feature: unknown): feature is string =>
                      typeof feature === "string"
                  )
                : [];
              const frequency =
                plan.billing_interval === "year"
                  ? "/ano"
                  : plan.billing_interval === "month"
                    ? "/mês"
                    : "";

              return (
                <article
                  className={`${styles.planCard} ${
                    !isFree && isPaidPlan ? styles.premiumCard : ""
                  }`}
                  key={plan.id}
                >
                  <div className={styles.planTop}>
                    <span className={styles.planCategory}>
                      {isFree ? "ESSENCIAL" : "FITMIND PREMIUM"}
                    </span>
                    {isPaidPlan && (
                      <Sparkles size={19} aria-hidden="true" />
                    )}
                  </div>
                  <h3>{plan.name}</h3>
                  <p className={styles.planDescription}>
                    {plan.description || "Conheça os recursos deste plano."}
                  </p>
                  <div className={styles.priceLine}>
                    <span className={styles.price}>
                      {plan.is_configured
                        ? formatMoney(plan.price_cents, plan.currency)
                        : "Em breve"}
                    </span>
                    {plan.is_configured && frequency && (
                      <span className={styles.frequency}>{frequency}</span>
                    )}
                  </div>
                  <div className={styles.featureDivider} />
                  <p className={styles.featuresTitle}>O que está incluído</p>
                  <ul className={styles.featuresList}>
                    {features.map((feature) => (
                      <li key={feature}>
                        <Check size={16} aria-hidden="true" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className={styles.planAction}>
                    {isFree ? (
                      <span className={styles.freeLabel}>
                        <CheckCircle2 size={17} aria-hidden="true" />
                        Plano gratuito disponível
                      </span>
                    ) : isPaidPlan ? (
                      <CheckoutButton
                        plan={plan.code}
                        disabled={
                          !checkoutEnabled ||
                          isPremium ||
                          isPending ||
                          !priceReady
                        }
                        label={
                          isPremium
                            ? "Premium ativo"
                            : isPending
                              ? "Aguardando confirmação"
                              : !checkoutEnabled
                                ? "Assinatura em preparação"
                                : !priceReady
                                  ? "Indisponível no momento"
                                  : "Assinar agora"
                        }
                      />
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>

          {!checkoutEnabled && (
            <div className={styles.checkoutNotice} role="status">
              <LockKeyhole size={20} aria-hidden="true" />
              <p>
                <strong>Assinaturas em preparação.</strong> A contratação será
                liberada após a validação da integração de pagamentos. Nenhuma
                cobrança pode ser iniciada nesta etapa.
              </p>
            </div>
          )}
        </section>

        <section className={styles.historySection} aria-labelledby="history-title">
          <div className={styles.historyHeader}>
            <div className={styles.historyTitle}>
              <span className={styles.historyIcon} aria-hidden="true">
                <ReceiptText size={20} />
              </span>
              <div>
                <span className={styles.eyebrow}>MOVIMENTAÇÕES</span>
                <h2 id="history-title">Histórico de pagamentos</h2>
              </div>
            </div>
            <span className={styles.historyCount}>
              {payments?.length ?? 0} registro(s)
            </span>
          </div>

          {payments?.length ? (
            <div className={styles.paymentList}>
              {payments.map((payment) => {
                const paymentStatus = payment.status ?? "";
                return (
                  <div className={styles.paymentRow} key={payment.id}>
                    <span className={styles.paymentIcon} aria-hidden="true">
                      <CreditCard size={19} />
                    </span>
                    <div className={styles.paymentDetails}>
                      <strong>
                        {payment.description || "Assinatura FitMind AI"}
                      </strong>
                      <span>
                        {new Date(payment.created_at).toLocaleDateString("pt-BR")}
                        {" · "}
                        {paymentStatusLabels[paymentStatus] || paymentStatus}
                      </span>
                    </div>
                    <strong className={styles.paymentAmount}>
                      {formatMoney(payment.amount_cents, payment.currency)}
                    </strong>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              <CreditCard size={26} aria-hidden="true" />
              <strong>Nenhum pagamento registrado</strong>
              <p>Suas movimentações aparecerão aqui quando houver cobranças.</p>
            </div>
          )}
          <div className={styles.historyFootnote}>
            <ShieldCheck size={17} aria-hidden="true" />
            <p>
              A assinatura recorrente é administrada pelo Mercado Pago.
              Você pode consultar o status ou cancelar futuras cobranças acima.
              O FitMind AI não armazena número completo de cartão nem CVV.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
