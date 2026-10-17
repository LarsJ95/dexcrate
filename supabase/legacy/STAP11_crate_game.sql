-- STAP 11: Crate-game. Crate points verdienen met je echte collectie en er virtuele pakjes mee openen.
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan. Raakt je echte kaarten niet aan.
--
-- Beveiliging: je kunt deze tabellen alleen LEZEN. Punten en virtuele kaarten veranderen uitsluitend via de
-- functies hieronder, die de regels afdwingen (elke kaart/transactie telt één keer, nooit onder 0 punten).

begin;

-- ---------------------------------------------------------------------------
-- 1. Tabellen
-- ---------------------------------------------------------------------------
create table if not exists public.crate_wallet (
  user_id         uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  points          integer not null default 0 check (points >= 0),
  last_daily      date,
  last_free_pack  date,
  updated_at      timestamptz not null default now()
);

create table if not exists public.crate_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade')),
  -- Waar de punten bij horen (kaart-id, transactie-id, Pokédex-nummer, set, datum …); uniek per soort.
  ref         text not null check (char_length(ref) between 1 and 80),
  points      integer not null,
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);

create index if not exists crate_ledger_user_idx on public.crate_ledger (user_id, created_at desc);

create table if not exists public.crate_cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tcgdex_id   text not null check (char_length(tcgdex_id) between 3 and 50),
  name        text not null check (char_length(name) between 1 and 200),
  image       text check (char_length(image) <= 300),
  rarity      text check (char_length(rarity) <= 60),
  set_name    text check (char_length(set_name) <= 100),
  quantity    integer not null default 1 check (quantity between 1 and 9999),
  first_at    timestamptz not null default now(),
  last_at     timestamptz not null default now(),
  unique (user_id, tcgdex_id)
);

alter table public.crate_wallet enable row level security;
alter table public.crate_ledger enable row level security;
alter table public.crate_cards enable row level security;

-- Alleen lezen (eigen rijen); schrijven gaat via de functies.
drop policy if exists "crate_wallet_read" on public.crate_wallet;
create policy "crate_wallet_read" on public.crate_wallet for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "crate_ledger_read" on public.crate_ledger;
create policy "crate_ledger_read" on public.crate_ledger for select to authenticated using ((select auth.uid()) = user_id);
drop policy if exists "crate_cards_read" on public.crate_cards;
create policy "crate_cards_read" on public.crate_cards for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.crate_wallet, public.crate_ledger, public.crate_cards from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Hulpfunctie: punten boeken (eenmalig per soort + ref). Geeft de geboekte punten terug (0 = al geboekt).
-- ---------------------------------------------------------------------------
create or replace function public.crate_book(p_user uuid, p_kind text, p_ref text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  booked integer;
begin
  insert into public.crate_ledger (user_id, kind, ref, points)
  values (p_user, p_kind, p_ref, p_points)
  on conflict (user_id, kind, ref) do nothing
  returning points into booked;
  if booked is null then
    return 0;
  end if;
  update public.crate_wallet set points = points + booked, updated_at = now() where user_id = p_user;
  return booked;
end;
$$;

revoke execute on function public.crate_book(uuid, text, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Bijwerken: punten voor kaarten, verkopen, aankopen, nieuwe Pokédex-soorten en de dagbonus.
--    p_bonus: {"<kaart-id>": 0-20} extra voor zeldzaamheid; p_dex: Pokédex-nummers die je hebt.
-- ---------------------------------------------------------------------------
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

  -- Dagbonus: 50 punten, één keer per dag.
  earned := earned + public.crate_book(me, 'daily', current_date::text, 50);

  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object(
    'points', w.points,
    'earned', earned,
    'free_pack', w.last_free_pack is null or w.last_free_pack < current_date
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Set compleet: 250 punten, één keer per set.
-- ---------------------------------------------------------------------------
create or replace function public.crate_set_complete(p_set text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  if p_set is null or p_set !~ '^[a-z-]{2,5}/[A-Za-z0-9.+-]{1,40}$' then
    raise exception 'Invalid set';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  return public.crate_book(me, 'set', p_set, 250);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Pakje openen: 100 punten (of gratis, één keer per dag). p_cards: 1-10 kaarten
--    [{"tcgdex_id","name","image","rarity","set_name"}].
-- ---------------------------------------------------------------------------
create or replace function public.crate_open_pack(p_cards jsonb)
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
  if jsonb_typeof(p_cards) <> 'array' or jsonb_array_length(p_cards) not between 1 and 10 then
    raise exception 'A pack has 1 to 10 cards';
  end if;
  insert into public.crate_wallet (user_id) values (me) on conflict (user_id) do nothing;
  select * into w from public.crate_wallet where user_id = me for update;
  free := w.last_free_pack is null or w.last_free_pack < current_date;
  cost := case when free then 0 else 100 end;
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
  return jsonb_build_object('points', w.points, 'free_pack', false, 'cost', cost);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Dubbelen inruilen: per extra exemplaar punten naar zeldzaamheid; er blijft er altijd één over.
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
  per_copy integer;
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
  per_copy := case
    when lower(coalesce(rec_card.rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(rec_card.rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(rec_card.rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(rec_card.rarity, '')) like '%rare%' then 5
    when lower(coalesce(rec_card.rarity, '')) = 'uncommon' then 3
    else 2
  end;
  gained := per_copy * p_count;
  update public.crate_cards set quantity = quantity - p_count where id = rec_card.id;
  update public.crate_wallet set points = points + gained, updated_at = now() where user_id = me;
  insert into public.crate_ledger (user_id, kind, ref, points) values (me, 'trade', gen_random_uuid()::text, gained);
  select * into w from public.crate_wallet where user_id = me;
  return jsonb_build_object('points', w.points, 'gained', gained);
end;
$$;

-- Alleen ingelogde gebruikers mogen de functies aanroepen.
revoke execute on function public.crate_sync(jsonb, integer[]) from public, anon;
revoke execute on function public.crate_set_complete(text) from public, anon;
revoke execute on function public.crate_open_pack(jsonb) from public, anon;
revoke execute on function public.crate_trade(text, integer) from public, anon;
grant execute on function public.crate_sync(jsonb, integer[]) to authenticated;
grant execute on function public.crate_set_complete(text) to authenticated;
grant execute on function public.crate_open_pack(jsonb) to authenticated;
grant execute on function public.crate_trade(text, integer) to authenticated;

commit;

select 'STAP11 klaar' as resultaat,
       to_regclass('public.crate_wallet') is not null as wallet,
       to_regclass('public.crate_cards') is not null as cards;
