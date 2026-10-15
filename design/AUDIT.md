# Audit huidige UI (DESIGN.md sectie 0)

Datum: 15-10-2026. Bron: `src/index.css`, `src/App.css`, componenten in `src/`. Gemeten met een script (fonts, kleuren, spacing, radius, schaduwen, breakpoints, animaties) en contrastberekening (WCAG).

## 1. Inventaris

**Fonts**
- Eén familie: Archivo (Google Fonts via CDN, `display=swap`), fallback `system-ui, Segoe UI, Roboto, sans-serif`.
- Gewichten in gebruik: 400 (1×), 500 (2×), 600 (19×), 700 (11×), 800 (12×).
- Groottes: 3 tokens (`--fs-label` 12,8px, `--fs-small` 14px, `--fs-stat` 24px, `--fs-h2` 19,2px) plus 26 losse waarden (0,68rem t/m clamp(2,8rem, 9vw, 4,75rem)).

**Kleuren**
- Tokens in `index.css` voor donker (standaard) en licht thema: achtergrond, 3 oppervlakniveaus, 2 randen, 3 tekstniveaus, accent geel, blauw (links/grafiek), groen, rood, oranje, en lichte varianten daarvan.
- Buiten tokens: 42 verschillende `rgb()`-waarden in `App.css` (overlays, gloed, schaduwen, holo-gradiënten), plus losse hex `#fff`, `#000`, `#13224d`, `#0a1226`, `#eaf0ff`, `#0e1a3a` in componentstijlen.
- In TSX-componenten: geen hardcoded kleuren.

**Spacing**: rem-waarden; op de 4px-schaal: 4, 8, 12, 16, 24, 32, 48, 64. Buiten de schaal: 1,6 / 2,4 / 3,2 / 4,8 / 5,6 / 6,4 / 7,2 / 8,8 / 9,6 / 10,4 / 11,2 / 12,8 / 13,6 / 14,4 / 17,6 / 20 / 28 / 38,4 / 40 / 56 px (samen ±120 plekken).

**Radius**: tokens s 8px, m 14px, l 14px; daarnaast 3px, 4px, 6px, 12px, 999px (pillen), 50% (rond), 4,5%/3,2% (kaartvorm).

**Schaduwen**: `--shadow-card` (op panelen, stat-tegels, kaarten), `--shadow-pop` (popup, dropdowns, chart-tip), plus 8 losse schaduwen (scanknop, focus-ringen, camerakader, login-kaartjes).

**Breakpoints**: 860 (navigatie), 760 (login), 560, 520, 480, 420 px; plus `hover: hover` en `prefers-reduced-motion`.

**Componenten en states**
- Knoppen: standaard (secundair), `primary` (geel), `ghost`, `danger`, `danger-text`, `icon-btn`, segmented; hover, active (1px omlaag), focus-visible (gele ring), disabled (50% dekking). Geen loading-state als stijl (tekst "Saving…").
- Invoer/select: hover, focus (blauwe rand), placeholder; geen error-state op het veld zelf (fout staat onder het formulier, niet onder het veld).
- Kaarttegel, kaart-popup (weergave/formulier), stat-tegel, paneel, set-rij, binder-vak, scan-rij, meter, grafiek, camera-overlay, getekende kaartvoorkant (incl. loading).
- Lege en foutstaten: aanwezig per pagina (tekst + "Try again").

**Animaties** (geen libraries, alleen CSS)
- Hover-overgangen: kleur/rand 120 ms, transform 120–180 ms, schaduw 180 ms.
- Kaarttegel: optillen + glans bij hover (transform, opacity én background-position).
- Holo-glans (`foil-sweep`, 7 s cyclus, transform).
- Laad-shimmer kaartvoorkant (`face-shimmer`, background-position).
- `prefers-reduced-motion`: alle animaties en overgangen uit.

## 2. Afwijkingen van DESIGN.md

