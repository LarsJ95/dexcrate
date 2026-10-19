-- STAP20 (19-10-2026): scan-keuzes onthouden. Kies je bij een scan een andere kaart dan de app voorstelde, dan
-- onthoudt de app dat voor dezelfde lezing (taal, setcode, nummer, naam) en stelt die kaart de volgende keer voor,
-- op al je apparaten. Ook: Reset account wist deze keuzes (reset_my_account opnieuw, nu met scan_choices).
-- Veilig om opnieuw te draaien. Wist niets.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP20 klaar", keuzes = true, reset = true, anon_mag = false.

begin;

-- Eén rij per lezing ("zh-cn|CSMC|4|dedenne") met de kaart die je toen koos ("zh-cn/CSMC-004").
create table if not exists public.scan_choices (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  read_key    text not null check (char_length(read_key) between 3 and 300),
  card_key    text not null check (char_length(card_key) between 3 and 200),
  updated_at  timestamptz not null default now(),
  primary key (user_id, read_key)
);

alter table public.scan_choices enable row level security;
drop policy if exists "scan_choices_own" on public.scan_choices;
-- Alleen je eigen keuzes lezen en schrijven.
create policy "scan_choices_own" on public.scan_choices
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.scan_choices from anon;

-- Reset account: zelfde als STAP16, plus scan_choices.
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
    'app_errors', 'scan_choices',
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

select 'STAP20 klaar' as resultaat,
       to_regclass('public.scan_choices') is not null as keuzes,
       to_regprocedure('public.reset_my_account()') is not null as reset,
       has_table_privilege('anon', 'public.scan_choices', 'select') as anon_mag;
