// Live earthquakes from the USGS feed – size by magnitude, colour by depth,
// the most recent ones pulse.

import * as THREE from 'three';
import { loadJSON, URLS } from '../core/data.js';
import { latLonToVector3, angularDistance, formatNumber } from '../core/geo.js';

const DEPTH_COLORS = [[0, '#ffe45c'], [35, '#ffab3d'], [70, '#ff6a3d'], [300, '#d6246e'], [700, '#7b2cbf']];
const depthColor = (d) => {
  let c = DEPTH_COLORS[0][1];
  for (const [limit, col] of DEPTH_COLORS) if (d >= limit) c = col;
  return c;
};

function ago(ms) {
  const h = ms / 3600000;
  if (h < 1) return `před ${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `před ${Math.round(h)} h`;
  return `před ${Math.round(h / 24)} dny`;
}

export default {
  id: 'earthquakes',
  name: 'Zemětřesení (živě)',
  description: 'Aktuální otřesy podle USGS, obnovuje se každých 5 minut.',
  options: [
    {
      id: 'feed', label: 'Období a síla', type: 'select', default: '4.5_month',
      choices: [
        { value: 'all_day', label: 'poslední den – všechna' },
        { value: '2.5_week', label: 'poslední týden – M 2,5+' },
        { value: '4.5_month', label: 'poslední měsíc – M 4,5+' },
        { value: 'significant_month', label: 'poslední měsíc – významná' },
      ],
    },
  ],

  async build(ctx, opts) {
    const [mag, period] = opts.feed.split('_');
    const url = URLS.earthquakes(mag, period);
    let quakes = [];

    const geometry = new THREE.BufferGeometry();
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, scale: { value: window.devicePixelRatio || 1 } },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        attribute float size;
        attribute float fresh;
        attribute vec3 color;
        uniform float time;
        uniform float scale;
        varying vec3 vColor;
        varying float vPulse;
        void main() {
          vColor = color;
          vPulse = fresh * fract(time * 0.6);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale * (1.0 + vPulse * 1.5);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vPulse;
        void main() {
          float r = length(gl_PointCoord - 0.5) * 2.0;
          if (r > 1.0) discard;
          float ring = vPulse > 0.0 ? smoothstep(0.75, 0.85, r) * (1.0 - vPulse) : 0.0;
          float core = 1.0 - smoothstep(0.55, 0.7, r);
          float a = max(core * 0.85, ring);
          gl_FragColor = vec4(vColor, a);
          #include <colorspace_fragment>
        }`,
    });
    const points = new THREE.Points(geometry, material);
    points.renderOrder = 2;

    const load = async () => {
      const data = await loadJSON(url, { noCache: true });
      const now = Date.now();
      quakes = data.features.map((f) => ({
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2],
        mag: f.properties.mag ?? 0, place: f.properties.place, time: f.properties.time,
      })).sort((a, b) => a.mag - b.mag);
      const pos = new Float32Array(quakes.length * 3);
      const col = new Float32Array(quakes.length * 3);
      const size = new Float32Array(quakes.length);
      const fresh = new Float32Array(quakes.length);
      const v = new THREE.Vector3();
      const c = new THREE.Color();
      quakes.forEach((q, i) => {
        latLonToVector3(q.lat, q.lon, 1.002, v).toArray(pos, i * 3);
        c.set(depthColor(q.depth)).toArray(col, i * 3);
        size[i] = 3 + Math.max(0, q.mag) ** 1.7 * 0.9;
        fresh[i] = now - q.time < 86400000 ? 1 : 0;
      });
      geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(size, 1));
      geometry.setAttribute('fresh', new THREE.BufferAttribute(fresh, 1));
      geometry.computeBoundingSphere();
    };
    await load();
    const timer = setInterval(() => load().catch(console.error), 5 * 60 * 1000);

    return {
      object: points,
      attribution: 'Zemětřesení: USGS',
      update(dt) { material.uniforms.time.value += dt; },
      dispose() { clearInterval(timer); },
      describe(lat, lon) {
        const tol = Math.max(0.2, (ctx.globe.cameraDistance - 1) * 1.5);
        let best = null;
        let bestD = tol;
        for (const q of quakes) {
          const d = angularDistance(lat, lon, q.lat, q.lon);
          if (d < bestD) { best = q; bestD = d; }
        }
        if (!best) return null;
        return {
          title: `Zemětřesení M ${best.mag.toFixed(1)}`,
          lines: [best.place || '', `Hloubka ${formatNumber(best.depth)} km · ${ago(Date.now() - best.time)}`],
        };
      },
    };
  },
};
