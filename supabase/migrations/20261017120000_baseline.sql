-- Dexcrate basismigratie (17-10-2026): het volledige schema zoals het na STAP16 is, overgenomen uit supabase/legacy/schema.sql.
-- Vanaf hier gaat elke databasewijziging als nieuw bestand in supabase/migrations/ (zie README, "Database").
--
-- Productie had dit al via de losse STAP-bestanden: daar is deze migratie alleen als "toegepast" gemarkeerd
-- (supabase migration repair 20261017120000 --status applied), niet uitgevoerd. Een nieuw project krijgt hem via db push.
--
-- Volgorde en herkomst:
--   002_cards.sql
--   004_price_snapshots.sql
--   STAP4_datamodel.sql
--   STAP5_transacties.sql
--   STAP6_doelen_wishlist.sql
--   STAP7_waardering.sql
--   STAP8_binders_scans.sql
--   STAP10_wishlist_lijsten.sql
--   STAP11_crate_game.sql
--   STAP12_crate_pakjes.sql
--   STAP13_crate_wens.sql
--   STAP14_account_reset.sql
--   STAP15_scanlimiet.sql
--   STAP16_foutlog.sql
-- Bewust niet opgenomen:
--   003_migrate_to_cards.sql / STAP1 (eenmalige overzetting uit sales/purchases; STAP1 = 002 + 003),
--   STAP2 (= 004), STAP3 (vervangen door STAP4), STAP9 (verwijderde sales/purchases).
-- Nog in de database maar niet meer in de app: locations, binder_slots en cards.location_* (Locations-scherm is weg).
--
-- Vereist: extensies pg_net en pg_cron (zie 004). Lukt "create extension pg_cron" niet:
-- zet Cron aan via Dashboard → Integrations → Cron en draai dit script opnieuw.

-- ===========================================================================
-- Basis: updated_at-trigger en gedeelde prijsopnames
-- ===========================================================================

-- updated_at bijhouden
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

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

alter table public.price_snapshots enable row level security;

-- Prijzen zijn publieke marktdata: ingelogd mag lezen; schrijven alleen via server-side job (geen policy = geen client-writes).
drop policy if exists "snapshots_read" on public.price_snapshots;
create policy "snapshots_read" on public.price_snapshots
  for select to authenticated
  using (true);

-- ===========================================================================
-- Uit 002_cards.sql
-- ===========================================================================

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

-- ===========================================================================
-- Uit 004_price_snapshots.sql
-- ===========================================================================

-- Dagelijkse prijsopnames (Cardmarket via TCGdex) voor het prijsverloop. Idempotent.
-- Uitvoeren in Supabase Dashboard → SQL Editor, ná 002 en 003.
--
-- Werking: pg_cron start dagelijks request_price_snapshots(); die vuurt per gekoppelde kaart een
-- HTTP-verzoek af via pg_net (asynchroon). collect_price_snapshots() draait elk uur en verwerkt
-- de binnengekomen antwoorden tot price_snapshots. Antwoorden blijven 6 uur bewaard in pg_net.
--
-- Lukt "create extension pg_cron" niet: zet Cron aan via Dashboard → Integrations → Cron en draai dit script opnieuw.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Reverse-holoprijzen (TCGdex "-holo"-velden) naast de gewone prijzen.
alter table public.price_snapshots
  add column if not exists trend_holo numeric(10, 2),
  add column if not exists low_holo   numeric(10, 2),
  add column if not exists avg1_holo  numeric(10, 2),
  add column if not exists avg7_holo  numeric(10, 2),
  add column if not exists avg30_holo numeric(10, 2);

-- Openstaande verzoeken; niet bereikbaar voor de app (RLS aan, geen policies).
create table if not exists public.price_requests (
  request_id   bigint primary key,
  tcgdex_id    text not null,
  requested_on date not null default current_date
);
alter table public.price_requests enable row level security;

