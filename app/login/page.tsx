"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
export default function Login() {
  const [email,setEmail]=useState(""); const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
  async function submit(e:React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    try { const supabase=createClient(); const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) throw error; window.location.href="/"; }
    catch(err) { setMessage(err instanceof Error ? err.message : "Não foi possível entrar."); }
    finally { setBusy(false); }
  }
  return <main className="auth-wrap"><form className="auth-card" onSubmit={submit}><Link className="brand" href="/">FITMIND <span>AI.</span></Link><p className="eyebrow">BEM-VINDO DE VOLTA</p><h1>Entre na sua conta.</h1><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Senha<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} /></label><button className="primary full" disabled={busy}>{busy?"Entrando...":"Entrar"}</button>{message&&<p className="error">{message}</p>}<p className="muted small">Ainda não tem conta? <Link href="/cadastro">Criar cadastro</Link></p></form></main>;
}
