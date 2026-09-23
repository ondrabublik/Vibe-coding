// Political map of today's world, optionally as a thematic (choropleth) map.

import { createMapCanvas, createFeatureIndex } from '../core/canvasMap.js';
import { loadCountries, CONTINENTS_CS } from '../core/countries.js';
import { formatNumber } from '../core/geo.js';

const PASTEL = ['#f2d59b', '#c7e0a0', '#f4b5a4', '#d5c4ec', '#f0c2dc', '#f6e58f', '#a9ddcb'];
const CONTINENT_COLORS = {
  Africa: '#e9b872', Asia: '#e98f7b', Europe: '#8fb6e8', 'North America': '#9fd59a',
  'South America': '#c9e07c', Oceania: '#d4a4e0', Antarctica: '#f2f4f7', 'Seven seas (open ocean)': '#b7c4cf',
};
const SEQ = ['#fff3cf', '#fddf97', '#fdbf66', '#f99b47', '#ec6c32', '#cf4128', '#9e1f22'];
const NO_DATA = '#d0d0d0';

// Thematic modes: value(props) + class breaks for the choropleth.
const THEMES = {
  population: {
    title: 'Počet obyvatel',
    value: (p) => p.POP_EST,
    breaks: [1e6, 5e6, 2e7, 5e7, 1e8, 3e8],
    labels: ['< 1 mil.', '1–5 mil.', '5–20 mil.', '20–50 mil.', '50–100 mil.', '100–300 mil.', '> 300 mil.'],
  },
  density: {
    title: 'Hustota zalidnění (obyv./km²)',
    value: (p) => (p.POP_EST > 0 ? p.POP_EST / p.areaKm2 : null),
    breaks: [10, 25, 50, 100, 200, 500],
    labels: ['< 10', '10–25', '25–50', '50–100', '100–200', '200–500', '> 500'],
  },
  gdp: {
    title: 'HDP na obyvatele (USD, 2019)',
    value: (p) => (p.GDP_MD > 0 && p.POP_EST > 0 ? (p.GDP_MD * 1e6) / p.POP_EST : null),
    breaks: [1000, 3000, 6000, 12000, 25000, 50000],
    labels: ['< 1 000', '1–3 tis.', '3–6 tis.', '6–12 tis.', '12–25 tis.', '25–50 tis.', '> 50 tis.'],
  },
};

function classify(theme, props) {
  const v = theme.value(props);
  if (v == null || !Number.isFinite(v)) return NO_DATA;
  let i = 0;
  while (i < theme.breaks.length && v >= theme.breaks[i]) i++;
  return SEQ[i];
}

export default {
  id: 'political',
  name: 'Politická mapa',
  category: 'Současnost',
  description: 'Dnešní státy světa; lze přepnout na tematické mapy obyvatel a HDP.',
  options: [
    {
      id: 'color', label: 'Barvy států', type: 'select', default: 'political',
      choices: [
        { value: 'political', label: 'Politická mapa' },
        { value: 'continent', label: 'Podle kontinentů' },
        { value: 'population', label: 'Počet obyvatel' },
        { value: 'density', label: 'Hustota zalidnění' },
        { value: 'gdp', label: 'HDP na obyvatele' },
      ],
    },
    { id: 'labels', label: 'Názvy států', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    ctx.progress('Načítám hranice států…');
    const countries = await loadCountries();
    const features = countries.features;
    const theme = THEMES[opts.color];

    const m = createMapCanvas(ctx.textureWidth);
    const { ctx: g } = m;
    g.fillStyle = theme ? '#e4ebf1' : '#9dc4e0';
    g.fillRect(0, 0, m.width, m.height);
    m.graticule(15, theme ? 'rgba(80,100,120,0.12)' : 'rgba(255,255,255,0.35)');

    for (const f of features) {
      const p = f.properties;
      const color = theme
        ? classify(theme, p)
        : opts.color === 'continent'
          ? CONTINENT_COLORS[p.CONTINENT] || NO_DATA
          : PASTEL[(p.MAPCOLOR7 - 1) % PASTEL.length];
      m.fill(f, color);
    }
    m.stroke({ type: 'FeatureCollection', features }, 'rgba(60,60,70,0.75)', 1.1);

    const legend = theme
      ? { title: theme.title, items: [...SEQ.map((color, i) => ({ color, label: theme.labels[i] })), { color: NO_DATA, label: 'bez údajů' }] }
      : opts.color === 'continent'
        ? { title: 'Kontinenty', items: Object.entries(CONTINENT_COLORS).map(([k, color]) => ({ color, label: CONTINENTS_CS[k] })) }
        : null;

    const labels = opts.labels
      ? features.map((f) => ({
        lat: f.properties.LABEL_Y, lon: f.properties.LABEL_X,
        text: f.properties.nameCs,
        rank: Math.max(0, (f.properties.LABELRANK ?? 5) - 2),
        className: `country dark r${Math.max(0, (f.properties.LABELRANK ?? 5) - 2)}`,
      }))
      : [];

    const find = createFeatureIndex(features);
    return {
      map: m.canvas,
      lighting: 'soft',
      labels,
      legend,
      attribution: 'Hranice a data: Natural Earth',
      describe(lat, lon) {
        const f = find(lon, lat);
        if (!f) return null;
        const p = f.properties;
        const lines = [
          CONTINENTS_CS[p.CONTINENT] || p.CONTINENT,
          `Rozloha: ${formatNumber(p.areaKm2)} km²`,
        ];
        if (p.POP_EST > 0) lines.push(`Obyvatel: ${formatNumber(p.POP_EST)} (${formatNumber(p.POP_EST / p.areaKm2)}/km²)`);
        const gdp = THEMES.gdp.value(p);
        if (gdp) lines.push(`HDP na obyvatele: ${formatNumber(gdp)} USD`);
        if (p.SOVEREIGNT && p.SOVEREIGNT !== p.ADMIN) lines.push(`Patří k: ${p.SOVEREIGNT}`);
        return { title: p.nameCs, lines };
      },
    };
  },
};
