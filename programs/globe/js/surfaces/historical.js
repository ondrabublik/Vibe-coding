// Historical political borders from 123 000 BC to 2010 (dataset by A. Ourednik).

import { createMapCanvas, rewind, labelAnchor, rankFromArea, createFeatureIndex, hashColor } from '../core/canvasMap.js';
import { loadJSON, URLS } from '../core/data.js';
import { feature } from 'topojson-client';

const YEARS = [
  -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300, -200, -100, -1,
  100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400, 1492, 1500, 1530, 1600, 1650,
  1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938, 1945, 1960, 1994, 2000, 2010,
];

const fileFor = (y) => (y < 0 ? `world_bc${-y}` : `world_${y}`);
const yearLabel = (y) => (y < 0 ? `${new Intl.NumberFormat('cs-CZ').format(-y)} př. n. l.` : `${y} n. l.`);

const NOTES = {
  '-123000': 'Doba ledová – mapa ukazuje hlavně rozšíření člověka a velké kulturní oblasti.',
  '-323': 'Rok smrti Alexandra Velikého – jeho říše sahá od Řecka po Indii.',
  '-1': 'Přelom letopočtu: Římská říše, Parthie, říše Chan v Číně.',
  '1279': 'Mongolská říše na vrcholu – největší souvislá říše v dějinách.',
  '1492': 'Kolumbus připlouvá do Ameriky. V Americe vládnou Aztékové a Inkové.',
  '1783': 'Konec americké války za nezávislost – vznik USA.',
  '1815': 'Vídeňský kongres po porážce Napoleona.',
  '1914': 'Začátek první světové války – koloniální říše na vrcholu.',
  '1938': 'Předvečer druhé světové války, Mnichovská dohoda.',
  '1945': 'Konec druhé světové války.',
  '1960': '„Rok Afriky“ – vlna dekolonizace.',
  '1994': 'Po rozpadu SSSR, Jugoslávie a Československa.',
};

export default {
  id: 'historical',
  name: 'Historické hranice',
  category: 'Historie',
  description: 'Státy a říše v 53 okamžicích dějin od doby ledové po rok 2010.',
  options: [
    { id: 'year', label: 'Rok', type: 'steps', values: YEARS.map((y) => ({ value: y, label: yearLabel(y) })), default: 1492 },
    { id: 'empire', label: 'Kolonie v barvě mateřské země', type: 'checkbox', default: true },
    { id: 'labels', label: 'Názvy', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    ctx.progress(`Načítám mapu roku ${yearLabel(opts.year)}…`);
    const [data, landTopo] = await Promise.all([loadJSON(URLS.historical(fileFor(opts.year))), loadJSON(URLS.land)]);
    rewind(data);
    const features = data.features.filter((f) => f.geometry && f.properties?.NAME);
    const land = feature(landTopo, landTopo.objects.land);

    const m = createMapCanvas(ctx.textureWidth);
    const g = m.ctx;
    g.fillStyle = '#9fc2d6';
    g.fillRect(0, 0, m.width, m.height);
    m.graticule(15, 'rgba(255,255,255,0.3)');
    m.fill(land, '#e8e2d0'); // unclaimed land
    m.stroke(land, 'rgba(70,90,110,0.5)', 0.8);

    const colorKey = (p) => (opts.empire && p.SUBJECTO ? p.SUBJECTO : p.NAME);
    for (const f of features) m.fill(f, hashColor(colorKey(f.properties)));
    m.stroke({ type: 'FeatureCollection', features }, 'rgba(50,40,40,0.7)', 1);

    const labels = [];
    if (opts.labels) {
      const byName = new Map();
      for (const f of features) {
        const a = labelAnchor(f);
        if (!a) continue;
        const prev = byName.get(f.properties.NAME);
        if (!prev || a.area > prev.area) byName.set(f.properties.NAME, a);
      }
      for (const [name, a] of byName) {
        const rank = rankFromArea(a.area);
        labels.push({ lat: a.lat, lon: a.lon, text: name, rank, className: `country dark r${rank}` });
      }
    }

    const find = createFeatureIndex(features);
    return {
      map: m.canvas,
      lighting: 'soft',
      labels,
      info: NOTES[String(opts.year)] || '',
      attribution: 'Historické hranice: A. Ourednik, historical-basemaps (CC BY-SA 4.0) · Natural Earth',
      describe(lat, lon) {
        const f = find(lon, lat);
        if (!f) return null;
        const p = f.properties;
        const lines = [];
        if (p.SUBJECTO && p.SUBJECTO !== p.NAME) lines.push(`Pod vládou: ${p.SUBJECTO}`);
        if (p.PARTOF && p.PARTOF !== p.NAME && p.PARTOF !== p.SUBJECTO) lines.push(`Součást: ${p.PARTOF}`);
        if (p.BORDERPRECISION === 1) lines.push('Hranice jen přibližné');
        return { title: p.NAME, lines };
      },
    };
  },
};
