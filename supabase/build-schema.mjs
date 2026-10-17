// Bouwt supabase/schema.sql: één installatiescript voor een lege database (eindstand van alle STAP-bestanden).
// Gebruik: node supabase/build-schema.mjs  (nieuw STAP-bestand? Voeg het toe aan PARTS.)
import { readFileSync, writeFileSync } from 'node:fs'

const DIR = new URL('./', import.meta.url)
const PARTS = [
  '002_cards.sql',
  '004_price_snapshots.sql',
  'STAP4_datamodel.sql',
  'STAP5_transacties.sql',
  'STAP6_doelen_wishlist.sql',
  'STAP7_waardering.sql',
  'STAP8_binders_scans.sql',
  'STAP10_wishlist_lijsten.sql',
  'STAP11_crate_game.sql',
  'STAP12_crate_pakjes.sql',
  'STAP13_crate_wens.sql',
  'STAP14_account_reset.sql',
]

const header = `-- Dexcrate: volledig databaseschema voor een NIEUW, leeg Supabase-project (eindstand van alle STAP-bestanden).
-- Gegenereerd uit de losse bestanden hieronder; bij een nieuw STAP-bestand dit bestand opnieuw opbouwen met: node supabase/build-schema.mjs
-- Uitvoeren in Supabase Dashboard → SQL Editor: alles plakken en één keer Run. Opnieuw draaien kan.
--
-- NIET draaien op de bestaande database: die is al bijgewerkt via de STAP-bestanden.
--
-- Volgorde en herkomst:
${PARTS.map((p) => `--   ${p}`).join('\n')}
-- Bewust niet opgenomen:
--   003_migrate_to_cards.sql / STAP1 (eenmalige overzetting uit sales/purchases; STAP1 = 002 + 003),
--   STAP2 (= 004), STAP3 (vervangen door STAP4), STAP9 (verwijderde sales/purchases).
-- Nog in de database maar niet meer in de app: locations, binder_slots en cards.location_* (Locations-scherm is weg).
--
-- Vereist: extensies pg_net en pg_cron (zie 004). Lukt "create extension pg_cron" niet:
-- zet Cron aan via Dashboard → Integrations → Cron en draai dit script opnieuw.

-- ===========================================================================
-- Basis: updated_at-trigger en gedeelde prijsopnames
-- ===========================================================================

-- updated_at bijhouden
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Dagelijkse prijsmomentopnames (Cardmarket via TCGdex), gedeeld per kaart.
create table if not exists public.price_snapshots (
  tcgdex_id  text not null check (char_length(tcgdex_id) <= 50),
  taken_on   date not null default current_date,
  currency   text not null default 'EUR',
  trend      numeric(10, 2),
  low        numeric(10, 2),
  avg1       numeric(10, 2),
  avg7       numeric(10, 2),
  avg30      numeric(10, 2),
  primary key (tcgdex_id, taken_on)
);

alter table public.price_snapshots enable row level security;

-- Prijzen zijn publieke marktdata: ingelogd mag lezen; schrijven alleen via server-side job (geen policy = geen client-writes).
drop policy if exists "snapshots_read" on public.price_snapshots;
create policy "snapshots_read" on public.price_snapshots
  for select to authenticated
  using (true);
`

const body = PARTS.map((p) => {
  const sql = readFileSync(new URL(p, DIR), 'utf8').replace(/\r\n/g, '\n').trimEnd()
  return `\n-- ===========================================================================\n-- Uit ${p}\n-- ===========================================================================\n\n${sql}\n`
}).join('')

writeFileSync(new URL('schema.sql', DIR), header + body + `\nselect 'schema klaar' as resultaat;\n`)
console.log('geschreven:', PARTS.length, 'delen')
