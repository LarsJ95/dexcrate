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
