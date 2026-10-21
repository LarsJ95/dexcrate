-- STAP22 (21-10-2026): beheer uitgebreid (vereist STAP21).
--  1. Crate-regels in een tabel (crate_config), aan te passen op de beheerpagina. Great pack 300 → 200.
--     Inruilen gebruikt nu ook de factor uit de regels (stond vast op 2).
--  2. Per gebruiker: puntengeschiedenis en foutlogboek bekijken.
--  3. Scans: telling per dag (scan_daily, 90 dagen) en een eigen scanlimiet per gebruiker (scan_limits).
--  4. Mededeling aan alle gebruikers (announcements): balk bovenaan de app.
--  Logboek: admin_actions krijgt meer soorten en een kolom details.
-- Veilig om opnieuw te draaien. Wist niets (alleen scantellingen ouder dan 90 dagen, bij het scannen).
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP22 klaar", regels = true, great = 200, scans = true, mededeling = true, anon_mag = false.

begin;

-- ---------------------------------------------------------------------------
-- 0. Logboek: meer soorten acties, met details.
-- ---------------------------------------------------------------------------
alter table public.admin_actions add column if not exists details jsonb;
alter table public.admin_actions drop constraint if exists admin_actions_action_check;
alter table public.admin_actions
  add constraint admin_actions_action_check
  check (action in ('grant_points', 'set_rules', 'set_scan_limit', 'announce', 'invite', 'ban', 'unban', 'delete_user'));

-- Eén regel in het logboek (alleen voor de functies hieronder en de Edge Function admin-users).
create or replace function public.admin_log(p_admin uuid, p_target uuid, p_action text, p_points integer, p_reason text, p_details jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_id uuid;
begin
  insert into public.admin_actions (admin_id, target_user, action, points, reason, details)
  values (p_admin, p_target, p_action, p_points, left(btrim(p_reason), 200), p_details)
  returning admin_actions.id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.admin_log(uuid, uuid, text, integer, text, jsonb) from public, anon, authenticated;
grant execute on function public.admin_log(uuid, uuid, text, integer, text, jsonb) to service_role;

-- Reden controleren (3-200 tekens) of een fout geven.
create or replace function public.admin_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  why text := btrim(coalesce(p_reason, ''));
begin
  if char_length(why) < 3 or char_length(why) > 200 then
    raise exception 'Give a reason (3 to 200 characters)' using errcode = '22023';
  end if;
  return why;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Crate-regels in een tabel.
-- ---------------------------------------------------------------------------
create table if not exists public.crate_config (
  id          boolean primary key default true check (id),
  rules       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null
);

alter table public.crate_config enable row level security;
revoke all on public.crate_config from anon, authenticated;

-- Startwaarden: zoals STAP19, Great pack 200 (was 300), plus prijzen voor gericht kopen (STAP23).
insert into public.crate_config (rules) values (jsonb_build_object(
  'daily', 150,
  'trade_factor', 2,
  'crate_set', 500,
  'packs', jsonb_build_object('booster', 100, 'great', 200, 'master', 1000, 'set', 150, 'type', 300),
  'craft', jsonb_build_object('common', 40, 'uncommon', 60, 'rare', 100, 'double', 200, 'illustration', 300, 'special', 600)
)) on conflict (id) do nothing;

-- De regels voor de app en alle Crate-functies; zonder rij de startwaarden.
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
      'craft', jsonb_build_object('common', 40, 'uncommon', 60, 'rare', 100, 'double', 200, 'illustration', 300, 'special', 600)
    )
  );
$$;

revoke execute on function public.crate_rules() from public, anon;
grant execute on function public.crate_rules() to authenticated, service_role;

