create extension if not exists pgcrypto;

create table if not exists public.meta_ads_entries (
  id text primary key,
  profile text not null check (profile in ('harley','giovanni')),
  start_date date not null,
  end_date date not null,
  impressions bigint not null default 0,
  followers bigint not null default 0,
  spend numeric(14,2) not null default 0,
  clicks bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_funnel (
  id text primary key,
  profile text not null check (profile in ('harley','giovanni')),
  day date not null,
  contato int not null default 0,
  qualificacao int not null default 0,
  reuniao int not null default 0,
  proposta int not null default 0,
  fechado int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.meeting_leads (
  id text primary key,
  profile text not null check (profile in ('harley','giovanni')),
  name text not null,
  contact text not null default '',
  instagram text not null default '',
  avg_revenue numeric(14,2) not null default 0,
  status text not null check (status in ('marcou','realizou','no_show','proposta','venda')),
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.finance_data (
  id text primary key,
  day date not null,
  kind text not null check (kind in ('receita','despesa')),
  expense_type text null check (expense_type in ('fixa','variavel')),
  category text not null check (category in ('administrativo','pessoas','impostos','sistemas','marketing','comissoes','taxas','outros')),
  description text not null,
  value numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ops_tasks (
  id text primary key,
  title text not null,
  owner text not null default '',
  due date null,
  status text not null check (status in ('backlog','em_andamento','bloqueado','feito')),
  created_at timestamptz not null default now()
);

alter table public.meta_ads_entries enable row level security;
alter table public.daily_funnel enable row level security;
alter table public.meeting_leads enable row level security;
alter table public.finance_data enable row level security;
alter table public.ops_tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meta_ads_entries' and policyname='anon_all') then
    create policy anon_all on public.meta_ads_entries for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='daily_funnel' and policyname='anon_all') then
    create policy anon_all on public.daily_funnel for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='meeting_leads' and policyname='anon_all') then
    create policy anon_all on public.meeting_leads for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='finance_data' and policyname='anon_all') then
    create policy anon_all on public.finance_data for all to anon using (true) with check (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ops_tasks' and policyname='anon_all') then
    create policy anon_all on public.ops_tasks for all to anon using (true) with check (true);
  end if;
end $$;
