import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
const money=(c:number,cur="BRL")=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:cur}).format(c/100);
export default async function AdminPage(){
 const supabase=await createClient(); const {data:{user}}=await supabase.auth.getUser(); if(!user) redirect("/login");
 const {data:role}=await supabase.from("user_roles").select("role").eq("user_id",user.id).maybeSingle(); if(role?.role!=="admin") redirect("/");
 const [{data:users},{data:plans},{data:payments},{count:premium}]=await Promise.all([
  supabase.from("profiles").select("id,full_name,account_status,created_at").order("created_at",{ascending:false}).limit(100),
  supabase.from("plans").select("id,code,name,price_cents,currency,is_active,is_configured").order("price_cents"),
  supabase.from("payments").select("id,user_id,amount_cents,currency,status,created_at").order("created_at",{ascending:false}).limit(50),
  supabase.from("subscriptions").select("id",{count:"exact",head:true}).eq("plan","premium").eq("status","active")
 ]);
 const total=(payments??[]).filter((p:any)=>p.status==="approved").reduce((n:number,p:any)=>n+p.amount_cents,0);
 return <main className="app-shell"><section className="main-area" style={{maxWidth:1150,margin:"0 auto",width:"100%"}}><header className="topbar"><div><span className="eyebrow">FITMIND AI · CONTROLE</span><h1>Painel administrativo</h1></div><Link className="secondary" href="/">Voltar ao app</Link></header>
 <div className="stats-grid"><article className="stat-card"><span>Usuários listados</span><strong>{users?.length??0}</strong><small>Últimos 100 cadastros</small></article><article className="stat-card"><span>Assinantes Premium ativos</span><strong>{premium??0}</strong><small>Assinaturas atuais</small></article><article className="stat-card"><span>Pagamentos aprovados</span><strong>{money(total)}</strong><small>Soma dos 50 registros recentes</small></article></div>
 <article className="surface full-panel"><span className="eyebrow">GESTÃO DE USUÁRIOS</span><h2>Contas cadastradas</h2>{users?.map((u:any)=><div className="exercise-row" key={u.id}><div><strong>{u.full_name||"Sem nome cadastrado"}</strong><small>{u.id} · {new Date(u.created_at).toLocaleDateString("pt-BR")}</small></div><span className="pill">{u.account_status}</span></div>)}</article>
 <article className="surface full-panel"><span className="eyebrow">PLANOS E PREÇOS</span><h2>Configuração comercial</h2><p className="muted">Os preços dos planos estão cadastrados. A integração do checkout e das cobranças será realizada em uma próxima etapa.</p>{plans?.map((p:any)=><div className="exercise-row" key={p.id}><div><strong>{p.name}</strong><small>{p.code} · {p.is_active?"Ativo":"Inativo"}</small></div><strong>{p.is_configured?money(p.price_cents,p.currency):"Preço não definido"}</strong></div>)}</article>
 <article className="surface full-panel"><span className="eyebrow">FINANCEIRO</span><h2>Transações recentes</h2>{payments?.length?payments.map((p:any)=><div className="exercise-row" key={p.id}><div><strong>{p.status}</strong><small>{new Date(p.created_at).toLocaleString("pt-BR")} · Conta {p.user_id.slice(0,8)}…</small></div><strong>{money(p.amount_cents,p.currency)}</strong></div>):<p className="muted">Nenhuma transação registrada.</p>}</article></section></main>;
}
