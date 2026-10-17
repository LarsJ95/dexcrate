-- STAP 6: verzameldoelen per set en een wishlist. Pas draaien nadat STAP5 gelukt is.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Verzameldoel per set: wat telt mee voor "compleet".
-- ---------------------------------------------------------------------------
create table if not exists public.collection_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- TCGdex-dataset en set, bv. 'en' + 'sv03.5'.
  lang             text not null check (lang in ('en', 'ja', 'zh-cn', 'zh-tw', 'ko')),
  set_id           text not null check (char_length(set_id) between 1 and 40),
  -- Welke uitvoeringen elk een eigen vakje zijn; leeg = elke uitvoering van een kaart telt.
  variants         text[] not null default '{}'
    check (variants <@ array['normal', 'holo', 'reverse', 'firstEdition']::text[]),
  -- Welke kaarttalen meetellen; leeg = elke taal.
  languages        text[] not null default '{}'
    check (languages <@ array['en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'nl', 'de', 'fr', 'it', 'es', 'pt']::text[]),
  -- Secret rares (nummers boven de officiële telling) meetellen.
  include_secret   boolean not null default true,
  -- Onderweg zijnde kaarten al meetellen als "in bezit".
  include_incoming boolean not null default false,
  -- Gewenst aantal per vakje.
  wanted_qty       integer not null default 1 check (wanted_qty between 1 and 99),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, lang, set_id)
);

drop trigger if exists collection_goals_updated_at on public.collection_goals;
create trigger collection_goals_updated_at before update on public.collection_goals
  for each row execute function public.set_updated_at();

alter table public.collection_goals enable row level security;
drop policy if exists "collection_goals_own" on public.collection_goals;
create policy "collection_goals_own" on public.collection_goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Wishlist: kaarten (en uitvoeringen) die je zoekt.
-- ---------------------------------------------------------------------------
create table if not exists public.wishlist_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Cataloguskaart (TCGdex), bv. 'en/sv03.5-151'; null = eigen omschrijving zonder koppeling.
  tcgdex_id     text check (char_length(tcgdex_id) <= 50),
  name          text not null check (char_length(name) between 1 and 200),
  set_code      text check (char_length(set_code) <= 20),
  card_number   text check (char_length(card_number) <= 20),
  -- null = elke uitvoering / taal / conditie is goed.
  variant       text check (variant in ('normal', 'holo', 'reverse', 'firstEdition')),
  language      text check (language in ('en', 'ja', 'zh-cn', 'zh-tw', 'ko', 'nl', 'de', 'fr', 'it', 'es', 'pt')),
  min_condition text check (min_condition in ('MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  wanted_qty    integer not null default 1 check (wanted_qty between 1 and 99),
  max_price     numeric(10, 2) check (max_price >= 0),
  priority      smallint not null default 2 check (priority between 1 and 3),
  notes         text check (char_length(notes) <= 2000),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists wishlist_items_user_idx on public.wishlist_items (user_id);

drop trigger if exists wishlist_items_updated_at on public.wishlist_items;
create trigger wishlist_items_updated_at before update on public.wishlist_items
  for each row execute function public.set_updated_at();

alter table public.wishlist_items enable row level security;
drop policy if exists "wishlist_items_own" on public.wishlist_items;
create policy "wishlist_items_own" on public.wishlist_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Databasefuncties uit STAP5 alleen voor ingelogde gebruikers (standaard mocht iedereen ze aanroepen;
--    zonder login konden ze niets schrijven, maar dit is netter).
-- ---------------------------------------------------------------------------
revoke execute on function public.record_sale(jsonb) from public, anon;
revoke execute on function public.set_sale_status(uuid, text, numeric) from public, anon;
revoke execute on function public.record_purchase(jsonb) from public, anon;
grant execute on function public.record_sale(jsonb) to authenticated;
grant execute on function public.set_sale_status(uuid, text, numeric) to authenticated;
grant execute on function public.record_purchase(jsonb) to authenticated;

commit;

select 'STAP6 klaar' as resultaat,
       (select count(*) from public.collection_goals) as doelen,
       (select count(*) from public.wishlist_items) as wishlist;
