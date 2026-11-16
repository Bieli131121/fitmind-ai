-- FITMIND AI / Mercado Pago - executar UMA vez no Supabase SQL Editor.
-- Pré-requisito: migrations 20261111_admin_finance.sql e contas já criadas.
-- PRESERVA usuários, assinaturas e pagamentos existentes.
begin;

-- A tabela original permitia apenas free/premium; aceita mensal/anual.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free','premium','premium_monthly','premium_yearly'));
alter table public.subscriptions add column if not exists provider_status text;

-- Não permitir duas assinaturas remotas diferentes com o mesmo identificador.
create unique index if not exists subscriptions_provider_subscription_uidx
  on public.subscriptions(provider_subscription_id)
  where provider_subscription_id is not null;

-- Acesso só pode ser concedido pelo backend com SERVICE_ROLE_KEY.
-- Garante que usuários comuns tenham apenas leitura das próprias assinaturas.
alter table public.subscriptions enable row level security;
drop policy if exists "subscription own read" on public.subscriptions;
create policy "subscription own read" on public.subscriptions
  for select to authenticated using (auth.uid() = user_id);
-- Rejeita mutações financeiras pelo cliente mesmo se houver políticas antigas.
-- Apenas a SERVICE_ROLE_KEY do backend pode alterar o estado de pagamento.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
    where schemaname = 'public' and tablename = 'subscriptions'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL') loop
    execute format('drop policy if exists %I on public.subscriptions', p.policyname);
  end loop;
end $$;
revoke insert, update, delete on public.subscriptions from anon, authenticated;
revoke insert, update, delete on public.payments from anon, authenticated;

update public.plans set price_cents = 0, currency = 'BRL',
  is_configured = true, is_active = true where code = 'free';
update public.plans set price_cents = 1500, currency = 'BRL',
  is_configured = true, is_active = true where code = 'premium_monthly';
update public.plans set price_cents = 15000, currency = 'BRL',
  is_configured = true, is_active = true where code = 'premium_yearly';

create index if not exists subscription_status_index on public.subscriptions(status);
create index if not exists payments_provider_user_idx on public.payments(provider_payment_id,user_id);
commit;

-- VERIFICAR DEPOIS:
-- select code,price_cents,currency,is_configured from public.plans order by price_cents;
-- select plan,status,provider_status from public.subscriptions limit 10;
