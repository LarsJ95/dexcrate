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
