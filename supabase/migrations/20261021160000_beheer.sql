-- STAP21 (21-10-2026): beheer. Beheerders (tabel admins) kunnen gebruikers bekijken en Crate points toekennen of
-- afhalen. Wie beheerder is bepaalt alleen de database: elke beheerfunctie controleert dat eerst, de app verbergt
-- de pagina alleen. Elke actie komt met reden in een logboek (admin_actions) en als regel 'admin' in crate_ledger.
-- Veilig om opnieuw te draaien. Wist niets. Maakt nog niemand beheerder: zie de regel onderaan.
-- Handmatig: Supabase → SQL Editor → dit hele bestand plakken → Run.
-- Verwacht: "STAP21 klaar", beheer = true, gebruikers = true, punten = true, anon_mag = false.

begin;

-- 1. Wie beheerder is. Geen policies: via de API leest of schrijft niemand deze tabel (alleen de functies hieronder
--    en het Supabase-dashboard).
create table if not exists public.admins (
  user_id   uuid primary key references auth.users (id) on delete cascade,
  added_at  timestamptz not null default now()
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

-- 2. Logboek van beheeracties: wie deed wat bij wie, en waarom.
create table if not exists public.admin_actions (
  id           uuid primary key default gen_random_uuid(),
  admin_id     uuid references auth.users (id) on delete set null,
  target_user  uuid references auth.users (id) on delete cascade,
  action       text not null check (action in ('grant_points')),
  points       integer,
  reason       text not null check (char_length(reason) between 3 and 200),
  created_at   timestamptz not null default now()
);

create index if not exists admin_actions_created_idx on public.admin_actions (created_at desc);

alter table public.admin_actions enable row level security;
revoke all on public.admin_actions from anon, authenticated;

-- 3. Nieuwe soort boeking 'admin' (toegekend of afgehaald door een beheerder).
alter table public.crate_ledger drop constraint if exists crate_ledger_kind_check;
alter table public.crate_ledger
  add constraint crate_ledger_kind_check
  check (kind in ('card', 'sale', 'purchase', 'dex', 'set', 'daily', 'pack', 'trade', 'wish', 'crateset', 'admin'));

-- 4. Ben ik beheerder? (De app gebruikt dit alleen om de pagina te tonen.)
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.admins where user_id = (select auth.uid()));
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- 5. Alle gebruikers met wat je nodig hebt om te helpen; geen kaarten, foto's of bedragen.
create or replace function public.admin_list_users()
returns table (
  user_id          uuid,
  email            text,
  created_at       timestamptz,
  last_sign_in_at  timestamptz,
  is_admin         boolean,
  cards            bigint,
  crate_points     integer,
  scans_24h        bigint,
  errors_7d        bigint
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
           (select count(*) from public.app_errors e where e.user_id = u.id and e.created_at > now() - interval '7 days')
      from auth.users u
     order by u.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- 6. Crate points toekennen (positief) of afhalen (negatief, nooit onder 0). Geeft de nieuwe stand terug.
create or replace function public.admin_grant_points(p_user uuid, p_points integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  why text := btrim(coalesce(p_reason, ''));
  action_id uuid;
  balance integer;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 100000 then
    raise exception 'Points must be between -100000 and 100000, and not 0' using errcode = '22023';
  end if;
  if char_length(why) < 3 or char_length(why) > 200 then
    raise exception 'Give a reason (3 to 200 characters)' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'User not found' using errcode = '22023';
  end if;

  insert into public.crate_wallet (user_id) values (p_user) on conflict (user_id) do nothing;
  -- Vergrendelen, zodat twee acties tegelijk de stand niet onder 0 kunnen brengen.
  select points into balance from public.crate_wallet where user_id = p_user for update;
  if balance + p_points < 0 then
    raise exception 'Not enough points to take away (balance %)', balance using errcode = '22023';
  end if;

  insert into public.admin_actions (admin_id, target_user, action, points, reason)
  values (me, p_user, 'grant_points', p_points, why)
  returning id into action_id;
  insert into public.crate_ledger (user_id, kind, ref, points) values (p_user, 'admin', action_id::text, p_points);
  update public.crate_wallet set points = points + p_points, updated_at = now() where user_id = p_user
  returning points into balance;
  return balance;
end;
$$;

revoke execute on function public.admin_grant_points(uuid, integer, text) from public, anon;
grant execute on function public.admin_grant_points(uuid, integer, text) to authenticated;

-- 7. Laatste beheeracties (nieuwste eerst).
create or replace function public.admin_recent_actions(p_limit integer default 50)
returns table (
  id            uuid,
  created_at    timestamptz,
  admin_email   text,
  target_email  text,
  action        text,
  points        integer,
  reason        text
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
    select a.id, a.created_at, ua.email::text, ut.email::text, a.action, a.points, a.reason
      from public.admin_actions a
      left join auth.users ua on ua.id = a.admin_id
      left join auth.users ut on ut.id = a.target_user
     order by a.created_at desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;

revoke execute on function public.admin_recent_actions(integer) from public, anon;
grant execute on function public.admin_recent_actions(integer) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP21 klaar' as resultaat,
       to_regclass('public.admins') is not null as beheer,
       to_regprocedure('public.admin_list_users()') is not null as gebruikers,
       to_regprocedure('public.admin_grant_points(uuid, integer, text)') is not null as punten,
       has_function_privilege('anon', 'public.admin_list_users()', 'execute') as anon_mag;

-- Jezelf beheerder maken (één keer, los draaien, met je eigen e-mailadres):
--   insert into public.admins (user_id) select id from auth.users where email = 'jij@voorbeeld.nl' on conflict do nothing;
