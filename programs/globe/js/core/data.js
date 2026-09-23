// Loading of remote data with an in-memory cache. Every layer fetches through
// these helpers, so switching back and forth between layers does not download
// the same file twice.

const THREE_GLOBE = 'https://cdn.jsdelivr.net/npm/three-globe@2.41.12/example';
const NATURAL_EARTH = 'https://cdn.jsdelivr.net/gh/nvkelso/natural-earth-vector@v5.1.2/geojson';

export const URLS = {
  blueMarble: `${THREE_GLOBE}/img/earth-blue-marble.jpg`,
  earthDay: `${THREE_GLOBE}/img/earth-day.jpg`,
  earthNight: `${THREE_GLOBE}/img/earth-night.jpg`,
  topology: `${THREE_GLOBE}/img/earth-topology.png`,
  water: `${THREE_GLOBE}/img/earth-water.png`,
  clouds: `${THREE_GLOBE}/clouds/clouds.png`,
  countries: `${NATURAL_EARTH}/ne_50m_admin_0_countries.geojson`,
  places: `${NATURAL_EARTH}/ne_50m_populated_places_simple.geojson`,
  land: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-50m.json',
  countriesTopo: 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json',
  historical: (file) => `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@master/geojson/${file}.geojson`,
  plateBoundaries: 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_boundaries.json',
  plates: 'https://cdn.jsdelivr.net/gh/fraxen/tectonicplates@master/GeoJSON/PB2002_plates.json',
  earthquakes: (mag, period) => `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/${mag}_${period}.geojson`,
  paleo: (kind, time, model) => `https://gws.gplates.org/reconstruct/${kind}/?time=${time}&model=${model}`,
};

const cache = new Map();

function cached(key, factory) {
  if (!cache.has(key)) {
    const p = factory();
    cache.set(key, p);
    p.catch(() => cache.delete(key)); // allow a retry after a failure
  }
  return cache.get(key);
}

export function loadJSON(url, { noCache = false } = {}) {
  const run = async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    return res.json();
  };
  return noCache ? run() : cached(url, run);
}

export function loadImage(url) {
  return cached(url, () => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Obrázek se nepodařilo načíst – ${url}`));
    img.src = url;
  }));
}

/** Returns the pixel data of an image (optionally resampled to width × height). */
export function imagePixels(img, width = img.width, height = img.height) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height);
}

/** Loads a font from the stylesheet before a layer draws text with it on a canvas. */
export async function ensureFont(spec) {
  try { await document.fonts.load(spec); } catch { /* fall back to a default font */ }
}
