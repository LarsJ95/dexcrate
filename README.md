# Dexcrate

Persoonlijke PWA voor een Pokémon-kaartencollectie: collectie, aan- en verkoop, marktwaarde (Cardmarket via TCGdex), set-voortgang, wishlist en kaarten scannen met de camera.

Live: https://larsj95.github.io/dexcrate/

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
| `npm run dev` | Ontwikkelserver |
| `npm run build` | Typecheck + productiebuild in `dist/` |
| `npm run lint` | oxlint (`.oxlintrc.json`) |
| `npm test` | Vitest |

Zonder sleutels start de app niet (`src/lib/supabase.ts`). De publishable key is publiek; de beveiliging loopt via RLS. Gebruik nooit de secret key in de app.

## Online zetten

Elke push naar `main` draait `.github/workflows/deploy.yml`: lint → test → build → GitHub Pages. De Supabase-URL en publishable key staan als repository variables. Tests draaien daar **zonder** sleutels: een test die (indirect) `src/lib/supabase.ts` laadt, moet `vi.mock('…/supabase', …)` gebruiken plus een dynamische import (zie bv. `src/lib/model.test.ts`).

## Database

Wijzigingen gaan als SQL-bestand dat je zelf in Supabase → SQL Editor draait (alles plakken, één keer Run).

- `supabase/STAP*.sql`: de stappen zoals ze op de bestaande database zijn gedraaid, in volgorde.
- `supabase/schema.sql`: volledig schema voor een **nieuw, leeg** project (eindstand van alle stappen). Na een nieuw STAP-bestand: voeg het toe aan `PARTS` in `supabase/build-schema.mjs` en draai `node supabase/build-schema.mjs`.

## Edge Functions

In `supabase/functions/`, via de editor in het Supabase-dashboard gedeployd (controleer bij deployen het naamveld). "Verify JWT" blijft aan.

- `recognize-card`: herkent kaarten op een foto met Claude. Secret: `ANTHROPIC_API_KEY`. Limiet per gebruiker (40 per minuut, 500 per 24 uur) via `scan_quota_take()` uit STAP15; zonder STAP15 werkt scannen zonder limiet.
- `card-image`: laatste redmiddel voor kaartfoto's via PriceCharting.

## Foutlogboek

Crashes en onafgevangen fouten (geen netwerkfouten) gaan naar de tabel `app_errors` (STAP16, alleen eigen regels): Supabase → Table Editor → `app_errors`. Zie `src/lib/errorLog.ts`.

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

`npm run build` en daarna `npm run test:e2e` (of `node tools/e2e/run.mjs scan-queue` voor één test): headless Chrome via het DevTools-protocol, geen extra dependency. Supabase wordt in de browser nagebootst (nep-sessie, testdata uit `tools/e2e/fixtures`); er gaat niets naar je echte database, `.env.local` is alleen nodig voor het Supabase-adres. Test nu: offline-cache (collectie/wishlist offline, gewist na uitloggen), foutlogboek en de scanlijst (IndexedDB, in stukken, grens van 250). Niet in CI: Chrome is daar niet ingericht.

## Bekende melding van npm audit

`npm audit` meldt `uuid < 11.1.1` via `exceljs` (alleen gebruikt voor de Excel-import). Bewust zo gelaten (17-10-2026): het lek zit in `uuid` v3/v5/v6 met een `buf`-argument, terwijl exceljs alleen `v4()` gebruikt; bovendien laadt de app de kant-en-klare `exceljs/dist/exceljs.min.js` met een eigen kopie, dus een override zou alleen de melding stilzetten. Opnieuw bekijken als exceljs een nieuwe versie uitbrengt.

## Visueel controleren

`preview.html` (alleen in de ontwikkelserver) toont pagina's met voorbeelddata, bv. `/preview.html?page=collectionpage`, `?page=binder&set=en/sv03.5`, `?page=settings&theme=light`. Zie `src/preview/Preview.tsx` voor alle opties.
