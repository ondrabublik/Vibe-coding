// "Orbis terrarum" – the world as known to Europeans before Columbus (1491),
// painted as an old portolan chart. The Americas, Australia and Antarctica
// are missing: they are simply unknown sea and "terra incognita".

import { createMapCanvas, seededRandom, geoCentroid, createFeatureIndex } from '../core/canvasMap.js';
import { loadJSON, URLS, ensureFont } from '../core/data.js';
import { loadCountries } from '../core/countries.js';
import { feature } from 'topojson-client';

const DEG = Math.PI / 180;
const INK = '#3d2710';
const SEA = '#e7d9b0';
const LAND = '#dcc185';

/** Which present-day landmasses were unknown to Europe in 1491 (by centroid). */
function isUnknown([lon, lat]) {
  return lon < -32 || lat < -50 || (lon > 112 && lat < -11) || (lon > 128 && lat < -1) || (lon > 150 && lat < 45);
}

const MOUNTAINS = [
  [[6, 45.5], [10, 46.5], [14, 47]], // Alps
  [[-1.5, 43], [2.5, 42.6]], // Pyrenees
  [[18, 49.5], [22, 49], [25, 47.5], [25, 45.5], [22.5, 44.8]], // Carpathians
  [[10, 44], [13, 42.5], [16, 40]], // Apennines
  [[20, 42.5], [25, 42.7]], // Balkan
  [[39, 43.5], [44, 42.8], [48, 41.5]], // Caucasus
  [[59.5, 67], [59, 60], [58.5, 55], [58, 51]], // Ural
  [[-8, 31], [-3, 33], [3, 35], [8, 35.5]], // Atlas
  [[30, 37], [35, 37.5], [40, 38.5]], // Taurus
  [[45, 35], [50, 31], [55, 28]], // Zagros
  [[67, 34.5], [71, 36]], // Hindu Kush
  [[74, 35], [80, 31], [86, 28], [92, 28], [96, 28.5]], // Himalaya
  [[70, 41.5], [78, 42], [86, 43]], // Tian Shan
  [[86, 50], [90, 49], [95, 47]], // Altai
  [[38, 13], [39, 9], [38, 6]], // Ethiopian highlands
  [[8, 61], [13, 64], [17, 68]], // Scandinavian mountains
];

const REGIONS = [
  ['EVROPA', 16, 52, 34], ['AFRICA', 14, 16, 42], ['ASIA', 92, 47, 48], ['ARABIA', 45, 22, 26],
  ['INDIA', 78, 21, 28], ['CATHAY', 112, 33, 28], ['TARTARIA', 78, 60, 30], ['AETHIOPIA', 26, -6, 24],
  ['PERSIA', 56, 32, 22], ['EGYPTVS', 29, 26.5, 16], ['SCANDIA', 16, 64, 18], ['MOSCOVIA', 40, 56, 18],
];
const SEAS = [
  ['Mare Mediterraneum', 18, 35.3, 20], ['Mare Oceanum', -20, 37, 26], ['Mare Tenebrosum', -48, 22, 30],
  ['Oceanus Indicus', 75, -14, 30], ['Mare Rubrum', 38.5, 20.5, 13], ['Mare Caspium', 51, 42, 13],
  ['Mare Sinarum', 114, 17, 20], ['Mare Balticum', 19.5, 57, 12], ['Oceanus Septentrionalis', 40, 74, 22],
  ['Oceanus Orientalis', 150, 25, 26],
];
const SMALL = [['Cipangu', 138, 37.5, 16], ['Taprobana', 81, 5, 14], ['Madagascar', 47, -19, 13], ['Britannia', -2, 53.5, 13]];
const UNKNOWN_TEXT = [[-100, 42], [-62, -12], [132, -27], [0, -68], [-150, 5], [172, -45]];
const ROSES = [[14, 36.5, 48], [-24, 22, 62], [68, -4, 62], [111, 6, 48]];

