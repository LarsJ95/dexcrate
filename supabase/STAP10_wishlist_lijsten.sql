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
