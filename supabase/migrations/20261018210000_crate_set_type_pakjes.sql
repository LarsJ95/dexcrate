-- STAP18 (18-10-2026): Crate-game uitbreiding. Set pack (200) en Type pack (300), +500 voor een complete set in je
-- Crate, dagbonus 50 → 100 en dubbelen inruilen levert twee keer zoveel op. De app leest de regels via crate_rules().
-- Vereist STAP11-13. Veilig om opnieuw te draaien. Wist niets; je punten en Crate-kaarten blijven staan.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP18 klaar", regels = true, set_compleet = true, anon_mag = false.

begin;

-- 1. Nieuwe soort boeking 'crateset' (complete set in de Crate; 'set' is je echte collectie).
alter table public.crate_ledger drop constraint if exists crate_ledger_kind_check;
alter table public.crate_ledger
  add constraint crate_ledger_kind_check
  check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade', 'wish', 'crateset'));

-- 2. De regels op één plek; de app toont kosten en opbrengsten hieruit.
create or replace function public.crate_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'daily', 100,
    'trade_factor', 2,
    'crate_set', 500,
    'packs', jsonb_build_object('booster', 100, 'great', 300, 'master', 1000, 'set', 200, 'type', 300)
  );
$$;

-- 3. Inruilwaarde per extra exemplaar: twee keer de oude waarde (4 tot 60).
create or replace function public.crate_trade_value(p_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2 * case
    when lower(coalesce(p_rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(p_rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(p_rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(p_rarity, '')) like '%rare%' then 5
    when lower(coalesce(p_rarity, '')) = 'uncommon' then 3
    else 2
  end;
$$;

revoke execute on function public.crate_trade_value(text) from public, anon, authenticated;

-- 4. Bijwerken: zelfde als STAP11, alleen de dagbonus is nu 100.
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

  -- Dagbonus: 100 punten, één keer per dag.
  earned := earned + public.crate_book(me, 'daily', current_date::text, 100);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'earned', earned,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date
  );
end;
$$;

-- 5. Pakje openen: nu ook 'set' (200) en 'type' (300). Alleen de gewone booster is één keer per dag gratis.
create or replace function public.crate_open_pack(p_cards jsonb, p_pack text default 'booster')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  w public.crate_wallet;
  cost integer;
  free boolean;
  c jsonb;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_pack is null or p_pack not in ('booster', 'great', 'master', 'set', 'type') then
    raise exception 'Unknown pack';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = me for update;
  free := p_pack = 'booster' and (w.last_free_pack is null or w.last_free_pack < current_date);
  cost := case when free then 0 else (public.crate_rules() -> 'packs' ->> p_pack)::integer end;
  if w.points < cost then
    raise exception 'Not enough Crate points';
  end if;

  for c in select * from jsonb_array_elements(p_cards) loop
    if coalesce(c ->> 'tcgdex_id', '') !~ '^[a-z-]{2,5}/.{1,44}$' or coalesce(c ->> 'name', '') = '' then
      raise exception 'Invalid card in pack';
    end if;
    insert into public.crate_cards (user_id, tcgdex_id, name, image, rarity, set_name)
    values (
      me,
      c ->> 'tcgdex_id',
      left(c ->> 'name', 200),
      left(nullif(c ->> 'image', ''), 300),
      left(nullif(c ->> 'rarity', ''), 60),
      left(nullif(c ->> 'set_name', ''), 100)
    )
    on conflict (user_id, tcgdex_id) do update set quantity = least(9999, public.crate_cards.quantity + 1), last_at = now();
  end loop;

  update public.crate_wallet
  set points = points - cost,
      last_free_pack = case when free then current_date else last_free_pack end,
      updated_at = now()
  where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'pack', gen_random_uuid()::text, -cost);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date,
    'cost', cost
  );
end;
$$;

-- 6. Complete set in je Crate: alle nummers 1..p_total (de officiële telling) minstens één keer. +500, één keer per set.
--    p_set: "en/sv03.5". Geeft de geboekte punten terug (0 = nog niet compleet of al gekregen).
create or replace function public.crate_set_done(p_set text, p_total integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  have integer;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if coalesce(p_set, '') !~ '^[a-z-]{2,5}/[A-Za-z0-9.+-]{1,30}$' or p_total is null or p_total not between 5 and 500 then
    raise exception 'Invalid set';
  end if;
  select count(distinct substring(tcgdex_id from length(p_set) + 2)::integer) into have
  from public.crate_cards
  where user_id = me
    and starts_with(tcgdex_id, p_set || '-')
    and substring(tcgdex_id from length(p_set) + 2) ~ '^[0-9]{1,4}$'
    and substring(tcgdex_id from length(p_set) + 2)::integer between 1 and p_total;
  if have < p_total then
    return 0;
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  return public.crate_book(me, 'crateset', p_set, (public.crate_rules() ->> 'crate_set')::integer);
end;
$$;

revoke execute on function public.crate_rules() from public, anon;
revoke execute on function public.crate_sync(jsonb, integer[]) from public, anon;
revoke execute on function public.crate_open_pack(jsonb, text) from public, anon;
revoke execute on function public.crate_set_done(text, integer) from public, anon;
grant execute on function public.crate_rules() to authenticated;
grant execute on function public.crate_sync(jsonb, integer[]) to authenticated;
grant execute on function public.crate_open_pack(jsonb, text) to authenticated;
grant execute on function public.crate_set_done(text, integer) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP18 klaar' as resultaat,
       to_regprocedure('public.crate_rules()') is not null as regels,
       to_regprocedure('public.crate_set_done(text, integer)') is not null as set_compleet,
       has_function_privilege('anon', 'public.crate_set_done(text, integer)', 'execute') as anon_mag;
