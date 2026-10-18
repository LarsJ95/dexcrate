-- STAP17 (18-10-2026): eigen wishlist-lijsten waar je zelf wensen in zet, naast de slimme lijsten (filters, STAP10).
-- Veilig om opnieuw te draaien. Wist niets.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run. Verwacht: "STAP17 klaar", eigen_lijsten = true, anon_mag = false.

begin;

-- Soort lijst: 'smart' (filters) of 'manual' (zelf gekozen wensen). Bestaande lijsten blijven slim.
alter table public.wishlist_lists
  add column if not exists kind text not null default 'smart';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wishlist_lists_kind_check') then
    alter table public.wishlist_lists add constraint wishlist_lists_kind_check check (kind in ('smart', 'manual'));
  end if;
end $$;

-- Welke wens in welke eigen lijst staat. Weg met de lijst of de wens: koppeling ook weg.
create table if not exists public.wishlist_list_items (
  list_id     uuid not null references public.wishlist_lists (id) on delete cascade,
  item_id     uuid not null references public.wishlist_items (id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (list_id, item_id)
);

create index if not exists wishlist_list_items_user_idx on public.wishlist_list_items (user_id);
create index if not exists wishlist_list_items_item_idx on public.wishlist_list_items (item_id);

alter table public.wishlist_list_items enable row level security;
drop policy if exists "wishlist_list_items_own" on public.wishlist_list_items;
-- Alleen je eigen koppelingen, en alleen tussen je eigen lijst en je eigen wens.
create policy "wishlist_list_items_own" on public.wishlist_list_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.wishlist_lists l where l.id = list_id and l.user_id = (select auth.uid()))
    and exists (select 1 from public.wishlist_items i where i.id = item_id and i.user_id = (select auth.uid()))
  );

revoke all on public.wishlist_list_items from anon;

commit;

notify pgrst, 'reload schema';

select 'STAP17 klaar' as resultaat,
       to_regclass('public.wishlist_list_items') is not null as eigen_lijsten,
       has_table_privilege('anon', 'public.wishlist_list_items', 'select') as anon_mag;
