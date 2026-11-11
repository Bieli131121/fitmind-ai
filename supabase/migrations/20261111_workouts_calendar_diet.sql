-- FitMind AI: calendário pessoal e planos alimentares gerados.
-- Execute UMA VEZ no Supabase SQL Editor, depois da migration admin_finance.
create table if not exists public.workout_calendar (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  event_date date not null,
  plan_id uuid references public.workout_plans(id) on delete set null,
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.diet_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  goal text,
  content jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.workout_calendar enable row level security;
alter table public.diet_plans enable row level security;
drop policy if exists "calendar own access" on public.workout_calendar;
create policy "calendar own access" on public.workout_calendar for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "diet plans own access" on public.diet_plans;
create policy "diet plans own access" on public.diet_plans for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create index if not exists workout_calendar_user_date_idx on public.workout_calendar(user_id,event_date);
create index if not exists diet_plans_user_created_idx on public.diet_plans(user_id,created_at desc);
