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
- Dex (https://dextcg.com/): binder-weergave met instelbaar paginaformaat (6 vakken = 2 kolommen, of 9 = 3 kolommen; gewijzigd 17-10-2026, was 9/12), kaartfoto's centraal.
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
- Licht thema als eigen palet (17-10-2026 twee keer donkerder gemaakt op verzoek): achtergrond #dcdae1, oppervlak #efedf2 (verhoogd #dbd8e0, #d4d1da), tekst primair #17161c (zacht #3a3842), secundair #595562, rand #c9c6cf (sterk #b0abb8), accent #ffcb05 alleen als vlak met donkere tekst, accent als lijn/markering #6f5100 (`--accent-line`), focusring #17161c (`--focus`), succes #066238, waarschuwing #7a4700, fout #a1281f. Alle tekstkleuren ≥ 4,5:1 op elk vlak (laagste 4,8).
  In het donkere thema zijn `--focus` en `--accent-line` gelijk aan het accent.

Typekleur (token `--type`): de kleur van het energietype van de kaart in beeld. Gebruikt voor de achtergrondgloed, het vage patroon van energiesymbolen en de typestreep op tegels. Nooit voor tekst. Standaard (geen kaart in beeld): Lightning.
- Energietypes (`--energy-*`): Grass #4fb84a, Fire #f0612f, Water #3d8fe0, Lightning #f5c518, Psychic #b05cc8, Fighting #c5683a, Darkness #4a6b70, Metal #8e9aa4, Dragon #c9a227, Fairy #e47fb8, Colorless #cfcabf.
- Zeldzaamheidssymbolen: gewone sterren/cirkel in tekstkleur, gouden sterren `--rarity-gold` #e8b931 (licht thema #6f5100).
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
- Illustraties: zelf getekende energiesymbolen (eenvoudige vlakvormen) en zeldzaamheidssymbolen (cirkel, ruit, ster); geanimeerde Pokémon-sprites (PokéAPI, Black/White) voor partner, trainerkaart en Pikachu-peek. Auteursrecht op sprites ligt bij Nintendo/The Pokémon Company; geaccepteerd risico (15-10-2026), net als de kaartafbeeldingen.
- Logo (18-10-2026, gekozen uit 3 concepten): gele kaart (`--logo-card`) met een D en een witte holo-glinster, donkere omlijning (`--logo-ink`). Bron: `public/favicon.svg` (zelfde vorm als LogoMark); alle icoontjes (favicon.ico, apple-touch-icon, pwa-192/512, maskable) via `node tools/icons.mjs`. De pokébal blijft alleen op de getekende kaartvoorkant (BallMark).
- Beeldformaten: AVIF/WebP, altijd width/height of aspect-ratio, lazy loading onder de fold


## 8. Componenten

Elk component heeft verplicht deze states: default, hover, active, focus-visible, disabled, en waar relevant loading, empty en error.

- Knoppen: varianten ___ (bijv. primair, secundair, tekstlink)
- Formulieren: label altijd zichtbaar, foutmelding onder veld, ___
- Kaarten: ___
- Navigatie desktop (18-10-2026, op verzoek): zijbalk met bovenaan een gele knop "Scan cards", daaronder groepen met kopje: My cards (Overview, Collection, Sets, Wishlist), Trade (Buy & sell), Extras (Photo inbox, Crate game). Onder Sets de laatste 3 bezochte sets (per apparaat, open set gemarkeerd). Getallen alleen als er iets te doen is: Collection = niet gekoppelde kaarten, Wishlist = deals binnen je max. prijs, Photo inbox = foto's nog niet gekoppeld (telling max. 1 min oud). Onderaan Settings (ook actief op Import/Backup, die via Settings bereikbaar zijn), thema, uitloggen en inklappen (alleen iconen, 76 px, getallen als stip, per apparaat onthouden). Telefoon: More-pagina met dezelfde groepen en uitleg per item, getal op de Collection-tab en een stip op More.
- Navigatie mobiel (17-10-2026): onderbalk met 5 knoppen (Scan in het midden). Duimzone: de hoofdactie van een pagina (Add card, Upload photos; klasse `fab`) zweeft op telefoon en tablet rechtsonder boven de onderbalk (56 px hoog, pil, `--shadow-float`), verborgen tijdens selecteren. Tikdoelen op touchscreens minimaal 44 px, velden en knoppen in werkbalken 48 px (styles/61-telefoon-tikdoelen.css).
- Footer: ___
- Filters (goedgekeurd 17-10-2026, op alle pagina's gelijk): 1) tabs bovenaan als er groepen zijn (Sets: talen, Wishlist: lijsten); 2) werkbalk: zoeken links, keuzeknoppen (status), sorteren altijd rechts (`.toolbar-sort`); 3) filterpaneel (components/FilterPanel.tsx): elk veld met label erboven in een raster van gelijke kolommen (min. 180 px; set en prijsbereik 2 kolommen), vinkjes in een eigen rij, voetregel met "N filters active" links en acties + "Clear all filters" rechts. Groot scherm: altijd open. Telefoon (≤480 px, gewijzigd 20-10-2026 op verzoek: het uitklapblok bleef open staan): knop "Filters (n)" in de werkbalk (gele rand als er filters aan staan) opent de filters in een venster van onderaf (Sheet) met een vaste voet "Clear all" + gele knop "Show N cards" (sluit het venster); ✕, terug of naast tikken sluit ook en bewaart de keuzes. Actieve filters staan als chips met × onder de werkbalk, bij meer dan één met "Clear all" (bron: Baymard, mobiele filters als overlay met één duidelijke afsluitknop met aantal). Telefoon: werkbalk in twee kolommen, zoeken en keuzeknoppen over de volle breedte, sorteren en "Filters" naast elkaar, alles even breed. Enter/zoekknop in een zoekveld sluit het toetsenbord. Alle velden en knoppen in werkbalk en paneel hebben dezelfde hoogte (token `--control-h`, 44 px).
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
- Holo-glans op tegels: één lichtstreep per ±7 s, per kaart verschoven, op 60% sterkte (17-10-2026 verlaagd op verzoek); alleen op holo, reverse holo en zeldzaamheid vanaf Double rare. Touchscreens (21-10-2026, holo-tegels knipperden in Chrome op Android zolang de glans bewoog, ook bij oplichten/doven; gekozen door de gebruiker): stilstaande zachte regenboogglans diagonaal door het midden (25%), geen animatie en geen mengmodus.
- Holo-kanteling in kaartweergave en vergrote kaart: kaart kantelt mee met vinger/muis (max. 16°), glans per zeldzaamheid (Double rare regenboogstrepen, Illustration rare zachte regenboog met lijntjes, Special illustration rare felle regenboog met glinsters, Hyper rare goud). Alleen op de kaart die bekeken wordt. Stilstaand (kaartvenster) is de glans zacht (1/4); tijdens kantelen in de vergrote kaart iets sterker (0,55, niet vol) (gewijzigd 17-10-2026 op verzoek, twee keer: was te veel). Touchscreens (20-10-2026, zwart flikkeren in Chrome op Android bij de vergrote kaart): geen rustige zwaai in rust (beweegt alleen onder de vinger en komt dan tot stilstand), geen filter op de glanslaag, glans ±0,6× (stil 0,15, kantelen 0,33); geen mengmodus (gewone doorzichtige lagen, lichtvlek zonder donkere rand; toegevoegd 20-10-2026 omdat het tijdens kantelen met de vinger nog flikkerde); kaarten buiten de vergrote kaart (die op touch nooit kantelen) zonder 3D-transform, dus zonder eigen GPU-laag (21-10-2026, Crate → Most valuable knipperde). Muis/desktop ongewijzigd.
- Achtergrondgloed volgt het energietype (`--type`), overgang 700 ms.
- Momenten (elk ≤ 1,5 s, nooit blokkerend, bediening blijft werken):
  - Kaart toegevoegd of gescand: kaart draait van achterkant naar voorkant, vonken; stralen vanaf Double rare.
  - Wishlist-kaart gevonden: pokébal vangt de kaart, wiebelt, "Caught!".
  - Set compleet: confetti in energiekleuren, stempel "Complete".
  - Binder: kaart springt met glinster in zijn vak.
  - Overview: collectiewaarde telt op bij openen (≤ 800 ms).
- Laden: wiebelende pokébal; lege kaartplekken glanzen in de typekleur.
- Langsrenner (Pokémon die onderlangs rende): op verzoek verwijderd 18-10-2026, niet opnieuw voorstellen.
- Kaart licht optillen bij hover: 4 px omhoog via transform, alleen op apparaten met hover.
- Pokémon-sfeer (goedgekeurd 16-10-2026):
  - Knoppen veren in bij indrukken (scale 0,96, 150 ms); primaire knop: holo-glans strijkt eroverheen bij hover, icoon draait mee. Menu-icoon hupt bij hover.
  - Pokébal-vormen (ook zonder animaties): stip onder actieve tab/filter en naast het actieve menu-item; vinkjes als pokébal (leeg = open, aan = gevangen, wiebelt).
  - Pikachu kijkt om de rand van een kaart (eerst na 1–2 min, daarna elke 3–6 min; niet op Scan, bij popups of invoer; nooit over knoppen of velden). Tikken: "Pika!" en weg. 1 op 50 shiny. Scrollen: meteen weg.
  - Who's that Pokémon? (silhouetten in de setbinder): verwijderd op verzoek (17-10-2026). Ontbrekende kaarten staan op telefoon én computer meteen als grijze kaart.
  - Setbinder (17-10-2026, op verzoek): onder elke kaart naam, nummer en Cardmarket-marktprijs (standaarduitvoering), pas opgehaald als de kaart in beeld komt; bestaat er een reverse holo, dan op de regel eronder "RH €…" (18-10-2026). Setkaart-venster: dan twee even grote prijzen (Normal/Holo en Reverse holo) met een groen vinkje bij de uitvoering die je hebt, plus "Your copies: €totaal (aantal)". Zoekbalk op de setpagina (naam of nummer). Na "kosten berekenen" staat bij ontbrekende kaarten de prijs van wat ontbreekt; bij sorteren op waarde de geladen waarde.
  - Overview (goedgekeurd 16-10-2026): Trainer Card met 8 badges (mijlpalen kaarten / soorten / waarde), Pokédex-teller per generatie, partner-Pokémon (sprite, tikken = sprong + roep), typekleur van je collectie als de topkaart Colorless is, grafiek met vlak in de typekleur en pokébal als eindpunt, spelzinnen bij Gainers/Losers. Vanaf 2200 px een vaste trainer-zijkolom rechts (sinds 18-10-2026; was links) (sinds 16-10-2026 op verzoek; pagina dan max. 2080 px).
  - Settings (16-10-2026): secties Appearance (thema Dark/Light/Automatic, Animations, levende achtergrond aan/uit, energiebehang aan/uit), Partner Pokémon (huidige partner + Change), Scanning (standaardmodus, Auto, wazige foto's tegenhouden), New cards en Value estimates (in je account; "Use suggested values" NM 100/EX 85/GD 70/LP 60/PL 45/PO 30), Account and data (ingelogd als, uitloggen, wachtwoord wijzigen, Backup/Import, Clear app cache, versie + Check for updates). Per sectie een label "This device" of "Your account"; alles bewaart direct (geen Save-knop). Apparaatinstellingen in lib/devicePrefs.ts. Onderaan "Reset account" (rood kader): wist alles via STAP14 (reset_my_account) plus foto's/bonnetjes in de opslag en voortgang op het toestel; uiterlijk en scaninstellingen blijven. Bevestigen door RESET te typen; knop "Make a backup first".
  - Overview "Your most valuable card" (16-10-2026): naast de kaart prijsfeiten (trend vs. 30-daags gemiddelde, 30-daags gemiddelde, betaald, winst/verlies, aantal), Cardmarket-knop en rechts je nummers 2-5 met rangnummer; onder 1200 px staat de top 2-5 eronder.
  - Levende achtergrond (16-10-2026, components/Sky.tsx): alles achter panelen en kaarten (z-index -2; paginaverloop staat daarom op html, niet body). Sterrenhemel die twinkelt (donker thema; licht thema overdag zachtblauwe wolken), hemeltint per tijdstip (dageraad 5-8, dag 8-18, schemer 18-21, nacht), noorderlicht in je favoriete typekleur, vallende ster om de 20-60 s (tikken op lege plek = wens, 1x per dag +5 Crate points via STAP13), Team Rocket-ballon (Meowth) en de prestatie Blasting Off Again op verzoek verwijderd 18-10-2026 (niet opnieuw voorstellen), silhouet van een vliegende Pokémon (liefst uit je collectie) om de 2,5-5 min, 's nachts Gengar die om de rand kijkt en wegvlucht als je in de buurt komt. Animations uit = alleen stille sterren. Preview: ?sky=star|flyer|gengar&phase=dawn|day|dusk|night.
  - Landingspagina dexcrate.com (17-10-2026, landing/index.html): zelfde huisstijl (donker, Pokémon-geel, Archivo, kaart-logo), hero met kaartwaaier in CSS (geen echte kaartplaatjes) en marktwaarde-chip, 6 functietegels, 3 stappen, FAQ (details/summary), afsluitende knop; "Private beta" vermeld; footer met merkdisclaimer. Engels, zoals de app.
  - Achtergrond van de dag (17-10-2026, op verzoek: het vaste bliksempatroon verveelde; lib/backdrop.ts, styles/65-achtergronden.css): alleen donker thema, elke kalenderdag de volgende uit Pokéballen (omlijnde ballen in de typekleur, 6%), Holo-glans (zacht regenboogverloop dat in 60 s heen en weer schuift via transform; stil bij Animations uit), Energie-mix (alle energiesymbolen in hun eigen kleur, 7,5%) en Sterrennacht (diepblauwe lucht met vage melkweg; de hemel tekent dan volle en 1,6x zoveel sterren en een vallende ster om de 8-25 s). De schakelaar in Settings heet nu "Background pattern" en zet de laag uit. Licht thema houdt het energiepatroon in de typekleur.
  - Scanpagina (20-10-2026, gekozen door de gebruiker): geen keuzeknoppen en "Take photos" meer, maar drie modus-tegels (Quick scan, Single card, Binder page) met icoon en één regel uitleg; één tik opent de camera in die modus. De huidige modus staat bovenaan, groot en geel; de andere twee naast elkaar eronder (vanaf 768 px drie naast elkaar, de huidige het breedst). Daaronder "Or choose photos from files" en meteen je scans. Losse kaart/binder: foto en "New photo" pas zodra er een foto is. De gele Scan-knop in de onderbalk opent de scanpagina (niet direct de camera; keuze gebruiker). Camera: zaklampknop altijd linksboven (gedimd als het toestel hem niet laat bedienen; tikken legt uit of zoekt een andere lens), ernaast "Lens n/m" bij meerdere achterlenzen; Settings → Scanning → Check camera.
  - Snel scannen (16-10-2026): Scan heeft standaard "Quick scan": camera blijft open, flits bij elke foto, strook onderin met teller en thumbnails (geel = klaar, rood = mislukt, puls = bezig). Herkennen op de achtergrond (3 tegelijk), dezelfde kaart telt op (2×). Daaronder "Your scans": per kaart eigen foto + match, keuze match/uitvoering/aantal, Edit/Retry/×, onderaan conditie + "Add N to collection" + Clear (met bevestiging). Compact sinds 20-10-2026 (audit S1–S4, op verzoek): kop met vinkje, eigen foto + catalogusfoto (tik = beide groot naast elkaar), naam, "set #nummer · prijs · Owned n×" op één regel en × rechtsboven; waarschuwing over de volle breedte; bij twijfel de 3 beste kandidaten als foto's met de setcode eronder, ernaast "No link" en "More…" (alle kandidaten); kiezen vinkt aan; daaronder uitvoering, aantal (− n +) en "More" (kandidaten + Correct / Look again / Edit). Onderbalk op één regel: Condition (label klein in het vak), "Add N", Clear. Zekere regel ±175 px op 390 px. Wachtrij blijft bewaard op het apparaat.
  - Quick scan uitbreiding (16-10-2026): scherm blijft aan; melding per foto in de camera ("✓ Pikachu · 151 #025", ★ bij wishlist) met Undo; duidelijk wazige foto's tegengehouden (Use anyway); lijst in groepen Check these / Still working / Looks good; alleen het kader (+12%) wordt verstuurd; foto's in IndexedDB tot ze herkend zijn (overleeft herstart en offline); knop "Auto" rechtsonder (geel = aan) drukt zelf af als een nieuwe kaart stil in het kader ligt (tolerant voor een trillende hand; lijkt de kaart op de vorige, dan "Tap the shutter for another copy"; minimaal 1,5/2,5/4 s tussen twee automatische foto's, instelbaar in Settings → Scanning, standaard 2,5 s), met statusregel; kader staat hoger zodat de onderrand vrij blijft.
  - Overview in één oogopslag (18-10-2026, op verzoek): What you own (compact) boven de spotlight; naast Gainers/Losers "Wishlist deals" (binnen je max. prijs, anders grootste dalers; tik = Cardmarket) in plaats van Most valuable; grafiek 130 px hoog; Sales-cijfers compact. Vanaf 2800 px: pagina max. 3200 px, trainer-kolom rechts 440 px en compact (kleinere trainer card en Pokédex zonder uitleg, Recently added één rij van 4), hoofdcijfer en spotlight naast elkaar, verkoopmeter en gemiddelden naast elkaar, tussenruimte 16 px, kleinere duimnagels. Doel: op 3440×1440 op 100% zonder scrollen.
  - Overview op de telefoon (≤480 px, 20-10-2026, audit O1 op verzoek; groter scherm ongewijzigd): volgorde waarde + grafiek, Wishlist deals, Sets almost complete, What you own, duurste kaart, Gainers, Losers, Recently added; daarna Trainer card, Pokédex en Sales als inklapbare blokken (kop met titel, samenvatting zoals "Lv. 3 · 0 badges" / "5 / 1025 caught" / "−€233.15 net" en pijltje; standaard dicht, open/dicht onthouden per apparaat; components/PhoneFold.tsx). Niets weggehaald. Pagina ±3.330 px i.p.v. ±4.400 px met voorbeelddata.
  - Overview opgeschoond (16-10-2026, op verzoek): Your team, Evolution lines, Buying chances en Trainer report weg; ervoor in de plaats "Sets almost complete" (3 sets het dichtst bij compleet, met afmaakkosten als er hooguit 30 kaarten ontbreken) en "Recently added" (laatste 8 kaarten met waarde). Trainer-level: 50·(level−1)² EXP, ±40 kaarten ≈ level 6.
  - Uitbreiding (goedgekeurd 16-10-2026): badgekoffer met uitleg/voortgang en trainer-rang (Youngster → Champion), viering bij nieuwe badge; Pokédex als rood apparaat met regio's (Kanto … Paldea) en raster per regio (gevangen in kleur, rest silhouet); type-team (sterk/zwak tegen); evolutielijnen met viering; Pokémon wipt bij hover uit een kaarttegel; partner kiezen in Settings (starters of automatisch) die meeloopt in zijbalk/kopbalk en juicht bij momenten. (Hoog gras met wilde Pokémon is op 16-10-2026 weer verwijderd op verzoek.)
  - Kaartpopup ontwerp B (gekozen 18-10-2026, vervangt de tabs hieronder; styles/66): set en nummer onder de titel; foto met ernaast een feitenkolom (grote marktprijs met uitvoering en "vs 30-day avg", daaronder Status/Rarity/Condition/Type/Language/Paid … als label/waarde, op de telefoon als rijen met de waarde rechts) en de waardebalk; variantvraag; Pokédex en setvoortgang als compacte rijen in één blok; Card text, Prices en Photos inklapbaar (inhoud laadt pas bij openen); actiebalk onderaan. Setkaart-venster (setpagina, wishlist) in dezelfde opbouw, met "Your copies": elk eigen exemplaar met waarde en Edit (opent meteen het formulier).
  - (Vervangen) Kaartpopup (goedgekeurd 16-10-2026): vaste kop (foto, set, chips, marktprijs met zichtbaar "vs 30-day avg", betaald, waardebalk als HP-balk), tabs Overview / Card / Prices / Photos (actieve tab met pokébal-stip, pijltjestoetsen), actiebalk onderaan (Edit, Cardmarket, hoofdactie). Overview: variantvraag met knoppen als de variant onbekend is, Pokédex-strook (sprite, nummer, regio, evolutielijn), setvoortgang met link. Card: HP, stadium, vaardigheden, aanvallen met energiekosten, zwakte/resistentie/terugtrekken, illustrator, kaartkoppeling met uitleg. Prices: compacte bronnen met uitleg achter een i, grafiek met verandering over de getoonde periode. Colorless-kaarten kleuren met je meest verzamelde type.
  - Beloning en terugkomen (goedgekeurd 16-10-2026): "New Pokédex entry!" bij de eerste kaart van een soort; trainer-level 1-100 met EXP-balk (XP uit kaarten, zeldzaamheid, soorten en badges; "… grew to Lv. 12!"); pakje openen bij 2+ kaarten tegelijk (kaarten draaien om met 120 ms interval, zeldzaamste als laatste en groter); verborgen prestaties ("???" in de badgekoffer, "Secret found"); "A deal appeared!" en "Only 2 left in …!" als toast onderaan; Pokémon van de dag en trainer-rapport (later op verzoek verwijderd); trillen op Android bij momenten. Alles "nieuw sinds de vorige keer", per apparaat onthouden; eerste keer alleen onthouden.
  - Crate-game (goedgekeurd 16-10-2026): pagina Crate (in "More"/zijbalk) met Crate points (munt met krat-icoon), pakje van 10 willekeurige Engelse kaarten (6 common, 3 uncommon, 1 rare-vak met kansen tot Hyper rare), zelf omdraaien (tik per kaart of "Reveal all", vonken vanaf Double rare), virtuele collectie los van de echte, dubbelen inruilen voor punten. Punten via databasefuncties (STAP11): kaart 10 + zeldzaamheid, verkoop 15, aankoop 5, Pokédex-soort 25, set compleet 250, dagbonus 50, één gratis pakje per dag; toast "+N Crate points".
  - Crate-uitbreiding (goedgekeurd 16-10-2026, STAP12): drie pakjes naast elkaar (Booster 100 rood, Great 300 blauw, Master 1000 paars met gouden rand; alleen de Booster 1x per dag gratis), punten links ernaast op brede schermen. Kaart aantikken opent een venster met grote foto (tik = schermvullend), Cardmarket-trend, 30-daags gemiddelde, link naar Cardmarket en inruilknop; prijs onder elke kaart in het raster (geladen zodra in beeld). "Trade in all duplicates (+N pts)" met bevestiging in de regel. Tabblad Overview: totalen (kaarten, marktwaarde, waarde dubbelen, duurste kaart), tabel per zeldzaamheid en sorteerbare tabel van alle kaarten. Telefoon (21-10-2026, liep buiten beeld): niets zijwaarts scrollen; marktwaarde bovenaan over de volle breedte; tabel met twee kolommen (kaart met zeldzaamheid + set eronder, waarde met "aantal × prijs" eronder), sorteren op de overige kolommen via een keuzelijst rechtsboven.
  - HP-balken: voortgang groen > 50%, geel > 20%, anders rood (tokens `--hp-high/mid/low`, per thema).
  - Gevechts-tekstvak: meldingen en momenten met dubbel kader; knipperend pijltje bij aantikbare meldingen en momenten.
  - Momenten: "Level up!" bij mijlpalen (kaarten in een set: 10, 25, 50, 100 …; collectie: 10, 25, 50, 100, 250 …; eerste bezoek alleen onthouden), "Gotcha!" bij toevoegen aan de wishlist (pokébal wiebelt en klikt dicht).
- Popup en vergrote kaart verschijnen: opacity met schaal 0,96 → 1; op mobiel schuift de popup omhoog (translateY).

Regels:
- Animeer `transform` en `opacity`; uitzonderingen: `background-position` voor holo-glans, canvas voor vonken en confetti
- Geen layout shift door animaties
- Instelling "Animations" in Settings (per apparaat). Uit, of `prefers-reduced-motion`: geen beweging, alleen directe weergave
- Animatie moet iets betekenen (feedback, beloning, sfeer van het type), nooit decoratie op elk element
- Maximaal één moment tegelijk; volgende momenten wachten in een korte wachtrij (max. 4) en spelen daarna (gewijzigd 16-10-2026)


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
