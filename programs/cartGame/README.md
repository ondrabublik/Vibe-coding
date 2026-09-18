# Dobřany Kart – Velká cena Tiché ulice

3D motokárové závody ve stylu Mario Kart v prohlížeči (three.js, ES moduly, bez build kroku a bez backendu).
Trať vede skutečnými ulicemi v Dobřanech kolem ulice Tichá:

**start v pěší části Tiché → Tichá (dlažba) → Chlumčanská → U Lomy → Oty Kovala → zpět do Tiché** (≈ 520 m na kolo).

Spuštění: `startServer.bat` (PHP server na http://localhost:8000). ES moduly nejdou otevřít přes `file://`.
Stačí i jiný statický server, např. `python -m http.server`.

## Ovládání

| Klávesa | Akce |
|---|---|
| ↑ / W | plyn |
| ↓ / S | brzda, couvání |
| ← → / A D | zatáčení |
| Mezerník / Shift | drift: drž a zatáčej, po pouštění mini-turbo (modré jiskry ≈ 1 s, oranžové ≈ 2 s) |
| E / Ctrl / X | použít předmět (🍄 turbo, 🍌 banán, 🐢 samonaváděcí krunýř) |
| C | přepnout kameru · R zpět na trať · M zvuk · Esc pauza |

Funguje i gamepad a na dotykových zařízeních se zobrazí tlačítka na obrazovce.

## Odkud je krajina

- **Ulice, půdorysy budov (včetně počtu podlaží a roku stavby), plochy zeleně a potoky:** OpenStreetMap (© přispěvatelé OSM, ODbL).
- **Terén:** skutečný výškopis (Copernicus DEM přes Open-Meteo), jemně převýšený ×1,25. Trať se svažuje k Radbuze.
- **Vzhled podle Street View:** v Tiché jsou nové bílé a šedé kubické domy s plochou střechou a velkými tmavými okny,
  šedá zámková dlažba, řady tújí, šedé lampy, popelnice a zaparkovaná bílá dodávka. V Chlumčanské a okolí stojí starší
  jedno- a dvoupatrové domy s valbovou červenou střechou, béžovou omítkou, cihlovým soklem a kovovými ploty.
  Styl domu se vybírá podle roku stavby z OSM (a u Tiché podle polohy).

Data jsou uložená v `js/mapData.js`. Přegenerovat je jde skriptem `python tools/build_map.py` (stáhne čerstvá data z Overpass API a Open-Meteo).

## Struktura

| Soubor | Účel |
|---|---|
| `js/main.js` | renderer, stavy hry (menu, odpočet, závod, výsledky), vstupy, kamera, HUD, minimapa, kvalita grafiky |
| `js/track.js` | **definice okruhu `CIRCUIT`** (body na reálných ulicích), zaoblení rohů, dotazy na polohu, obrubníky, chodníky, ploty/túje, lampy, startovní brána |
| `js/world.js` | terén z výškopisu, textura podkladu z OSM ploch, okolní ulice, budovy (moderní / starší styl), stromy, obloha |
| `js/kart.js` | model motokáry, arkádová fyzika (drift, mini-turbo, nárazy), AI jezdci |
| `js/items.js` | krabice s předměty, banány, krunýře, zrychlovací pásy |
| `js/audio.js` | syntetizované zvuky přes WebAudio (motor, efekty) |
| `js/util.js` | výška terénu, procedurální textury, pomocná geometrie |

## Jak rozšiřovat

- **Jiná trasa:** uprav pole `CIRCUIT` v `js/track.js` (souřadnice v metrech, x = východ, z = jih, střed = Tichá).
  Rohy se zaoblí automaticky, ploty a zábrany v ústích ulic se vygenerují podle OSM.
- **Víc aut nebo překážek na trati:** `addParkedVehicles()` v `js/main.js`.
- **Nový předmět:** `ITEM_INFO`, `randomItem()` a `use()` v `js/items.js`.
- **Výkon:** v menu „Grafika“ (Nízká = bez stínů). Rozlišení se navíc samo snižuje, když snímek trvá déle než ~25 ms.
