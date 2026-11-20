import * as THREE from 'three';
import { GLSL_WAVES, GLSL_GUST } from './waves.js';

// ---------- dlaždicová normálová mapa drobného čeření ----------
function makeDetailNormalMap(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const comps = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 48; i++) {
    let fx = Math.round((rnd() * 2 - 1) * 14), fy = Math.round((rnd() * 2 - 1) * 14);
    if (fx === 0 && fy === 0) fx = 1;
    const f = Math.hypot(fx, fy);
    comps.push({ fx, fy, a: 1 / Math.pow(f, 1.25), ph: rnd() * 6.283 });
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let h = 0, dx = 0, dy = 0;
    for (const c of comps) {
      const th = 2 * Math.PI * (c.fx * u + c.fy * v) + c.ph;
      h += c.a * Math.sin(th);
      const cc = c.a * Math.cos(th) * 2 * Math.PI;
      dx += cc * c.fx; dy += cc * c.fy;
    }
    const s = 0.012;
    const nx = -dx * s, ny = -dy * s;
    const i = (y * size + x) * 4;
    data[i] = Math.max(0, Math.min(255, 128 + nx * 127));
    data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 127));
    data[i + 2] = 255;
    data[i + 3] = Math.max(0, Math.min(255, 128 + h * 60));
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// mřížka: jemná uprostřed, k okrajům se zvětšuje
function makeOceanGeometry() {
  const coords = [0];
  let step = 1.0, x = 0, i = 0;
  while (x < 6000) { if (i > 60) step *= 1.045; x += step; coords.push(x); i++; }
  const axis = [...coords.slice(1).reverse().map((c) => -c), ...coords];
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const p = (j * n + k) * 3;
    pos[p] = axis[k]; pos[p + 1] = 0; pos[p + 2] = axis[j];
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let k = 0; k < n - 1; k++) {
    const a = j * n + k, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b;
    idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const SKY_FN = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uFlash;
vec3 skyGradient(vec3 d){
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55));
  if(h < 0.0) col = uHorizon * 0.8;
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sd, 10.0) * 0.25;
  return col * (1.0 + uFlash*2.5);
}
`;

export function createOcean(waves) {
  const uniforms = {
    uTime: { value: 0 },
    uWA: { value: waves.uA }, uWB: { value: waves.uB },
    uCamPos: { value: new THREE.Vector3() },
    uDetail: { value: makeDetailNormalMap() },
    uWater: { value: new THREE.Color(0x0b4f7a) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0002 },
    uChop: { value: 0.5 }, uFoam: { value: 0.3 }, uLight: { value: 1 }, uFlash: { value: 0 },
    uGustDrift: { value: new THREE.Vector2() }, uGustAmp: { value: 0.2 },
    uWindDir: { value: new THREE.Vector2(0, -1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime; uniform vec3 uCamPos;
      ${GLSL_WAVES}
      varying vec3 vWorld; varying vec2 vP0; varying float vFade;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float dist = length(p - uCamPos.xz);
        float fade = 1.0 - smoothstep(500.0, 2400.0, dist);
        vec3 d = gerstnerDisp(p, uTime) * fade;
        wp.xyz += d;
        vP0 = p; vFade = fade; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCamPos; uniform sampler2D uDetail;
      uniform vec3 uWater; uniform vec3 uFogColor; uniform float uFogDensity;
      uniform float uChop; uniform float uFoam; uniform float uLight; uniform float uGustAmp;
      uniform vec2 uWindDir;
      ${GLSL_WAVES}
      ${GLSL_GUST}
      ${SKY_FN}
      varying vec3 vWorld; varying vec2 vP0; varying float vFade;
      void main(){
        float crest;
        vec3 N = gerstnerNormal(vP0, uTime, vFade, crest);
        float dist = length(vWorld - uCamPos);
        float g = gustValue(vWorld.xz, uTime);
        float gust = clamp(g * uGustAmp * 2.0, -0.6, 1.0);
        // drobné čeření
        vec2 drift = uWindDir * uTime;
        vec4 d1 = texture2D(uDetail, vWorld.xz / 23.0 + drift * 0.035);
        vec4 d2 = texture2D(uDetail, vWorld.xz / 7.3 - drift.yx * 0.06 + 0.37);
        vec4 d3 = texture2D(uDetail, vWorld.xz / 61.0 + drift * 0.012);
        vec2 dn = (d1.xy - 0.5) * 1.0 + (d2.xy - 0.5) * 0.7 + (d3.xy - 0.5) * 0.8;
        float rough = (0.35 + 0.65 * uChop) * (1.0 + 0.8 * max(gust, 0.0)) * mix(0.25, 1.0, exp(-dist * 0.004));
        N = normalize(N + vec3(dn.x, 0.0, dn.y) * rough * 1.2);
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
        vec3 sky = skyGradient(normalize(R));
        float sunD = max(dot(normalize(R), uSunDir), 0.0);
        vec3 spec = uSunColor * (pow(sunD, 900.0) * 18.0 + pow(sunD, 90.0) * 0.6) * uLight;
        float diff = max(dot(N, uSunDir), 0.0) * 0.5 + 0.5;
        vec3 water = uWater * (0.55 + 0.6 * diff) * uLight;
        // prosvítání hřebenů
        float h = vWorld.y;
        water += vec3(0.0, 0.09, 0.08) * clamp(h * 0.6 + 0.3, 0.0, 1.0) * pow(1.0 - ndv, 2.0) * uLight;
        water *= 1.0 - 0.18 * max(gust, 0.0);
        vec3 col = mix(water, sky * 0.92, fres) + spec * (1.0 - 0.6 * uFoam * 0.0);
        // pěna na hřebenech
        float n = (d1.a + d2.a * 0.6 + d3.a) / 2.6;
        float foam = smoothstep(0.55, 0.95, crest * 0.9 + n * 0.6 + gust * 0.15) * uFoam * vFade;
        foam += smoothstep(0.72, 0.8, n + max(gust,0.0)*0.15) * uFoam * 0.25 * vFade;
        col = mix(col, vec3(0.92, 0.95, 0.97) * (0.6 + 0.4 * diff) * uLight, clamp(foam, 0.0, 0.9));
        // mlha
        float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
        col = mix(col, uFogColor * (1.0 + uFlash * 1.5), clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(makeOceanGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

export function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uCloudColor: { value: new THREE.Color() }, uClouds: { value: 0.3 }, uTime: { value: 0 },
    uDrift: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uFogColor: { value: new THREE.Color() }, uHaze: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCloudColor; uniform float uClouds; uniform float uTime; uniform vec2 uDrift;
      uniform vec3 uFogColor; uniform float uHaze;
      ${SKY_FN}
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = skyGradient(d);
        float sd = max(dot(d, uSunDir), 0.0);
        float sunDisk = smoothstep(0.9993, 0.9997, sd);
        col += uSunColor * sunDisk * 6.0 * (1.0 - uClouds * 0.9);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 1.6 + uDrift * uTime;
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uClouds * 0.95 - 0.1, 1.15 - uClouds * 0.75, n + 0.25);
          float shade = fbm(uv * 1.7 + 3.1);
          vec3 cc = uCloudColor * (0.72 + 0.4 * shade) + uSunColor * pow(sd, 6.0) * 0.35;
          cc *= (1.0 + uFlash * 3.0);
          col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y));
        }
        col = mix(col, uFogColor * (1.0 + uFlash * 1.5), uHaze * (1.0 - smoothstep(0.0, 0.35, d.y)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return { mesh, uniforms };
}
