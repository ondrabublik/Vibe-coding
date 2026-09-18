import * as THREE from 'three';
import { lambert } from './util.js';

export const ITEM_INFO = {
  mushroom: { icon: '🍄', name: 'Turbo houba' },
  banana: { icon: '🍌', name: 'Banán' },
  shell: { icon: '🐢', name: 'Krunýř' },
};

// Item boxes, bananas, shells and boost pads
export class Items {
  constructor(scene, track, T) {
    this.scene = scene;
    this.track = track;
    this.boxes = [];
    this.bananas = [];
    this.shells = [];
    this.pads = [];

    // item boxes: rows across the road
    const boxGeo = new THREE.BoxGeometry(1.1, 1.1, 1.1);
    const boxMat = lambert({ map: T.itemBox, transparent: true, opacity: 0.92, emissive: 0x332244, roughness: 0.2 });
    for (const f of [0.17, 0.5, 0.77]) {
      const s = track.startS + track.length * f;
      for (const lat of [-3.6, -1.2, 1.2, 3.6]) {
        const p = track.pos(s, lat);
        const m = new THREE.Mesh(boxGeo, boxMat);
        m.position.set(p.x, p.y + 1.1, p.z);
        m.castShadow = true;
        scene.add(m);
        this.boxes.push({ mesh: m, x: p.x, z: p.z, y: p.y + 1.1, respawn: 0, phase: Math.random() * 6 });
      }
    }

    // boost pads on the two long straights (U Lomy, Oty Kovala)
    const padMat = lambert({ map: T.boost, emissive: 0xff7a00, emissiveIntensity: 0.35, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -8, polygonOffsetUnits: -8 });
    this.padTex = T.boost;
    const segStart = (k) => (k === 0 ? 0 : track.segEndS[k - 1]);
    for (const [seg, frac, lat] of [[3, 0.45, 2.2], [4, 0.3, -2.2], [4, 0.7, 2.4]]) {
      const s0 = segStart(seg), s1 = track.segEndS[seg];
      const s = s0 + (s1 - s0) * frac;
      const i = track.idxAt(s);
      const p = track.pos(s, lat);
      const g = new THREE.PlaneGeometry(2.6, 4);
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, padMat);
      m.position.set(p.x, p.y + 0.13, p.z);
      m.rotation.y = track.heading(i) + Math.PI;
      m.receiveShadow = true;
      scene.add(m);
      this.pads.push({ s, lat, i });
    }

    // meshes for projectiles
    this.bananaGeo = new THREE.SphereGeometry(0.32, 12, 8);
    this.bananaGeo.scale(1.6, 0.6, 0.6);
    this.bananaMat = lambert({ color: 0xf5d020, roughness: 0.5 });
    this.shellGeo = new THREE.SphereGeometry(0.42, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    this.shellMat = lambert({ color: 0x2eb82e, roughness: 0.35, metalness: 0.1 });
    this.shellRimMat = lambert({ color: 0xffffff });
  }

  randomItem(rank, count) {
    const f = count > 1 ? (rank - 1) / (count - 1) : 0; // 0 = leader, 1 = last
    const pm = 0.1 + 0.45 * f, ps = 0.3 + 0.1 * f;
    const r = Math.random();
    return r < pm ? 'mushroom' : r < pm + ps ? 'shell' : 'banana';
  }

  hazards() {
    return this.bananas.map((b) => ({ idx: b.idx, lat: b.lat, r: 0.6 }));
  }

