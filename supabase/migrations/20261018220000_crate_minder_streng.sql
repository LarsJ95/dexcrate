-- STAP19 (18-10-2026): Crate minder streng (keuze gebruiker na simulatie): dagbonus 100 → 150 en Set pack 200 → 150.
-- De dagbonus komt nu ook uit crate_rules(), zodat een volgende aanpassing alleen daar hoeft.
-- Vereist STAP18. Veilig om opnieuw te draaien. Wist niets; je punten en Crate-kaarten blijven staan.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP19 klaar", dagbonus = 150, set_pack = 150.

begin;

-- 1. De regels: alleen dagbonus en Set pack veranderen.
create or replace function public.crate_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', 150,
    'trade_factor', 2,
    'crate_set', 500,
    'packs', jsonb_build_object('booster', 100, 'great', 300, 'master', 1000, 'set', 150, 'type', 300)
  );
$$;

-- 2. Bijwerken: zelfde als STAP18, de dagbonus uit de regels.
create or replace function public.crate_sync(p_bonus jsonb default '{}'::jsonb, p_dex integer[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  earned integer := 0;
  r record;
  d integer;
  bonus integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;

  -- Elke kaart in bezit: 10 punten + bonus (max. 20), één keer per kaart.
  for r in select id from public.cards where user_id = me and status <> 'sold' loop
    bonus := least(20, greatest(0, coalesce((p_bonus ->> r.id::text)::integer, 0)));
    earned := earned + public.crate_book(me, 'card', r.id::text, 10 + bonus);
  end loop;

  -- Vastgelegde verkopen (15) en aankopen (5), niet geannuleerd.
  if to_regclass('public.transactions') is not null then
    for r in execute 'select id, kind from public.transactions where user_id = $1 and kind in (''sale'', ''purchase'') and status <> ''cancelled''' using me loop
      earned := earned + public.crate_book(me, r.kind, r.id::text, case when r.kind = 'sale' then 15 else 5 end);
    end loop;
  end if;

  -- Nieuwe Pokédex-soorten: 25 per soort (1-1025), één keer.
  foreach d in array coalesce(p_dex, '{}') loop
    if d between 1 and 1025 then
      earned := earned + public.crate_book(me, 'dex', d::text, 25);
    end if;
  end loop;

  -- Dagbonus volgens de regels (STAP19: 150), één keer per dag.
  earned := earned + public.crate_book(me, 'daily', current_date::text, (public.crate_rules() ->> 'daily')::integer);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'earned', earned,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date
  );
end;
$$;

revoke execute on function public.crate_rules() from public, anon;
revoke execute on function public.crate_sync(jsonb, integer[]) from public, anon;
grant execute on function public.crate_rules() to authenticated;
grant execute on function public.crate_sync(jsonb, integer[]) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP19 klaar' as resultaat,
       (public.crate_rules() ->> 'daily')::integer as dagbonus,
       (public.crate_rules() -> 'packs' ->> 'set')::integer as set_pack;
