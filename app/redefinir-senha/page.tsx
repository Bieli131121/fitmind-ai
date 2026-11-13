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

    const hashType = hash.get("type");
    const recoveryFlag = params.get("recovery") === "1";
    const code = params.get("code");
    const tokenHash = params.get("token_hash");
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (active && event === "PASSWORD_RECOVERY") {
        setVerified(true);
        setChecking(false);
      }
    });

    async function verify() {
      try {
        let validRecovery = false;

        if (tokenHash) {
          const { data, error } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: "recovery",
          });

          if (error) throw error;
          validRecovery = !!data.session;
        } else if (code) {
          const { data, error } =
            await supabase.auth.exchangeCodeForSession(code);

          if (error) throw error;
          validRecovery = !!data.session;
        } else if (
          accessToken &&
          refreshToken &&
          (hashType === "recovery" || recoveryFlag)
        ) {
          const { data, error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) throw error;
          validRecovery = !!data.session;
        }

        if (!validRecovery) {
          const { data, error } = await supabase.auth.getSession();
          if (error) throw error;

          validRecovery =
            !!data.session && (hashType === "recovery" || recoveryFlag);
        }

        if (!active) return;

        if (validRecovery) {
          setVerified(true);
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        } else {
          setMessage(
            "Link invÃ¡lido ou expirado. Solicite uma nova recuperaÃ§Ã£o."
          );
        }
      } catch (error) {
        console.error("Erro ao validar recuperaÃ§Ã£o:", error);

        if (active) {
          setMessage(
            "NÃ£o foi possÃ­vel validar o link. Solicite uma nova recuperaÃ§Ã£o."
          );
        }
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
    } catch (error) {
      console.error("Erro ao atualizar senha:", error);
      setMessage(
        error instanceof Error
          ? error.message
          : "NÃ£o foi possÃ­vel atualizar a senha. Solicite um novo link."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <Link className="brand" href="/">
          FITMIND <span>AI.</span>
        </Link>

        <p className="eyebrow">SEGURANÃ‡A DA CONTA</p>
        <h1>Redefinir senha.</h1>

        {checking ? (
          <p className="muted small">Validando seu link de seguranÃ§a...</p>
        ) : done ? (
          <>
            <p className="muted small">
              Senha atualizada com sucesso. Entre novamente com sua nova senha.
            </p>
            <Link href="/login">Ir para o login</Link>
          </>
        ) : !verified ? (
          <>
            <p className="error">
              {message || "Link de recuperaÃ§Ã£o nÃ£o autorizado."}
            </p>
            <Link href="/esqueci-senha">Solicitar novo link</Link>
          </>
        ) : (
          <>
            <label>
              Nova senha
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <label>
              Confirmar nova senha
              <input
                type="password"
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
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