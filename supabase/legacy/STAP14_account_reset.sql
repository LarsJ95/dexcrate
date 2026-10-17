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
