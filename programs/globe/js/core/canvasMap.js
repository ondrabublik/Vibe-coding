// Helpers for drawing vector data into an equirectangular canvas, which is
// then used as the texture of the globe. d3-geo takes care of the projection
// and of cutting polygons at the antimeridian.

import { geoEquirectangular, geoPath, geoArea, geoCentroid, geoContains, geoBounds, geoGraticule } from 'd3-geo';

export { geoArea, geoCentroid, geoContains };

/** Creates a 2:1 canvas with a d3 projection and a path generator bound to it. */
export function createMapCanvas(width = 4096) {
  const height = width / 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const projection = geoEquirectangular()
    .scale(width / (2 * Math.PI))
    .translate([width / 2, height / 2])
    .precision(0.2);
  const path = geoPath(projection, ctx);
  const px = width / 4096; // one "design pixel" – keeps line widths consistent across resolutions

  const map = {
    canvas, ctx, projection, path, width, height, px,
    /** Lon/lat → canvas x/y. */
    xy: (lon, lat) => [(lon + 180) / 360 * width, (90 - lat) / 180 * height],
    fill(geo, style) { ctx.beginPath(); path(geo); ctx.fillStyle = style; ctx.fill(); },
    stroke(geo, style, lineWidth = 1) {
      ctx.beginPath(); path(geo);
      ctx.strokeStyle = style; ctx.lineWidth = lineWidth * px; ctx.stroke();
    },
    graticule(step = 15, style = 'rgba(255,255,255,0.15)', lineWidth = 1) {
      map.stroke(geoGraticule().step([step, step]).extentMinor([[-180, -90], [180, 90.1]])(), style, lineWidth);
    },
    /**
     * Draws text at lon/lat. The text is pre-stretched horizontally by 1/cos(lat)
     * so it does not look squeezed once wrapped on the sphere.
     */
    text(str, lon, lat, { font = '24px sans-serif', color = '#000', align = 'center', stroke = null, strokeWidth = 3, letterSpacing = 0, rotate = 0 } = {}) {
      const [x, y] = map.xy(lon, lat);
      const k = 1 / Math.max(0.2, Math.cos(lat * Math.PI / 180));
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, 1);
      if (rotate) ctx.rotate(rotate);
      ctx.font = font.replace(/(\d+(\.\d+)?)px/, (_, n) => `${n * px}px`);
      ctx.textAlign = align;
      ctx.textBaseline = 'middle';
      if (letterSpacing) ctx.letterSpacing = `${letterSpacing * px}px`;
      if (stroke) {
        ctx.lineJoin = 'round';
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth * px;
        ctx.strokeText(str, 0, 0);
      }
      ctx.fillStyle = color;
      ctx.fillText(str, 0, 0);
      ctx.restore();
    },
  };
  return map;
}

/**
 * d3-geo expects clockwise outer rings (spherical polygons). Many GeoJSON
 * sources use the opposite orientation, which d3 interprets as "the whole
 * world except this polygon". Fixes the orientation in place and returns the data.
 */
export function rewind(geojson) {
  const fixPolygon = (rings) => {
    if (geoArea({ type: 'Polygon', coordinates: rings }) > 2 * Math.PI) rings.forEach((r) => r.reverse());
  };
  const walk = (g) => {
    if (!g) return;
    if (g.type === 'FeatureCollection') g.features.forEach(walk);
    else if (g.type === 'Feature') walk(g.geometry);
    else if (g.type === 'GeometryCollection') g.geometries.forEach(walk);
    else if (g.type === 'Polygon') fixPolygon(g.coordinates);
    else if (g.type === 'MultiPolygon') g.coordinates.forEach(fixPolygon);
  };
  walk(geojson);
  return geojson;
}

/** Centroid and area of the largest part of a (multi)polygon – a good place for a label. */
export function labelAnchor(feature) {
  const g = feature.geometry;
  if (!g) return null;
  let best = null;
  let total = 0;
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  for (const coords of polys) {
    const poly = { type: 'Polygon', coordinates: coords };
    const area = geoArea(poly);
    total += area;
    if (!best || area > best.area) best = { poly, area };
  }
  if (!best) return null;
  const [lon, lat] = geoCentroid(best.poly);
  return { lon, lat, area: total };
}

/** Label importance (0 = most important) derived from an area in steradians. */
export function rankFromArea(area) {
  return Math.max(0, Math.min(10, Math.round(-2.2 * Math.log10(area) - 1.5)));
}

/**
 * Spatial lookup "which feature is at lon/lat", with bounding-box pre-filtering.
 * When several features overlap, the smallest one wins.
 */
export function createFeatureIndex(features) {
  const items = features
    .filter((f) => f.geometry)
    .map((f) => ({ f, b: geoBounds(f), area: geoArea(f) }))
    .sort((a, b) => a.area - b.area);
  return (lon, lat) => {
    for (const { f, b } of items) {
      const [[w, s], [e, n]] = b;
      if (lat < s || lat > n) continue;
      if (w <= e ? (lon < w || lon > e) : (lon < w && lon > e)) continue;
      if (geoContains(f, [lon, lat])) return f;
    }
    return null;
  };
}

/** Stable pleasant colour derived from a string. */
export function hashColor(str, { s = [40, 62], l = [58, 74], alpha = 1 } = {}) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h >>>= 0;
  const hue = h % 360;
  const sat = s[0] + ((h >> 9) % 1000) / 1000 * (s[1] - s[0]);
  const lig = l[0] + ((h >> 19) % 1000) / 1000 * (l[1] - l[0]);
  return `hsla(${hue}, ${sat.toFixed(1)}%, ${lig.toFixed(1)}%, ${alpha})`;
}

/** Deterministic pseudo-random generator (mulberry32) for decorative drawing. */
export function seededRandom(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpolates a colour ramp given as [[value, '#rrggbb'], ...]. Returns [r, g, b]. */
export function rampColor(ramp, v) {
  if (v <= ramp[0][0]) return hexToRgb(ramp[0][1]);
  for (let i = 1; i < ramp.length; i++) {
    if (v <= ramp[i][0]) {
      const [v0, c0] = ramp[i - 1];
      const [v1, c1] = ramp[i];
      const t = (v - v0) / (v1 - v0);
      const a = hexToRgb(c0);
      const b = hexToRgb(c1);
      return [0, 1, 2].map((k) => a[k] + (b[k] - a[k]) * t);
    }
  }
  return hexToRgb(ramp[ramp.length - 1][1]);
}

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
