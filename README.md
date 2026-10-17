# Dexcrate

Persoonlijke PWA voor een Pokémon-kaartencollectie: collectie, aan- en verkoop, marktwaarde (Cardmarket via TCGdex), set-voortgang, wishlist en kaarten scannen met de camera.

Live: https://dexcrate.com (landingspagina) en https://dexcrate.com/app/ (de app) (sinds 17-10-2026; het oude adres https://larsj95.github.io/dexcrate/ stuurt door). Domein bij Versio (DNS: 4× A en 4× AAAA naar GitHub Pages, CNAME `www` → `larsj95.github.io`, TXT `_github-pages-challenge-LarsJ95` voor de domeinverificatie; geen wildcard-records). Custom domain en Enforce HTTPS staan in de repo-instellingen (Pages), geen CNAME-bestand nodig bij publiceren via Actions.

## Stack

- React 19 + TypeScript + Vite (PWA via `vite-plugin-pwa`, hash-routing)
- Supabase: database met Row Level Security, opslag (foto's, bonnetjes), Edge Functions
- Kaartdata en prijzen: TCGdex; extra beeldbronnen in `src/lib/cardImages.ts` en `src/lib/setIcons.ts`

## Starten

```sh
npm install
cp .env.example .env.local   # vul VITE_SUPABASE_URL en VITE_SUPABASE_PUBLISHABLE_KEY in
npm run dev
```

| Script | Doet |
| --- | --- |
| `npm run dev` | Ontwikkelserver op **productie**-data (`.env.local`) |
| `npm run dev:staging` | Ontwikkelserver op de **testdatabase** (`.env.staging.local`), met rood TEST-label |
| `npm run build` | Typecheck + productiebuild in `dist/` |
| `npm run build:staging` | Build tegen de testdatabase |
| `npm run lint` | oxlint (`.oxlintrc.json`) |
| `npm test` | Vitest (altijd zonder Supabase-sleutels, net als CI) |
| `npm run test:e2e` | Browsertests (na `npm run build`) |

Zonder sleutels start de app niet (`src/lib/supabase.ts`). De publishable key is publiek; de beveiliging loopt via RLS. Gebruik nooit de secret key in de app. `dev:staging` en `build:staging` weigeren te starten zonder `.env.staging.local` die naar een ánder project wijst dan `.env.local`.

## Werkwijze en online zetten

`main` is beschermd: wijzigingen gaan via een branch en pull request.

1. Branch maken, wijzigen, pushen, pull request openen.
2. `.github/workflows/ci.yml` draait op elke pull request: lint → tests → build → browsertests (Chrome). Pas als die groen is kan de pull request erin.
3. Samenvoegen in `main` draait `.github/workflows/deploy.yml`: lint → test → build → GitHub Pages. De Supabase-URL en publishable key staan als repository variables.

Tests draaien **zonder** Supabase-sleutels: een test die (indirect) `src/lib/supabase.ts` laadt, moet `vi.mock('…/supabase', …)` gebruiken plus een dynamische import (zie bv. `src/lib/model.test.ts`).

## Database

Het schema staat in migraties: `supabase/migrations/<tijdstempel>_<naam>.sql`, toegepast met de Supabase CLI (vaste versie via `npx supabase@2.119.0`, geen Docker nodig, geen dependency).

Nieuwe databasewijziging:

1. `npx supabase@2.119.0 migration new <naam>` en de SQL in het nieuwe bestand schrijven. Nooit een bestaande migratie aanpassen.
2. Pull request openen: `.github/workflows/migrate.yml` zet de migratie automatisch op de **testdatabase**. Test met `npm run dev:staging`.
3. Goed? Vóór het samenvoegen: Actions → *Database migreren* → Run workflow → branch van de pull request, target `production`, mode `migrate`. Daarna samenvoegen (de app gaat dan pas live).

Secrets per GitHub environment (`staging`, `production`): `SUPABASE_DB_URL` = de **Session pooler**-verbinding uit Supabase → Connect (wachtwoord percent-encoded). Productie heeft daarnaast `BACKUP_PASSPHRASE`.

- `supabase/migrations/20261017120000_baseline.sql`: het volledige schema na STAP16 (startpunt). Op productie alleen als toegepast gemarkeerd (eenmalig: workflow met mode `mark-baseline`); tot dan weigert de workflow productie, zodat de basismigratie daar nooit draait.
- `supabase/legacy/`: de oude STAP-bestanden en `schema.sql` (geschiedenis; niet meer gebruiken).
- `supabase/config.toml`: nodig voor de CLI; geldt alleen voor een lokale stack. Nooit `supabase config push` zonder het hele bestand te controleren.

## Back-ups

`.github/workflows/backup.yml`: elke maandag (en met de hand via Actions) een dump van de productiedatabase (rollen, schema, data), **versleuteld** met `BACKUP_PASSPHRASE` en 90 dagen bewaard als artifact. De repo is publiek: de workflow stopt als de passphrase ontbreekt. Bewaar de passphrase in je wachtwoordmanager: zonder is een back-up onbruikbaar. Foto's en bonnetjes (Supabase Storage) zitten er niet in; die staan in de back-up van de app zelf (Backup-pagina). GitHub zet geplande workflows uit na 60 dagen zonder activiteit in de repo (dan een mail; opnieuw aanzetten in Actions).

Terugzetten (in een nieuw, leeg project):

```sh
gpg -d dexcrate-backup-JJJJ-MM-DD.tar.gz.gpg | tar -xzf -
psql --single-transaction --variable ON_ERROR_STOP=1 \
  --file dexcrate-backup/roles.sql --file dexcrate-backup/schema.sql \
  --command 'SET session_replication_role = replica' \
  --file dexcrate-backup/data.sql --dbname "<Session pooler-URL van het nieuwe project>"
```

## Edge Functions

In `supabase/functions/`, via de editor in het Supabase-dashboard gedeployd (controleer bij deployen het naamveld). "Verify JWT" blijft aan.

- `recognize-card`: herkent kaarten op een foto met Claude. Secret: `ANTHROPIC_API_KEY`. Limiet per gebruiker (40 per minuut, 500 per 24 uur) via `scan_quota_take()` (STAP15, in de basismigratie); zonder werkt scannen zonder limiet.
- `card-image`: laatste redmiddel voor kaartfoto's via PriceCharting.

## Foutlogboek

Crashes en onafgevangen fouten (geen netwerkfouten) gaan naar de tabel `app_errors` (STAP16, alleen eigen regels): Supabase → Table Editor → `app_errors`. Zie `src/lib/errorLog.ts`.

## Landingspagina en SEO

Sinds 17-10-2026: dexcrate.com is een statische landingspagina (`landing/`), de app staat op dexcrate.com/app/.

- `npm run build` bouwt de app in `dist/app/` (Vite, `build.outDir`) en zet daarna met `tools/build-landing.mjs` de landingspagina in `dist/`: `index.html`, `404.html`, `robots.txt`, `sitemap.xml` (lastmod = bouwdatum), `og-image.png`, favicons en het lettertype.
- De landingspagina is gewone HTML/CSS (geen JavaScript nodig): titel, beschrijving, canonical, Open Graph/Twitter-preview en structured data (WebSite, WebApplication, FAQPage). FAQ-tekst staat twee keer (zichtbaar en in de JSON-LD): bij aanpassen beide wijzigen.
- De app heeft `noindex`. Oude links `dexcrate.com/#/…` sturen door naar `/app/#/…`. `landing/sw.js` ruimt de service worker op die de app vóór de verhuizing op de hoofdmap had (alleen de precache van `/`, niet die van `/app/`).
- Deelafbeelding opnieuw maken: `node tools/og-image.mjs` (schrijft `landing/og-image.png`).
- Lighthouse op de landingspagina (17-10-2026, mobiel): prestaties, toegankelijkheid, best practices en SEO allemaal 100.
- Merkdisclaimer (niet gelieerd aan Nintendo/The Pokémon Company e.d.) staat in de footer; geen kaartplaatjes op de landingspagina.

## Code

- `src/pages/`: één bestand per route; alle pagina's en de app-schil worden pas na het inloggen geladen (lazy, `src/App.tsx`)
- `src/components/`: onderdelen; `*Parts.tsx` bundelt kleine stukken van één pagina
- `src/lib/`: logica zonder React (getest met `*.test.ts`)
- `src/hooks/`: gedeelde React-hooks
- `src/styles/`: CSS per onderdeel; de volgorde in `src/App.css` is de cascade
- Componenttests: `*.test.tsx` met `// @vitest-environment jsdom` bovenaan en Testing Library

UI-werk: lees eerst `DESIGN.md`.

## Snelheid meten (Lighthouse)

`npm run build` en daarna `node tools/lighthouse.mjs [routes]`: mobiel (middenklasse-telefoon, trage 4G), eerst het inlogscherm bij een eerste bezoek, daarna de routes als ingelogde gebruiker. Voor echte data: `LH_EMAIL` en `LH_PASSWORD` in `.env.local` (niet in git, niet in de app). Uitleg en opties bovenin het script.

## Browsertests

`npm run build` en daarna `npm run test:e2e` (of `node tools/e2e/run.mjs scan-queue` voor één test): headless Chrome via het DevTools-protocol, geen extra dependency. Supabase wordt in de browser nagebootst (nep-sessie, testdata uit `tools/e2e/fixtures`); er gaat niets naar je echte database, `.env.local` is alleen nodig voor het Supabase-adres. Test nu: offline-cache (collectie/wishlist offline, gewist na uitloggen), foutlogboek en de scanlijst (IndexedDB, in stukken, grens van 250). Draaien ook in CI op elke pull request (`CHROME_PATH` = Chrome van de runner).

## Bekende melding van npm audit

`npm audit` meldt `uuid < 11.1.1` via `exceljs` (alleen gebruikt voor de Excel-import). Bewust zo gelaten (17-10-2026): het lek zit in `uuid` v3/v5/v6 met een `buf`-argument, terwijl exceljs alleen `v4()` gebruikt; bovendien laadt de app de kant-en-klare `exceljs/dist/exceljs.min.js` met een eigen kopie, dus een override zou alleen de melding stilzetten. Opnieuw bekijken als exceljs een nieuwe versie uitbrengt.

## Visueel controleren

`preview.html` (alleen in de ontwikkelserver) toont pagina's met voorbeelddata, bv. `/preview.html?page=collectionpage`, `?page=binder&set=en/sv03.5`, `?page=settings&theme=light`. Zie `src/preview/Preview.tsx` voor alle opties.