create or replace function public.request_price_snapshots() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  r record;
begin
  -- Oude, nooit beantwoorde verzoeken opruimen.
  delete from public.price_requests where requested_on < current_date - 2;

  for r in
    select distinct c.tcgdex_id
    from public.cards c
    where c.kind = 'card'
      and c.status <> 'sold'
      -- Alleen veilige sleutels ("en/sv03.5-151") in de URL.
      and c.tcgdex_id ~ '^[a-z]{2}(-[a-z]{2})?/[A-Za-z0-9._+-]{1,40}$'
      and not exists (
        select 1 from public.price_snapshots s
        where s.tcgdex_id = c.tcgdex_id and s.taken_on = current_date
      )
  loop
    insert into public.price_requests (request_id, tcgdex_id)
    values (
      net.http_get(
        url := 'https://api.tcgdex.net/v2/' || split_part(r.tcgdex_id, '/', 1) || '/cards/' || split_part(r.tcgdex_id, '/', 2),
        timeout_milliseconds := 10000
      ),
      r.tcgdex_id
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.collect_price_snapshots() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with resp as (
    select q.tcgdex_id, q.requested_on, (h.content::jsonb -> 'pricing' -> 'cardmarket') as cm
    from public.price_requests q
    join net._http_response h on h.id = q.request_id
    where h.status_code = 200
      and h.content_type like 'application/json%'
  ),
  ins as (
    insert into public.price_snapshots (
      tcgdex_id, taken_on, currency, trend, low, avg1, avg7, avg30,
      trend_holo, low_holo, avg1_holo, avg7_holo, avg30_holo
    )
    select
      tcgdex_id, requested_on, coalesce(cm ->> 'unit', 'EUR'),
      -- 0 betekent bij TCGdex "geen data".
      nullif((cm ->> 'trend')::numeric, 0),
      nullif((cm ->> 'low')::numeric, 0),
      nullif((cm ->> 'avg1')::numeric, 0),
      nullif((cm ->> 'avg7')::numeric, 0),
      nullif((cm ->> 'avg30')::numeric, 0),
      nullif((cm ->> 'trend-holo')::numeric, 0),
      nullif((cm ->> 'low-holo')::numeric, 0),
      nullif((cm ->> 'avg1-holo')::numeric, 0),
      nullif((cm ->> 'avg7-holo')::numeric, 0),
      nullif((cm ->> 'avg30-holo')::numeric, 0)
    from resp
    where jsonb_typeof(cm) = 'object'
    on conflict (tcgdex_id, taken_on) do update set
      trend = excluded.trend, low = excluded.low, avg1 = excluded.avg1, avg7 = excluded.avg7, avg30 = excluded.avg30,
      trend_holo = excluded.trend_holo, low_holo = excluded.low_holo, avg1_holo = excluded.avg1_holo,
      avg7_holo = excluded.avg7_holo, avg30_holo = excluded.avg30_holo
    returning 1
  )
  select count(*) into n from ins;

  -- Beantwoorde verzoeken (ook mislukte) zijn klaar.
  delete from public.price_requests q
  using net._http_response h
  where h.id = q.request_id;

  return n;
end;
$$;

-- Alleen de database zelf (cron) mag deze functies aanroepen, niet de app.
revoke execute on function public.request_price_snapshots() from public, anon, authenticated;
revoke execute on function public.collect_price_snapshots() from public, anon, authenticated;

-- Planning (tijden in UTC). TCGdex ververst prijzen rond 09:00 UTC.
select cron.unschedule(jobname) from cron.job where jobname in ('price-snapshots-request', 'price-snapshots-collect');
select cron.schedule('price-snapshots-request', '30 10 * * *', 'select public.request_price_snapshots()');
select cron.schedule('price-snapshots-collect', '45 * * * *', 'select public.collect_price_snapshots()');

-- Eerste opname meteen starten; wordt binnen het uur verwerkt door de collect-job.
select public.request_price_snapshots() as verzoeken_gestart;

-- ===========================================================================
-- Uit STAP4_datamodel.sql
-- ===========================================================================

-- STAP 4: uitgebreider datamodel (bezit/beschikbaarheid, meerdere foto's, locaties, importbatches).
-- Kopieer ALLES in dit bestand (Ctrl+A, Ctrl+C), plak in Supabase → SQL Editor → nieuwe lege query → Run.
--
-- Veilig:
-- - Alles in één transactie: gaat er iets mis, dan verandert er niets.
-- - Alleen toevoegen; er wordt niets verwijderd. De kolom `status` blijft bestaan en wordt automatisch bijgehouden.
-- - Opnieuw draaien kan: niets wordt dubbel aangemaakt.
-- - Vervangt STAP3 (eigen foto's): STAP3 hoef je niet meer te draaien. Heb je STAP3 al gedraaid,
--   dan worden die foto's overgezet naar de nieuwe fototabel.

begin;

-- ---------------------------------------------------------------------------
-- 1. Locaties (map, doos, ...). Eerst aanmaken: cards verwijst ernaar.
-- ---------------------------------------------------------------------------
create table if not exists public.locations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  kind        text not null default 'binder' check (kind in ('binder', 'box', 'deck', 'other')),
  -- Vakken per pagina (binders), bv. 9 of 12.
  page_size   integer check (page_size between 1 and 24),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists locations_user_idx on public.locations (user_id);

drop trigger if exists locations_updated_at on public.locations;
create trigger locations_updated_at before update on public.locations
  for each row execute function public.set_updated_at();

alter table public.locations enable row level security;
drop policy if exists "locations_own" on public.locations;
create policy "locations_own" on public.locations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Importbatches: elke import herkenbaar en terug te draaien.
-- ---------------------------------------------------------------------------
create table if not exists public.import_batches (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source      text not null check (char_length(source) between 1 and 40),
  file_name   text check (char_length(file_name) <= 200),
  -- SHA-256 van het bestand: dezelfde import nogmaals wordt herkend.
  file_hash   text check (char_length(file_hash) <= 128),
  row_count   integer not null default 0 check (row_count >= 0),
  created_at  timestamptz not null default now(),
  reverted_at timestamptz
);

create index if not exists import_batches_user_idx on public.import_batches (user_id);

alter table public.import_batches enable row level security;
drop policy if exists "import_batches_own" on public.import_batches;
create policy "import_batches_own" on public.import_batches
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Nieuwe velden op cards (elke regel = één of meer gelijke exemplaren).
-- ---------------------------------------------------------------------------
alter table public.cards
  -- Bezit: onderweg, in bezit, verkocht, geruild, weggegeven.
  add column if not exists ownership       text not null default 'owned'
    check (ownership in ('incoming', 'owned', 'sold', 'traded', 'given_away')),
  -- Beschikbaarheid: bewaren, te koop, gereserveerd.
  add column if not exists availability    text not null default 'keep'
    check (availability in ('keep', 'for_sale', 'reserved')),
  add column if not exists notes           text check (char_length(notes) <= 2000),
  add column if not exists cert_number     text check (char_length(cert_number) <= 40),
  -- Druk of stempel, bv. "Staff stamp", "Prerelease", "Shadowless".
  add column if not exists edition         text check (char_length(edition) <= 60),
  -- Kwaliteit van de cataloguskoppeling (tcgdex_id).
  add column if not exists link_status     text
    check (link_status in ('exact', 'approximate', 'unconfirmed', 'manual')),
  -- Extern product-ID, los van onze eigen id.
  add column if not exists cardmarket_id   integer check (cardmarket_id > 0),
  add column if not exists location_id     uuid,
  add column if not exists location_page   integer check (location_page between 1 and 999),
  add column if not exists location_slot   integer check (location_slot between 1 and 99),
  add column if not exists import_batch_id uuid;

-- Foreign keys apart, zodat opnieuw draaien geen fout geeft.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_location_fk') then
    alter table public.cards add constraint cards_location_fk
      foreign key (location_id) references public.locations (id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cards_import_batch_fk') then
    alter table public.cards add constraint cards_import_batch_fk
      foreign key (import_batch_id) references public.import_batches (id) on delete set null;
  end if;
end;
$$;

create index if not exists cards_location_idx on public.cards (location_id) where location_id is not null;
create index if not exists cards_import_batch_idx on public.cards (import_batch_id) where import_batch_id is not null;

-- Huidige status overzetten (alleen regels die nog op de standaardwaarden staan).
update public.cards
set ownership    = case when status = 'sold' then 'sold' else 'owned' end,
    availability = case when status = 'for_sale' then 'for_sale' else 'keep' end
where status <> 'collection' and ownership = 'owned' and availability = 'keep';

-- Bestaande koppelingen: kwaliteit niet vastgelegd, dus "onbevestigd".
update public.cards set link_status = 'unconfirmed'
where tcgdex_id is not null and link_status is null;

-- `status` blijft voor oudere app-versies en de prijs-cron; deze trigger houdt beide kanten gelijk.
create or replace function public.cards_sync_status() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and new.ownership is not distinct from old.ownership
     and new.availability is not distinct from old.availability then
    -- Oudere app-versie wijzigde alleen `status`: nieuwe velden daaruit afleiden.
    new.ownership := case
      when new.status = 'sold' then 'sold'
      when old.ownership in ('sold', 'traded', 'given_away') then 'owned'
      else old.ownership
    end;
    new.availability := case when new.status = 'for_sale' then 'for_sale' else 'keep' end;
  elsif tg_op = 'INSERT'
     and new.status <> 'collection'
     and new.ownership = 'owned' and new.availability = 'keep' then
    -- Oudere app-versie voegt toe met alleen `status`.
    new.ownership := case when new.status = 'sold' then 'sold' else 'owned' end;
    new.availability := case when new.status = 'for_sale' then 'for_sale' else 'keep' end;
  else
    new.status := case
      when new.ownership in ('sold', 'traded', 'given_away') then 'sold'
      when new.availability in ('for_sale', 'reserved') then 'for_sale'
      else 'collection'
    end;
  end if;
  -- Niet meer in bezit: niet meer te koop of gereserveerd.
  if new.ownership in ('sold', 'traded', 'given_away') then
    new.availability := 'keep';
  end if;
  return new;
end;
$$;

drop trigger if exists cards_sync_status on public.cards;
create trigger cards_sync_status before insert or update on public.cards
  for each row execute function public.cards_sync_status();

-- ---------------------------------------------------------------------------
-- 4. Eigen foto's: meerdere per regel, met label en hoofdfoto.
-- ---------------------------------------------------------------------------
create table if not exists public.card_photos (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- null = nog niet gekoppeld (foto-inbox). Kaart verwijderd → foto blijft, wordt ontkoppeld.
  card_id     uuid references public.cards (id) on delete set null,
  -- Weergaveversie (JPEG, max. 2000 px).
  path        text not null check (char_length(path) between 1 and 300),
  -- Kleine versie voor overzichten.
  thumb_path  text check (char_length(thumb_path) <= 300),
  -- Origineel bestand zoals geüpload (ongewijzigd).
  original_path text check (char_length(original_path) <= 300),
  original_name text check (char_length(original_name) <= 200),
  label       text not null default 'front'
    check (label in ('front', 'back', 'detail', 'damage', 'slab', 'scan', 'other')),
  is_primary  boolean not null default false,
  width       integer check (width between 1 and 20000),
  height      integer check (height between 1 and 20000),
  bytes       integer check (bytes between 1 and 50000000),
  created_at  timestamptz not null default now()
);

create index if not exists card_photos_user_idx on public.card_photos (user_id);
create index if not exists card_photos_card_idx on public.card_photos (card_id) where card_id is not null;
-- Maximaal één hoofdfoto per kaartregel.
create unique index if not exists card_photos_one_primary on public.card_photos (card_id)
  where is_primary and card_id is not null;

alter table public.card_photos enable row level security;
drop policy if exists "card_photos_own" on public.card_photos;
create policy "card_photos_own" on public.card_photos
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Privé-bucket: alleen bereikbaar met een tijdelijke, ondertekende link.
insert into storage.buckets (id, name, public)
values ('card-photos', 'card-photos', false)
on conflict (id) do nothing;

-- Elke gebruiker alleen in zijn eigen map (eerste mapnaam = user-id).
drop policy if exists "card_photos_select_own" on storage.objects;
create policy "card_photos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_insert_own" on storage.objects;
create policy "card_photos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_update_own" on storage.objects;
create policy "card_photos_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "card_photos_delete_own" on storage.objects;
create policy "card_photos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

-- STAP3 al gedraaid? Dan de bestaande foto's overzetten als hoofdfoto (de kolom blijft staan).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'cards' and column_name = 'image_path'
  ) then
    execute $q$
      insert into public.card_photos (user_id, card_id, path, label, is_primary)
      select c.user_id, c.id, c.image_path, 'front', true
      from public.cards c
      where c.image_path is not null
        and not exists (select 1 from public.card_photos p where p.card_id = c.id and p.path = c.image_path)
    $q$;
  end if;
end;
$$;

commit;

-- Controle: aantallen per bezit/beschikbaarheid. Het totaal moet gelijk zijn aan vóór de migratie.
select ownership, availability, status, count(*) as regels, sum(quantity) as stuks
from public.cards
group by ownership, availability, status
order by ownership, availability;

-- ===========================================================================
-- Uit STAP5_transacties.sql
-- ===========================================================================

-- STAP 5: aankopen en verkopen als transacties (lots, kosten, betaal-/verzendstatus, retour, aankoopbewijzen).
-- Pas draaien nadat STAP4 gelukt is.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
--
-- Veilig:
-- - Alles in één transactie: gaat er iets mis, dan verandert er niets.
-- - Alleen toevoegen. Je huidige aankoop- en verkoopprijzen worden per kaartregel overgezet naar transacties;
--   lege prijzen blijven leeg (onbekend), ze worden geen 0.
-- - Opnieuw draaien kan: niets wordt dubbel aangemaakt.

begin;

-- ---------------------------------------------------------------------------
-- 1. Herkomst van gesplitste regels (verkoop van 1 van 3 → nieuwe regel "split_from" de oude).
-- ---------------------------------------------------------------------------
alter table public.cards
  add column if not exists split_from uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cards_split_from_fk') then
    alter table public.cards add constraint cards_split_from_fk
      foreign key (split_from) references public.cards (id) on delete set null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Transacties en regels.
-- ---------------------------------------------------------------------------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind            text not null check (kind in ('purchase', 'sale', 'trade', 'gift_in', 'gift_out')),
  occurred_on     date,
  channel         text check (char_length(channel) <= 50),
  counterparty    text check (char_length(counterparty) <= 100),
  -- Bedrag voor de kaarten zelf (aankoopprijs of verkoopopbrengst), zonder verzending. null = onbekend.
  amount          numeric(10, 2) check (amount >= 0),
  -- Aankoop: betaalde verzendkosten. Verkoop: ontvangen verzendbijdrage van de koper.
  shipping_amount numeric(10, 2) check (shipping_amount >= 0),
  -- Aankoop: overige kosten (bv. servicekosten). Verkoop: platform- en betaalkosten.
  fees_amount     numeric(10, 2) check (fees_amount >= 0),
  -- Verkoop: werkelijke verzend- en verpakkingskosten.
  shipping_cost   numeric(10, 2) check (shipping_cost >= 0),
  -- Terugbetaald aan de koper (gedeeltelijke terugbetaling of retour).
  refund_amount   numeric(10, 2) check (refund_amount >= 0),
  status          text not null default 'completed'
    check (status in ('open', 'paid', 'shipped', 'completed', 'cancelled', 'returned')),
  notes           text check (char_length(notes) <= 2000),
  -- Alleen voor de eenmalige overzetting uit cards (voorkomt dubbel overzetten).
  legacy_card_id  uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists transactions_user_idx on public.transactions (user_id);
create unique index if not exists transactions_legacy_idx on public.transactions (legacy_card_id, kind)
  where legacy_card_id is not null;

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

alter table public.transactions enable row level security;
drop policy if exists "transactions_own" on public.transactions;
create policy "transactions_own" on public.transactions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table if not exists public.transaction_lines (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  -- Kaartregel verwijderd → regel blijft (historie), zonder koppeling.
  card_id        uuid references public.cards (id) on delete set null,
  quantity       integer not null check (quantity between 1 and 9999),
  -- Bedrag per stuk; null = onderdeel van een lot zonder (bekende) verdeling.
  unit_amount    numeric(10, 2) check (unit_amount >= 0),
  created_at     timestamptz not null default now()
);

create index if not exists transaction_lines_tx_idx on public.transaction_lines (transaction_id);
create index if not exists transaction_lines_card_idx on public.transaction_lines (card_id) where card_id is not null;

alter table public.transaction_lines enable row level security;
drop policy if exists "transaction_lines_own" on public.transaction_lines;
create policy "transaction_lines_own" on public.transaction_lines
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Aankoopbewijzen: privé, los van kaartfoto's.
-- ---------------------------------------------------------------------------
create table if not exists public.transaction_documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  path           text not null check (char_length(path) between 1 and 300),
  name           text check (char_length(name) <= 200),
  created_at     timestamptz not null default now()
);

create index if not exists transaction_documents_tx_idx on public.transaction_documents (transaction_id);

alter table public.transaction_documents enable row level security;
drop policy if exists "transaction_documents_own" on public.transaction_documents;
create policy "transaction_documents_own" on public.transaction_documents
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

drop policy if exists "receipts_select_own" on storage.objects;
create policy "receipts_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "receipts_insert_own" on storage.objects;
create policy "receipts_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

drop policy if exists "receipts_delete_own" on storage.objects;
create policy "receipts_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.jwt()->>'sub'));

-- ---------------------------------------------------------------------------
-- 4. Bestaande prijzen overzetten: per kaartregel één aankoop- en/of verkooptransactie.
--    (In de SQL Editor is er geen ingelogde gebruiker, dus user_id expliciet uit de kaart.)
-- ---------------------------------------------------------------------------
with ins as (
  insert into public.transactions (user_id, kind, occurred_on, channel, amount, status, legacy_card_id)
  select c.user_id, 'purchase', c.purchase_date, c.purchase_channel,
         c.quantity * c.purchase_price, 'completed', c.id
  from public.cards c
  where (c.purchase_price is not null or c.purchase_channel is not null or c.purchase_date is not null)
    -- Geen kaart die al in een aankoop staat (eerder overgezet of via de app vastgelegd).
    and not exists (
      select 1 from public.transaction_lines l join public.transactions t on t.id = l.transaction_id
      where l.card_id = c.id and t.kind = 'purchase'
    )
    and not exists (select 1 from public.transactions t where t.legacy_card_id = c.id and t.kind = 'purchase')
    -- Gesplitste regel: de aankoop hoort bij de oorspronkelijke regel.
    and c.split_from is null
  returning id, user_id, legacy_card_id
)
insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
select ins.user_id, ins.id, c.id, c.quantity, c.purchase_price
from ins join public.cards c on c.id = ins.legacy_card_id;

with ins as (
  insert into public.transactions (user_id, kind, occurred_on, channel, amount, status, legacy_card_id)
  select c.user_id, 'sale', c.sale_date, c.sale_channel,
         c.quantity * c.sale_price, 'completed', c.id
  from public.cards c
  where c.ownership = 'sold'
    -- Geen kaart die al in een verkoop staat (eerder overgezet of via de app vastgelegd).
    and not exists (
      select 1 from public.transaction_lines l join public.transactions t on t.id = l.transaction_id
      where l.card_id = c.id and t.kind = 'sale'
    )
    and not exists (select 1 from public.transactions t where t.legacy_card_id = c.id and t.kind = 'sale')
  returning id, user_id, legacy_card_id
)
insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
select ins.user_id, ins.id, c.id, c.quantity, c.sale_price
from ins join public.cards c on c.id = ins.legacy_card_id;

-- ---------------------------------------------------------------------------
-- 5. Verkoop vastleggen als één geheel: splitsen, status zetten en transactie + regels aanmaken.
--    Rechten van de aanroeper (RLS geldt), dus alleen je eigen kaarten.
--    p = { occurred_on, channel, counterparty, amount, shipping_amount, fees_amount, shipping_cost,
--          status, notes, lines: [{ card_id, quantity, unit_amount }] }
-- ---------------------------------------------------------------------------
create or replace function public.record_sale(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  tx_id      uuid;
  ln         jsonb;
  c          public.cards%rowtype;
  qty        integer;
  unit       numeric(10, 2);
  target     uuid;
  sale_state text := coalesce(nullif(p->>'status', ''), 'completed');
  sold_on    date := nullif(p->>'occurred_on', '')::date;
  chan       text := nullif(btrim(p->>'channel'), '');
begin
  if sale_state not in ('open', 'paid', 'shipped', 'completed') then
    raise exception 'Invalid sale status: %', sale_state;
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'Choose at least one card.';
  end if;

  insert into public.transactions (kind, occurred_on, channel, counterparty, amount, shipping_amount,
                                   fees_amount, shipping_cost, status, notes)
  values ('sale', sold_on, chan, nullif(btrim(p->>'counterparty'), ''),
          nullif(p->>'amount', '')::numeric, nullif(p->>'shipping_amount', '')::numeric,
          nullif(p->>'fees_amount', '')::numeric, nullif(p->>'shipping_cost', '')::numeric,
          sale_state, nullif(btrim(p->>'notes'), ''))
  returning id into tx_id;

  for ln in select value from jsonb_array_elements(p->'lines') loop
    qty := (ln->>'quantity')::integer;
    unit := nullif(ln->>'unit_amount', '')::numeric;
    select * into c from public.cards where id = (ln->>'card_id')::uuid for update;
    if not found then
      raise exception 'Card not found.';
    end if;
    if c.ownership <> 'owned' then
      raise exception '"%" is not in your possession.', c.name;
    end if;
    if qty is null or qty < 1 or qty > c.quantity then
      raise exception 'Invalid quantity for "%" (you have %).', c.name, c.quantity;
    end if;

    if qty < c.quantity then
      -- Deel verkopen: nieuwe regel voor de verkochte stuks; de rest blijft zoals hij was.
      insert into public.cards (
        user_id, name, set_code, card_number, quantity, kind, tcgdex_id, language, condition, variant,
        grading_company, grade, purchase_price, purchase_channel, purchase_date, sort_order,
        notes, cert_number, edition, link_status, cardmarket_id, split_from,
        ownership, availability, status, sale_price, sale_channel, sale_date
      ) values (
        c.user_id, c.name, c.set_code, c.card_number, qty, c.kind, c.tcgdex_id, c.language, c.condition, c.variant,
        c.grading_company, c.grade, c.purchase_price, c.purchase_channel, c.purchase_date, c.sort_order,
        c.notes, c.cert_number, c.edition, c.link_status, c.cardmarket_id, c.id,
        'sold', 'keep', 'sold', unit, chan, sold_on
      ) returning id into target;
      update public.cards set quantity = quantity - qty where id = c.id;
    else
      update public.cards
      set ownership = 'sold', availability = 'keep', sale_price = unit, sale_channel = chan, sale_date = sold_on
      where id = c.id;
      target := c.id;
    end if;

    insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
    values (c.user_id, tx_id, target, qty, unit);
  end loop;

  return tx_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Status van een verkoop wijzigen. Annuleren of retour zet de kaarten terug in bezit (te koop);
--    de transactie blijft bewaard (historie). Geannuleerd/retour is definitief.
-- ---------------------------------------------------------------------------
create or replace function public.set_sale_status(p_id uuid, p_status text, p_refund numeric default null)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  t public.transactions%rowtype;
begin
  select * into t from public.transactions where id = p_id for update;
  if not found or t.kind <> 'sale' then
    raise exception 'Sale not found.';
  end if;
  if t.status in ('cancelled', 'returned') then
    raise exception 'This sale is already %, that cannot be changed.', t.status;
  end if;
  if p_status not in ('open', 'paid', 'shipped', 'completed', 'cancelled', 'returned') then
    raise exception 'Invalid status: %', p_status;
  end if;

  if p_status in ('cancelled', 'returned') then
    update public.cards c
    set ownership = 'owned', availability = 'for_sale', sale_date = null
    from public.transaction_lines l
    where l.transaction_id = p_id and l.card_id = c.id and c.ownership = 'sold';
  end if;

  update public.transactions
  set status = p_status,
      refund_amount = case when p_refund is not null then p_refund else refund_amount end
  where id = p_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Aankoop vastleggen voor bestaande kaartregels (bv. eerst toegevoegd als "Incoming").
--    p = { occurred_on, channel, counterparty, amount, shipping_amount, fees_amount, status, notes,
--          received: bool, lines: [{ card_id, unit_amount }] }  (aantal = hele regel)
-- ---------------------------------------------------------------------------
create or replace function public.record_purchase(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  tx_id   uuid;
  ln      jsonb;
  c       public.cards%rowtype;
  unit    numeric(10, 2);
  bought  date := nullif(p->>'occurred_on', '')::date;
  chan    text := nullif(btrim(p->>'channel'), '');
  arrived boolean := coalesce((p->>'received')::boolean, false);
begin
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') = 0 then
    raise exception 'Choose at least one card.';
  end if;

  insert into public.transactions (kind, occurred_on, channel, counterparty, amount, shipping_amount,
                                   fees_amount, status, notes)
  values ('purchase', bought, chan, nullif(btrim(p->>'counterparty'), ''),
          nullif(p->>'amount', '')::numeric, nullif(p->>'shipping_amount', '')::numeric,
          nullif(p->>'fees_amount', '')::numeric, coalesce(nullif(p->>'status', ''), 'completed'),
          nullif(btrim(p->>'notes'), ''))
  returning id into tx_id;

  for ln in select value from jsonb_array_elements(p->'lines') loop
    unit := nullif(ln->>'unit_amount', '')::numeric;
    select * into c from public.cards where id = (ln->>'card_id')::uuid for update;
    if not found then
      raise exception 'Card not found.';
    end if;
    update public.cards
    set purchase_price = coalesce(unit, purchase_price),
        purchase_date = coalesce(bought, purchase_date),
        purchase_channel = coalesce(chan, purchase_channel),
        ownership = case when arrived and ownership = 'incoming' then 'owned' else ownership end
    where id = c.id;
    insert into public.transaction_lines (user_id, transaction_id, card_id, quantity, unit_amount)
    values (c.user_id, tx_id, c.id, c.quantity, unit);
  end loop;

  return tx_id;
end;
$$;

grant execute on function public.record_sale(jsonb) to authenticated;
grant execute on function public.set_sale_status(uuid, text, numeric) to authenticated;
grant execute on function public.record_purchase(jsonb) to authenticated;

commit;

-- Controle: aantal overgezette transacties per soort, en kaarten/stuks die erbij horen.
select t.kind, count(distinct t.id) as transacties, sum(l.quantity) as stuks,
       count(*) filter (where l.unit_amount is null) as regels_zonder_bedrag
from public.transactions t
join public.transaction_lines l on l.transaction_id = t.id
group by t.kind
order by t.kind;

-- ===========================================================================
-- Uit STAP6_doelen_wishlist.sql
-- ===========================================================================

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

-- ===========================================================================
-- Uit STAP7_waardering.sql
-- ===========================================================================

-- STAP 7: eigen waarderingen per kaart en persoonlijke instellingen (conditiecorrectie, verkoopkosten).
-- Pas draaien nadat STAP6 gelukt is.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Handmatige waardering per kaartregel (per stuk), naast de marktprijzen. Historie blijft bewaard.
-- ---------------------------------------------------------------------------
create table if not exists public.valuations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  card_id    uuid not null references public.cards (id) on delete cascade,
  -- Waarde per stuk in euro.
  amount     numeric(10, 2) not null check (amount >= 0),
  valued_on  date not null default current_date,
  note       text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists valuations_card_idx on public.valuations (card_id);
create index if not exists valuations_user_idx on public.valuations (user_id);

alter table public.valuations enable row level security;
drop policy if exists "valuations_own" on public.valuations;
create policy "valuations_own" on public.valuations
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 2. Persoonlijke instellingen (één rij per gebruiker). Leeg = niet ingesteld: dan geen schatting.
--    settings = { condition_pct: { "NM": 100, "EX": 85, ... }, sale_fee_pct: 5, sale_cost_per_sale: 1.5 }
-- ---------------------------------------------------------------------------
create table if not exists public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_settings_updated_at on public.user_settings;
create trigger user_settings_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

alter table public.user_settings enable row level security;
drop policy if exists "user_settings_own" on public.user_settings;
create policy "user_settings_own" on public.user_settings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;

select 'STAP7 klaar' as resultaat;

-- ===========================================================================
-- Uit STAP8_binders_scans.sql
-- ===========================================================================

-- STAP 8: geplande binderindeling en bewaarde scansessies. Pas draaien nadat STAP7 gelukt is.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Geplande indeling van een map: welk vakje voor welke kaart bedoeld is (ook als je hem nog niet hebt).
--    De werkelijke plek van een exemplaar staat los hiervan in cards.location_id/page/slot.
-- ---------------------------------------------------------------------------
create table if not exists public.binder_slots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  page        integer not null check (page between 1 and 999),
  slot        integer not null check (slot between 1 and 99),
  -- Gereserveerd voor deze cataloguskaart (bv. 'en/sv03.5-151'); null = alleen een omschrijving.
  tcgdex_id   text check (char_length(tcgdex_id) <= 50),
  label       text not null check (char_length(label) between 1 and 200),
  variant     text check (variant in ('normal', 'holo', 'reverse', 'firstEdition')),
  created_at  timestamptz not null default now(),
  unique (location_id, page, slot)
);

create index if not exists binder_slots_location_idx on public.binder_slots (location_id);

alter table public.binder_slots enable row level security;
drop policy if exists "binder_slots_own" on public.binder_slots;
create policy "binder_slots_own" on public.binder_slots
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Snel opzoeken van wat er werkelijk in een map zit.
create index if not exists cards_location_place_idx on public.cards (location_id, location_page, location_slot)
  where location_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Scansessies: tussentijds bewaard, zodat een onderbroken sessie verder kan.
-- ---------------------------------------------------------------------------
create table if not exists public.scan_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- Lijst met gescande kaarten: [{ name, set_code, card_number, tcgdex_id, variant, card_id, at }].
  items      jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scan_sessions_user_idx on public.scan_sessions (user_id, closed_at);

drop trigger if exists scan_sessions_updated_at on public.scan_sessions;
create trigger scan_sessions_updated_at before update on public.scan_sessions
  for each row execute function public.set_updated_at();

alter table public.scan_sessions enable row level security;
drop policy if exists "scan_sessions_own" on public.scan_sessions;
create policy "scan_sessions_own" on public.scan_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;

select 'STAP8 klaar' as resultaat;

-- ===========================================================================
-- Uit STAP10_wishlist_lijsten.sql
-- ===========================================================================

-- STAP 10: slimme lijsten in de wishlist (opgeslagen filters, bv. "Onder €10" of "Fire"). Pas draaien na STAP6.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan.

begin;

create table if not exists public.wishlist_lists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  -- Filters als JSON-object (variant, taal, zeldzaamheid, prijs …); de app controleert de inhoud bij het lezen.
  filters     jsonb not null default '{}'::jsonb
    check (jsonb_typeof(filters) = 'object' and octet_length(filters::text) <= 4000),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists wishlist_lists_user_idx on public.wishlist_lists (user_id);

drop trigger if exists wishlist_lists_updated_at on public.wishlist_lists;
create trigger wishlist_lists_updated_at before update on public.wishlist_lists
  for each row execute function public.set_updated_at();

alter table public.wishlist_lists enable row level security;
drop policy if exists "wishlist_lists_own" on public.wishlist_lists;
create policy "wishlist_lists_own" on public.wishlist_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;

select 'STAP10 klaar' as resultaat, (select count(*) from public.wishlist_lists) as lijsten;

-- ===========================================================================
-- Uit STAP11_crate_game.sql
-- ===========================================================================

-- STAP 11: Crate-game. Crate points verdienen met je echte collectie en er virtuele pakjes mee openen.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan. Raakt je echte kaarten niet aan.
--
-- Beveiliging: je kunt deze tabellen alleen LEZEN. Punten en virtuele kaarten veranderen uitsluitend via de
-- functies hieronder, die de regels afdwingen (elke kaart/transactie telt één keer, nooit onder 0 punten).

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.crate_wallet (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  points          integer not null default 0 check (points >= 0),
  last_daily      date,
  last_free_pack  date,
  updated_at      timestamptz not null default now()
);

create table if not exists public.crate_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade')),
  -- Waar de punten bij horen (kaart-id, transactie-id, Pokédex-nummer, set, datum …); uniek per soort.
  ref         text not null check (char_length(ref) between 1 and 80),
  points      integer not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists crate_ledger_user_idx on public.crate_ledger (user_id, created_at desc);

create table if not exists public.crate_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tcgdex_id   text not null check (char_length(tcgdex_id) between 3 and 50),
  name        text not null check (char_length(name) between 1 and 200),
  image       text check (char_length(image) <= 300),
  rarity      text check (char_length(rarity) <= 60),
  set_name    text check (char_length(set_name) <= 100),
  quantity    integer not null default 1 check (quantity between 1 and 9999),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  unique (user_id, tcgdex_id)
);

alter table public.crate_wallet enable row level security;
alter table public.crate_ledger enable row level security;
alter table public.crate_cards enable row level security;

-- Alleen lezen (eigen rijen); schrijven gaat via de functies.
drop policy if exists "crate_wallet_read" on public.crate_wallet;
create policy "crate_wallet_read" on public.crate_wallet for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "crate_ledger_read" on public.crate_ledger;
create policy "crate_ledger_read" on public.crate_ledger for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "crate_cards_read" on public.crate_cards;
create policy "crate_cards_read" on public.crate_cards for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.crate_wallet, public.crate_ledger, public.crate_cards from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hulpfunctie: punten boeken (eenmalig per soort + ref). Geeft de geboekte punten terug (0 = al geboekt).
-- ---------------------------------------------------------------------------
create or replace function public.crate_book(p_user uuid, p_kind text, p_ref text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  booked integer;
begin
  insert into public.crate_ledger (user_id, kind, ref, points)
  values (p_user, p_kind, p_ref, p_points)
  on conflict (user_id, kind, ref) do nothing
  returning points into booked;
  if booked is null then
    return 0;
  end if;
  update public.crate_wallet set points = points + booked, updated_at = now() where user_id = p_user;
  return booked;
end;
$$;

revoke execute on function public.crate_book(uuid, text, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bijwerken: punten voor kaarten, verkopen, aankopen, nieuwe Pokédex-soorten en de dagbonus.
--    p_bonus: {"<kaart-id>": 0-20} extra voor zeldzaamheid; p_dex: Pokédex-nummers die je hebt.
-- ---------------------------------------------------------------------------
create or replace function public.crate_sync(p_bonus jsonb default '{}'::jsonb, p_dex integer[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  earned integer := 0;
  r record;
  d integer;
  bonus integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;

  -- Elke kaart in bezit: 10 punten + bonus (max. 20), één keer per kaart.
  for r in select id from public.cards where user_id = me and status <> 'sold' loop
    bonus := least(20, greatest(0, coalesce((p_bonus ->> r.id::text)::integer, 0)));
    earned := earned + public.crate_book(me, 'card', r.id::text, 10 + bonus);
  end loop;

  -- Vastgelegde verkopen (15) en aankopen (5), niet geannuleerd.
  if to_regclass('public.transactions') is not null then
    for r in execute 'select id, kind from public.transactions where user_id = $1 and kind in (''sale'', ''purchase'') and status <> ''cancelled''' using me loop
      earned := earned + public.crate_book(me, r.kind, r.id::text, case when r.kind = 'sale' then 15 else 5 end);
    end loop;
  end if;

  -- Nieuwe Pokédex-soorten: 25 per soort (1-1025), één keer.
  foreach d in array coalesce(p_dex, '{}') loop
    if d between 1 and 1025 then
      earned := earned + public.crate_book(me, 'dex', d::text, 25);
    end if;
  end loop;

  -- Dagbonus: 50 punten, één keer per dag.
  earned := earned + public.crate_book(me, 'daily', current_date::text, 50);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'earned', earned,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Set compleet: 250 punten, één keer per set.
-- ---------------------------------------------------------------------------
create or replace function public.crate_set_complete(p_set text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_set is null or p_set !~ '^[a-z-]{2,5}/[A-Za-z0-9.+-]{1,40}$' then
    raise exception 'Invalid set';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  return public.crate_book(me, 'set', p_set, 250);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Pakje openen: 100 punten (of gratis, één keer per dag). p_cards: 1-10 kaarten
--    [{"tcgdex_id","name","image","rarity","set_name"}].
-- ---------------------------------------------------------------------------
create or replace function public.crate_open_pack(p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  w public.crate_wallet;
  cost integer;
  free boolean;
  c jsonb;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = me for update;
  free := w.last_free_pack is null or w.last_free_pack < current_date;
  cost := case when free then 0 else 100 end;
  if w.points < cost then
    raise exception 'Not enough Crate points';
  end if;

  for c in select * from jsonb_array_elements(p_cards) loop
    if coalesce(c ->> 'tcgdex_id', '') !~ '^[a-z-]{2,5}/.{1,44}$' or coalesce(c ->> 'name', '') = '' then
      raise exception 'Invalid card in pack';
    end if;
    insert into public.crate_cards (user_id, tcgdex_id, name, image, rarity, set_name)
    values (
      me,
      c ->> 'tcgdex_id',
      left(c ->> 'name', 200),
      left(nullif(c ->> 'image', ''), 300),
      left(nullif(c ->> 'rarity', ''), 60),
      left(nullif(c ->> 'set_name', ''), 100)
    )
    on conflict (user_id, tcgdex_id) do update set quantity = least(9999, public.crate_cards.quantity + 1), last_at = now();
  end loop;

  update public.crate_wallet
  set points = points - cost,
      last_free_pack = case when free then current_date else last_free_pack end,
      updated_at = now()
  where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'pack', gen_random_uuid()::text, -cost);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'free_pack', false, 'cost', cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Dubbelen inruilen: per extra exemplaar punten naar zeldzaamheid; er blijft er altijd één over.
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade(p_tcgdex_id text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec_card public.crate_cards;
  per_copy integer;
  gained integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into rec_card from public.crate_cards where user_id = me and tcgdex_id = p_tcgdex_id for update;
  if rec_card.id is null then
    raise exception 'Card not found';
  end if;
  if p_count is null or p_count < 1 or p_count > rec_card.quantity - 1 then
    raise exception 'You can trade in at most % copies', greatest(0, rec_card.quantity - 1);
  end if;
  per_copy := case
    when lower(coalesce(rec_card.rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(rec_card.rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(rec_card.rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(rec_card.rarity, '')) like '%rare%' then 5
    when lower(coalesce(rec_card.rarity, '')) = 'uncommon' then 3
    else 2
  end;
  gained := per_copy * p_count;
  update public.crate_cards set quantity = quantity - p_count where id = rec_card.id;
  update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

-- Alleen ingelogde gebruikers mogen de functies aanroepen.
revoke execute on function public.crate_sync(jsonb, integer[]) from public, anon;
revoke execute on function public.crate_set_complete(text) from public, anon;
revoke execute on function public.crate_open_pack(jsonb) from public, anon;
revoke execute on function public.crate_trade(text, integer) from public, anon;
grant execute on function public.crate_sync(jsonb, integer[]) to authenticated;
grant execute on function public.crate_set_complete(text) to authenticated;
grant execute on function public.crate_open_pack(jsonb) to authenticated;
grant execute on function public.crate_trade(text, integer) to authenticated;

commit;

select 'STAP11 klaar' as resultaat,
       to_regclass('public.crate_wallet') is not null as wallet,
       to_regclass('public.crate_cards') is not null as cards;

-- ===========================================================================
-- Uit STAP12_crate_pakjes.sql
-- ===========================================================================

-- STAP 12: Crate-game uitbreiding. Drie soorten pakjes (Booster, Great, Master) en "alle dubbelen inruilen".
-- Vereist STAP11. Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, opnieuw draaien kan. Raakt je echte kaarten niet aan; alleen de Crate-functies.
--
-- Let op: de oude functie crate_open_pack(jsonb) wordt vervangen door crate_open_pack(jsonb, text)
-- (in dezelfde transactie, dus er is geen moment zonder). Je Crate-punten en -kaarten blijven staan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Inruilwaarde per extra exemplaar (gedeeld door crate_trade en crate_trade_all).
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade_value(p_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(p_rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(p_rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(p_rarity, '')) like '%rare%' then 5
    when lower(coalesce(p_rarity, '')) = 'uncommon' then 3
    else 2
  end;
$$;

revoke execute on function public.crate_trade_value(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pakje openen per soort: booster 100 (één keer per dag gratis), great 300, master 1000.
--    p_cards: 1-10 kaarten [{"tcgdex_id","name","image","rarity","set_name"}].
-- ---------------------------------------------------------------------------
drop function if exists public.crate_open_pack(jsonb);

create or replace function public.crate_open_pack(p_cards jsonb, p_pack text default 'booster')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  w public.crate_wallet;
  cost integer;
  free boolean;
  c jsonb;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_pack is null or p_pack not in ('booster', 'great', 'master') then
    raise exception 'Unknown pack';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = me for update;
  -- Alleen de gewone booster is één keer per dag gratis.
  free := p_pack = 'booster' and (w.last_free_pack is null or w.last_free_pack < current_date);
  cost := case when free then 0 when p_pack = 'great' then 300 when p_pack = 'master' then 1000 else 100 end;
  if w.points < cost then
    raise exception 'Not enough Crate points';
  end if;

  for c in select * from jsonb_array_elements(p_cards) loop
    if coalesce(c ->> 'tcgdex_id', '') !~ '^[a-z-]{2,5}/.{1,44}$' or coalesce(c ->> 'name', '') = '' then
      raise exception 'Invalid card in pack';
    end if;
    insert into public.crate_cards (user_id, tcgdex_id, name, image, rarity, set_name)
    values (
      me,
      c ->> 'tcgdex_id',
      left(c ->> 'name', 200),
      left(nullif(c ->> 'image', ''), 300),
      left(nullif(c ->> 'rarity', ''), 60),
      left(nullif(c ->> 'set_name', ''), 100)
    )
    on conflict (user_id, tcgdex_id) do update set quantity = least(9999, public.crate_cards.quantity + 1), last_at = now();
  end loop;

  update public.crate_wallet
  set points = points - cost,
      last_free_pack = case when free then current_date else last_free_pack end,
      updated_at = now()
  where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'pack', gen_random_uuid()::text, -cost);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date,
    'cost', cost
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Eén kaart inruilen (zelfde regels als STAP11, nu met de gedeelde waardefunctie).
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade(p_tcgdex_id text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec_card public.crate_cards;
  gained integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into rec_card from public.crate_cards where user_id = me and tcgdex_id = p_tcgdex_id for update;
  if rec_card.id is null then
    raise exception 'Card not found';
  end if;
  if p_count is null or p_count < 1 or p_count > rec_card.quantity - 1 then
    raise exception 'You can trade in at most % copies', greatest(0, rec_card.quantity - 1);
  end if;
  gained := public.crate_trade_value(rec_card.rarity) * p_count;
  update public.crate_cards set quantity = quantity - p_count where id = rec_card.id;
  update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Alle dubbelen in één keer inruilen; van elke kaart blijft er één over.
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade_all()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec_card public.crate_cards;
  gained integer := 0;
  copies integer := 0;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  for rec_card in select * from public.crate_cards where user_id = me and quantity > 1 for update loop
    gained := gained + public.crate_trade_value(rec_card.rarity) * (rec_card.quantity - 1);
    copies := copies + rec_card.quantity - 1;
    update public.crate_cards set quantity = 1 where id = rec_card.id;
  end loop;
  if gained > 0 then
    update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
    insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  end if;
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', coalesce(w.points, 0), 'gained', gained, 'copies', copies);
end;
$$;

-- Alleen ingelogde gebruikers mogen de functies aanroepen.
revoke execute on function public.crate_open_pack(jsonb, text) from public, anon;
revoke execute on function public.crate_trade(text, integer) from public, anon;
revoke execute on function public.crate_trade_all() from public, anon;
grant execute on function public.crate_open_pack(jsonb, text) to authenticated;
grant execute on function public.crate_trade(text, integer) to authenticated;
grant execute on function public.crate_trade_all() to authenticated;

commit;

-- PostgREST de nieuwe functies laten zien.
notify pgrst, 'reload schema';

select 'STAP12 klaar' as resultaat,
       to_regprocedure('public.crate_open_pack(jsonb, text)') is not null as pakjes,
       to_regprocedure('public.crate_trade_all()') is not null as alles_inruilen;

-- ===========================================================================
-- Uit STAP13_crate_wens.sql
-- ===========================================================================

-- STAP 13: Wens bij een vallende ster. Tik op een vallende ster in de achtergrond: één keer per dag +5 Crate points.
-- Vereist STAP11. Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, opnieuw draaien kan. Raakt je echte kaarten niet aan.

begin;

-- 1. Nieuwe soort boeking 'wish' toestaan (de lijst met soorten staat als controle op crate_ledger).
alter table public.crate_ledger drop constraint if exists crate_ledger_kind_check;
alter table public.crate_ledger
  add constraint crate_ledger_kind_check
  check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade', 'wish'));

-- 2. Wens doen: +5 punten, één keer per dag (via crate_book: elke dag telt één keer).
create or replace function public.crate_wish()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  gained integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  gained := public.crate_book(me, 'wish', current_date::text, 5);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

revoke execute on function public.crate_wish() from public, anon;
grant execute on function public.crate_wish() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP13 klaar' as resultaat,
       to_regprocedure('public.crate_wish()') is not null as wens;

-- ===========================================================================
-- Uit STAP14_account_reset.sql
-- ===========================================================================

-- STAP 14: Account resetten. Settings → Account and data → Reset account wist al JOUW gegevens in één keer.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Dit bestand zelf wist niets: het maakt alleen de functie aan. Opnieuw draaien kan.
--
-- De functie wist alleen rijen van de ingelogde gebruiker (auth.uid()). Je login blijft bestaan,
-- en de gedeelde prijsgeschiedenis per kaart (price_snapshots) wordt niet aangeraakt.
-- Foto's en bonnetjes in de opslag verwijdert de app zelf (via de Storage-API).

begin;

create or replace function public.reset_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text;
  n integer;
  result jsonb := '{}'::jsonb;
  -- Volgorde: eerst wat naar andere tabellen verwijst. Tabellen die (nog) niet bestaan worden overgeslagen.
  tables text[] := array[
    'transaction_documents', 'transaction_lines', 'transactions',
    'card_photos', 'valuations', 'binder_slots', 'cards', 'locations',
    'wishlist_items', 'wishlist_lists', 'collection_goals',
    'scan_sessions', 'import_batches', 'user_settings',
    'crate_cards', 'crate_ledger', 'crate_wallet',
    'sales', 'purchases'
  ];
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null and exists (
      select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'user_id'
    ) then
      execute format('delete from public.%I where user_id = $1', t) using me;
      get diagnostics n = row_count;
      result := result || jsonb_build_object(t, n);
    end if;
  end loop;
  return result;
end;
$$;

revoke execute on function public.reset_my_account() from public, anon;
grant execute on function public.reset_my_account() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP14 klaar' as resultaat,
       to_regprocedure('public.reset_my_account()') is not null as reset;

-- ===========================================================================
-- Uit STAP15_scanlimiet.sql
-- ===========================================================================

-- STAP 15: limiet op scans (kosten van de herkenning begrenzen). Per gebruiker hoogstens 40 foto's per minuut
-- en 500 per 24 uur. De Edge Function recognize-card vraagt per foto eerst toestemming aan scan_quota_take().
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan. Raakt je kaarten niet aan.
-- Limieten aanpassen: de twee getallen in scan_quota_take() wijzigen en dit bestand opnieuw draaien.

begin;

-- Eén rij per toegestane scan; ouder dan een dag wordt opgeruimd. Niet bereikbaar voor de app (RLS aan, geen policies).
create table if not exists public.scan_calls (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);

create index if not exists scan_calls_user_at_idx on public.scan_calls (user_id, at);

alter table public.scan_calls enable row level security;
revoke all on public.scan_calls from anon, authenticated;

-- Toestemming voor één scan: { ok: true, left_today } of { ok: false, reason: 'minute' | 'day', retry_after (seconden) }.
create or replace function public.scan_quota_take()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  per_minute constant integer := 40;
  per_day constant integer := 500;
  n_minute integer;
  n_day integer;
  oldest timestamptz;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  -- Gelijktijdige scans van dezelfde gebruiker na elkaar tellen (snel scannen stuurt er 3 tegelijk).
  perform pg_advisory_xact_lock(hashtextextended('scan_quota:' || me::text, 0));
  delete from public.scan_calls where user_id = me and at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 minute'), count(*), min(at)
    into n_minute, n_day, oldest
    from public.scan_calls where user_id = me;
  if n_minute >= per_minute then
    return jsonb_build_object('ok', false, 'reason', 'minute', 'retry_after', 60);
  end if;
  if n_day >= per_day then
    return jsonb_build_object('ok', false, 'reason', 'day',
      'retry_after', greatest(60, ceil(extract(epoch from (oldest + interval '1 day' - now()))))::integer);
  end if;
  insert into public.scan_calls (user_id) values (me);
  return jsonb_build_object('ok', true, 'left_today', per_day - n_day - 1);
end;
$$;

revoke execute on function public.scan_quota_take() from public, anon;
grant execute on function public.scan_quota_take() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP15 klaar' as resultaat,
       to_regprocedure('public.scan_quota_take()') is not null as limiet,
       has_function_privilege('anon', 'public.scan_quota_take()', 'execute') as anon_mag;

-- ===========================================================================
-- Uit STAP16_foutlog.sql
-- ===========================================================================

-- STAP 16: foutlogboek. Als de app op een telefoon crasht, komt de fout hier terecht (alleen je eigen fouten),
-- zodat je hem kunt terugzien zonder screenshots: Supabase → Table Editor → app_errors.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan. Raakt je kaarten niet aan.

begin;

create table if not exists public.app_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  message    text not null check (char_length(message) between 1 and 500),
  stack      text check (char_length(stack) <= 4000),
  -- Waar het gebeurde: pagina (#/collection) en soort (render, error, promise).
  context    text check (char_length(context) <= 200),
  app_build  text check (char_length(app_build) <= 40),
  user_agent text check (char_length(user_agent) <= 300)
);

create index if not exists app_errors_user_idx on public.app_errors (user_id, created_at desc);

alter table public.app_errors enable row level security;

-- Alleen eigen fouten toevoegen en lezen; niet wijzigen. Wissen gaat via "Reset account".
drop policy if exists "app_errors_insert_own" on public.app_errors;
create policy "app_errors_insert_own" on public.app_errors
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "app_errors_select_own" on public.app_errors;
create policy "app_errors_select_own" on public.app_errors
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke all on public.app_errors from anon;
grant select, insert on public.app_errors to authenticated;

-- "Reset account" (STAP14) wist voortaan ook het foutlogboek: zelfde functie, app_errors erbij in de lijst.
create or replace function public.reset_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text;
  n integer;
  result jsonb := '{}'::jsonb;
  -- Volgorde: eerst wat naar andere tabellen verwijst. Tabellen die (nog) niet bestaan worden overgeslagen.
  tables text[] := array[
    'transaction_documents', 'transaction_lines', 'transactions',
    'card_photos', 'valuations', 'binder_slots', 'cards', 'locations',
    'wishlist_items', 'wishlist_lists', 'collection_goals',
    'scan_sessions', 'import_batches', 'user_settings',
    'crate_cards', 'crate_ledger', 'crate_wallet',
    'app_errors',
    'sales', 'purchases'
  ];
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null and exists (
      select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'user_id'
    ) then
      execute format('delete from public.%I where user_id = $1', t) using me;
      get diagnostics n = row_count;
      result := result || jsonb_build_object(t, n);
    end if;
  end loop;
  return result;
end;
$$;

revoke execute on function public.reset_my_account() from public, anon;
grant execute on function public.reset_my_account() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP16 klaar' as resultaat,
       to_regclass('public.app_errors') is not null as foutlog,
       has_table_privilege('anon', 'public.app_errors', 'insert') as anon_mag;

select 'schema klaar' as resultaat;
