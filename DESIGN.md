# DESIGN.md

Dit document is leidend voor alle UI-, styling- en animatiewerk in dit project.
Lees het volledig vóór elke UI-wijziging. Bij conflict tussen bestaande code en dit document: meld het conflict eerst, pas niets aan zonder akkoord.

Velden met `___` vul ik zelf in. Verzin geen waarden voor lege velden: vraag ernaar.


## 0. Lopend project: eenmalige audit (eerst uitvoeren)

Voer deze stap uit vóórdat je iets aanpast:

1. Inventariseer de huidige situatie:
   - Gebruikte fonts, gewichten en groottes
   - Alle kleuren (hex) en waar ze voorkomen
   - Spacing, radius, schaduwen, breakpoints
   - Componenten en hun states
   - Animaties en gebruikte libraries
2. Rapporteer:
   - Afwijkingen van dit document
   - Alles wat op de verboden-lijst (sectie 11) staat
   - Hardcoded waarden die tokens zouden moeten zijn
3. Stel een migratieplan voor, per pagina of sectie, in kleine stappen.
4. Wacht op akkoord. Daarna sectie voor sectie uitvoeren.


## 1. Merk en toon

- Product: Binderline, persoonlijke web-app/PWA voor een Pokémon-kaartencollectie: collectie, aankoop en verkoop, marktwaarde (Cardmarket), set-voortgang en scannen met de camera.
- Doelgroep: de eigenaar zelf, verzamelaar en verkoper; gebruikt de app vooral op de telefoon.
- Gevoel in 3 woorden: modern, professioneel, overzichtelijk
- Wat het níet moet zijn: kinderachtig of "te Pokémon" (Pokémon-sfeer alleen in accenten), druk, afleidend, opvulinformatie.
- Tone of voice copy: Engels, kort en direct, alleen informatie die iets toevoegt; geen uitleg- of opvulzinnen.


## 2. Referenties

Screenshots staan in `/design/referenties/`.
Per referentie: wat precies overnemen, niet de hele site kopiëren.

