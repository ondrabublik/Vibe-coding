# Rybník – rybářský simulátor

3D simulátor rybaření u českého rybníka, běží čistě v prohlížeči (HTML + JavaScript + Three.js).

## Spuštění

Otevři `index.html` v prohlížeči (Chrome, Edge, Firefox). Three.js se načítá z CDN, takže je potřeba internet.
Případně spusť lokální server:

```bash
python -m http.server 8765
```

a otevři `http://localhost:8765`.

### Na mobilu a na televizi LG

Spusť na počítači server, který je vidět v domácí síti, a v telefonu / v prohlížeči televize (aplikace *Webový prohlížeč* na LG webOS) otevři adresu počítače:

```bash
python .claude/serve.py 8765
```

`http://<IP-adresa-počítače>:8765` (IP zjistíš příkazem `ipconfig`; Windows se může zeptat na povolení ve firewallu).

Zařízení se pozná samo. Ručně jde režim vynutit parametrem v adrese: `?touch=1` (mobil), `?tv=1` (televize – na počítači se dá zkoušet klávesnicí, barevná tlačítka jsou R G Y B), `?touch=0&tv=0` (počítač). Kvalita grafiky: `?q=low` / `?q=high` (na mobilu a TV je automaticky nižší).

## Ovládání

| Akce | Ovládání |
|---|---|
| Nahození | podívej se na vodu, **drž levé tlačítko** (síla roste, švih myší nahoru ji zrychlí, myší do stran míříš) a **pusť** – montáž dopadne do kroužku |
| Rychlost navíjení | klávesy **1–5** nebo kolečko při drženém pravém tlačítku |
| Zásek | **klikni levým tlačítkem**, když se splávek ponoří nebo dravec zaútočí |
| Navíjení | **pravé tlačítko** |
| Vedení prutu při zdolávání | drž levé + pohyb myší |
| Hloubka nástrahy / brzda | kolečko myši |
| Chůze / běh | WASD / Shift (jen v rámci revíru ohraničeného plotem) |
| Obchod | **E** u stánku (u cesty za tebou vpravo) |
| Výbava, deník, nápověda | Tab, J, H |
| Hodit příkrm | F |

### Mobil (na šířku)

| Akce | Ovládání |
|---|---|
| Chůze | levý palec – joystick v levé dolní části (plná výchylka = běh) |
| Rozhlížení | táhni prstem kdekoli jinde |
| Nahození / zásek / vedení prutu | tlačítko **Nahodit** (mění se na *Zásek*, *Vést prut*): drž = síla hodu, tažení po něm = míření a vedení prutu, ťuknutí = zásek |
| Navíjení | drž **Navíjet**; **Rychlost** přepíná 1–5 |
| Hloubka / brzda | **− / +** (podržením se opakuje) |
| Výbava, deník, krmení, nápověda | menu **☰** |
| Obchod | ťukni na nápis *Nakoupit ve stánku* |

### Televize LG (dálkový ovladač)

| Akce | Ovládání |
|---|---|
| Otáčení / chůze | **← →** / **↑ ↓** |
| Nahození | **drž OK** (šipkami ← → míříš), **pusť** = nahodit |
| Zásek | **OK** |
| Zdolávání | **drž OK** = navíjení, **šipky** vedou prut |
| Navíjení zap / vyp | **červené** |
| Hloubka / brzda | **CH ▲ / ▼** |
| Rychlost navíjení | **1–5** |
| Krmení / výbava / menu | **zelené** / **žluté** / **modré** |
| Zavřít okno | **Zpět** |
| Okna (obchod, výbava…) | šipkami se vybírá, **OK** potvrdí |

Ukazovátko Magic Remote funguje jako myš (OK = klik, kolečko = hloubka / brzda), kamerou ale neotáčí.

## Prvky inspirované hrou How to Fish (bez zbraní)

- **Vzácné barevné varianty** – zlatá forma, albín, koi kapr, černá forma; násobí cenu a dávají žeton.
- **Bonus za styl** – udržené skoky ryby nad hladinu, dalekonosný hod, napětí na hraně vlasce, pevná ruka, bleskové zdolání, série úlovků bez ztráty.
- **Legendy rybníka (bossové)** – Zubatá Máňa, Starý Bohouš, Kapitán Vousáč; mají ukazatel síly a dvakrát se rozzuří.
- **Úkoly od pana Vávry** – příběhová řada odemyká legendy, k tomu vedlejší úkoly.
- **Rybí automat** ve stánku – za žetony barvy prutu, peníze a návnady.
- **Ryba se plácá na břehu** a racek ti občas ukradne malou rybu.

## Soubory

- `js/terrain.js`, `js/water.js`, `js/vegetation.js`, `js/sky.js` – rybník podle fotky, voda s odrazy, tráva, rákosí, stromy, plot revíru
  - svět je ohraničený: hráč chodí jen uvnitř plotu (`World.bounds`), terén končí na `World.extent` a jeho okraj schová opar
  - detaily podle vzdálenosti: tráva mizí od 32 m, rákosí od 75 m, stromy dál než 60 m mají zjednodušenou korunu (konstanty na začátku `vegetation.js`)
  - plynulost: stínová mapa celého revíru se kreslí jen jednou při načtení, krok hry se počítá z časové značky snímku a když snímky nestíhají obnovu displeje, hra sníží rozlišení vykreslování (až na 75 %, na mobilu a TV 60 %; aktuální hodnota je vidět u fps vlevo nahoře, `?q=high` adaptaci vypne)
- `js/fishdata.js`, `js/fishmodel.js` – 14 druhů českých ryb a jejich procedurální modely
- `js/fishing.js`, `js/rod.js`, `js/fishai.js` – nahazování, záběry, zdolávání, chování ryb
- `js/controls.js` – rozpoznání zařízení, dotykové ovládání a dálkový ovladač TV (vše jen zapisuje do vstupu hráče jako myš a klávesnice)
- `js/gear.js`, `js/shop.js`, `js/game.js` – vybavení, stánek s prodavačem, peníze a ukládání (localStorage)
