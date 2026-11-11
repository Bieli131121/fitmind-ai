-- FITMIND AI — schema inicial PostgreSQL / Supabase
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  age integer check (age is null or age between 13 and 110),
  height_cm numeric(5,2) check (height_cm is null or height_cm between 80 and 250),
  weight_kg numeric(5,2) check (weight_kg is null or weight_kg between 20 and 500),
  goal text,
  experience_level text,
  training_days integer check (training_days is null or training_days between 1 and 7),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  muscle_group text not null,
  instructions text,
  equipment text,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  objective text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_days (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.workout_plans(id) on delete cascade,
  day_name text not null,
  sort_order integer not null default 0
);

create table if not exists public.workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_day_id uuid not null references public.workout_days(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  exercise_name text not null,
  sets integer not null default 3 check (sets between 1 and 20),
  reps text not null default '8–12',
  rest_seconds integer not null default 90,
  sort_order integer not null default 0
);

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id uuid references public.workout_plans(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  notes text
);

create table if not exists public.workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.workout_sessions(id) on delete cascade,
  workout_exercise_id uuid references public.workout_exercises(id) on delete set null,
  exercise_name text not null,
  set_number integer not null,
  reps_completed integer,
  weight_kg numeric(6,2),
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  weight_kg numeric(5,2),
  waist_cm numeric(5,2),
  chest_cm numeric(5,2),
  arm_cm numeric(5,2),
  thigh_cm numeric(5,2),
  recorded_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','premium')),
  status text not null default 'inactive',
  provider text,
  provider_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- RLS: dados privados sempre vinculados ao usuário autenticado.
alter table public.profiles enable row level security;
alter table public.workout_plans enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_sets enable row level security;
alter table public.body_metrics enable row level security;
alter table public.subscriptions enable row level security;
alter table public.workout_days enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.exercises enable row level security;

create policy "profile own read" on public.profiles for select using (auth.uid() = id);
create policy "profile own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profile own update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "plans own all" on public.workout_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions own all" on public.workout_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "metrics own all" on public.body_metrics for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "subscription own read" on public.subscriptions for select using (auth.uid() = user_id);
create policy "sets own access" on public.workout_sets for all using (
  exists(select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid())
) with check (
  exists(select 1 from public.workout_sessions s where s.id = session_id and s.user_id = auth.uid())
);
create policy "days through own plan" on public.workout_days for all using (
  exists(select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid())
) with check (
  exists(select 1 from public.workout_plans p where p.id = plan_id and p.user_id = auth.uid())
);
create policy "workout exercises through own plan" on public.workout_exercises for all using (
  exists(select 1 from public.workout_days d join public.workout_plans p on p.id=d.plan_id where d.id=workout_day_id and p.user_id=auth.uid())
) with check (
  exists(select 1 from public.workout_days d join public.workout_plans p on p.id=d.plan_id where d.id=workout_day_id and p.user_id=auth.uid())
);
create policy "exercises readable by signed in users" on public.exercises for select to authenticated using (true);

-- Criar perfil automaticamente após cadastro.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''));
  insert into public.subscriptions (user_id, plan, status) values (new.id, 'free', 'active');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

create index if not exists workout_plans_user_idx on public.workout_plans(user_id);
create index if not exists workout_sessions_user_date_idx on public.workout_sessions(user_id, started_at desc);
create index if not exists body_metrics_user_date_idx on public.body_metrics(user_id, recorded_at desc);
