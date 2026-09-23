// Real-time day and night: shades the night side of any surface, shows city
// lights there and marks the point where the Sun is directly overhead.

import * as THREE from 'three';
import { loadImage, URLS } from '../core/data.js';
import { subsolarPoint, latLonToVector3 } from '../core/geo.js';

const SPEEDS = [
  { value: 1, label: 'skutečný čas' },
  { value: 600, label: '10 minut za sekundu' },
  { value: 3600, label: '1 hodina za sekundu' },
  { value: 86400 * 4, label: '4 dny za sekundu (roční období)' },
];

export default {
  id: 'dayNight',
  name: 'Den a noc',
  description: 'Aktuální poloha slunce: noční strana Země, soumrak a světla měst.',
  options: [
    { id: 'speed', label: 'Plynutí času', type: 'select', choices: SPEEDS, default: 1 },
    { id: 'lights', label: 'Světla měst v noci', type: 'checkbox', default: true },
    { id: 'darkness', label: 'Tma', type: 'range', min: 0.3, max: 1, step: 0.05, default: 0.8, live: true, format: (v) => `${Math.round(v * 100)} %` },
  ],

  async build(ctx, opts) {
    const nightImg = await loadImage(URLS.earthNight);
    const uniforms = {
      sunDir: { value: new THREE.Vector3(1, 0, 0) },
      nightMap: { value: ctx.globe.toTexture(nightImg) },
      lights: { value: opts.lights ? 1 : 0 },
      darkness: { value: opts.darkness },
    };
    const material = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */`
        varying vec3 vN;
        varying vec2 vUv;
        void main() {
          vN = normalize(position);
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 sunDir;
        uniform sampler2D nightMap;
        uniform float lights;
        uniform float darkness;
        varying vec3 vN;
        varying vec2 vUv;
        void main() {
          float d = dot(normalize(vN), sunDir);         // sine of the Sun's elevation
          float night = smoothstep(0.05, -0.12, d);     // civil + nautical twilight
          vec3 city = texture2D(nightMap, vUv).rgb * lights;
          float glow = max(city.r, max(city.g, city.b));
          vec3 col = vec3(0.0, 0.015, 0.05) + city * 1.6;
          float a = night * max(darkness, glow);
          // warm band along the terminator
          float dusk = exp(-pow(d / 0.06, 2.0));
          col = mix(col, vec3(0.9, 0.35, 0.1), dusk * 0.35);
          a = max(a, dusk * 0.18);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.0008, 192, 96), material);
    mesh.renderOrder = 1;

    let speed = opts.speed;
    let simTime = Date.now();
    let sun = subsolarPoint(new Date(simTime));
    let sunLabel = null;
    const timeFmt = new Intl.DateTimeFormat('cs-CZ', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });

    const refresh = () => {
      sun = subsolarPoint(new Date(simTime));
      latLonToVector3(sun.lat, sun.lon, 1, uniforms.sunDir.value);
      if (sunLabel) {
        latLonToVector3(sun.lat, sun.lon, 1, sunLabel.pos);
        ctx.globe.labels.markDirty();
      }
    };
    refresh();

    return {
      object: mesh,
      labels: [{ lat: sun.lat, lon: sun.lon, text: '☀ Slunce v nadhlavníku', rank: 0, className: 'sea' }],
      update(dt) {
        if (!sunLabel) sunLabel = ctx.globe.labels.groups.get('overlay:dayNight')?.[0] || null;
        simTime = speed === 1 ? Date.now() : simTime + dt * 1000 * speed;
        refresh();
      },
      setOption(id, value) {
        if (id === 'lights') uniforms.lights.value = value ? 1 : 0;
        else if (id === 'darkness') uniforms.darkness.value = value;
        else if (id === 'speed') { speed = value; if (value === 1) simTime = Date.now(); }
        else return false;
        return true;
      },
      describe(lat, lon) {
        const n = latLonToVector3(lat, lon);
        const elev = Math.asin(THREE.MathUtils.clamp(n.dot(uniforms.sunDir.value), -1, 1)) * 180 / Math.PI;
        const state = elev > 0 ? 'den' : elev > -6 ? 'občanský soumrak' : elev > -12 ? 'námořní soumrak' : elev > -18 ? 'astronomický soumrak' : 'noc';
        return {
          title: `Slunce ${elev >= 0 ? 'nad' : 'pod'} obzorem ${Math.abs(elev).toFixed(1)}° – ${state}`,
          lines: [`Čas: ${timeFmt.format(new Date(simTime))} UTC`],
        };
      },
    };
  },
};