  use(kart, events) {
    const t = this.track;
    const item = kart.item;
    kart.item = null;
    if (item === 'mushroom') {
      kart.startBoost(1.3);
      events.push({ type: 'boost', kart });
    } else if (item === 'banana') {
      const bx = kart.x - Math.sin(kart.heading) * 2.2, bz = kart.z - Math.cos(kart.heading) * 2.2;
      const i = t.nearest(bx, bz, kart.idx, 20);
      const m = new THREE.Mesh(this.bananaGeo, this.bananaMat);
      const y = t.surfaceY(bx, bz, i) + 0.2;
      m.position.set(bx, y, bz);
      m.rotation.y = Math.random() * 6;
      m.castShadow = true;
      this.scene.add(m);
      this.bananas.push({ mesh: m, x: bx, z: bz, idx: i, lat: t.lateral(bx, bz, i), owner: kart, age: 0 });
      events.push({ type: 'drop', kart });
    } else if (item === 'shell') {
      const g = new THREE.Group();
      const top = new THREE.Mesh(this.shellGeo, this.shellMat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 16), this.shellRimMat);
      rim.rotation.x = Math.PI / 2;
      g.add(top, rim);
      g.traverse((o) => (o.castShadow = true));
      this.scene.add(g);
      const s = kart.idx * t.step + 2.2;
      const lat = t.lateral(kart.x, kart.z, kart.idx);
      this.shells.push({ mesh: g, s, lat, v: Math.max(34, kart.speed + 16), life: 4.5, owner: kart, x: kart.x, z: kart.z, age: 0 });
      events.push({ type: 'shell', kart });
    }
  }

  update(dt, karts, time, ranks) {
    const t = this.track;
    const events = [];
    // boxes
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        b.mesh.visible = b.respawn <= 0;
        if (b.respawn <= 0) b.mesh.scale.setScalar(0.01);
      }
      if (b.mesh.visible) {
        b.mesh.rotation.set(time * 0.9 + b.phase, time * 1.3 + b.phase, 0);
        b.mesh.position.y = b.y + Math.sin(time * 2 + b.phase) * 0.15;
        const sc = Math.min(1, b.mesh.scale.x + dt * 3);
        b.mesh.scale.setScalar(sc);
        for (const k of karts) {
          if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 2.2 ** 2) {
            b.mesh.visible = false;
            b.respawn = 3;
            if (!k.item && k.itemRoll <= 0) {
              k.itemRoll = 1.0;
              k.pendingItem = this.randomItem(ranks.get(k), karts.length);
              events.push({ type: 'pickup', kart: k });
            }
            break;
          }
        }
      }
    }
    // item roulette
    for (const k of karts) {
      if (k.itemRoll > 0) {
        k.itemRoll -= dt;
        if (k.itemRoll <= 0) { k.item = k.pendingItem; events.push({ type: 'gotItem', kart: k }); }
      }
    }
    // boost pads
    this.padTex.offset.y = (time * 1.5) % 1;
    for (const p of this.pads) {
      for (const k of karts) {
        let ds = k.idx * t.step - p.s;
        if (ds > t.length / 2) ds -= t.length;
        if (ds < -t.length / 2) ds += t.length;
        if (Math.abs(ds) < 2.2 && Math.abs(t.lateral(k.x, k.z, k.idx) - p.lat) < 1.6) {
          if (k.boostTime < 0.9) events.push({ type: 'pad', kart: k });
          k.startBoost(1.0);
        }
      }
    }
    // bananas
    for (let n = this.bananas.length - 1; n >= 0; n--) {
      const b = this.bananas[n];
      b.age += dt;
      for (const k of karts) {
        if (k === b.owner && b.age < 0.6) continue;
        if ((k.x - b.x) ** 2 + (k.z - b.z) ** 2 < 1.25 ** 2) {
          if (k.hit()) events.push({ type: 'hit', kart: k });
          this.scene.remove(b.mesh);
          this.bananas.splice(n, 1);
          break;
        }
      }
    }
    // shells: race along the road and home in on the nearest kart ahead
    for (let n = this.shells.length - 1; n >= 0; n--) {
      const sh = this.shells[n];
      sh.life -= dt; sh.age += dt;
      sh.s += sh.v * dt;
      let best = null, bestD = 45;
      for (const k of karts) {
        if (k === sh.owner) continue;
        let d = k.idx * t.step - (((sh.s % t.length) + t.length) % t.length);
        if (d < -t.length / 2) d += t.length;
        if (d > 0 && d < bestD) { bestD = d; best = k; }
      }
      if (best) sh.lat += (t.lateral(best.x, best.z, best.idx) - sh.lat) * Math.min(1, 2.5 * dt);
      const p = t.pos(sh.s, sh.lat);
      sh.x = p.x; sh.z = p.z;
      sh.mesh.position.set(p.x, p.y + 0.25, p.z);
      sh.mesh.rotation.y += dt * 12;
      let dead = sh.life <= 0;
      for (const k of karts) {
        if (k === sh.owner && sh.age < 0.4) continue;
        if ((k.x - sh.x) ** 2 + (k.z - sh.z) ** 2 < 1.4 ** 2) {
          if (k.hit()) events.push({ type: 'hit', kart: k });
          dead = true;
          break;
        }
      }
      for (let m = this.bananas.length - 1; m >= 0 && !dead; m--) {
        const b = this.bananas[m];
        if ((b.x - sh.x) ** 2 + (b.z - sh.z) ** 2 < 1.1) {
          this.scene.remove(b.mesh); this.bananas.splice(m, 1); dead = true;
        }
      }
      if (dead) { this.scene.remove(sh.mesh); this.shells.splice(n, 1); }
    }
    return events;
  }

  clear() {
    for (const b of this.bananas) this.scene.remove(b.mesh);
    for (const s of this.shells) this.scene.remove(s.mesh);
    this.bananas = []; this.shells = [];
    for (const b of this.boxes) { b.respawn = 0; b.mesh.visible = true; b.mesh.scale.setScalar(1); }
  }
}