export default {
  id: 'oldWorld',
  name: 'Svět před Kolumbem',
  category: 'Historie',
  description: 'Známý svět roku 1491 jako stará mapa – Amerika, Austrálie a Antarktida ještě neexistují.',
  options: [
    { id: 'rhumb', label: 'Kompasové růžice a kurzové čáry', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    ctx.progress('Kreslím starou mapu…');
    const [landTopo, countries] = await Promise.all([
      loadJSON(URLS.land),
      loadCountries(),
      ensureFont('40px "IM Fell English SC"'),
      ensureFont('italic 40px "IM Fell English"'),
    ]);

    const polys = feature(landTopo, landTopo.objects.land).features
      .flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
      .filter((coords) => !isUnknown(geoCentroid({ type: 'Polygon', coordinates: coords })));
    const known = { type: 'MultiPolygon', coordinates: polys };

    const m = createMapCanvas(ctx.textureWidth);
    const g = m.ctx;
    const px = m.px;
    const rnd = seededRandom(1491);
    const stretch = (lat) => 1 / Math.max(0.25, Math.cos(lat * DEG));

    // --- parchment
    g.fillStyle = SEA;
    g.fillRect(0, 0, m.width, m.height);
    for (let i = 0; i < 1800; i++) {
      const x = rnd() * m.width;
      const y = rnd() * m.height;
      const r = (20 + rnd() * 160) * px;
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rnd() < 0.6;
      grad.addColorStop(0, dark ? `rgba(120,80,30,${0.03 + rnd() * 0.05})` : `rgba(255,248,225,${0.05 + rnd() * 0.08})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, 2 * r, 2 * r);
    }

    // --- unknown parts of the world: darker, hatched
    const fog = (x0, y0, x1, y1, from, to) => {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      g.fillStyle = grad;
    };
    const [xw] = m.xy(-40, 0);
    const [xe] = m.xy(150, 0);
    const [, yS] = m.xy(0, -38);
    const [, yN] = m.xy(0, 70);
    const dim = 'rgba(95,60,25,0.32)';
    const clear = 'rgba(95,60,25,0)';
    fog(0, 0, xw, 0, dim, clear); g.fillRect(0, 0, xw, m.height);
    fog(xe, 0, m.width, 0, clear, dim); g.fillRect(xe, 0, m.width - xe, m.height);
    fog(0, yS, 0, m.height, clear, dim); g.fillRect(0, yS, m.width, m.height - yS);
    fog(0, 0, 0, yN, dim, clear); g.fillRect(0, 0, m.width, yN);

    g.save();
    g.beginPath();
    g.rect(0, 0, xw, m.height);
    g.rect(xe, 0, m.width - xe, m.height);
    g.rect(0, yS, m.width, m.height - yS);
    g.clip();
    g.strokeStyle = 'rgba(80,50,20,0.13)';
    g.lineWidth = 1.2 * px;
    const step = 11 * px;
    g.beginPath();
    for (let x = -m.height; x < m.width; x += step) { g.moveTo(x, 0); g.lineTo(x + m.height, m.height); }
    g.stroke();
    g.restore();

    // --- rhumb lines (portolan style)
    if (opts.rhumb) {
      for (const [lon, lat] of ROSES) {
        const [cx, cy] = m.xy(lon, lat);
        const k = stretch(lat);
        const R = 75 * (m.width / 360);
        for (let i = 0; i < 32; i++) {
          const a = (i / 32) * Math.PI * 2;
          g.strokeStyle = i % 4 === 0 ? 'rgba(40,25,10,0.38)' : i % 2 === 0 ? 'rgba(40,100,55,0.35)' : 'rgba(160,45,30,0.32)';
          g.lineWidth = (i % 4 === 0 ? 1.1 : 0.8) * px;
          g.beginPath();
          g.moveTo(cx, cy);
          g.lineTo(cx + Math.sin(a) * R * k, cy - Math.cos(a) * R);
          g.stroke();
        }
      }
    }

    // --- little waves in the known seas
    g.strokeStyle = 'rgba(60,70,70,0.35)';
    g.lineWidth = 1 * px;
    for (let i = 0; i < 700; i++) {
      const lon = -40 + rnd() * 190;
      const lat = -38 + rnd() * 105;
      const [x, y] = m.xy(lon, lat);
      const s = (4 + rnd() * 3) * px * stretch(lat) * 0.8;
      g.beginPath();
      g.moveTo(x - 2 * s, y);
      g.quadraticCurveTo(x - s, y - s, x, y);
      g.quadraticCurveTo(x + s, y - s, x + 2 * s, y);
      g.stroke();
    }

    // --- coastal ripples: concentric lines around the coast, drawn on a separate layer
    const ripples = document.createElement('canvas');
    ripples.width = m.width;
    ripples.height = m.height;
    const r = ripples.getContext('2d');
    const rPath = m.path.context(r);
    r.lineJoin = 'round';
    for (let n = 4; n >= 1; n--) {
      const d = n * 4.5 * px;
      r.beginPath(); rPath(known);
      r.globalCompositeOperation = 'source-over';
      r.strokeStyle = `rgba(55,70,75,${0.42 - n * 0.08})`;
      r.lineWidth = 2 * d + 0.8 * px;
      r.stroke();
      r.globalCompositeOperation = 'destination-out';
      r.lineWidth = 2 * d - 0.8 * px;
      r.stroke();
    }
    m.path.context(g);
    g.drawImage(ripples, 0, 0);

    // --- land
    m.fill(known, LAND);
    g.save();
    g.beginPath(); m.path(known); g.clip();
    g.beginPath(); m.path(known);
    g.strokeStyle = 'rgba(110,70,25,0.22)';
    g.lineWidth = 16 * px;
    g.lineJoin = 'round';
    g.stroke();
    for (let i = 0; i < 1500; i++) { // stippled texture on land
      const [x, y] = [rnd() * m.width, rnd() * m.height];
      g.fillStyle = `rgba(90,60,20,${0.05 + rnd() * 0.08})`;
      g.fillRect(x, y, 2 * px, 2 * px);
    }
    g.restore();
    m.stroke(known, INK, 1.5);

    // --- mountains
    for (const chain of MOUNTAINS) {
      for (let i = 0; i < chain.length - 1; i++) {
        const [lon0, lat0] = chain[i];
        const [lon1, lat1] = chain[i + 1];
        const n = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / 1.8));
        for (let j = 0; j < n; j++) {
          const t = j / n;
          const lon = lon0 + (lon1 - lon0) * t + (rnd() - 0.5) * 0.6;
          const lat = lat0 + (lat1 - lat0) * t + (rnd() - 0.5) * 0.6;
          const [x, y] = m.xy(lon, lat);
          const s = (4 + rnd() * 2) * px;
          const sx = s * 1.5 * stretch(lat);
          g.beginPath();
          g.moveTo(x - sx, y);
          g.quadraticCurveTo(x - sx * 0.3, y - s * 1.6, x, y - s * 1.4);
          g.quadraticCurveTo(x + sx * 0.3, y - s * 1.6, x + sx, y);
          g.closePath();
          g.fillStyle = '#cfae72';
          g.fill();
          g.beginPath();
          g.moveTo(x, y - s * 1.4);
          g.quadraticCurveTo(x + sx * 0.3, y - s * 1.6, x + sx, y);
          g.lineTo(x + sx * 0.1, y);
          g.closePath();
          g.fillStyle = 'rgba(90,55,20,0.45)';
          g.fill();
          g.beginPath();
          g.moveTo(x - sx, y);
          g.quadraticCurveTo(x - sx * 0.3, y - s * 1.6, x, y - s * 1.4);
          g.quadraticCurveTo(x + sx * 0.3, y - s * 1.6, x + sx, y);
          g.strokeStyle = INK;
          g.lineWidth = 1 * px;
          g.stroke();
        }
      }
    }

    // --- compass roses
    if (opts.rhumb) {
      for (const [lon, lat, size] of ROSES) drawRose(g, ...m.xy(lon, lat), size * px, stretch(lat), px);
    }

    // --- lettering
    const caps = (size) => `${size}px "IM Fell English SC", Georgia, serif`;
    const ital = (size) => `italic ${size}px "IM Fell English", Georgia, serif`;
    for (const [t, lon, lat, size] of REGIONS) {
      m.text(t, lon, lat, { font: caps(size), color: 'rgba(70,35,15,0.85)', letterSpacing: size * 0.35 });
    }
    for (const [t, lon, lat, size] of SEAS) m.text(t, lon, lat, { font: ital(size), color: 'rgba(40,55,60,0.8)', letterSpacing: size * 0.08 });
    for (const [t, lon, lat, size] of SMALL) m.text(t, lon, lat, { font: ital(size), color: 'rgba(70,35,15,0.9)' });
    for (const [lon, lat] of UNKNOWN_TEXT) {
      m.text('TERRA INCOGNITA', lon, lat, { font: caps(46), color: 'rgba(80,45,15,0.45)', letterSpacing: 14 });
    }
    m.text('Hic svnt dracones', -72, 18, { font: ital(22), color: 'rgba(120,30,20,0.6)' });
    m.text('Orbis Terrarvm', 68, -30, { font: caps(40), color: 'rgba(70,35,15,0.75)', letterSpacing: 10 });
    m.text('Anno Domini MCDXCI', 68, -34, { font: ital(24), color: 'rgba(70,35,15,0.75)' });

    const unknownCountries = new Set(['North America', 'South America', 'Oceania', 'Antarctica']);
    const find = createFeatureIndex(countries.features);
    return {
      map: m.canvas,
      lighting: 'soft',
      view: { lat: 30, lon: 35 },
      info: 'Evropský obraz světa těsně před objevnými plavbami: Ptolemaiova tradice, zprávy Marca Pola a portugalské plavby podél Afriky. Za Atlantikem se čekalo jen moře až k Asii.',
      attribution: 'Tvary pevnin: Natural Earth (stylizace)',
      describe(lat, lon) {
        const f = find(lon, lat);
        if (!f) return null;
        const p = f.properties;
        return unknownCountries.has(p.CONTINENT)
          ? { title: 'Terra incognita', lines: ['Evropanům roku 1491 neznámá země', `Dnes: ${p.nameCs}`] }
          : { title: 'Orbis terrarum – známý svět', lines: [`Dnes: ${p.nameCs}`] };
      },
    };
  },
};

function drawRose(g, cx, cy, size, k, px) {
  g.save();
  g.translate(cx, cy);
  g.scale(k, 1);
  g.lineWidth = 1 * px;
  g.strokeStyle = INK;
  g.beginPath();
  g.arc(0, 0, size * 0.62, 0, Math.PI * 2);
  g.fillStyle = 'rgba(240,228,195,0.85)';
  g.fill();
  g.stroke();
  g.beginPath();
  g.arc(0, 0, size * 0.55, 0, Math.PI * 2);
  g.stroke();
  // 16 points: long ones for main winds, short for half winds
  for (let i = 15; i >= 0; i--) {
    const a = (i / 16) * Math.PI * 2;
    const len = i % 4 === 0 ? size : i % 2 === 0 ? size * 0.68 : size * 0.45;
    const w = i % 4 === 0 ? size * 0.13 : size * 0.09;
    const tip = [Math.sin(a) * len, -Math.cos(a) * len];
    const left = [Math.sin(a - Math.PI / 2) * w, -Math.cos(a - Math.PI / 2) * w];
    const right = [-left[0], -left[1]];
    const color = i % 4 === 0 ? '#3d2710' : i % 2 === 0 ? '#2f6a3c' : '#a33322';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(...left); g.lineTo(...tip); g.closePath();
    g.fillStyle = color; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(...right); g.lineTo(...tip); g.closePath();
    g.fillStyle = '#f2e6c4'; g.fill(); g.stroke();
  }
  g.beginPath();
  g.arc(0, 0, size * 0.07, 0, Math.PI * 2);
  g.fillStyle = '#a33322';
  g.fill();
  g.stroke();
  // north marker
  g.font = `${size * 0.32}px "IM Fell English SC", Georgia, serif`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillStyle = INK;
  g.fillText('N', 0, -size * 1.02);
  g.restore();
}