-- Inruilwaarde: factor uit de regels (stond vast op 2).
create or replace function public.crate_trade_value(p_rarity text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((public.crate_rules() ->> 'trade_factor')::integer, 2) * case
    when lower(coalesce(p_rarity, '')) in ('special illustration rare', 'hyper rare', 'mega hyper rare', 'crown') then 30
    when lower(coalesce(p_rarity, '')) in ('illustration rare', 'secret rare', 'shiny ultra rare') then 15
    when lower(coalesce(p_rarity, '')) in ('double rare', 'ultra rare', 'shiny rare', 'ace spec rare', 'radiant rare', 'amazing rare') then 10
    when lower(coalesce(p_rarity, '')) like '%rare%' then 5
    when lower(coalesce(p_rarity, '')) = 'uncommon' then 3
    else 2
  end;
$$;

revoke execute on function public.crate_trade_value(text) from public, anon, authenticated;

-- Regels wijzigen: alleen bekende sleutels, hele getallen binnen grenzen; ontbrekende sleutels blijven zoals ze waren.
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
  sub jsonb := '{"packs": ["booster", "great", "master", "set", "type"], "craft": ["common", "uncommon", "rare", "double", "illustration", "special"]}';
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

-- ---------------------------------------------------------------------------
-- 2. Per gebruiker: puntengeschiedenis en foutlogboek.
-- ---------------------------------------------------------------------------
create or replace function public.admin_user_ledger(p_user uuid, p_limit integer default 100)
returns table (created_at timestamptz, kind text, ref text, points integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select l.created_at, l.kind, l.ref, l.points
      from public.crate_ledger l
     where l.user_id = p_user
     order by l.created_at desc
     limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

revoke execute on function public.admin_user_ledger(uuid, integer) from public, anon;
grant execute on function public.admin_user_ledger(uuid, integer) to authenticated;

create or replace function public.admin_user_errors(p_user uuid, p_limit integer default 50)
returns table (created_at timestamptz, message text, context text, app_build text, user_agent text, stack text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select e.created_at, e.message, e.context, e.app_build, e.user_agent, left(e.stack, 1500)
      from public.app_errors e
     where e.user_id = p_user
     order by e.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_user_errors(uuid, integer) from public, anon;
grant execute on function public.admin_user_errors(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Scans per dag en eigen scanlimiet per gebruiker.
-- ---------------------------------------------------------------------------
create table if not exists public.scan_daily (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  scans    integer not null default 0,
  primary key (user_id, day)
);

alter table public.scan_daily enable row level security;
revoke all on public.scan_daily from anon, authenticated;

-- null = standaard (40 per minuut, 500 per 24 uur).
create table if not exists public.scan_limits (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  per_minute  integer check (per_minute between 1 and 200),
  per_day     integer check (per_day between 1 and 10000),
  updated_at  timestamptz not null default now()
);

alter table public.scan_limits enable row level security;
revoke all on public.scan_limits from anon, authenticated;

-- Zoals STAP15, met eigen limiet per gebruiker en telling per dag.
create or replace function public.scan_quota_take()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  lim_minute integer;
  lim_day integer;
  n_minute integer;
  n_day integer;
  oldest timestamptz;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  select l.per_minute, l.per_day into lim_minute, lim_day from public.scan_limits l where l.user_id = me;
  lim_minute := coalesce(lim_minute, 40);
  lim_day := coalesce(lim_day, 500);
  -- Gelijktijdige scans van dezelfde gebruiker na elkaar tellen (snel scannen stuurt er 3 tegelijk).
  perform pg_advisory_xact_lock(hashtextextended('scan_quota:' || me::text, 0));
  delete from public.scan_calls where user_id = me and at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 minute'), count(*), min(at)
    into n_minute, n_day, oldest
    from public.scan_calls where user_id = me;
  if n_minute >= lim_minute then
    return jsonb_build_object('ok', false, 'reason', 'minute', 'retry_after', 60);
  end if;
  if n_day >= lim_day then
    return jsonb_build_object('ok', false, 'reason', 'day',
      'retry_after', greatest(60, ceil(extract(epoch from (oldest + interval '1 day' - now()))))::integer);
  end if;
  insert into public.scan_calls (user_id) values (me);
  insert into public.scan_daily (user_id, day, scans) values (me, current_date, 1)
  on conflict (user_id, day) do update set scans = public.scan_daily.scans + 1;
  delete from public.scan_daily where user_id = me and day < current_date - 90;
  return jsonb_build_object('ok', true, 'left_today', lim_day - n_day - 1);
end;
$$;

revoke execute on function public.scan_quota_take() from public, anon;
grant execute on function public.scan_quota_take() to authenticated;

create or replace function public.admin_scan_stats(p_days integer default 14)
returns table (day date, scans bigint, users bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select d.day::date, coalesce(sum(s.scans), 0)::bigint, count(s.user_id)::bigint
      from generate_series(current_date - (least(greatest(coalesce(p_days, 14), 1), 90) - 1), current_date, interval '1 day') as d(day)
      left join public.scan_daily s on s.day = d.day::date
     group by d.day
     order by d.day desc;
end;
$$;

revoke execute on function public.admin_scan_stats(integer) from public, anon;
grant execute on function public.admin_scan_stats(integer) to authenticated;

-- null bij allebei = terug naar de standaard.
create or replace function public.admin_set_scan_limit(p_user uuid, p_per_minute integer, p_per_day integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  why := public.admin_reason(p_reason);
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;
  if p_per_minute is not null and p_per_minute not between 1 and 200 then
    raise exception 'Per minute must be between 1 and 200' using errcode = '22023';
  end if;
  if p_per_day is not null and p_per_day not between 1 and 10000 then
    raise exception 'Per day must be between 1 and 10000' using errcode = '22023';
  end if;
  if p_per_minute is null and p_per_day is null then
    delete from public.scan_limits where user_id = p_user;
  else
    insert into public.scan_limits (user_id, per_minute, per_day, updated_at) values (p_user, p_per_minute, p_per_day, now())
    on conflict (user_id) do update set per_minute = excluded.per_minute, per_day = excluded.per_day, updated_at = now();
  end if;
  perform public.admin_log(auth.uid(), p_user, 'set_scan_limit', null, why, jsonb_build_object('per_minute', p_per_minute, 'per_day', p_per_day));
end;
$$;

revoke execute on function public.admin_set_scan_limit(uuid, integer, integer, text) from public, anon;
grant execute on function public.admin_set_scan_limit(uuid, integer, integer, text) to authenticated;

-- Gebruikerslijst: zoals STAP21, plus scans in 30 dagen, eigen scanlimiet en of het account geblokkeerd is.
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  user_id          uuid,
  email            text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  is_admin         boolean,
  cards            bigint,
  crate_points     integer,
  scans_24h        bigint,
  scans_30d        bigint,
  errors_7d        bigint,
  scan_per_minute  integer,
  scan_per_day     integer,
  banned_until     timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select u.id,
           u.email::text,
           u.created_at,
           u.last_sign_in_at,
           exists (select 1 from public.admins a where a.user_id = u.id),
           (select count(*) from public.cards c where c.user_id = u.id and c.status <> 'sold'),
           coalesce((select w.points from public.crate_wallet w where w.user_id = u.id), 0),
           (select count(*) from public.scan_calls s where s.user_id = u.id and s.at > now() - interval '1 day'),
           (select coalesce(sum(d.scans), 0)::bigint from public.scan_daily d where d.user_id = u.id and d.day > current_date - 30),
           (select count(*) from public.app_errors e where e.user_id = u.id and e.created_at > now() - interval '7 days'),
           (select l.per_minute from public.scan_limits l where l.user_id = u.id),
           (select l.per_day from public.scan_limits l where l.user_id = u.id),
           u.banned_until
      from auth.users u
     order by u.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Mededeling aan alle gebruikers.
-- ---------------------------------------------------------------------------
create table if not exists public.announcements (
  id          uuid primary key default gen_random_uuid(),
  message     text not null check (char_length(message) between 3 and 300),
  level       text not null default 'info' check (level in ('info', 'warning')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users (id) on delete set null
);

alter table public.announcements enable row level security;
revoke all on public.announcements from anon, authenticated;
grant select on public.announcements to authenticated;
drop policy if exists "announcements_read_active" on public.announcements;
-- Iedereen die is ingelogd leest alleen de actieve mededeling; schrijven gaat via de functies.
create policy "announcements_read_active" on public.announcements for select to authenticated using (active);

-- Nieuwe mededeling (vervangt de vorige); lege tekst = weghalen.
create or replace function public.admin_set_announcement(p_message text, p_level text default 'info')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  msg text := btrim(coalesce(p_message, ''));
  new_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  update public.announcements set active = false where active;
  if msg = '' then
    perform public.admin_log(me, null, 'announce', null, 'Announcement removed', null);
    return null;
  end if;
  if char_length(msg) < 3 or char_length(msg) > 300 then
    raise exception 'Message must be 3 to 300 characters' using errcode = '22023';
  end if;
  if coalesce(p_level, 'info') not in ('info', 'warning') then
    raise exception 'Level must be info or warning' using errcode = '22023';
  end if;
  insert into public.announcements (message, level, created_by) values (msg, coalesce(p_level, 'info'), me) returning id into new_id;
  perform public.admin_log(me, null, 'announce', null, left(msg, 200), jsonb_build_object('level', coalesce(p_level, 'info')));
  return new_id;
end;
$$;

revoke execute on function public.admin_set_announcement(text, text) from public, anon;
grant execute on function public.admin_set_announcement(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Logboek met details en de nieuwe soorten (andere kolommen: eerst weghalen).
-- ---------------------------------------------------------------------------
drop function if exists public.admin_recent_actions(integer);
create function public.admin_recent_actions(p_limit integer default 50)
returns table (
  id            uuid,
  created_at    timestamptz,
  admin_email   text,
  target_email  text,
  action        text,
  points        integer,
  reason        text,
  details       jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.created_at, ua.email::text, ut.email::text, a.action, a.points, a.reason, a.details
      from public.admin_actions a
      left join auth.users ua on ua.id = a.admin_id
      left join auth.users ut on ut.id = a.target_user
     order by a.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_recent_actions(integer) from public, anon;
grant execute on function public.admin_recent_actions(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Reset account: zoals STAP20, plus scan_daily (de scanlimiet blijft staan).
-- ---------------------------------------------------------------------------
create or replace function public.reset_my_account()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  t text;
  n integer;
  result jsonb := '{}'::jsonb;
  tables text[] := array[
    'transaction_documents', 'transaction_lines', 'transactions',
    'card_photos', 'valuations', 'binder_slots', 'cards', 'locations',
    'wishlist_items', 'wishlist_lists', 'collection_goals',
    'scan_sessions', 'import_batches', 'user_settings',
    'crate_cards', 'crate_ledger', 'crate_wallet',
    'app_errors', 'scan_choices', 'scan_daily',
    'sales', 'purchases'
  ];
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null and exists (
      select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t and c.column_name = 'user_id'
    ) then
      execute format('delete from public.%I where user_id = $1', t) using me;
      get diagnostics n = row_count;
      result := result || jsonb_build_object(t, n);
    end if;
  end loop;
  return result;
end;
$$;

revoke execute on function public.reset_my_account() from public, anon;
grant execute on function public.reset_my_account() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP22 klaar' as resultaat,
       to_regclass('public.crate_config') is not null as regels,
       (public.crate_rules() -> 'packs' ->> 'great')::integer as great,
       to_regclass('public.scan_daily') is not null as scans,
       to_regclass('public.announcements') is not null as mededeling,
       has_function_privilege('anon', 'public.admin_set_crate_rules(jsonb, text)', 'execute') as anon_mag;
