# Glóbus

Interaktivní 3D model Země v prohlížeči (three.js, ES moduly, bez build kroku a bez backendu).
Zemí lze otáčet myší, kolečkem přibližovat, dvojklikem přeletět na místo. Podklad (povrch) se
přepíná v panelu vlevo, přes něj lze zapínat další vrstvy. Pod kurzorem se ukazují souřadnice
a informace z aktivních vrstev (stát, výška, zemětřesení, výška Slunce…).

Spuštění: `startServer.bat` (PHP server na http://localhost:8000) nebo jakýkoli statický server,
např. `python -m http.server`. ES moduly nejdou otevřít přes `file://`.
Data se stahují z veřejných CDN a služeb, takže je potřeba internet.

Stav aplikace je v URL (`#surface=historical&year=1492&layers=graticule,cities`), odkaz lze sdílet.

## Podklady

| Podklad | Obsah | Zdroj dat |
|---|---|---|
| Satelitní snímek | NASA Blue Marble, reliéf (bump map), odlesky oceánu | three-globe / NASA |
| Noční světla | osvětlení měst | NASA Black Marble |
| Politická mapa | dnešní státy s českými názvy; také tematické mapy: kontinenty, počet obyvatel, hustota, HDP na obyvatele | Natural Earth 1:50m |
| Výšková mapa | hypsometrie s vystínovaným reliéfem, posuvník zvýšení hladiny moře | NASA topologie (8bit, ~25 m/stupeň) |
| Časová pásma | námořní pásma po 15° s živými hodinami | Natural Earth |
| Historické hranice | 53 okamžiků od 123 000 př. n. l. po rok 2010, kolonie v barvě mateřské země | [historical-basemaps](https://github.com/aourednik/historical-basemaps) |
| Svět před Kolumbem | kreslená portolánová mapa roku 1491 – jen Evropanům známý svět | Natural Earth (stylizace) |
| Pohyb kontinentů | rekonstrukce pevnin 0–1000 mil. let (Pangea, Rodinie) | [GPlates Web Service](https://gws.gplates.org), model Merdith 2021 |
| Obrácená Země | oceány ↔ pevniny | Natural Earth |

## Vrstvy

Zeměpisná síť (rovník, obratníky, polární kruhy) · Státní hranice · Města · Oblačnost ·
Den a noc (skutečná poloha Slunce, soumrak, světla měst, zrychlený čas) · Tektonické desky (PB2002) ·
Zemětřesení živě (USGS, obnova po 5 min).

## Struktura

```
index.html, style.css
js/main.js              – start aplikace, přepínání vrstev, stav v URL
js/registry.js          – SEZNAM VRSTEV (sem se přidává nová)
js/core/globe.js        – scéna, kamera, atmosféra, osvětlení, picking, přelet
js/core/labels.js       – HTML popisky (skrývání za horizontem, podle přiblížení, bez překryvu)
js/core/canvasMap.js    – kreslení GeoJSON do rovnoběžkové (equirectangular) textury přes d3-geo
js/core/data.js         – URL zdrojů, načítání s cache
js/core/geo.js          – převody lat/lon ↔ 3D, poloha Slunce, GeoJSON → čáry
js/core/countries.js    – dnešní státy s českými názvy (sdílené)
js/core/ui.js           – generické UI (ovládací prvky z deklarace options)
js/surfaces/*.js        – podklady
js/overlays/*.js        – překryvné vrstvy
```

## Jak přidat nový podklad

1. Vytvoř `js/surfaces/mujPodklad.js`:

```js
import { createMapCanvas } from '../core/canvasMap.js';

export default {
  id: 'mujPodklad',               // unikátní, objeví se v URL
  name: 'Můj podklad',
  category: 'Fantazie',           // skupina v panelu
  description: 'Krátký popis.',
  options: [                      // UI se vygeneruje samo
    { id: 'barva', label: 'Barva', type: 'select', default: 'red',
      choices: [{ value: 'red', label: 'červená' }, { value: 'blue', label: 'modrá' }] },
    // typy: checkbox | select | range {min,max,step,format} | steps {values:[{value,label}]}
    // live: true → posuvník volá setOption() už při tažení
  ],

  async build(ctx, opts) {
    // ctx: { THREE, globe, textureWidth, progress(msg) }
    const m = createMapCanvas(ctx.textureWidth);      // plátno 2:1 + d3 projekce
    m.ctx.fillStyle = opts.barva;
    m.ctx.fillRect(0, 0, m.width, m.height);
    return {
      map: m.canvas,              // canvas | Image | THREE.Texture
      // bumpMap, bumpScale, specularMap, specular, shininess – volitelné
      lighting: 'soft',           // 'natural' | 'soft' | 'flat'
      labels: [{ lat: 50, lon: 14, text: 'Praha', rank: 2, className: 'city' }],
      legend: { title: '…', items: [{ color: '#f00', label: '…' }] },
      info: 'Text pod volbami.',
      attribution: 'Zdroj dat',
      view: { lat: 0, lon: 0 },   // kam se při přepnutí podívat
      describe: (lat, lon) => ({ title: 'Pod kurzorem', lines: ['…'] }),
      update: (dt, now) => {},    // volá se každý snímek
      setOption: (id, value) => false, // true = změna aplikována bez přestavby
      dispose: () => {},
    };
  },
};
```

2. Přidej import a položku do pole `surfaces` v `js/registry.js`.

Nová **vrstva** (`js/overlays/`) vypadá stejně, jen místo `map` vrací `object` (libovolný
THREE.Object3D přidaný do scény – koule 1 = povrch Země). Pro převod souřadnic použij
`latLonToVector3(lat, lon, radius)` z `core/geo.js`, pro čáry z GeoJSON `geometryToSegments()`.

Tipy:
- GeoJSON z cizích zdrojů prožeň `rewind()` z `canvasMap.js` (d3 vyžaduje orientaci polygonů).
- Pro „co je pod kurzorem“ použij `createFeatureIndex(features)`.
- Stahování dělej přes `loadJSON` / `loadImage` z `data.js` – mají cache.

## Nápady na rozšíření

Köppenova klimatická mapa · hustota obyvatel v mřížce · ledovce v době ledové (−120 m) ·
trasy objevitelů (Kolumbus, Magellan) jako animované čáry · lety / lodní trasy · Měsíc a Mars
jako další tělesa (stačí jiná textura).
