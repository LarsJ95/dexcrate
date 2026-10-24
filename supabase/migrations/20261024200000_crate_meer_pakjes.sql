-- STAP26 (24-10-2026): vier nieuwe Crate-pakjes. Lucky pack 150 (zoals een Booster, met 1 op 30 kans op een God pack:
-- alle 10 kaarten hits), Pokémon pack 250, Era pack 200 en Pakje van de dag 200. De Edge Function "crate" trekt ze.
-- Prijzen alleen toegevoegd als ze er nog niet zijn; bestaande prijzen (ook via Admin → Crate rules) blijven staan.
-- Wist niets. Veilig om opnieuw te draaien. Gaat via de workflow "Database migreren".
-- Verwacht: "STAP26 klaar", lucky = 150, daily = 200.

begin;

update public.crate_config
   set rules = jsonb_set(rules, '{packs}', '{"lucky": 150, "pokemon": 250, "era": 200, "daily": 200}'::jsonb || coalesce(rules -> 'packs', '{}'::jsonb)),
       updated_at = now()
 where id;

-- Startwaarden als er (nog) geen rij is: ook de nieuwe pakjes.
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
      'packs', jsonb_build_object('booster', 100, 'great', 200, 'master', 1000, 'set', 150, 'type', 300, 'lucky', 150, 'pokemon', 250, 'era', 200, 'daily', 200),
      'craft', jsonb_build_object('common', 120, 'uncommon', 180, 'rare', 300, 'double', 600, 'illustration', 900, 'special', 1800)
    )
  );
$$;

revoke execute on function public.crate_rules() from public, anon;
grant execute on function public.crate_rules() to authenticated, service_role;

-- Pakje opslaan dat de functie getrokken heeft (zoals STAP23), nu ook de nieuwe soorten.
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
  if p_pack is null or p_pack not in ('booster', 'great', 'master', 'set', 'type', 'lucky', 'pokemon', 'era', 'daily') then
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

revoke execute on function public.crate_srv_open(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.crate_srv_open(uuid, text, jsonb) to service_role;

-- Regels wijzigen (zoals STAP22): de nieuwe pakjes ook in Admin → Crate rules.
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
  top jsonb := '{"daily": [0, 10000], "trade_factor": [1, 10], "crate_set": [0, 100000]}';
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

commit;

notify pgrst, 'reload schema';

select 'STAP26 klaar' as resultaat,
       (public.crate_rules() -> 'packs' ->> 'lucky')::integer as lucky,
       (public.crate_rules() -> 'packs' ->> 'daily')::integer as daily;
