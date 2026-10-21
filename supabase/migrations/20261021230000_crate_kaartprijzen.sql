-- STAP24 (21-10-2026): ontbrekende kaart kopen 3× zo duur (op verzoek: sets werden te makkelijk compleet).
-- common 120 · uncommon 180 · rare 300 · Double/Ultra 600 · Illustration 900 · SIR/Hyper/secret 1800.
-- Past alleen de prijzen aan als ze nog de startwaarden van STAP22 zijn; heb je ze via Admin → Crate rules al
-- veranderd, dan blijven die staan. Vereist STAP22. Veilig om opnieuw te draaien. Wist niets.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP24 klaar", common = 120, special = 1800.

begin;

update public.crate_config
   set rules = jsonb_set(rules, '{craft}', '{"common": 120, "uncommon": 180, "rare": 300, "double": 600, "illustration": 900, "special": 1800}'::jsonb),
       updated_at = now()
 where id
   and rules -> 'craft' = '{"common": 40, "uncommon": 60, "rare": 100, "double": 200, "illustration": 300, "special": 600}'::jsonb;

-- Startwaarden als er (nog) geen rij is: ook de nieuwe prijzen.
create or replace function public.crate_rules()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select rules from public.crate_config where id),
    jsonb_build_object(
      'daily', 150, 'trade_factor', 2, 'crate_set', 500,
      'packs', jsonb_build_object('booster', 100, 'great', 200, 'master', 1000, 'set', 150, 'type', 300),
      'craft', jsonb_build_object('common', 120, 'uncommon', 180, 'rare', 300, 'double', 600, 'illustration', 900, 'special', 1800)
    )
  );
$$;

revoke execute on function public.crate_rules() from public, anon;
grant execute on function public.crate_rules() to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

select 'STAP24 klaar' as resultaat,
       (public.crate_rules() -> 'craft' ->> 'common')::integer as common,
       (public.crate_rules() -> 'craft' ->> 'special')::integer as special;
