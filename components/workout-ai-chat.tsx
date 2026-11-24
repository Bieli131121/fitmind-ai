"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Bot, Check, Dumbbell, LoaderCircle, Send, Sparkles, UserRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import styles from "./workout-ai-chat.module.css";

type Exercise = { name: string; catalog_id: string; sets: number; reps: string; rest_seconds: number };
type ProposedPlan = { name: string; objective: string; days: { day_name: string; exercises: Exercise[] }[] };
type Message = { id: string; role: "user" | "assistant"; content: string; plan: ProposedPlan | null; created_at: string };
export type SavedWorkoutPlan = {
  id: string; name: string; objective: string | null;
  workout_days: { id: string; day_name: string; exercises: { name: string; catalog_id: string | null; sets: number; reps: string; rest_seconds: number }[] }[];
};

const suggestions = [
  "Quero um treino de 3 dias para iniciantes na academia.",
  "Monte um treino para ganhar massa e perder gordura, 5 dias por semana.",
  "Quero treinar em casa sem equipamentos.",
];

export default function WorkoutAIChat({ onSaved }: { onSaved: (plan: SavedWorkoutPlan) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/workout/chat", { cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error || "Falha ao carregar o histórico."); return data; })
      .then(data => { if (active) setMessages(data.messages ?? []); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : "Falha ao carregar histórico."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [messages, sending]);

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || sending || loading) return;
    setSending(true);
    setError("");
    setInput("");
    const localId = `local-${Date.now()}`;
    setMessages(v => [...v, { id: localId, role: "user", content: message, plan: null, created_at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/workout/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Não foi possível falar com a IA.");
      const next = (result.messages ?? []) as Message[];
      if (!next.length) throw new Error("Não foi possível recuperar a resposta da IA.");
      setMessages(v => [...v.filter(x => x.id !== localId), ...next]);
      if (typeof result.remaining === "number") setRemaining(result.remaining);
    } catch (err) {
      setMessages(v => v.filter(x => x.id !== localId));
      setInput(message);
      setError(err instanceof Error ? err.message : "Falha ao enviar mensagem.");
    } finally {
      setSending(false);
    }
  }

  async function savePlan(plan: ProposedPlan, messageId: string) {
    if (saving) return;
    setSaving(messageId);
    setError("");
    const sb = createClient();
    let createdPlanId: string | null = null;
    try {
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error("Faça login para salvar seu treino.");
      if (!plan.days.length || plan.days.length > 7 || plan.days.some(d => !d.exercises.length)) throw new Error("A sugestão de treino está incompleta.");
      const { data: planRow, error: planError } = await sb.from("workout_plans")
        .insert({ user_id: user.id, name: plan.name, objective: plan.objective, is_active: true })
        .select("id,name,objective").single();
      if (planError || !planRow) throw new Error(planError?.message ?? "Falha ao criar o plano.");
      createdPlanId = planRow.id;
      const { data: dayRows, error: dayError } = await sb.from("workout_days")
        .insert(plan.days.map((day, index) => ({ plan_id: planRow.id, day_name: day.day_name, sort_order: index })))
        .select("id,day_name,sort_order");
      if (dayError || !dayRows || dayRows.length !== plan.days.length) throw new Error(dayError?.message ?? "Falha ao criar os dias de treino.");
      const rows = dayRows.flatMap(dayRow => {
        const original = plan.days[dayRow.sort_order];
        return original.exercises.map((ex, index) => ({
          workout_day_id: dayRow.id, exercise_id: ex.catalog_id, exercise_name: ex.name,
          sets: ex.sets, reps: ex.reps, rest_seconds: ex.rest_seconds, sort_order: index,
        }));
      });
      const { error: exerciseError } = await sb.from("workout_exercises").insert(rows);
      if (exerciseError) throw exerciseError;
      const savedPlan: SavedWorkoutPlan = {
        id: planRow.id, name: planRow.name, objective: planRow.objective,
        workout_days: [...dayRows].sort((a, b) => a.sort_order - b.sort_order).map(d => ({
          id: d.id, day_name: d.day_name,
          exercises: plan.days[d.sort_order].exercises.map(ex => ({ ...ex }))
        }))
      };
      createdPlanId = null;
      setSaved(v => [...v, messageId]);
      onSaved(savedPlan);
    } catch (err) {
      if (createdPlanId) {
        const { error: cleanupError } = await sb.from("workout_plans").delete().eq("id", createdPlanId);
        if (cleanupError) console.error("Não foi possível reverter plano incompleto:", cleanupError.message);
      }
      setError(err instanceof Error ? err.message : "Falha ao salvar treino.");
    } finally {
      setSaving(null);
    }
  }

  return <article className={`surface full-panel ${styles.container}`}>
    <div className={styles.heading}>
      <div className={styles.botIcon}><Bot size={23} /></div>
      <div><span className="eyebrow">SEU PERSONAL COM IA</span><h2>Monte seu treino conversando</h2><p>Conte seus objetivos, sua experiência e os equipamentos disponíveis. Ajuste o plano com a IA antes de salvar.</p></div>
    </div>
    <div className={styles.chat} role="log" aria-live="polite" aria-label="Histórico da conversa com o personal de IA">
      {loading ? <p className={styles.note}><LoaderCircle size={15} className={styles.spin}/> Carregando conversa...</p> : null}
      {!loading && messages.length === 0 ? <div className={styles.welcome}>
        <Sparkles size={24} /><strong>Olá! Sou o Personal AI.</strong>
        <p>Posso montar sua divisão semanal, escolher exercícios da biblioteca e ajustar o treino conforme suas preferências. Como você gostaria de treinar?</p>
        <div className={styles.suggestions}>{suggestions.map(s => <button key={s} className="secondary" type="button" disabled={sending} onClick={() => sendMessage(s)}>{s}</button>)}</div>
      </div> : null}
      {messages.map(m => <div key={m.id} className={`${styles.messageRow} ${m.role === "user" ? styles.mine : ""}`}>
        <div className={styles.smallAvatar}>{m.role === "user" ? <UserRound size={16}/> : <Bot size={16}/>}</div>
        <div className={styles.bubble}>
          <p className={styles.bubbleText}>{m.content}</p>
          {m.plan && <div className={styles.plan}>
            <div className={styles.planHeading}><Dumbbell size={18}/><div><strong>{m.plan.name}</strong><span>{m.plan.objective}</span></div></div>
            {m.plan.days.map((d, index) => <details key={`${d.day_name}-${index}`} className={styles.day} open={index === 0}>
              <summary>{d.day_name}<span>{d.exercises.length} exercícios</span></summary>
              {d.exercises.map((e, i) => <div className={styles.exercise} key={`${e.name}-${i}`}><strong>{e.name}</strong><span>{e.sets} séries · {e.reps} repetições · {e.rest_seconds}s descanso</span></div>)}
            </details>)}
            <button className="primary" type="button" disabled={saving !== null || saved.includes(m.id)} onClick={() => savePlan(m.plan!, m.id)}>
              {saved.includes(m.id) ? <><Check size={16}/> Salvo nos meus treinos</> : saving === m.id ? <><LoaderCircle size={16}/> Salvando...</> : <><Check size={16}/> Salvar nos meus treinos <ArrowUpRight size={15}/></>}
            </button>
            <p className={styles.hint}>Quer mudar algo? Envie outra mensagem. Somente os treinos que você confirmar serão salvos.</p>
          </div>}
        </div>
      </div>)}
      {sending && <div className={styles.waiting}><Bot size={16}/> Personal AI está preparando a resposta... <LoaderCircle className={styles.spin} size={14}/></div>}
      <div ref={bottomRef}/>
    </div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    <form className={styles.composer} onSubmit={e => { e.preventDefault(); sendMessage(input); }}>
      <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
        rows={2} maxLength={1200} disabled={sending || loading} placeholder="Ex.: Sou iniciante, tenho 4 dias livres e quero ganhar massa..." aria-label="Sua mensagem para o personal de IA"/>
      <button type="submit" className="primary" disabled={!input.trim() || loading || sending}><Send size={16}/> Enviar</button>
    </form>
    <div className={styles.footer}><span>Treinos são sugestões educativas. Em caso de dor ou limitação, consulte um profissional.</span>{remaining !== null && <span>{remaining} mensagens disponíveis nas próximas 24h*</span>}</div>
  </article>;
}
