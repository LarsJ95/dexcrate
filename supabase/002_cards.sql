-- Eén voorraad met status (vervangt sales + purchases). Idempotent.
-- Uitvoeren in Supabase Dashboard → SQL Editor, vóór 003_migrate_to_cards.sql.

create table if not exists public.cards (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 200),
  set_code         text check (char_length(set_code) <= 20),
  card_number      text check (char_length(card_number) <= 20),
  quantity         integer not null default 1 check (quantity between 1 and 9999),
  kind             text not null default 'card' check (kind in ('card', 'sealed')),
  tcgdex_id        text check (char_length(tcgdex_id) <= 50),

  status           text not null default 'collection' check (status in ('collection', 'for_sale', 'sold')),

  -- Staat van de kaart; null = onbekend.
  language         text check (language in ('en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'nl', 'de', 'fr', 'it', 'es', 'pt')),
  condition        text check (condition in ('MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  variant          text check (variant in ('normal', 'holo', 'reverse', 'firstEdition')),
  grading_company  text check (grading_company in ('PSA', 'CGC', 'BGS', 'SGC', 'TAG', 'other')),
  grade            numeric(3, 1) check (grade between 1 and 10),

  purchase_price   numeric(10, 2) check (purchase_price between 0 and 1000000),
  purchase_channel text check (char_length(purchase_channel) <= 50),
  purchase_date    date,
  sale_price       numeric(10, 2) check (sale_price between 0 and 1000000),
  sale_channel     text check (char_length(sale_channel) <= 50),
  sale_date        date,

  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- Grading: bedrijf en cijfer horen bij elkaar.
  constraint cards_grading_pair check ((grading_company is null) = (grade is null))
);

create index if not exists cards_user_idx on public.cards (user_id);

drop trigger if exists cards_updated_at on public.cards;
create trigger cards_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

alter table public.cards enable row level security;

drop policy if exists "cards_own" on public.cards;
create policy "cards_own" on public.cards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
