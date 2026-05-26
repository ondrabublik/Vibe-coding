# NACA 4-digit profil — DXF / CSV / STEP

Jednostránková aplikace (HTML + JavaScript) pro výpočet, náhled a export 4místných NACA profilů. Funguje bez serveru — stačí otevřít `index.html` v prohlížeči.

## Funkce

- NACA kód (4 číslice) ↔ tloušťka profilu (%)
- Měřítko = délka profilu (chord) v mm
- Úhel natočení kolem náběžné hrany
- Náhled vnější uzavřené křivky a vnitřní (offset)
- **DXF** — jedna uzavřená `LWPOLYLINE` (vrstva `PROFILE`), jednotky mm
- **CSV** — uzavřená křivka (X;Y v mm) s BOM, kompatibilní s českým Excelem
- **STEP** — extrudovaný dutý profil (AP214):
  - Tloušťka stěny → vnitřní křivka pomocí inward offsetu
  - Délka L → extruze podél osy Z
  - Topologicky uzavřený `MANIFOLD_SOLID_BREP` se 2 čely a 2N bočními rovinnými stěnami

## Spuštění

Dvojklik na [`index.html`](index.html).

## Soubory

- `js/naca4.js` — výpočet 4-digit NACA, transformace (scale + rotate)
- `js/closedCurve.js` — uzavřená křivka, CCW orientace, inward offset, kontrola self-intersection
- `js/canvasView.js` — náhled (Canvas 2D)
- `js/dxfExport.js` — DXF
- `js/csvExport.js` — CSV
- `js/stepExport.js` — STEP AP214 (ADVANCED_BREP_SHAPE_REPRESENTATION)
- `js/app.js` — UI logika

## Poznámky

- **Tloušťka stěny** musí být menší než lokální polovina tloušťky profilu (zejména u odtokové hrany). Pokud se vnitřní křivka samaprokříží, STEP export se zablokuje s upozorněním.
- STEP soubor lze otevřít ve FreeCAD, SolidWorks, Onshape, Fusion 360 a dalších CAD nástrojích podporujících AP214.
- DXF lze otevřít v AutoCADu, LibreCAD, FreeCAD apod.
