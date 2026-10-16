-- STAP 12: Crate-game uitbreiding. Drie soorten pakjes (Booster, Great, Master) en "alle dubbelen inruilen".
-- Vereist STAP11. Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, opnieuw draaien kan. Raakt je echte kaarten niet aan; alleen de Crate-functies.
--
-- Let op: de oude functie crate_open_pack(jsonb) wordt vervangen door crate_open_pack(jsonb, text)
-- (in dezelfde transactie, dus er is geen moment zonder). Je Crate-punten en -kaarten blijven staan.

begin;

-- ---------------------------------------------------------------------------
-- 1. Inruilwaarde per extra exemplaar (gedeeld door crate_trade en crate_trade_all).
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade_value(p_rarity text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(coalesce(p_rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(p_rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(p_rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(p_rarity, '')) like '%rare%' then 5
    when lower(coalesce(p_rarity, '')) = 'uncommon' then 3
    else 2
  end;
$$;

revoke execute on function public.crate_trade_value(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Pakje openen per soort: booster 100 (één keer per dag gratis), great 300, master 1000.
--    p_cards: 1-10 kaarten [{"tcgdex_id","name","image","rarity","set_name"}].
-- ---------------------------------------------------------------------------
drop function if exists public.crate_open_pack(jsonb);

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
  if p_pack is null or p_pack not in ('booster', 'great', 'master') then
    raise exception 'Unknown pack';
  end if;
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = me for update;
  -- Alleen de gewone booster is één keer per dag gratis.
  free := p_pack = 'booster' and (w.last_free_pack is null or w.last_free_pack < current_date);
  cost := case when free then 0 when p_pack = 'great' then 300 when p_pack = 'master' then 1000 else 100 end;
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

-- ---------------------------------------------------------------------------
-- 3. Eén kaart inruilen (zelfde regels als STAP11, nu met de gedeelde waardefunctie).
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade(p_tcgdex_id text, p_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec_card public.crate_cards;
  gained integer;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select * into rec_card from public.crate_cards where user_id = me and tcgdex_id = p_tcgdex_id for update;
  if rec_card.id is null then
    raise exception 'Card not found';
  end if;
  if p_count is null or p_count < 1 or p_count > rec_card.quantity - 1 then
    raise exception 'You can trade in at most % copies', greatest(0, rec_card.quantity - 1);
  end if;
  gained := public.crate_trade_value(rec_card.rarity) * p_count;
  update public.crate_cards set quantity = quantity - p_count where id = rec_card.id;
  update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Alle dubbelen in één keer inruilen; van elke kaart blijft er één over.
-- ---------------------------------------------------------------------------
create or replace function public.crate_trade_all()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  rec_card public.crate_cards;
  gained integer := 0;
  copies integer := 0;
  w public.crate_wallet;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  for rec_card in select * from public.crate_cards where user_id = me and quantity > 1 for update loop
    gained := gained + public.crate_trade_value(rec_card.rarity) * (rec_card.quantity - 1);
    copies := copies + rec_card.quantity - 1;
    update public.crate_cards set quantity = 1 where id = rec_card.id;
  end loop;
  if gained > 0 then
    update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
    insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  end if;
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', coalesce(w.points, 0), 'gained', gained, 'copies', copies);
end;
$$;

-- Alleen ingelogde gebruikers mogen de functies aanroepen.
revoke execute on function public.crate_open_pack(jsonb, text) from public, anon;
revoke execute on function public.crate_trade(text, integer) from public, anon;
revoke execute on function public.crate_trade_all() from public, anon;
grant execute on function public.crate_open_pack(jsonb, text) to authenticated;
grant execute on function public.crate_trade(text, integer) to authenticated;
grant execute on function public.crate_trade_all() to authenticated;

commit;

-- PostgREST de nieuwe functies laten zien.
notify pgrst, 'reload schema';

select 'STAP12 klaar' as resultaat,
       to_regprocedure('public.crate_open_pack(jsonb, text)') is not null as pakjes,
       to_regprocedure('public.crate_trade_all()') is not null as alles_inruilen;
