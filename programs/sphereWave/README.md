# Tsunami na sféře

Simulace globální vlny tsunami po zemětřesení nebo dopadu planetky do oceánu.
Běží pouze v prohlížeči (WebGL2, bez sestavování), stačí otevřít `index.html`.

## Síť
- Ikosaedr, každá stěna rozdělena na n × n trojúhelníků po hlavních kružnicích
  (geodetické dělení), kontrolní objemy = Voronoiovy buňky: 10n² + 2 buněk,
  šestiúhelníky + 12 nutných pětiúhelníků.
- Zahuštění volbou n (16 … 256, tj. ~480 km … ~30 km), volitelné Lloydovy
  iterace (centroidální Voronoiova teselace). Poměr max/min plochy šestiúhelníku ≈ 1,14.

## Numerika (metoda konečných objemů)
- **Lineární mělká voda / vlnová rovnice** – posunutá síť (C-grid): η v buňkách,
  normálová rychlost na stěnách, schéma dopředu-dozadu, přesné zachování objemu,
  časový krok z Gershgorinova odhadu spektra.
- **Nelineární mělká voda** – Godunovovo schéma s Rusanovovým tokem, MUSCL
  rekonstrukce s Venkatakrishnanovým limiterem, hydrostatická rekonstrukce
  (well-balanced nad reálným dnem), SSP-RK2, Coriolis, Manningovo tření.
  Hybnost je 3D kartézský vektor promítaný do tečné roviny koule.
- Pevnina = nepropustné stěny, vnitrozemské deprese se z oceánu vyřadí.

## Data
- `data/etopo.js` – ETOPO1 (NOAA NCEI) po 0,25°, int16 v base64 (staženo přes
  NOAA CoastWatch ERDDAP). Zprůměrováno do buněk sítě.
- Linie pobřeží: Natural Earth 50m (`world-atlas` z jsDelivr), při výpadku CDN se jen nevykreslí.

## Soubory
| soubor | obsah |
| --- | --- |
| `js/mesh.js` | generátor šestiúhelníkové sítě, geometrie buněk a stěn |
| `js/bathy.js` | dekódování ETOPO, průměrování do buněk, maska oceánu |
| `js/solver.js` | lineární a nelineární FVM řešič, max. amplituda, čas příchodu, mareografy |
| `js/sources.js` | počáteční zdvih hladiny: zemětřesení (škálování Strasser 2010) a dopad (Ward & Asphaug 2000) |
| `js/render.js` | WebGL2 glóbus / mapa, šestiúhelníky nebo hladké zobrazení |
| `js/app.js` | ovládání, časová smyčka, graf mareografů |
