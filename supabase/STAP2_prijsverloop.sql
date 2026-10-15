-- STAP 2 VAN 2: dagelijks prijsverloop. Pas draaien nadat STAP1 gelukt is.
-- Kopieer ALLES in dit bestand (Ctrl+A, Ctrl+C), plak in Supabase → SQL Editor → nieuwe query → Run.

-- Dagelijkse prijsopnames (Cardmarket via TCGdex) voor het prijsverloop. Idempotent.
-- Uitvoeren in Supabase Dashboard → SQL Editor, ná 002 en 003.
--
-- Werking: pg_cron start dagelijks request_price_snapshots(); die vuurt per gekoppelde kaart een
-- HTTP-verzoek af via pg_net (asynchroon). collect_price_snapshots() draait elk uur en verwerkt
-- de binnengekomen antwoorden tot price_snapshots. Antwoorden blijven 6 uur bewaard in pg_net.
--
-- Lukt "create extension pg_cron" niet: zet Cron aan via Dashboard → Integrations → Cron en draai dit script opnieuw.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Reverse-holoprijzen (TCGdex "-holo"-velden) naast de gewone prijzen.
alter table public.price_snapshots
  add column if not exists trend_holo numeric(10, 2),
  add column if not exists low_holo   numeric(10, 2),
  add column if not exists avg1_holo  numeric(10, 2),
  add column if not exists avg7_holo  numeric(10, 2),
  add column if not exists avg30_holo numeric(10, 2);

-- Openstaande verzoeken; niet bereikbaar voor de app (RLS aan, geen policies).
create table if not exists public.price_requests (
  request_id   bigint primary key,
  tcgdex_id    text not null,
  requested_on date not null default current_date
);
alter table public.price_requests enable row level security;

create or replace function public.request_price_snapshots() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer := 0;
  r record;
begin
  -- Oude, nooit beantwoorde verzoeken opruimen.
  delete from public.price_requests where requested_on < current_date - 2;

  for r in
    select distinct c.tcgdex_id
    from public.cards c
    where c.kind = 'card'
      and c.status <> 'sold'
      -- Alleen veilige sleutels ("en/sv03.5-151") in de URL.
      and c.tcgdex_id ~ '^[a-z]{2}(-[a-z]{2})?/[A-Za-z0-9._+-]{1,40}$'
      and not exists (
        select 1 from public.price_snapshots s
        where s.tcgdex_id = c.tcgdex_id and s.taken_on = current_date
      )
  loop
    insert into public.price_requests (request_id, tcgdex_id)
    values (
      net.http_get(
        url := 'https://api.tcgdex.net/v2/' || split_part(r.tcgdex_id, '/', 1) || '/cards/' || split_part(r.tcgdex_id, '/', 2),
        timeout_milliseconds := 10000
      ),
      r.tcgdex_id
    );
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.collect_price_snapshots() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  with resp as (
    select q.tcgdex_id, q.requested_on, (h.content::jsonb -> 'pricing' -> 'cardmarket') as cm
    from public.price_requests q
    join net._http_response h on h.id = q.request_id
    where h.status_code = 200
      and h.content_type like 'application/json%'
  ),
  ins as (
    insert into public.price_snapshots (
      tcgdex_id, taken_on, currency, trend, low, avg1, avg7, avg30,
      trend_holo, low_holo, avg1_holo, avg7_holo, avg30_holo
    )
    select
      tcgdex_id, requested_on, coalesce(cm ->> 'unit', 'EUR'),
      -- 0 betekent bij TCGdex "geen data".
      nullif((cm ->> 'trend')::numeric, 0),
      nullif((cm ->> 'low')::numeric, 0),
      nullif((cm ->> 'avg1')::numeric, 0),
      nullif((cm ->> 'avg7')::numeric, 0),
      nullif((cm ->> 'avg30')::numeric, 0),
      nullif((cm ->> 'trend-holo')::numeric, 0),
      nullif((cm ->> 'low-holo')::numeric, 0),
      nullif((cm ->> 'avg1-holo')::numeric, 0),
      nullif((cm ->> 'avg7-holo')::numeric, 0),
      nullif((cm ->> 'avg30-holo')::numeric, 0)
    from resp
    where jsonb_typeof(cm) = 'object'
    on conflict (tcgdex_id, taken_on) do update set
      trend = excluded.trend, low = excluded.low, avg1 = excluded.avg1, avg7 = excluded.avg7, avg30 = excluded.avg30,
      trend_holo = excluded.trend_holo, low_holo = excluded.low_holo, avg1_holo = excluded.avg1_holo,
      avg7_holo = excluded.avg7_holo, avg30_holo = excluded.avg30_holo
    returning 1
  )
  select count(*) into n from ins;

  -- Beantwoorde verzoeken (ook mislukte) zijn klaar.
  delete from public.price_requests q
  using net._http_response h
  where h.id = q.request_id;

  return n;
end;
$$;

-- Alleen de database zelf (cron) mag deze functies aanroepen, niet de app.
revoke execute on function public.request_price_snapshots() from public, anon, authenticated;
revoke execute on function public.collect_price_snapshots() from public, anon, authenticated;

-- Planning (tijden in UTC). TCGdex ververst prijzen rond 09:00 UTC.
select cron.unschedule(jobname) from cron.job where jobname in ('price-snapshots-request', 'price-snapshots-collect');
select cron.schedule('price-snapshots-request', '30 10 * * *', 'select public.request_price_snapshots()');
select cron.schedule('price-snapshots-collect', '45 * * * *', 'select public.collect_price_snapshots()');

-- Eerste opname meteen starten; wordt binnen het uur verwerkt door de collect-job.
select public.request_price_snapshots() as verzoeken_gestart;
