-- STAP30 (24-10-2026, voorbereiding op live gaan): totaalplafond voor scans per dag over alle gebruikers samen (standaard
-- 2000), bovenop de grens per gebruiker (500 per dag, 40 per minuut). Zo kan een drukke dag de AI-kosten niet laten
-- ontsporen. Aan te passen in Admin → Scans (0 = scannen voor iedereen uit). Bereikt: de scan wordt geweigerd met reden
-- "day" (de huidige recognize-card-functie meldt dan "Daily scan limit reached", zonder nieuwe deploy) en scope "total".
-- Nieuwe tabel scan_config met expliciete rechten. Wist niets. Veilig om opnieuw te draaien. Via "Database migreren".
-- Verwacht: "STAP30 klaar", total_per_day = 2000 (of de eigen waarde), anon_mag = false.

begin;

create table if not exists public.scan_config (
  id             boolean primary key default true check (id),
  total_per_day  integer not null default 2000 check (total_per_day between 0 and 100000),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null
);

alter table public.scan_config enable row level security;
revoke all on public.scan_config from anon, authenticated;
grant select, insert, update, delete on public.scan_config to service_role;

insert into public.scan_config (id) values (true) on conflict (id) do nothing;

-- Logboek: nieuwe soort actie.
alter table public.admin_actions drop constraint if exists admin_actions_action_check;
alter table public.admin_actions
  add constraint admin_actions_action_check
  check (action in ('grant_points', 'set_rules', 'set_scan_limit', 'announce', 'invite', 'ban', 'unban', 'delete_user', 'set_scan_total'));

-- Scan tellen of weigeren (zoals STAP22), nu ook met het totaalplafond.
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
  lim_total integer;
  n_minute integer;
  n_day integer;
  n_total integer;
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
  -- Totaal van vandaag over iedereen; één tegelijk tellen (altijd na het slot per gebruiker: vaste volgorde).
  select coalesce((select c.total_per_day from public.scan_config c where c.id), 2000) into lim_total;
  perform pg_advisory_xact_lock(hashtextextended('scan_quota:total', 0));
  select coalesce(sum(d.scans), 0) into n_total from public.scan_daily d where d.day = current_date;
  if n_total >= lim_total then
    return jsonb_build_object('ok', false, 'reason', 'day', 'scope', 'total',
      'retry_after', greatest(60, ceil(extract(epoch from (date_trunc('day', now()) + interval '1 day' - now()))))::integer);
  end if;
  insert into public.scan_calls (user_id) values (me);
  insert into public.scan_daily (user_id, day, scans) values (me, current_date, 1)
  on conflict (user_id, day) do update set scans = public.scan_daily.scans + 1;
  delete from public.scan_daily where user_id = me and day < current_date - 90;
  return jsonb_build_object('ok', true, 'left_today', least(lim_day - n_day, lim_total - n_total) - 1);
end;
$$;

revoke execute on function public.scan_quota_take() from public, anon;
grant execute on function public.scan_quota_take() to authenticated;

-- Admin: plafond en gebruik van vandaag lezen.
create or replace function public.admin_scan_total()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total_per_day', coalesce((select c.total_per_day from public.scan_config c where c.id), 2000),
    'used_today', coalesce((select sum(d.scans) from public.scan_daily d where d.day = current_date), 0)
  );
end;
$$;

revoke execute on function public.admin_scan_total() from public, anon;
grant execute on function public.admin_scan_total() to authenticated;

-- Admin: plafond aanpassen (0 = scannen voor iedereen uit), met reden in het logboek.
create or replace function public.admin_set_scan_total(p_total integer, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  why text;
  before integer;
begin
  if not public.is_admin() then
    raise exception 'Not allowed' using errcode = '42501';
  end if;
  why := public.admin_reason(p_reason);
  if p_total is null or p_total not between 0 and 100000 then
    raise exception 'Scans per day must be between 0 and 100000' using errcode = '22023';
  end if;
  select c.total_per_day into before from public.scan_config c where c.id;
  insert into public.scan_config (id, total_per_day, updated_at, updated_by) values (true, p_total, now(), auth.uid())
  on conflict (id) do update set total_per_day = excluded.total_per_day, updated_at = now(), updated_by = auth.uid();
  perform public.admin_log(auth.uid(), null, 'set_scan_total', null, why, jsonb_build_object('before', before, 'after', p_total));
  return p_total;
end;
$$;

revoke execute on function public.admin_set_scan_total(integer, text) from public, anon;
grant execute on function public.admin_set_scan_total(integer, text) to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP30 klaar' as resultaat,
       (select c.total_per_day from public.scan_config c where c.id) as total_per_day,
       has_function_privilege('anon', 'public.admin_set_scan_total(integer, text)', 'execute') as anon_mag;
