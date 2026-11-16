"use client";

import { useState } from "react";

type PlanCode = "premium_monthly" | "premium_yearly";

type Props = {
  plan: PlanCode;
  disabled: boolean;
  label: string;
};

export default function CheckoutButton({ plan, disabled, label }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function startCheckout() {
    if (disabled || loading) return;
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/mercadopago/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });

      const result: { checkout_url?: string; error?: string } =
        await response.json();

      if (!response.ok || !result.checkout_url) {
        throw new Error(result.error ?? "Não foi possível iniciar a assinatura.");
      }

      // Confere a URL devolvida pelo nosso servidor antes de redirecionar.
      const url = new URL(result.checkout_url);
      const host = url.hostname.toLowerCase();
      const trusted = ["mercadopago.com", "mercadopago.com.br"].some(
        (domain) => host === domain || host.endsWith(`.${domain}`)
      );
      if (url.protocol !== "https:" || !trusted) {
        throw new Error("O endereço de pagamento retornado não é válido.");
      }

      window.location.assign(url.toString());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar assinatura.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="primary"
        disabled={disabled || loading}
        onClick={startCheckout}
      >
        {loading ? "Abrindo pagamento..." : label}
      </button>
      {error && <p className="muted small" role="alert">{error}</p>}
    </div>
  );
}
