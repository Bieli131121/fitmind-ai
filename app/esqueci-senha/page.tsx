"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function EsqueciSenha() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [success, setSuccess] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/redefinir-senha?recovery=1`,
      });

      if (error) throw error;

      setSuccess(true);
      setMessage("Se existir uma conta para esse e-mail, enviaremos um link de recuperaÃ§Ã£o.");
    } catch {
      setMessage("NÃ£o foi possÃ­vel solicitar a recuperaÃ§Ã£o. Confira o e-mail e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand" href="/">FITMIND <span>AI.</span></Link>
        <p className="eyebrow">RECUPERAÃ‡ÃƒO DE ACESSO</p>
        <h1>Esqueceu sua senha?</h1>
        <p className="muted small">Informe seu e-mail cadastrado para receber o link seguro de recuperaÃ§Ã£o.</p>
        <label>E-mail
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <button className="primary full" disabled={busy}>
          {busy ? "Enviando..." : "Enviar link de recuperaÃ§Ã£o"}
        </button>
        {message && <p className={success ? "muted small" : "error"}>{message}</p>}
        <p className="muted small"><Link href="/login">Voltar para entrar</Link></p>
      </form>
    </main>
  );
}
