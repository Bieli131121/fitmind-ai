"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RedefinirSenha() {
  const [verified, setVerified] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const hash = new URLSearchParams(window.location.hash.slice(1));
    const params = new URLSearchParams(window.location.search);
    const recoveryHash = hash.get("type") === "recovery";
    const code = params.get("code");

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") {
        setVerified(true);
        setChecking(false);
      }
    });

    async function verify() {
      try {
        let validRecovery = recoveryHash;

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          validRecovery = true;
          window.history.replaceState({}, "", "/redefinir-senha");
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (!active) return;

        if (validRecovery && data.session) {
          setVerified(true);
        } else if (!validRecovery) {
          setMessage("Acesse esta pÃ¡gina pelo link de recuperaÃ§Ã£o enviado ao seu e-mail.");
        } else {
          setMessage("Link invÃ¡lido ou expirado. Solicite uma nova recuperaÃ§Ã£o.");
        }
      } catch {
        if (active) setMessage("Link invÃ¡lido ou expirado. Solicite uma nova recuperaÃ§Ã£o.");
      } finally {
        if (active) setChecking(false);
      }
    }

    verify();

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!verified) {
      setMessage("Sua autorizaÃ§Ã£o de recuperaÃ§Ã£o nÃ£o foi validada.");
      return;
    }
    if (password.length < 8) {
      setMessage("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setMessage("As senhas nÃ£o coincidem.");
      return;
    }

    setBusy(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await supabase.auth.signOut();
      setDone(true);
    } catch {
      setMessage("NÃ£o foi possÃ­vel atualizar a senha. Solicite um novo link e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand" href="/">FITMIND <span>AI.</span></Link>
        <p className="eyebrow">SEGURANÃ‡A DA CONTA</p>
        <h1>Redefinir senha.</h1>
        {checking ? (
          <p className="muted small">Validando seu link de seguranÃ§a...</p>
        ) : done ? (
          <>
            <p className="muted small">Senha atualizada com sucesso. Entre novamente com sua nova senha.</p>
            <Link href="/login">Ir para o login</Link>
          </>
        ) : !verified ? (
          <>
            <p className="error">{message || "Link de recuperaÃ§Ã£o nÃ£o autorizado."}</p>
            <Link href="/esqueci-senha">Solicitar novo link</Link>
          </>
        ) : (
          <>
            <label>Nova senha
              <input type="password" required minLength={8} value={password} onChange={e => setPassword(e.target.value)} />
            </label>
            <label>Confirmar nova senha
              <input type="password" required minLength={8} value={confirm} onChange={e => setConfirm(e.target.value)} />
            </label>
            <button className="primary full" disabled={busy}>
              {busy ? "Salvando..." : "Alterar senha"}
            </button>
            {message && <p className="error">{message}</p>}
          </>
        )}
      </form>
    </main>
  );
}
