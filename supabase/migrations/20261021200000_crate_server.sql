-- STAP23 (21-10-2026): Crate eerlijk. Punten, pakjes en gericht kopen gaan via de Edge Function "crate"; de app kan
-- zelf geen kaarten, zeldzaamheden, Pokédex-nummers of complete sets meer opgeven. Vereist STAP22.
--  - card_facts / set_facts: kaartgegevens van TCGdex (zeldzaamheid, Pokédex, set), door de functie opgehaald.
--  - crate_srv_*: alleen voor de functie (service_role). Punten per kaart één keer per kaart-identiteit (niet per
--    regel: verwijderen en opnieuw toevoegen geeft niets meer), verkoop/aankoop max. 20 per dag.
--  - Gericht kopen: ontbrekende kaart voor een vaste prijs per zeldzaamheid (crate_config → craft).
--  - De oude functies (crate_sync, crate_open_pack, crate_set_complete, crate_set_done) mag de app niet meer gebruiken.
-- EERST de Edge Function "crate" deployen, DAN dit bestand draaien (anders werkt de Crate tot de deploy niet).
-- Veilig om opnieuw te draaien. Wist niets.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP23 klaar", feiten = true, server = true, oud_dicht = true, anon_mag = false.

begin;

-- 1. Nieuwe soorten boekingen: punten per kaart-identiteit en gericht kopen.
alter table public.crate_ledger drop constraint if exists crate_ledger_kind_check;
alter table public.crate_ledger
  add constraint crate_ledger_kind_check
  check (kind in ('card', 'cardkey', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade', 'wish', 'crateset', 'admin', 'craft'));

-- 2. Kaart- en setgegevens van TCGdex (openbare catalogusgegevens, geen persoonsgegevens).
create table if not exists public.card_facts (
  tcgdex_id   text primary key check (char_length(tcgdex_id) between 3 and 60),
  rarity      text check (char_length(rarity) <= 60),
  dex_ids     integer[] not null default '{}',
  set_key     text check (char_length(set_key) <= 60),
  local_id    text check (char_length(local_id) <= 20),
  -- false = TCGdex kent de kaart niet (eigen of Chinese catalogus): basispunten, geen bonus of Pokédex.
  found       boolean not null default true,
  fetched_at  timestamptz not null default now()
);

create table if not exists public.set_facts (
  set_key     text primary key check (char_length(set_key) between 3 and 60),
  name        text check (char_length(name) <= 120),
  official    integer check (official between 0 and 2000),
  fetched_at  timestamptz not null default now()
);

alter table public.card_facts enable row level security;
alter table public.set_facts enable row level security;
revoke all on public.card_facts from anon, authenticated;
revoke all on public.set_facts from anon, authenticated;
grant select, insert, update on public.card_facts to service_role;
grant select, insert, update on public.set_facts to service_role;

-- 3. Hulpfuncties.
-- Rang van een zeldzaamheid (zoals rarityRule in de app); 0 = onbekend.
create or replace function public.crate_rarity_rank(p_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case lower(coalesce(p_rarity, ''))
    when 'common' then 1
    when 'uncommon' then 2
    when 'rare' then 3
    when 'rare holo' then 4
    when 'holo rare' then 4
    when 'rare holo lv.x' then 5
    when 'rare prime' then 5
    when 'legend' then 5
    when 'holo rare v' then 5
    when 'holo rare vmax' then 5
    when 'holo rare vstar' then 5
    when 'radiant rare' then 5
    when 'ace spec rare' then 5
    when 'double rare' then 5
    when 'amazing rare' then 6
    when 'ultra rare' then 6
    when 'full art trainer' then 6
    when 'shiny rare' then 6
    when 'illustration rare' then 7
    when 'shiny rare v' then 7
    when 'shiny rare vmax' then 7
    when 'shiny ultra rare' then 8
    when 'secret rare' then 8
    when 'special illustration rare' then 9
    when 'hyper rare' then 10
    when 'mega hyper rare' then 10
    when 'crown' then 10
    else 0
  end;
$$;

-- Prijsklasse voor gericht kopen (sleutels in crate_config → craft); null = niet te koop.
create or replace function public.crate_craft_class(p_rarity text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when public.crate_rarity_rank(p_rarity) = 1 then 'common'
    when public.crate_rarity_rank(p_rarity) = 2 then 'uncommon'
    when public.crate_rarity_rank(p_rarity) between 3 and 4 then 'rare'
    when public.crate_rarity_rank(p_rarity) between 5 and 6 then 'double'
    when public.crate_rarity_rank(p_rarity) = 7 then 'illustration'
    when public.crate_rarity_rank(p_rarity) >= 8 then 'special'
    else null
  end;
$$;

-- Identiteit van een echte kaart: gekoppeld = TCGdex-id, anders naam + set + nummer (max. 80 tekens voor ref).
create or replace function public.crate_card_key(p_tcgdex text, p_name text, p_set text, p_number text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(p_tcgdex, '') <> '' then 't:' || left(lower(p_tcgdex), 70)
    else 'k:' || md5(lower(coalesce(p_name, '')) || '|' || lower(coalesce(p_set, '')) || '|' || lower(coalesce(p_number, '')))
  end;
$$;

-- 4. Kaarten die al punten kregen (oude manier: per regel) ook als identiteit vastleggen, zodat dezelfde kaart
--    opnieuw toevoegen geen punten meer geeft. 0 punten: de punten zijn al geboekt.
insert into public.crate_ledger (user_id, kind, ref, points)
select c.user_id, 'cardkey', public.crate_card_key(c.tcgdex_id, c.name, c.set_code, c.card_number), 0
  from public.cards c
 where exists (select 1 from public.crate_ledger l where l.user_id = c.user_id and l.kind = 'card' and l.ref = c.id::text)
on conflict (user_id, kind, ref) do nothing;

-- 5. Functies voor de Edge Function (alleen service_role).

-- Versie van deze opzet (de functie controleert ermee of STAP23 gedraaid is).
create or replace function public.crate_srv_version()
returns integer
language sql
immutable
set search_path = ''
as $$ select 23 $$;

-- Kaart- en setgegevens bewaren of verversen.
create or replace function public.crate_srv_put_facts(p_cards jsonb, p_sets jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
begin
  if jsonb_typeof(coalesce(p_cards, '[]')) <> 'array' or jsonb_typeof(coalesce(p_sets, '[]')) <> 'array'
     or jsonb_array_length(coalesce(p_cards, '[]')) > 500 or jsonb_array_length(coalesce(p_sets, '[]')) > 200 then
    raise exception 'Invalid facts' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(coalesce(p_cards, '[]')) loop
    insert into public.card_facts (tcgdex_id, rarity, dex_ids, set_key, local_id, found, fetched_at)
    values (
      left(c ->> 'tcgdex_id', 60),
      left(nullif(c ->> 'rarity', ''), 60),
      coalesce((select array_agg(x::integer) from jsonb_array_elements_text(coalesce(c -> 'dex_ids', '[]')) x where x ~ '^[0-9]{1,4}$'), '{}'),
      left(nullif(c ->> 'set_key', ''), 60),
      left(nullif(c ->> 'local_id', ''), 20),
      coalesce((c ->> 'found')::boolean, true),
      now()
    )
    on conflict (tcgdex_id) do update set rarity = excluded.rarity, dex_ids = excluded.dex_ids, set_key = excluded.set_key,
      local_id = excluded.local_id, found = excluded.found, fetched_at = now();
  end loop;
  for c in select * from jsonb_array_elements(coalesce(p_sets, '[]')) loop
    insert into public.set_facts (set_key, name, official, fetched_at)
    values (left(c ->> 'set_key', 60), left(nullif(c ->> 'name', ''), 120), least(2000, greatest(0, coalesce((c ->> 'official')::integer, 0))), now())
    on conflict (set_key) do update set name = excluded.name, official = excluded.official, fetched_at = now();
  end loop;
end;
$$;

-- Punten bijwerken voor één gebruiker; alles uit de database zelf.
create or replace function public.crate_srv_sync(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  earned integer := 0;
  r record;
  d integer;
  got integer;
  n_today integer;
  rules jsonb := public.crate_rules();
  w public.crate_wallet;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  insert into public.crate_wallet (user_id) values (p_user) on conflict (user_id) do nothing;

  -- Elke kaart in bezit: 10 + zeldzaamheid (max. 20), één keer per kaart-identiteit.
  for r in
    select c.id, public.crate_card_key(c.tcgdex_id, c.name, c.set_code, c.card_number) as k, f.rarity
      from public.cards c
      left join public.card_facts f on f.tcgdex_id = c.tcgdex_id
     where c.user_id = p_user and c.status <> 'sold'
     order by c.created_at, c.id
  loop
    if exists (select 1 from public.crate_ledger l where l.user_id = p_user and l.kind = 'card' and l.ref = r.id::text) then
      continue;
    end if;
    earned := earned + public.crate_book(p_user, 'cardkey', r.k, 10 + least(20, public.crate_rarity_rank(r.rarity) * 2));
  end loop;

  -- Vastgelegde verkopen (15) en aankopen (5), niet geannuleerd; max. 20 per dag (de rest komt later).
  if to_regclass('public.transactions') is not null then
    select count(*) into n_today from public.crate_ledger
     where user_id = p_user and kind in ('sale', 'purchase') and points > 0 and created_at >= date_trunc('day', now());
    for r in execute 'select id, kind from public.transactions where user_id = $1 and kind in (''sale'', ''purchase'') and status <> ''cancelled'' order by created_at, id' using p_user loop
      exit when n_today >= 20;
      got := public.crate_book(p_user, r.kind, r.id::text, case when r.kind = 'sale' then 15 else 5 end);
      if got > 0 then
        n_today := n_today + 1;
        earned := earned + got;
      end if;
    end loop;
  end if;

  -- Nieuwe Pokédex-soorten (25), uit de kaartgegevens van wat je echt hebt.
  for d in
    select distinct x from public.cards c join public.card_facts f on f.tcgdex_id = c.tcgdex_id, unnest(f.dex_ids) as x
     where c.user_id = p_user and c.status <> 'sold'
  loop
    if d between 1 and 1025 then
      earned := earned + public.crate_book(p_user, 'dex', d::text, 25);
    end if;
  end loop;

  -- Dagbonus volgens de regels, één keer per dag.
  earned := earned + public.crate_book(p_user, 'daily', current_date::text, coalesce((rules ->> 'daily')::integer, 150));

  -- Echte set compleet (250): alle nummers 1..officieel in bezit.
  for r in
    select f.set_key, s.official,
           count(distinct case when f.local_id ~ '^[0-9]{1,4}$' and f.local_id::integer between 1 and s.official then f.local_id::integer end) as have
      from public.cards c
      join public.card_facts f on f.tcgdex_id = c.tcgdex_id
      join public.set_facts s on s.set_key = f.set_key
     where c.user_id = p_user and c.status <> 'sold' and s.official >= 5
     group by f.set_key, s.official
  loop
    if r.have >= r.official then
      earned := earned + public.crate_book(p_user, 'set', r.set_key, 250);
    end if;
  end loop;

  -- Complete set in je Crate (crate_set uit de regels).
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
  return jsonb_build_object('points', w.points, 'earned', earned, 'free_pack', w.last_free_pack is null or w.last_free_pack < current_date);
end;
$$;

-- Pakje opslaan dat de functie getrokken heeft; kosten uit de regels, één gratis Booster per dag.
create or replace function public.crate_srv_open(p_user uuid, p_pack text, p_cards jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.crate_wallet;
  cost integer;
  free boolean;
  c jsonb;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if p_pack is null or p_pack not in ('booster', 'great', 'master', 'set', 'type') then
    raise exception 'Unknown pack';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = p_user for update;
  free := p_pack = 'booster' and (w.last_free_pack is null or w.last_free_pack < current_date);
  cost := case when free then 0 else (public.crate_rules() -> 'packs' ->> p_pack)::integer end;
  if cost is null then
    raise exception 'Unknown pack';
  end if;
  if w.points < cost then
    raise exception 'Not enough Crate points';
  end if;
  for c in select * from jsonb_array_elements(p_cards) loop
    if coalesce(c ->> 'tcgdex_id', '') !~ '^[a-z-]{2,5}/.{1,44}$' or coalesce(c ->> 'name', '') = '' then
      raise exception 'Invalid card in pack';
    end if;
    insert into public.crate_cards (user_id, tcgdex_id, name, image, rarity, set_name)
    values (p_user, c ->> 'tcgdex_id', left(c ->> 'name', 200), left(nullif(c ->> 'image', ''), 300), left(nullif(c ->> 'rarity', ''), 60), left(nullif(c ->> 'set_name', ''), 100))
    on conflict (user_id, tcgdex_id) do update set quantity = least(9999, public.crate_cards.quantity + 1), last_at = now();
  end loop;
  update public.crate_wallet
     set points = points - cost,
         last_free_pack = case when free then current_date else last_free_pack end,
         updated_at = now()
   where user_id = p_user;
  insert into public.crate_ledger (user_id, kind, ref, points) values (p_user, 'pack', gen_random_uuid()::text, -cost);
  select * into w from public.crate_wallet where user_id = p_user;
  return jsonb_build_object('points', w.points, 'free_pack', w.last_free_pack is null or w.last_free_pack < current_date, 'cost', cost);
end;
$$;

-- Ontbrekende kaart gericht kopen (de functie heeft kaart en zeldzaamheid bij TCGdex opgezocht).
create or replace function public.crate_srv_craft(p_user uuid, p_card jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w public.crate_wallet;
  cls text := public.crate_craft_class(p_card ->> 'rarity');
  cost integer;
begin
  if p_user is null or not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if coalesce(p_card ->> 'tcgdex_id', '') !~ '^en/.{1,44}$' or coalesce(p_card ->> 'name', '') = '' then
    raise exception 'Invalid card' using errcode = '22023';
  end if;
  if cls is null then
    raise exception 'This card cannot be bought' using errcode = '22023';
  end if;
  cost := (public.crate_rules() -> 'craft' ->> cls)::integer;
  if cost is null or cost < 1 then
    raise exception 'This card cannot be bought' using errcode = '22023';
  end if;
  if exists (select 1 from public.crate_cards where user_id = p_user and tcgdex_id = p_card ->> 'tcgdex_id') then
    raise exception 'You already have this card' using errcode = '22023';
  end if;
  insert into public.crate_wallet (user_id) values (p_user) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = p_user for update;
  if w.points < cost then
    raise exception 'Not enough Crate points';
  end if;
  insert into public.crate_cards (user_id, tcgdex_id, name, image, rarity, set_name)
  values (p_user, p_card ->> 'tcgdex_id', left(p_card ->> 'name', 200), left(nullif(p_card ->> 'image', ''), 300), left(nullif(p_card ->> 'rarity', ''), 60), left(nullif(p_card ->> 'set_name', ''), 100));
  update public.crate_wallet set points = points - cost, updated_at = now() where user_id = p_user returning * into w;
  insert into public.crate_ledger (user_id, kind, ref, points) values (p_user, 'craft', gen_random_uuid()::text, -cost);
  return jsonb_build_object('points', w.points, 'cost', cost);
end;
$$;

revoke execute on function public.crate_srv_version() from public, anon, authenticated;
revoke execute on function public.crate_srv_put_facts(jsonb, jsonb) from public, anon, authenticated;
revoke execute on function public.crate_srv_sync(uuid) from public, anon, authenticated;
revoke execute on function public.crate_srv_open(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.crate_srv_craft(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.crate_srv_version() to service_role;
grant execute on function public.crate_srv_put_facts(jsonb, jsonb) to service_role;
grant execute on function public.crate_srv_sync(uuid) to service_role;
grant execute on function public.crate_srv_open(uuid, text, jsonb) to service_role;
grant execute on function public.crate_srv_craft(uuid, jsonb) to service_role;

-- 6. Oude functies waarin de app zelf kaarten, Pokédex-nummers of sets opgaf: dicht voor de app.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.crate_sync(jsonb, integer[])', 'public.crate_open_pack(jsonb, text)', 'public.crate_open_pack(jsonb)',
    'public.crate_set_complete(text)', 'public.crate_set_done(text, integer)'
  ] loop
    if to_regprocedure(f) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    end if;
  end loop;
end;
$$;

commit;

notify pgrst, 'reload schema';

select 'STAP23 klaar' as resultaat,
       to_regclass('public.card_facts') is not null as feiten,
       to_regprocedure('public.crate_srv_sync(uuid)') is not null as server,
       case when to_regprocedure('public.crate_sync(jsonb, integer[])') is null then true
            else not has_function_privilege('authenticated', 'public.crate_sync(jsonb, integer[])', 'execute') end as oud_dicht,
       has_function_privilege('anon', 'public.crate_srv_open(uuid, text, jsonb)', 'execute') as anon_mag;
