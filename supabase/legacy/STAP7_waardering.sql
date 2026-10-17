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
