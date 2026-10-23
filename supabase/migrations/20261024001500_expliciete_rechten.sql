-- STAP25 (24-10-2026): rechten op tabellen expliciet zetten.
-- Supabase geeft nieuwe tabellen in "public" geen automatische rechten meer (nieuwe projecten sinds 30-05-2026,
-- bestaande vanaf 30-10-2026). Zonder rechten geeft de app "permission denied", ook met goede RLS.
-- Herkenning: onder de oude standaard heeft service_role op elke tabel select/insert/update/delete (nergens
-- weggehaald). Alleen de tabellen hieronder waar dat ontbreekt, krijgen de rechten die productie heeft (de oude
-- standaard, min wat eerdere migraties weghaalden). Op productie verandert dus niets; op een nieuw project
-- (testdatabase, db reset) krijgt alles dezelfde rechten als productie. Latere tabellen raakt dit bestand nooit:
-- die krijgen hun rechten in de migratie die de tabel maakt.
-- Veilig om opnieuw te draaien. Wist niets.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP25 klaar", zonder_rechten = 0, anon_mag = false.

begin;

do $$
declare
  r record;
begin
  -- Rechten voor anon en authenticated: null = select, insert, update, delete; '' = niets. service_role: altijd alle vier.
  for r in
    select c.oid::regclass as tab,
           coalesce(s.anon, 'select, insert, update, delete') as anon,
           coalesce(s.auth, 'select, insert, update, delete') as auth
      from (values
        ('admin_actions', '', ''),
        ('admins', '', ''),
        ('announcements', '', 'select'),
        ('app_errors', '', null),
        ('binder_slots', null, null),
        ('card_facts', '', ''),
        ('card_photos', null, null),
        ('cards', null, null),
        ('collection_goals', null, null),
        ('crate_cards', 'select', 'select'),
        ('crate_config', '', ''),
        ('crate_ledger', 'select', 'select'),
        ('crate_wallet', 'select', 'select'),
        ('import_batches', null, null),
        ('locations', null, null),
        ('price_requests', null, null),
        ('price_snapshots', null, null),
        ('scan_calls', '', ''),
        ('scan_choices', '', null),
        ('scan_daily', '', ''),
        ('scan_limits', '', ''),
        ('scan_sessions', null, null),
        ('set_facts', '', ''),
        ('transaction_documents', null, null),
        ('transaction_lines', null, null),
        ('transactions', null, null),
        ('user_settings', null, null),
        ('valuations', null, null),
        ('wishlist_items', null, null),
        ('wishlist_list_items', '', null),
        ('wishlist_lists', null, null)
      ) s (name, anon, auth)
      join pg_class c on c.relname = s.name and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     where not (has_table_privilege('service_role', c.oid, 'select') and has_table_privilege('service_role', c.oid, 'insert')
                and has_table_privilege('service_role', c.oid, 'update') and has_table_privilege('service_role', c.oid, 'delete'))
  loop
    execute format('grant select, insert, update, delete on %s to service_role', r.tab);
    if r.anon <> '' then execute format('grant %s on %s to anon', r.anon, r.tab); end if;
    if r.auth <> '' then execute format('grant %s on %s to authenticated', r.auth, r.tab); end if;
  end loop;

  -- Reeksen van de identity-kolommen: de oude standaard gaf ze aan alle drie.
  for r in
    select c.oid::regclass as seq
      from pg_class c
     where c.relnamespace = 'public'::regnamespace
       and c.relkind = 'S'
       and c.relname in ('app_errors_id_seq', 'scan_calls_id_seq')
       and case when c.relkind = 'S' then not has_sequence_privilege('service_role', c.oid, 'usage') else false end
  loop
    execute format('grant usage, select on sequence %s to anon, authenticated, service_role', r.seq);
  end loop;
end $$;

commit;

notify pgrst, 'reload schema';

select 'STAP25 klaar' as resultaat,
       (select count(*)
          from pg_class c
         where c.relnamespace = 'public'::regnamespace
           and c.relkind = 'r'
           and not (has_table_privilege('service_role', c.oid, 'select') and has_table_privilege('service_role', c.oid, 'insert')
                    and has_table_privilege('service_role', c.oid, 'update') and has_table_privilege('service_role', c.oid, 'delete'))
       ) as zonder_rechten,
       has_table_privilege('anon', 'public.admins', 'select') as anon_mag;
