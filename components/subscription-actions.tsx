"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/financeiro/financeiro.module.css";

type Props = { hasSubscription: boolean; cancelable: boolean };

export default function SubscriptionActions({ hasSubscription, cancelable }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  async function execute(endpoint: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store" });
      const result: { error?: string } = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível atualizar.");
      setMessage(endpoint.endsWith("/cancel")
        ? "Renovação cancelada. O acesso já pago permanece válido até o fim do período."
        : "Situação consultada no Mercado Pago. Os dados foram atualizados.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Erro na atualização.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (ran.current || !hasSubscription) return;
    if (!new URLSearchParams(window.location.search).has("mp_return")) return;
    ran.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("mp_return");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    void execute("/api/mercadopago/sync");
    // Executa apenas uma vez ao retornar do checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSubscription]);

  if (!hasSubscription) return null;
  return (
    <div className={styles.accountActions}>
      <button type="button" className="secondary" disabled={busy}
        onClick={() => execute("/api/mercadopago/sync")}>
        {busy ? "Consultando..." : "Atualizar status no Mercado Pago"}
      </button>
      {cancelable && (
        <button type="button" className="secondary" disabled={busy}
          onClick={() => {
            if (window.confirm("Cancelar as próximas cobranças? Você poderá usar o período já pago até o vencimento, sem reembolso automático.")) {
              void execute("/api/mercadopago/cancel");
            }
          }}>
          Cancelar renovação
        </button>
      )}
      {message && <p role="status" className="muted small">{message}</p>}
    </div>
  );
}
