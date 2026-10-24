-- STAP27 (24-10-2026): Pack game eerlijk verdienen. Bezit van een kaart is niet te bewijzen, dus het tempo gaat omlaag:
--  - Dagplafond (earn_cap, standaard 1000, aan te passen in Admin → Pack game rules) voor punten uit je collectie:
--    kaarten, nieuwe Pokédex-soorten, complete sets, verkopen en aankopen. Wat erboven valt, komt de volgende dagen
--    binnen ("waiting"). Dagbonus, inruilen en de setbonus van je pack collection vallen er niet onder.
--  - Eén sync tegelijk per gebruiker (slot), zodat gelijktijdige verzoeken samen niet over de grenzen gaan.
--  - Verkopen en aankopen tellen alleen nog met minstens één kaart erin.
--  - Inruilfactor hoogstens 3 (hogere waarde in de regels wordt 3).
--  - admin_crate_audit: per gebruiker wat er de laatste dagen verdiend en toegevoegd is.
-- Verdiende punten blijven staan. crate_srv_version blijft 23 (de Edge Function hoeft hiervoor niet opnieuw).
-- Wist niets. Veilig om opnieuw te draaien. Gaat via de workflow "Database migreren".
-- Verwacht: "STAP27 klaar", earn_cap = 1000 (of de eigen waarde), trade_factor ≤ 3.

begin;

-- 1. Regels: dagplafond erbij (een eigen waarde blijft staan); inruilfactor hoogstens 3.
update public.crate_config
   set rules = jsonb_build_object('earn_cap', 1000) || rules,
       updated_at = now()
 where id and not rules ? 'earn_cap';

update public.crate_config
   set rules = jsonb_set(rules, '{trade_factor}', '3'),
       updated_at = now()
 where id and jsonb_typeof(rules -> 'trade_factor') = 'number' and (rules ->> 'trade_factor')::numeric > 3;

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
      'daily', 150, 'trade_factor', 2, 'crate_set', 500, 'earn_cap', 1000,
      'packs', jsonb_build_object('booster', 100, 'great', 200, 'master', 1000, 'set', 150, 'type', 300, 'lucky', 150, 'pokemon', 250, 'era', 200, 'daily', 200),
      'craft', jsonb_build_object('common', 120, 'uncommon', 180, 'rare', 300, 'double', 600, 'illustration', 900, 'special', 1800)
    )
  );
$$;

revoke execute on function public.crate_rules() from public, anon;
grant execute on function public.crate_rules() to authenticated, service_role;

