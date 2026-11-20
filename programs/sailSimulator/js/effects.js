import * as THREE from 'three';

// ---------- brázda za lodí ----------
export class Wake {
  constructor(scene, maxPts = 140) {
    this.max = maxPts;
    this.pts = []; // {x,z,dx,dz,age,w,str}
    const n = maxPts * 2;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.attr = new Float32Array(n * 3); // side, age01, strength
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aInfo', new THREE.BufferAttribute(this.attr, 3));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: `attribute vec3 aInfo; varying vec3 vI; varying vec2 vW;
        void main(){ vI=aInfo; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float uTime; uniform float uLight; varying vec3 vI; varying vec2 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        void main(){
          float side = abs(vI.x); float age = vI.y; float str = vI.z;
          float edge = smoothstep(0.55, 0.95, side) * (1.0 - smoothstep(0.95, 1.0, side));
          float center = (1.0 - smoothstep(0.0, 0.5, side)) * (1.0 - smoothstep(0.0, 0.35, age));
          float n = noise(vW * 1.3) * 0.6 + noise(vW * 4.1) * 0.4;
          float a = (edge * 0.9 + center * 0.7) * smoothstep(0.25, 0.75, n + 0.25 - age * 0.3);
          a *= (1.0 - age) * str;
          gl_FragColor = vec4(vec3(0.93,0.96,0.98) * uLight, clamp(a, 0.0, 0.85));
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.acc = 0;
  }
  reset() { this.pts = []; }
  update(dt, stern, heading, speed, beam, waves, t, life = 16) {
    this.acc += dt;
    for (const p of this.pts) p.age += dt / life;
    this.pts = this.pts.filter((p) => p.age < 1);
    if (this.acc > 0.12 && speed > 0.4) {
      this.acc = 0;
      this.pts.unshift({ x: stern.x, z: stern.z, dx: Math.cos(heading), dz: -Math.sin(heading), age: 0, w0: beam * 0.45, v: speed, str: Math.min(1, speed / 4) });
      if (this.pts.length > this.max) this.pts.length = this.max;
    }
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const k = i * 2;
      if (i >= n) { for (let j = 0; j < 2; j++) { this.pos.set([0, -50, 0], (k + j) * 3); this.attr.set([0, 1, 0], (k + j) * 3); } continue; }
      const p = this.pts[i];
      const tSec = p.age * life;
      const w = p.w0 + tSec * p.v * 0.36 * 0.4 + tSec * 0.25;
      for (let j = 0; j < 2; j++) {
        const s = j === 0 ? 1 : -1;
        const x = p.x + p.dx * w * s, z = p.z + p.dz * w * s;
        const y = waves.height(x, z, t) + 0.06;
        this.pos.set([x, y, z], (k + j) * 3);
        this.attr.set([s, p.age, p.str], (k + j) * 3);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aInfo.needsUpdate = true;
  }
}

// ---------- spršky od přídě ----------
export class Spray {
  constructor(scene, n = 500) {
    this.n = n;
    this.p = Array.from({ length: n }, () => ({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: 60 }, uLight: { value: 1 } },
      vertexShader: `attribute float aA; varying float vA; uniform float uSize;
        void main(){ vA=aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize * (0.3 + aA) / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; uniform float uLight;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d>0.5) discard;
          gl_FragColor = vec4(vec3(0.95,0.97,1.0)*uLight, vA * (1.0 - d*2.0) * 0.7); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
  }
  emit(x, y, z, vx, vy, vz, spread) {
    const q = this.p[this.i]; this.i = (this.i + 1) % this.n;
    q.x = x; q.y = y; q.z = z;
    q.vx = vx + (Math.random() - 0.5) * spread; q.vy = vy + Math.random() * spread * 0.8; q.vz = vz + (Math.random() - 0.5) * spread;
    q.life = 1;
  }
  update(dt, windX, windZ) {
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (q.life > 0) {
        q.life -= dt * 0.9;
        q.vy -= 9.81 * dt;
        q.vx += (windX - q.vx) * dt * 0.8; q.vz += (windZ - q.vz) * dt * 0.8;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      }
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.life > 0 ? q.y : -100; this.pos[i * 3 + 2] = q.z;
      this.alpha[i] = Math.max(0, q.life);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
  }
}

// ---------- déšť ----------
export class Rain {
  constructor(scene, n = 4000) {
    const pos = new Float32Array(n * 2 * 3), info = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80, r = Math.random();
      for (let j = 0; j < 2; j++) { pos.set([x, y, z], (i * 2 + j) * 3); info.set([j, r], (i * 2 + j) * 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uAlpha: { value: 0.28 } },
      vertexShader: `attribute vec2 aInfo; uniform float uTime; uniform vec3 uCenter; uniform vec2 uWind; varying float vT;
        void main(){
          vec3 p = position;
          float fall = 14.0;
          float y = mod(p.y - uTime * fall + aInfo.y * 40.0, 40.0);
          vec3 w = vec3(uWind.x, 0.0, uWind.y) * (40.0 - y) / fall * 0.5;
          vec3 base = vec3(mod(p.x - uCenter.x + w.x + 40.0, 80.0) - 40.0, y - 6.0, mod(p.z - uCenter.z + w.z + 40.0, 80.0) - 40.0) + uCenter;
          vec3 streak = normalize(vec3(uWind.x, -fall, uWind.y)) * 0.9 * aInfo.x;
          vT = aInfo.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(base + streak, 1.0);
        }`,
      fragmentShader: `uniform float uAlpha; varying float vT; void main(){ gl_FragColor = vec4(0.75,0.8,0.85, uAlpha * (1.0 - vT*0.6)); }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
}