| Regel | Huidige situatie |
|---|---|
| Fonts self-hosten (§3) | Via Google Fonts CDN |
| Geen tekst onder 14px (§3) | 14 plekken: 10,9 / 11,2 / 11,5 (4×) / 12 / 12,5 (2×) / 12,8 (2× + label-token) / 13,1 / 13,6 (2×) px |
| Contrast AA (§4) | Licht thema: gele focusrand op achtergrond 1,39:1 (min. 3:1); groene kleine tekst 4,12:1 (min. 4,5:1). Donker thema: alle gemeten paren OK |
| Alle kleuren als token (§4) | 42 losse `rgb()` + 6 losse hex in `App.css` |
| Spacing-schaal (§5) | ±120 waarden buiten de schaal |
| Eén radius-systeem (§6) | 8 / 14 + 5 losse waarden |
| Eén hoofdmiddel voor diepte (§6) | Randen én schaduwen én kleurvlakken door elkaar |
| Animeer alleen transform/opacity (§9) | Kleur-, rand-, schaduw- en background-position-overgangen |
| Animatie betekenisvol, geen decoratie (§9) | Holo-glans is decoratief (wel door jou gevraagd) |
| Componentstates (§8) | Geen loading-stijl op knoppen; geen fout onder het veld in formulieren |
| Lighthouse ≥ 90 (§12) | Nog niet gemeten |

## 3. Verboden-lijst (§11)

- **Glassmorphism**: `backdrop-filter: blur` op mobiele topbalk, onderbalk, popup-achtergrond en statusbadge.
- **Blauw verloop**: login-merkpaneel (navy-verloop), achtergrondgloed (blauw), kaartvoorkant (blauwe/gele gloed), hero (gele gloed + verloop). Geen gradient-tekst.
- **Tekens als icoon**: ✓ (Sold), ▲ ▼ ■ (prijsbeweging), ← (terug). Geen emoji in strikte zin, wel tekstglyphs als icoon.
- **Overal dezelfde radius met schaduw**: panelen, stat-tegels en kaarten delen 14px + `--shadow-card`.
- **Willekeurige spacing buiten de schaal**: zie §2.
- **Hardcoded waarden**: in `App.css` (niet in componenten).
- Niet aangetroffen: Inter/Roboto/Arial als hoofdfont, gecentreerde hero met drie feature cards, fade-in-up op elk element, shadcn/Tailwind, nieuwe libraries.

## 4. Migratieplan (kleine stappen, elk apart te keuren)

0. **Fundament** (geen zichtbare pagina-wijziging): tokens voor spacing (4px-schaal), typeschaal (min. 14px), radius, schaduw/diepte en alle losse kleuren; `App.css` alleen nog via tokens. Secties 5, 6 en 9 ingevuld 15-10-2026. ✔ Gedaan 15-10-2026 (spacing, radius, schaduw, kleuren; typeschaal volgt in stap 4, hover-glans vervalt in stap 5).
1. **Contrast**: focusring en groene tekst in licht thema op AA. ✔ Gedaan 15-10-2026: tokens `--focus` en `--accent-line`; licht groen #0a7a4c, oranje #8a5000 (alle gemeten paren ≥ 4,5:1 voor tekst, ≥ 3:1 voor lijnen).
2. **Fonts self-hosten**: Archivo als woff2 in `public/fonts` met `@font-face`, `font-display: swap` (bestand toevoegen, geen npm-pakket). ✔ Gedaan 15-10-2026: in `src/assets/fonts` (Vite geeft hash en juiste base-pad), latin + latin-ext, OFL-licentie erbij, in de offline-precache.
3. **Verboden-lijst**: blur vervangen door effen vlakken; verlopen weg of expliciet toestaan; tekstglyphs vervangen door SVG-iconen uit de bestaande iconenset.
4. **Per pagina** (telkens screenshots 1440 en 390 px + alle states): app-schil/navigatie → Collection (tegels) → kaart-popup → Overview → Sets/binder → Scan → Import → Login.
5. **Animaties**: alleen transform/opacity; holo-glans en hover-glans vastleggen in §9 of verwijderen.
6. **Kwaliteitscheck** per pagina volgens §12 (Lighthouse, toetsenbord, reduced motion, CLS).
