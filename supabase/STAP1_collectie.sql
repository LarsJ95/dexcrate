-- STAP 1 VAN 2: collectietabel aanmaken + je huidige data overzetten.
-- Kopieer ALLES in dit bestand (Ctrl+A, Ctrl+C), plak in Supabase → SQL Editor → nieuwe query → Run.

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

-- Kopieert sales + purchases naar cards. Verwijdert NIETS; oude tabellen blijven als back-up.
-- Draait alleen als cards nog leeg is (veilig om per ongeluk twee keer te starten).
-- Uitvoeren in Supabase Dashboard → SQL Editor, ná 002_cards.sql.

begin;

-- Taal: "JAPAN"/"CHINA" in de naam, anders de taal van de koppeling, anders Engels (losse kaarten).
-- Sealed producten krijgen geen taal.
create temporary table _src on commit drop as
select
  user_id,
  name as raw_name,
  set_code, card_number, quantity, kind, tcgdex_id, sort_order,
  case when sold then 'sold' else 'for_sale' end as status,
  null::numeric as purchase_price, null::text as purchase_channel,
  unit_price as sale_price, channel as sale_channel
from public.sales
union all
select
  user_id, name, set_code, card_number, quantity, kind, tcgdex_id, 1000 + sort_order,
  'collection',
  unit_price, channel,
  null, null
from public.purchases;

insert into public.cards (
  user_id, name, set_code, card_number, quantity, kind, tcgdex_id, status, language,
  purchase_price, purchase_channel, sale_price, sale_channel, sort_order
)
select
  user_id,
  btrim(regexp_replace(raw_name, '\s*\m(JAPAN|CHINA)\M\s*', ' ', 'gi')),
  set_code, card_number, quantity, kind, tcgdex_id, status,
  case
    when kind = 'sealed' then null
    when raw_name ~* '\mjapan\M' then 'ja'
    when raw_name ~* '\mchina\M' then 'zh-cn'
    when tcgdex_id is not null then split_part(tcgdex_id, '/', 1)
    else 'en'
  end,
  purchase_price, purchase_channel, sale_price, sale_channel, sort_order
from _src
where not exists (select 1 from public.cards);

commit;

-- Controle: moet 93 regels geven, en dezelfde totalen als je Excel.
select
  count(*)                                                                as regels,
  sum(quantity * sale_price) filter (where status = 'sold')              as verkocht,
  sum(quantity) filter (where status = 'sold')                           as verkocht_aantal,
  sum(quantity * sale_price) filter (where status = 'for_sale')          as te_koop,
  sum(quantity) filter (where status = 'for_sale')                       as te_koop_aantal,
  sum(quantity * purchase_price) filter (where purchase_price is not null) as gekocht,
  sum(quantity) filter (where purchase_price is not null)                as gekocht_aantal
from public.cards;
