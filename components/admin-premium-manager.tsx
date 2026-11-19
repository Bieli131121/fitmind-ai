"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, ShieldCheck, Search, Clock3 } from "lucide-react";
import styles from "./admin-premium-manager.module.css";

export type PremiumUser = {
  id: string;
  name: string;
  email: string | null;
  plan: string | null;
  status: string | null;
  provider: string | null;
  currentPeriodEnd: string | null;
};

const planName = (code: string | null) =>
  code === "premium_monthly" ? "Premium Mensal" :
  code === "premium_yearly" ? "Premium Anual" :
  code === "premium" ? "Premium" : "Gratuito";

function formatExpiry(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "medium", timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
}

export default function AdminPremiumManager({ users }: { users: PremiumUser[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [userId, setUserId] = useState("");
  const [plan, setPlan] = useState<"premium_monthly" | "premium_yearly">("premium_monthly");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("pt-BR");
    if (!term) return users;
    return users.filter((u) =>
      [u.name, u.email || "", u.id].some((v) => v.toLocaleLowerCase("pt-BR").includes(term))
    );
  }, [users, query]);
  const selected = users.find((u) => u.id === userId);
  const active = selected && selected.status === "active" && selected.currentPeriodEnd &&
    new Date(selected.currentPeriodEnd).getTime() > Date.now() &&
    ["premium", "premium_monthly", "premium_yearly"].includes(selected.plan ?? "");
  const remotelyManaged = Boolean(selected && (selected.provider === "mercado_pago"));
  const canRevoke = Boolean(selected && selected.provider === "admin" && active);

  async function changeAccess(action: "grant" | "revoke") {
    if (!selected || busy) return;
    const confirmText = action === "grant"
      ? `Liberar ${planName(plan)} manualmente para ${selected.email || selected.name}? Não haverá cobrança automática.`
      : `Revogar o Premium manual de ${selected.email || selected.name} agora?`;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    setMessage("");
    setFailed(false);
    try {
      const res = await fetch("/api/admin/premium", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, action, plan }),
      });
      const body = await res.json() as {
        ok?: boolean; error?: string; warning?: string; current_period_end?: string | null;
      };
      if (!res.ok || !body.ok) throw new Error(body.error || "Falha ao atualizar o plano.");
      setMessage(action === "grant"
        ? `Premium liberado até ${formatExpiry(body.current_period_end ?? null)}. ${body.warning ?? ""}`
        : `Acesso Premium revogado. ${body.warning ?? ""}`);
      router.refresh();
    } catch (error) {
      setFailed(true);
      setMessage(error instanceof Error ? error.message : "Não foi possível atualizar o plano.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="manage-premium-heading">
      <div className={styles.heading}>
        <span className={styles.headingIcon}><Crown size={20} /></span>
        <div>
          <span className={styles.kicker}>GESTÃO DE ACESSOS</span>
          <h2 id="manage-premium-heading">Liberar Premium manualmente</h2>
          <p>Escolha uma conta, selecione o período e confirme. Nenhum pagamento é registrado.</p>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.userPicker}>
          <label htmlFor="premium-search">Localizar aluno por nome, e-mail ou ID</label>
          <div className={styles.inputIcon}><Search size={16} aria-hidden="true" />
            <input id="premium-search" placeholder="Pesquisar entre os cadastros exibidos" value={query}
              onChange={(event) => { setQuery(event.target.value); setUserId(""); setMessage(""); }} />
          </div>
          <select aria-label="Escolha o usuário" value={userId} onChange={(event) => {setUserId(event.target.value);setMessage("");}}>
            <option value="">Selecione um aluno ({filtered.length})</option>
            {filtered.map((u) => <option value={u.id} key={u.id}>
              {u.name} {u.email ? `— ${u.email}` : ""} — {u.id.slice(0, 8)}
            </option>)}
          </select>
        </div>
        <div className={styles.planPicker}>
          <label htmlFor="premium-plan">Novo acesso</label>
          <select id="premium-plan" value={plan}
            onChange={(event) => setPlan(event.target.value as "premium_monthly" | "premium_yearly") }>
            <option value="premium_monthly">Premium Mensal — 1 mês</option>
            <option value="premium_yearly">Premium Anual — 12 meses</option>
          </select>
        </div>
      </div>

      {selected && <div className={styles.selectedCard}>
        <div className={styles.selectedIdentity}>
          <strong>{selected.name}</strong>
          <span>{selected.email || `ID: ${selected.id}`}</span>
        </div>
        <div className={styles.selectedStatus}>
          <span>Plano atual: <strong>{active ? planName(selected.plan) : "Gratuito"}</strong></span>
          <span><Clock3 size={14} /> Vencimento: {active ? formatExpiry(selected.currentPeriodEnd) : "—"}</span>
          <span>Origem: {selected.provider === "admin" ? "Liberação manual" : remotelyManaged ? "Mercado Pago" : "Sem assinatura paga"}</span>
        </div>
      </div>}

      {remotelyManaged && <p className={styles.caution} role="status">
        Esta conta utiliza o Mercado Pago. Para evitar alterar uma cobrança real, a liberação manual está bloqueada.
      </p>}
      <div className={styles.actions}>
        <button className={styles.grant} type="button" onClick={() => changeAccess("grant")}
          disabled={!selected || busy || remotelyManaged}>
          <Crown size={17} /> {busy ? "Processando..." : "Conceder Premium"}
        </button>
        <button className={styles.revoke} type="button" onClick={() => changeAccess("revoke")}
          disabled={!canRevoke || busy}>
          Revogar acesso manual
        </button>
      </div>
      {message && <p className={failed ? styles.feedbackError : styles.feedbackSuccess} role="status">{message}</p>}
      <p className={styles.help}><ShieldCheck size={15} /> Apenas administradores podem alterar o plano. O acesso expira automaticamente na data indicada.</p>
    </section>
  );
}
