-- STAP 15: limiet op scans (kosten van de herkenning begrenzen). Per gebruiker hoogstens 40 foto's per minuut
-- en 500 per 24 uur. De Edge Function recognize-card vraagt per foto eerst toestemming aan scan_quota_take().
-- Kopieer ALLES in dit bestand, plak in Supabase → SQL Editor → nieuwe lege query → Run.
-- Veilig: één transactie, alleen toevoegen, opnieuw draaien kan. Raakt je kaarten niet aan.
-- Limieten aanpassen: de twee getallen in scan_quota_take() wijzigen en dit bestand opnieuw draaien.

begin;

-- Eén rij per toegestane scan; ouder dan een dag wordt opgeruimd. Niet bereikbaar voor de app (RLS aan, geen policies).
create table if not exists public.scan_calls (
  id      bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);

create index if not exists scan_calls_user_at_idx on public.scan_calls (user_id, at);

alter table public.scan_calls enable row level security;
revoke all on public.scan_calls from anon, authenticated;

-- Toestemming voor één scan: { ok: true, left_today } of { ok: false, reason: 'minute' | 'day', retry_after (seconden) }.
create or replace function public.scan_quota_take()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  per_minute constant integer := 40;
  per_day constant integer := 500;
  n_minute integer;
  n_day integer;
  oldest timestamptz;
begin
  if me is null then
    raise exception 'Not signed in';
  end if;
  -- Gelijktijdige scans van dezelfde gebruiker na elkaar tellen (snel scannen stuurt er 3 tegelijk).
  perform pg_advisory_xact_lock(hashtextextended('scan_quota:' || me::text, 0));
  delete from public.scan_calls where user_id = me and at < now() - interval '1 day';
  select count(*) filter (where at > now() - interval '1 minute'), count(*), min(at)
    into n_minute, n_day, oldest
    from public.scan_calls where user_id = me;
  if n_minute >= per_minute then
    return jsonb_build_object('ok', false, 'reason', 'minute', 'retry_after', 60);
  end if;
  if n_day >= per_day then
    return jsonb_build_object('ok', false, 'reason', 'day',
      'retry_after', greatest(60, ceil(extract(epoch from (oldest + interval '1 day' - now()))))::integer);
  end if;
  insert into public.scan_calls (user_id) values (me);
  return jsonb_build_object('ok', true, 'left_today', per_day - n_day - 1);
end;
$$;

revoke execute on function public.scan_quota_take() from public, anon;
grant execute on function public.scan_quota_take() to authenticated;

commit;

notify pgrst, 'reload schema';

select 'STAP15 klaar' as resultaat,
       to_regprocedure('public.scan_quota_take()') is not null as limiet,
       has_function_privilege('anon', 'public.scan_quota_take()', 'execute') as anon_mag;