-- 2. Punten bijwerken (zoals STAP23), nu met slot, dagplafond en "waiting".
--    Volgorde binnen het plafond: Pokédex-soorten, complete sets, kaarten, verkopen/aankopen.
create or replace function public.crate_srv_sync(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned integer := 0;
  waiting integer := 0;
  r record;
  got integer;
  n_today integer;
  rules jsonb := public.crate_rules();
  cap integer;
  room integer;
  w public.crate_wallet;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  -- Eén tegelijk per gebruiker; het slot vervalt aan het eind van de transactie.
  perform pg_advisory_xact_lock(hashtextextended('crate_sync:' || p_user::text, 0));
  insert into public.crate_wallet (user_id) values (p_user) on conflict (user_id) do nothing;

  cap := case when jsonb_typeof(rules -> 'earn_cap') = 'number' then least(100000, greatest(0, (rules ->> 'earn_cap')::numeric::integer)) else 1000 end;
  select coalesce(sum(l.points), 0) into room
    from public.crate_ledger l
   where l.user_id = p_user and l.kind in ('cardkey', 'dex', 'set', 'sale', 'purchase') and l.points > 0
     and l.created_at >= date_trunc('day', now());
  room := greatest(0, cap - room);

  -- Nieuwe Pokédex-soorten (25), uit de kaartgegevens van wat je echt hebt.
  for r in
    select distinct x as d
      from public.cards c
      join public.card_facts f on f.tcgdex_id = c.tcgdex_id, unnest(f.dex_ids) as x
     where c.user_id = p_user and c.status <> 'sold' and x between 1 and 1025
       and not exists (select 1 from public.crate_ledger l where l.user_id = p_user and l.kind = 'dex' and l.ref = x::text)
     order by 1
  loop
    if room < 25 then
      waiting := waiting + 25;
      continue;
    end if;
    got := public.crate_book(p_user, 'dex', r.d::text, 25);
    earned := earned + got;
    room := room - got;
  end loop;

  -- Echte set compleet (250): alle nummers 1..officieel in bezit.
  for r in
    select f.set_key
      from public.cards c
      join public.card_facts f on f.tcgdex_id = c.tcgdex_id
      join public.set_facts s on s.set_key = f.set_key
     where c.user_id = p_user and c.status <> 'sold' and s.official >= 5
       and not exists (select 1 from public.crate_ledger l where l.user_id = p_user and l.kind = 'set' and l.ref = f.set_key)
     group by f.set_key, s.official
    having count(distinct case when f.local_id ~ '^[0-9]{1,4}$' and f.local_id::integer between 1 and s.official then f.local_id::integer end) >= s.official
     order by f.set_key
  loop
    if room < 250 then
      waiting := waiting + 250;
      continue;
    end if;
    got := public.crate_book(p_user, 'set', r.set_key, 250);
    earned := earned + got;
    room := room - got;
  end loop;

  -- Elke kaart in bezit: 10 + zeldzaamheid (max. 20), één keer per kaart-identiteit; oudste eerst.
  for r in
    select x.k, 10 + least(20, public.crate_rarity_rank(x.rarity) * 2) as pts
      from (
        select distinct on (k.k) k.k, f.rarity, k.created_at, k.id
          from (
            select c.id, c.created_at, c.tcgdex_id, public.crate_card_key(c.tcgdex_id, c.name, c.set_code, c.card_number) as k
              from public.cards c
             where c.user_id = p_user and c.status <> 'sold'
               and not exists (select 1 from public.crate_ledger l where l.user_id = p_user and l.kind = 'card' and l.ref = c.id::text)
          ) k
          left join public.card_facts f on f.tcgdex_id = k.tcgdex_id
         order by k.k, k.created_at, k.id
      ) x
     where not exists (select 1 from public.crate_ledger l where l.user_id = p_user and l.kind = 'cardkey' and l.ref = x.k)
     order by x.created_at, x.id
  loop
    if room < r.pts then
      waiting := waiting + r.pts;
      continue;
    end if;
    got := public.crate_book(p_user, 'cardkey', r.k, r.pts);
    earned := earned + got;
    room := room - got;
  end loop;

  -- Verkopen (15) en aankopen (5) met minstens één kaart erin, niet geannuleerd; max. 20 per dag.
  if to_regclass('public.transactions') is not null and to_regclass('public.transaction_lines') is not null then
    select count(*) into n_today from public.crate_ledger
     where user_id = p_user and kind in ('sale', 'purchase') and points > 0 and created_at >= date_trunc('day', now());
    for r in execute
      'select t.id, t.kind from public.transactions t
        where t.user_id = $1 and t.kind in (''sale'', ''purchase'') and t.status <> ''cancelled''
          and exists (select 1 from public.transaction_lines tl where tl.transaction_id = t.id and tl.card_id is not null)
          and not exists (select 1 from public.crate_ledger l where l.user_id = $1 and l.kind = t.kind and l.ref = t.id::text)
        order by t.created_at, t.id' using p_user
    loop
      got := case when r.kind = 'sale' then 15 else 5 end;
      if n_today >= 20 or room < got then
        waiting := waiting + got;
        continue;
      end if;
      got := public.crate_book(p_user, r.kind, r.id::text, got);
      if got > 0 then
        n_today := n_today + 1;
        earned := earned + got;
        room := room - got;
      end if;
    end loop;
  end if;

  -- Dagbonus volgens de regels, één keer per dag (buiten het plafond).
  earned := earned + public.crate_book(p_user, 'daily', current_date::text, coalesce((rules ->> 'daily')::integer, 150));

  -- Complete set in je pack collection (crate_set uit de regels; buiten het plafond: daar betaal je pakjes voor).
  for r in
    select k.set_key, s.official, count(distinct k.n) filter (where k.n between 1 and s.official) as have
      from (
        select regexp_replace(cc.tcgdex_id, '-[^-]+$', '') as set_key,
               case when substring(cc.tcgdex_id from '-([0-9]{1,4})$') is not null then substring(cc.tcgdex_id from '-([0-9]{1,4})$')::integer end as n
          from public.crate_cards cc
         where cc.user_id = p_user
      ) k
      join public.set_facts s on s.set_key = k.set_key
     where s.official >= 5
     group by k.set_key, s.official
  loop
    if r.have >= r.official then
      earned := earned + public.crate_book(p_user, 'crateset', r.set_key, coalesce((rules ->> 'crate_set')::integer, 500));
    end if;
  end loop;

  select * into w from public.crate_wallet where user_id = p_user;
  return jsonb_build_object(
    'points', w.points,
    'earned', earned,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date,
    'waiting', waiting,
    'cap', cap
  );
end;
$$;

revoke execute on function public.crate_srv_sync(uuid) from public, anon, authenticated;
grant execute on function public.crate_srv_sync(uuid) to service_role;

-- 3. Regels wijzigen (zoals STAP26): dagplafond erbij, inruilfactor 1 t/m 3.
create or replace function public.admin_set_crate_rules(p_rules jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text;
  cur jsonb := public.crate_rules();
  merged jsonb;
  k text;
  v jsonb;
  -- sleutel → [min, max]
  top jsonb := '{"daily": [0, 10000], "trade_factor": [1, 3], "crate_set": [0, 100000], "earn_cap": [100, 100000]}';
  sub jsonb := '{"packs": ["booster", "great", "master", "set", "type", "lucky", "pokemon", "era", "daily"], "craft": ["common", "uncommon", "rare", "double", "illustration", "special"]}';
  g text;
  n integer;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  why := public.admin_reason(p_reason);
  if jsonb_typeof(p_rules) <> 'object' then
    raise exception 'Rules must be an object' using errcode = '22023';
  end if;
  merged := cur;
  for k, v in select * from jsonb_each(p_rules) loop
    if top ? k then
      if jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric <> floor((v #>> '{}')::numeric) then
        raise exception '% must be a whole number', k using errcode = '22023';
      end if;
      n := (v #>> '{}')::integer;
      if n < (top -> k ->> 0)::integer or n > (top -> k ->> 1)::integer then
        raise exception '% must be between % and %', k, top -> k ->> 0, top -> k ->> 1 using errcode = '22023';
      end if;
      merged := jsonb_set(merged, array[k], to_jsonb(n));
    elsif sub ? k then
      if jsonb_typeof(v) <> 'object' then
        raise exception '% must be an object', k using errcode = '22023';
      end if;
      for g in select jsonb_object_keys(v) loop
        if not (sub -> k) ? g then
          raise exception 'Unknown rule %.%', k, g using errcode = '22023';
        end if;
        if jsonb_typeof(v -> g) <> 'number' or (v ->> g)::numeric <> floor((v ->> g)::numeric) or (v ->> g)::numeric not between (case when k = 'craft' then 1 else 0 end) and 100000 then
          raise exception '%.% must be a whole number between % and 100000', k, g, case when k = 'craft' then 1 else 0 end using errcode = '22023';
        end if;
        merged := jsonb_set(merged, array[k, g], to_jsonb((v ->> g)::integer), true);
      end loop;
    else
      raise exception 'Unknown rule %', k using errcode = '22023';
    end if;
  end loop;

  insert into public.crate_config (id, rules, updated_at, updated_by) values (true, merged, now(), me)
  on conflict (id) do update set rules = excluded.rules, updated_at = now(), updated_by = me;
  perform public.admin_log(me, null, 'set_rules', null, why, jsonb_build_object('before', cur, 'after', merged));
  return merged;
end;
$$;

revoke execute on function public.admin_set_crate_rules(jsonb, text) from public, anon;
grant execute on function public.admin_set_crate_rules(jsonb, text) to authenticated;

-- 4. Controleoverzicht (alleen beheerders): wie verdiende de laatste p_days dagen het meest uit de collectie,
--    hoeveel kaarten kwamen erbij, en de beste dag (wie elke dag het plafond haalt, valt zo op). Geen kaarten of bedragen.
create or replace function public.admin_crate_audit(p_days integer default 7)
returns table (
  user_id      uuid,
  email        text,
  earned       bigint,
  best_day     bigint,
  cards_added  bigint,
  cards_now    bigint,
  points       integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  since timestamptz := date_trunc('day', now()) - make_interval(days => least(greatest(coalesce(p_days, 7), 1), 90) - 1);
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    with per_day as (
      select l.user_id as uid, date_trunc('day', l.created_at) as day, sum(l.points) as pts
        from public.crate_ledger l
       where l.kind in ('cardkey', 'dex', 'set', 'sale', 'purchase') and l.points > 0 and l.created_at >= since
       group by l.user_id, date_trunc('day', l.created_at)
    ),
    per_user as (
      select d.uid, sum(d.pts)::bigint as earned, max(d.pts)::bigint as best_day from per_day d group by d.uid
    )
    select u.id,
           u.email::text,
           coalesce(p.earned, 0),
           coalesce(p.best_day, 0),
           (select count(*) from public.cards c where c.user_id = u.id and c.created_at >= since),
           (select count(*) from public.cards c where c.user_id = u.id and c.status <> 'sold'),
           coalesce((select wl.points from public.crate_wallet wl where wl.user_id = u.id), 0)
      from auth.users u
      left join per_user p on p.uid = u.id
     order by coalesce(p.earned, 0) desc, u.created_at
     limit 200;
end;
$$;

revoke execute on function public.admin_crate_audit(integer) from public, anon;
grant execute on function public.admin_crate_audit(integer) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP27 klaar' as resultaat,
       (public.crate_rules() ->> 'earn_cap')::integer as earn_cap,
       (public.crate_rules() ->> 'trade_factor')::numeric as trade_factor;
