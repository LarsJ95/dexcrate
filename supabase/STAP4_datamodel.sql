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
  path        text not null check (char_length(path) between 1 and 300),
  -- Kleine versie voor overzichten.
  thumb_path  text check (char_length(thumb_path) <= 300),
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
