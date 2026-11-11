"use client";
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
export default function Cadastro() {
 const [name,setName]=useState(""); const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [busy,setBusy]=useState(false); const [message,setMessage]=useState("");
 async function submit(e:React.FormEvent){e.preventDefault();setBusy(true);setMessage("");try{const supabase=createClient();const {data,error}=await supabase.auth.signUp({email,password,options:{data:{full_name:name},emailRedirectTo:`${window.location.origin}/login`}});if(error)throw error;setMessage(data.session?"Conta criada! Você já pode entrar.":"Cadastro recebido. Verifique seu e-mail e confirme a conta antes de entrar.");}catch(err){setMessage(err instanceof Error?err.message:"Erro ao criar conta.");}finally{setBusy(false);}}
 return <main className="auth-wrap"><form className="auth-card" onSubmit={submit}><Link className="brand" href="/">FITMIND <span>AI.</span></Link><p className="eyebrow">COMECE SUA EVOLUÇÃO</p><h1>Crie sua conta.</h1><label>Nome<input required value={name} onChange={e=>setName(e.target.value)} /></label><label>E-mail<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></label><label>Senha<input type="password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} /><small className="muted">Mínimo de 8 caracteres.</small></label><button className="primary full" disabled={busy}>{busy?"Criando...":"Criar conta"}</button>{message&&<p className="notice">{message}</p>}<p className="muted small">Já tem conta? <Link href="/login">Entrar</Link></p></form></main>;
}
