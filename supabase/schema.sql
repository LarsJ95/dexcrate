-- Pokémon kaarten: schema + Row Level Security.
-- Uitvoeren in Supabase Dashboard → SQL Editor. Idempotent: mag opnieuw gedraaid worden.

-- Verkooplijst
create table if not exists public.sales (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  set_code    text check (char_length(set_code) <= 20),
  card_number text check (char_length(card_number) <= 20),
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(10, 2) not null default 0 check (unit_price >= 0),
  channel     text check (char_length(channel) <= 50),
  sold        boolean not null default false,
  kind        text not null default 'card' check (kind in ('card', 'sealed')),
  tcgdex_id   text check (char_length(tcgdex_id) <= 50),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Aankooplijst
create table if not exists public.purchases (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 200),
  set_code    text check (char_length(set_code) <= 20),
  card_number text check (char_length(card_number) <= 20),
  quantity    integer not null default 1 check (quantity > 0),
  unit_price  numeric(10, 2) not null default 0 check (unit_price >= 0),
  channel     text check (char_length(channel) <= 50),
  kind        text not null default 'card' check (kind in ('card', 'sealed')),
  tcgdex_id   text check (char_length(tcgdex_id) <= 50),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists sales_user_idx on public.sales (user_id);
create index if not exists purchases_user_idx on public.purchases (user_id);

-- Dagelijkse prijsmomentopnames (Cardmarket via TCGdex), gedeeld per kaart.
create table if not exists public.price_snapshots (
  tcgdex_id  text not null check (char_length(tcgdex_id) <= 50),
  taken_on   date not null default current_date,
  currency   text not null default 'EUR',
  trend      numeric(10, 2),
  low        numeric(10, 2),
  avg1       numeric(10, 2),
  avg7       numeric(10, 2),
  avg30      numeric(10, 2),
  primary key (tcgdex_id, taken_on)
);

-- updated_at bijhouden
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists sales_updated_at on public.sales;
create trigger sales_updated_at before update on public.sales
  for each row execute function public.set_updated_at();

drop trigger if exists purchases_updated_at on public.purchases;
create trigger purchases_updated_at before update on public.purchases
  for each row execute function public.set_updated_at();

-- Row Level Security: alleen eigen rijen
alter table public.sales enable row level security;
alter table public.purchases enable row level security;
alter table public.price_snapshots enable row level security;

drop policy if exists "sales_own" on public.sales;
create policy "sales_own" on public.sales
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "purchases_own" on public.purchases;
create policy "purchases_own" on public.purchases
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Prijzen zijn publieke marktdata: ingelogd mag lezen; schrijven alleen via server-side job (geen policy = geen client-writes).
drop policy if exists "snapshots_read" on public.price_snapshots;
create policy "snapshots_read" on public.price_snapshots
  for select to authenticated
  using (true);
