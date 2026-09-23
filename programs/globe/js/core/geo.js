// Geographic math shared by the globe and the layers.
//
// Coordinate convention (matches the UV mapping of THREE.SphereGeometry with an
// equirectangular texture): +Y = north pole, +X = (0°, 0°), −Z = (0°, 90° E).

import * as THREE from 'three';

const DEG = Math.PI / 180;

export function latLonToVector3(lat, lon, radius = 1, target = new THREE.Vector3()) {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  return target.set(
    radius * Math.cos(phi) * Math.cos(lambda),
    radius * Math.sin(phi),
    -radius * Math.cos(phi) * Math.sin(lambda),
  );
}

export function vector3ToLatLon(v) {
  const r = v.length();
  return {
    lat: Math.asin(THREE.MathUtils.clamp(v.y / r, -1, 1)) / DEG,
    lon: Math.atan2(-v.z, v.x) / DEG,
  };
}

/** Great-circle distance in degrees. */
export function angularDistance(lat1, lon1, lat2, lon2) {
  const a = latLonToVector3(lat1, lon1);
  const b = latLonToVector3(lat2, lon2);
  return a.angleTo(b) / DEG;
}

/** Sub-solar point (where the Sun is in the zenith) for the given date. Accuracy ~0.1°. */
export function subsolarPoint(date = new Date()) {
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * DEG;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 0.0000004 * n) * DEG;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  // Greenwich mean sidereal time in degrees
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  let lon = ra / DEG - gmst;
  lon = ((lon + 540) % 360) - 180;
  return { lat: decl / DEG, lon };
}

/**
 * Converts GeoJSON line/polygon geometry into a flat array of segment
 * endpoints for THREE.LineSegments. Long edges are subdivided so they follow
 * the sphere instead of cutting through it.
 */
export function geometryToSegments(geometry, radius = 1.001, maxStepDeg = 1, out = []) {
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  const line = (coords) => {
    for (let i = 0; i < coords.length - 1; i++) {
      latLonToVector3(coords[i][1], coords[i][0], 1, a);
      latLonToVector3(coords[i + 1][1], coords[i + 1][0], 1, b);
      const steps = Math.max(1, Math.ceil(a.angleTo(b) / DEG / maxStepDeg));
      p.copy(a);
      for (let s = 1; s <= steps; s++) {
        q.copy(a).lerp(b, s / steps).normalize();
        out.push(p.x * radius, p.y * radius, p.z * radius, q.x * radius, q.y * radius, q.z * radius);
        p.copy(q);
      }
    }
  };
  const walk = (g) => {
    if (!g) return;
    switch (g.type) {
      case 'LineString': line(g.coordinates); break;
      case 'MultiLineString': case 'Polygon': g.coordinates.forEach(line); break;
      case 'MultiPolygon': g.coordinates.forEach((poly) => poly.forEach(line)); break;
      case 'GeometryCollection': g.geometries.forEach(walk); break;
      case 'Feature': walk(g.geometry); break;
      case 'FeatureCollection': g.features.forEach(walk); break;
    }
  };
  walk(geometry);
  return out;
}

export function formatLatLon(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, 's. š.', 'j. š.')}, ${f(lon, 'v. d.', 'z. d.')}`;
}

export function formatNumber(n) {
  return new Intl.NumberFormat('cs-CZ').format(Math.round(n));
}
