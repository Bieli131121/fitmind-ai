-- Histórico do personal com IA - executar uma vez no Supabase de testes antes do deploy.
-- Cada aluno consulta e grava somente as próprias mensagens.
create table if not exists public.workout_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 4000),
  plan jsonb,
  created_at timestamptz not null default now()
);
alter table public.workout_ai_messages enable row level security;
drop policy if exists "Workout chat own select" on public.workout_ai_messages;
create policy "Workout chat own select" on public.workout_ai_messages for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists "Workout chat own insert" on public.workout_ai_messages;
-- A API autenticada valida o usuario; apenas o servidor grava as duas mensagens.
-- Usuarios autenticados mantem somente a leitura dos seus proprios registros.
revoke insert, update, delete on public.workout_ai_messages from anon, authenticated;
create index if not exists workout_ai_messages_user_time_idx
  on public.workout_ai_messages (user_id, created_at desc);