- Collectr (app, geen URL; screenshots in `/design/referenties/collectr/`): portfolio-overzicht (totale collectiewaarde als hoofdcijfer met beweging), waardegrafiek, stijgers/dalers-lijst. Niet de kaartweergave.
- TCG Collector (https://www.tcgcollector.com/): set-voortgang, sets sorteren en filteren, kosten om een set af te maken.
- Dex (https://dextcg.com/): binder-weergave met instelbaar paginaformaat (9/12 vakken), kaartfoto's centraal.
- [BEELD NODIG: screenshots van bovenstaande in `/design/referenties/`]


## 3. Typografie

- Display/koppen: Archivo (Google Fonts, nu via CDN; gewichten 700, 800)
- Body: Archivo (gewichten 400, 500, 600)
- Mono (optioneel): geen
- Fonts self-hosten, `font-display: swap`

Schaal (desktop / mobiel, line-height, letter-spacing):
Huidige waarden uit de code (zie audit voor conflicten):
- Display (collectiewaarde): 76px / 45px, 1.0, -0.01em
- H1 (paginatitel): 40px / 30px, 1.1, -0.005em
- H2 (sectie, popup-titel): 19px / 19px (popup 21px), 1.1, -0.005em
- H3 (paneeltitel): 16px / 16px, 1.1, 0
- Body: 16px / 16px, 1.5, 0
- Klein: 14px / 14px, 1.5, 0. Conflict: labels nu 12,8px en enkele badges 11–13px (regel: geen tekst onder 14px).

Regels:
- Maximaal 2 font-families
- Regellengte body 60 tot 75 tekens
- Grote koppen krappere letter-spacing, kleine tekst iets ruimer
- Geen tekst onder 14px


## 4. Kleur

Standaardthema is donker (huidige tokens in `src/index.css`):
- Achtergrond: #0a1226
- Oppervlak (kaarten, panelen): #111b36 (verhoogd: #17244a, #1e2d5a)
- Tekst primair: #eaf0ff
- Tekst secundair: #8f9dc4
- Rand/lijn: #24335f (sterk: #34477d)
- Accent: #ffcb05 (tekst erop: #1a1300)
- Accent hover: #ffd83d
- Succes: #3fd99a
- Waarschuwing: #ffb547
- Fout: #ff6257
- Dark mode: ja, donker is de standaard. Licht thema als eigen palet:
  achtergrond #f2f5fb, oppervlak #ffffff, tekst primair #0e1a3a, secundair #5a6789, rand #dbe2ef,
  accent #ffcb05 (alleen als vlak met donkere tekst), accent als lijn/markering #9a7400 (token `--accent-line`), focusring #1f5fd6 (token `--focus`), succes #0a7a4c, waarschuwing #8a5000, fout #d63a2f.
  In het donkere thema zijn `--focus` en `--accent-line` gelijk aan het accent #ffcb05.

Regels:
- Accentkleur spaarzaam: alleen voor primaire actie en highlights
- Contrast minimaal WCAG AA (4.5:1 voor body, 3:1 voor grote tekst)
- Alle kleuren als token in het theme, nooit hardcoded in componenten


## 5. Layout en spacing

- Max contentbreedte: 1280 px voor pagina's; 760 px voor popups en formulieren
- Grid: kaartraster auto-fill met minimaal 176 px per kaart, mobiel 2 kolommen; gutter 16 px desktop, 12 px mobiel
- Spacing-schaal (alleen deze waarden): 4, 8, 12, 16, 24, 32, 48, 64 (tokens `--space-1` t/m `--space-8`; 96 en 128 niet nodig in deze app)
- Verticale ruimte tussen secties: desktop 24 px / mobiel 16 px; binnen een paneel 12 px
- Breakpoints: 480 (telefoon: 2-koloms raster, popup van onderaf), 768 (tablet: gesplitste login, formulier 3 kolommen), 1024 (zijbalk i.p.v. onderbalk)
- Zijmarge mobiel: 16 px

Regels:
- Asymmetrie en variatie in layout per sectie, niet elke sectie gecentreerd. Alleen op Overview (hoofdcijfer groot, lijsten eronder); Collection en Sets blijven herhaalbare rasters en lijsten
- Witruimte is een ontwerpkeuze: liever te veel dan te weinig


## 6. Vorm en diepte

- Radius: 4 (kleine badges: grade, aantal) / 8 (knoppen, invoer, chips) / 16 (panelen, popups, tegels) / 999 (statuspillen). Kaartfoto's houden de echte kaartvorm (4,5% / 3,2%)
- Diepte via: randen (1 px `--line`) als hoofdmiddel. Kleurvlakken (oppervlak 1–3) alleen voor nesting. Schaduw alleen voor zwevende lagen: popup, vergrote kaart, tooltip
- Schaduw (indien gebruikt): één token `--shadow-float`: donker `0 16px 48px rgb(0 0 0 / 0.45)`, licht `0 16px 48px rgb(14 26 58 / 0.18)`


## 7. Iconen en beeld

- Iconenset: ___ (één set, één stroke-dikte, één stijl)
- Fotografie: ___ (eigen beeld, stijl, kleurbewerking)
- Illustraties: ___ / geen
- Beeldformaten: AVIF/WebP, altijd width/height of aspect-ratio, lazy loading onder de fold


## 8. Componenten

Elk component heeft verplicht deze states: default, hover, active, focus-visible, disabled, en waar relevant loading, empty en error.

- Knoppen: varianten ___ (bijv. primair, secundair, tekstlink)
- Formulieren: label altijd zichtbaar, foutmelding onder veld, ___
- Kaarten: ___
- Navigatie desktop: ___
- Navigatie mobiel: ___
- Footer: ___
- Overige: ___


## 9. Animatie en interactie

- Libraries: geen, alleen CSS
- Easing standaard: ease-out voor binnenkomst en micro-interacties, ease-in-out voor verplaatsing (holo-glans)
- Duur:
  - Micro-interacties (hover, toggle): 150 ms
  - Elementen in beeld: 200 ms voor popup en vergrote kaart (afwijking van 400–800 ms, goedgekeurd 15-10-2026: werk-app, elke tik moet direct voelen)
  - Pagina-overgangen: 0 ms (direct wisselen)
- Kleurwissel bij hover: direct, zonder overgang

Toegestane effecten (alleen deze):
- Holo-glans op holo- en reverse-holokaarten (goedgekeurd 15-10-2026): één lichtstreep per ±7 s, per kaart verschoven, alleen transform; uit bij `prefers-reduced-motion`.
- Kaart licht optillen bij hover: 4 px omhoog via transform, alleen op apparaten met hover.
- Popup en vergrote kaart verschijnen: opacity met schaal 0,96 → 1; op mobiel schuift de popup omhoog (translateY).
- Laadstatus getekende kaartvoorkant: rustig knipperen via opacity.

Regels:
- Animeer alleen `transform` en `opacity`
- Geen layout shift door animaties
- Respecteer `prefers-reduced-motion`: dan geen beweging, alleen directe weergave
- Animatie moet iets betekenen (hiërarchie, volgorde, feedback), nooit decoratie op elk element
- Maximaal één opvallend effect per scherm


## 10. Content en copy

- Geen placeholder-tekst en geen lorem ipsum
- Ontbrekende tekst markeren als `[TEKST NODIG: omschrijving]` en melden
- Ontbrekend beeld markeren als `[BEELD NODIG: omschrijving]`
- Taal: ___
- Geen generieke marketingzinnen (bijv. "ontgrendel je potentieel", "naadloze ervaring", "next level")


## 11. Verboden

- Inter, Roboto, Arial of system fonts als hoofdfont
- Paars/blauw verloop, gradient-tekst. Uitzondering (goedgekeurd 15-10-2026): de bestaande verlopen in loginpaneel, achtergrondgloed, hero en getekende kaartvoorkant mogen blijven; gradient-tekst blijft verboden
- Glassmorphism (blur-panelen) tenzij hier expliciet toegestaan
- Emoji als icoon
- Generieke hero gecentreerd met drie feature cards eronder
- Fade-in-up op elk element
- Standaard shadcn/Tailwind-uitstraling zonder eigen theme
- Overal dezelfde radius-xl met schaduw
- Willekeurige spacing buiten de schaal
- Kleuren of waarden hardcoded in componenten
- Nieuwe libraries toevoegen zonder akkoord


## 12. Kwaliteitscheck per sectie (Definition of Done)

Een sectie is pas af als:

- [ ] Screenshots gemaakt op 1440px en 390px breed en vergeleken met de referentie
- [ ] Alle component-states werken (sectie 8)
- [ ] Toetsenbordnavigatie werkt, focus is zichtbaar
- [ ] Contrast voldoet aan WCAG AA
- [ ] Werkt correct met `prefers-reduced-motion`
- [ ] Geen console errors of warnings
- [ ] Geen layout shift (CLS) bij laden
- [ ] Lighthouse Performance en Accessibility minimaal 90
- [ ] Getest op een echt mobiel toestel (door mij)


## 13. Werkwijze

- Werk sectie voor sectie, nooit de hele site in één keer
- Vóór het bouwen van een sectie: kort plan met welke tokens, componenten en animaties je gebruikt
- Nieuwe token, component of afwijking nodig: eerst voorstellen, niet zelf invoeren
- Na elke sectie: screenshots tonen en wachten op feedback
