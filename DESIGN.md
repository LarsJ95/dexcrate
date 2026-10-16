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

- Product: Dexcrate, persoonlijke web-app/PWA voor een Pokémon-kaartencollectie: collectie, aankoop en verkoop, marktwaarde (Cardmarket), set-voortgang en scannen met de camera.
- Doelgroep: de eigenaar zelf, verzamelaar en verkoper; gebruikt de app vooral op de telefoon.
- Gevoel in 3 woorden: Pokémon-TCG-beleving, verzamelwaardig, overzichtelijk (gewijzigd 15-10-2026: meer Pokémon-sfeer, holo en animaties gevraagd, zie het goedgekeurde prototype "Holo Lab")
- Wat het níet moet zijn: kinderachtig, druk of in de weg; beleving mag nooit een handeling vertragen of blokkeren. Geen opvulinformatie.
- Tone of voice copy: Engels, kort en direct, alleen informatie die iets toevoegt; geen uitleg- of opvulzinnen.


## 2. Referenties

Screenshots staan in `/design/referenties/`.
Per referentie: wat precies overnemen, niet de hele site kopiëren.

- Collectr (app, geen URL; screenshots in `/design/referenties/collectr/`): portfolio-overzicht (totale collectiewaarde als hoofdcijfer met beweging), waardegrafiek, stijgers/dalers-lijst. Niet de kaartweergave.
- TCG Collector (https://www.tcgcollector.com/): set-voortgang, sets sorteren en filteren, kosten om een set af te maken.
- Dex (https://dextcg.com/): binder-weergave met instelbaar paginaformaat (9/12 vakken), kaartfoto's centraal.
- [BEELD NODIG: screenshots van bovenstaande in `/design/referenties/`]


## 3. Typografie

- Display/koppen: Archivo (zelf gehost in `src/assets/fonts`, variabel: gewicht 400–900, breedte 62–125%; koppen 800–900 op breedte 112–125%, token `--stretch-display`)
- Body: Archivo (gewichten 400, 500, 600; normale breedte)
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

Gewijzigd 15-10-2026: het marineblauw is vervangen. Basis is een neutrale, licht violet-getinte ondergrond; de kleur komt van de kaarten zelf via het energietype.

Standaardthema is donker (tokens in `src/index.css`):
- Achtergrond: #0e0d12
- Oppervlak (kaarten, panelen): #17161d (verhoogd: #1f1e26, #282730)
- Tekst primair: #f6f3ee (zacht: #d3cfd8)
- Tekst secundair: #a19ba9
- Rand/lijn: #2f2e38 (sterk: #42404d)
- Accent: #ffcb05 (tekst erop: #1a1300), hover #ffd83d
- Succes: #5fd68f
- Waarschuwing: #ffb547
- Fout: #ff6b5e
- Licht thema als eigen palet: achtergrond #f4f3f6, oppervlak #ffffff (verhoogd #efedf2, #e5e3ea), tekst primair #17161c (zacht #3a3842), secundair #625e6b, rand #dddae2 (sterk #c6c2cd), accent #ffcb05 alleen als vlak met donkere tekst, accent als lijn/markering #7d5b00 (`--accent-line`), focusring #17161c (`--focus`), succes #08703f, waarschuwing #8a5000, fout #b52f26.
  In het donkere thema zijn `--focus` en `--accent-line` gelijk aan het accent.

Typekleur (token `--type`): de kleur van het energietype van de kaart in beeld. Gebruikt voor de achtergrondgloed, het vage patroon van energiesymbolen en de typestreep op tegels. Nooit voor tekst. Standaard (geen kaart in beeld): Lightning.
- Energietypes (`--energy-*`): Grass #4fb84a, Fire #f0612f, Water #3d8fe0, Lightning #f5c518, Psychic #b05cc8, Fighting #c5683a, Darkness #4a6b70, Metal #8e9aa4, Dragon #c9a227, Fairy #e47fb8, Colorless #cfcabf.
- Zeldzaamheidssymbolen: gewone sterren/cirkel in tekstkleur, gouden sterren `--rarity-gold` #e8b931 (licht thema #7d5b00).
- Pokébal: rood `--ball-red` #e3350d, lijn #1b1b1f, wit #f3f1ec (gelijk in beide thema's).

Regels:
- Accentkleur spaarzaam: alleen voor primaire actie en highlights
- Contrast minimaal WCAG AA (4.5:1 voor body, 3:1 voor grote tekst en grafische elementen)
- Alle kleuren als token in het theme, nooit hardcoded in componenten


## 5. Layout en spacing

- Max contentbreedte: 1600 px voor pagina's (gewijzigd 16-10-2026, was 1280: te veel witruimte naast de zijbalk op brede schermen); 760 px voor popups en formulieren
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
- Illustraties: zelf getekende energiesymbolen (eenvoudige vlakvormen) en zeldzaamheidssymbolen (cirkel, ruit, ster); geanimeerde Pokémon-sprites (PokéAPI, Black/White) alleen voor de langsrenner, alleen Pokémon uit de eigen collectie. Auteursrecht op sprites ligt bij Nintendo/The Pokémon Company; geaccepteerd risico (15-10-2026), net als de kaartafbeeldingen.
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

Toegestane effecten (alleen deze; uitgebreid 15-10-2026 volgens prototype "Holo Lab"):
- Holo-glans op tegels: één lichtstreep per ±7 s, per kaart verschoven; alleen op holo, reverse holo en zeldzaamheid vanaf Double rare.
- Holo-kanteling in kaartweergave en vergrote kaart: kaart kantelt mee met vinger/muis (max. 16°), glans per zeldzaamheid (Double rare regenboogstrepen, Illustration rare zachte regenboog met lijntjes, Special illustration rare felle regenboog met glinsters, Hyper rare goud). Alleen op de kaart die bekeken wordt.
- Achtergrondgloed volgt het energietype (`--type`), overgang 700 ms.
- Momenten (elk ≤ 1,5 s, nooit blokkerend, bediening blijft werken):
  - Kaart toegevoegd of gescand: kaart draait van achterkant naar voorkant, vonken; stralen vanaf Double rare.
  - Wishlist-kaart gevonden: pokébal vangt de kaart, wiebelt, "Caught!".
  - Set compleet: confetti in energiekleuren, stempel "Complete".
  - Binder: kaart springt met glinster in zijn vak.
  - Overview: collectiewaarde telt op bij openen (≤ 800 ms).
- Laden: wiebelende pokébal; lege kaartplekken glanzen in de typekleur.
- Langsrenner: een Pokémon uit de eigen collectie rent onderlangs, hooguit eens per 3 minuten, niet op Scan, niet terwijl een popup of formulier open is. Tikken: springt en roept. 1 op 50 kans op shiny. 's Avonds (20–6 u) vaker Ghost-/Darkness-Pokémon.
- Kaart licht optillen bij hover: 4 px omhoog via transform, alleen op apparaten met hover.
- Pokémon-sfeer (goedgekeurd 16-10-2026):
  - Knoppen veren in bij indrukken (scale 0,96, 150 ms); primaire knop: holo-glans strijkt eroverheen bij hover, icoon draait mee. Menu-icoon hupt bij hover.
  - Pokébal-vormen (ook zonder animaties): stip onder actieve tab/filter en naast het actieve menu-item; vinkjes als pokébal (leeg = open, aan = gevangen, wiebelt).
  - Pikachu kijkt om de rand van een kaart (eerst na 1–2 min, daarna elke 3–6 min; niet op Scan, bij popups, invoer of als de langsrenner er is; nooit over knoppen of velden). Tikken: "Pika!" en weg. 1 op 50 shiny. Scrollen: meteen weg.
  - Who's that Pokémon?: ontbrekende Pokémon-kaarten in een set als silhouet op zachte stralen; bij hover of focus kleurt het silhouet in en verschijnt de kaart.
  - Overview (goedgekeurd 16-10-2026): Trainer Card met 8 badges (mijlpalen kaarten / soorten / waarde), Pokédex-teller per generatie, partner-Pokémon (sprite, tikken = sprong + roep), typekleur van je collectie als de topkaart Colorless is, grafiek met vlak in de typekleur en pokébal als eindpunt, spelzinnen bij Gainers/Losers, koopkansen uit de wishlist. Vanaf 2200 px een vaste trainer-zijkolom rechts (pagina dan max. 2080 px).
  - Uitbreiding (goedgekeurd 16-10-2026): badgekoffer met uitleg/voortgang en trainer-rang (Youngster → Champion), viering bij nieuwe badge; Pokédex als rood apparaat met regio's (Kanto … Paldea) en raster per regio (gevangen in kleur, rest silhouet); type-team (sterk/zwak tegen); evolutielijnen met viering; Pokémon wipt bij hover uit een kaarttegel; partner kiezen in Settings (starters of automatisch) die meeloopt in zijbalk/kopbalk en juicht bij momenten. (Hoog gras met wilde Pokémon is op 16-10-2026 weer verwijderd op verzoek.)
  - Kaartpopup (goedgekeurd 16-10-2026): vaste kop (foto, set, chips, marktprijs met zichtbaar "vs 30-day avg", betaald, waardebalk als HP-balk), tabs Overview / Card / Prices / Photos (actieve tab met pokébal-stip, pijltjestoetsen), actiebalk onderaan (Edit, Cardmarket, hoofdactie). Overview: variantvraag met knoppen als de variant onbekend is, Pokédex-strook (sprite, nummer, regio, evolutielijn), setvoortgang met link. Card: HP, stadium, vaardigheden, aanvallen met energiekosten, zwakte/resistentie/terugtrekken, illustrator, kaartkoppeling met uitleg. Prices: compacte bronnen met uitleg achter een i, grafiek met verandering over de getoonde periode. Colorless-kaarten kleuren met je meest verzamelde type.
  - HP-balken: voortgang groen > 50%, geel > 20%, anders rood (tokens `--hp-high/mid/low`, per thema).
  - Gevechts-tekstvak: meldingen en momenten met dubbel kader; knipperend pijltje bij aantikbare meldingen en momenten.
  - Momenten: "Level up!" bij mijlpalen (kaarten in een set: 10, 25, 50, 100 …; collectie: 10, 25, 50, 100, 250 …; eerste bezoek alleen onthouden), "Gotcha!" bij toevoegen aan de wishlist (pokébal wiebelt en klikt dicht).
- Popup en vergrote kaart verschijnen: opacity met schaal 0,96 → 1; op mobiel schuift de popup omhoog (translateY).

Regels:
- Animeer `transform` en `opacity`; uitzonderingen: `background-position` voor holo-glans, canvas voor vonken en confetti
- Geen layout shift door animaties
- Instelling "Animations" in Settings (per apparaat). Uit, of `prefers-reduced-motion`: geen beweging, alleen directe weergave
- Animatie moet iets betekenen (feedback, beloning, sfeer van het type), nooit decoratie op elk element
- Maximaal één moment tegelijk; een nieuw moment breekt het vorige af


## 10. Content en copy

- Geen placeholder-tekst en geen lorem ipsum
- Ontbrekende tekst markeren als `[TEKST NODIG: omschrijving]` en melden
- Ontbrekend beeld markeren als `[BEELD NODIG: omschrijving]`
- Taal: ___
- Geen generieke marketingzinnen (bijv. "ontgrendel je potentieel", "naadloze ervaring", "next level")


## 11. Verboden

- Inter, Roboto, Arial of system fonts als hoofdfont
- Paars/blauw verloop, gradient-tekst. Uitzondering (goedgekeurd 15-10-2026): verlopen in loginpaneel, achtergrondgloed (typekleur), hero, getekende kaartvoorkant, holo-glans en de voortgangsbalk in energiekleuren; gradient-tekst blijft verboden
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
