-- STAP28 (24-10-2026, op verzoek): Pack of the day hoogstens 3 keer per dag (per set van de dag; de teller begint
-- opnieuw met de nieuwe set om middernacht UTC). Geopende dagpakjes krijgen in het logboek een ref "daily:…", zodat
-- ze te tellen zijn; pakjes van vóór deze stap tellen niet mee. crate_daily_left(): hoeveel je er vandaag nog hebt.
-- crate_srv_version blijft 23 (de Edge Function hoeft niet opnieuw). Wist niets. Veilig om opnieuw te draaien.
-- Gaat via de workflow "Database migreren". Verwacht: "STAP28 klaar", left_func = true, anon_mag = false.

begin;

-- Pakje opslaan dat de functie getrokken heeft (zoals STAP26), nu met de dagelijkse grens voor Pack of the day.
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
  daily_opened integer := 0;
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
  -- Slot op de portemonnee: twee pakjes tegelijk kunnen niet allebei onder de grens doorglippen.
  select * into w from public.crate_wallet where user_id = p_user for update;
  if p_pack = 'daily' then
    select count(*) into daily_opened from public.crate_ledger
     where user_id = p_user and kind = 'pack' and ref like 'daily:%' and created_at >= date_trunc('day', now());
    if daily_opened >= 3 then
      raise exception 'Pack of the day: 3 a day. Come back tomorrow for a new set.' using errcode = '22023';
    end if;
  end if;
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
  insert into public.crate_ledger (user_id, kind, ref, points)
  values (p_user, 'pack', case when p_pack = 'daily' then 'daily:' else '' end || gen_random_uuid()::text, -cost);
  select * into w from public.crate_wallet where user_id = p_user;
  return jsonb_build_object(
    'points', w.points,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date,
    'cost', cost,
    'daily_left', greatest(0, 3 - daily_opened - case when p_pack = 'daily' then 1 else 0 end)
  );
end;
$$;

revoke execute on function public.crate_srv_open(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.crate_srv_open(uuid, text, jsonb) to service_role;

-- Hoeveel Pack of the day je vandaag nog kunt openen (0 t/m 3); alleen voor jezelf.
create or replace function public.crate_daily_left()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, 3 - (
    select count(*)::integer from public.crate_ledger
     where user_id = (select auth.uid()) and kind = 'pack' and ref like 'daily:%' and created_at >= date_trunc('day', now())
  ));
$$;

revoke execute on function public.crate_daily_left() from public, anon;
grant execute on function public.crate_daily_left() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP28 klaar' as resultaat,
       to_regprocedure('public.crate_daily_left()') is not null as left_func,
       has_function_privilege('anon', 'public.crate_daily_left()', 'execute') as anon_mag;
