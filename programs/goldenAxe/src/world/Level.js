import * as THREE from 'three';
import { mulberry32, hash2, rand } from '../core/util.js';
import * as P from './Props.js';

// Builds a level from a data file (src/data/levels/*.js) and runs its wave script.
export class Level {
  constructor(game, data) {
    this.game = game;
    this.data = data;
    this.zMin = data.zMin;
    this.zMax = data.zMax;
    this.endX = data.endX;
    this.group = new THREE.Group();
    this.animated = [];
    this.waveIdx = 0;
    this.wave = null;
    this.lockX = null;
    this.completed = false;
    this.build();
    game.gfx.scene.add(this.group);
  }

  cameraMaxX() { return this.lockX ?? this.endX; }

  // ---------------------------------------------------------------- building
  build() {
    const d = this.data, C = d.colors, r = mulberry32(d.seed);
    const scene = this.game.gfx.scene;
    scene.fog = new THREE.Fog(C.fog, 40, 130);
    scene.background = new THREE.Color(C.fog);
    this.buildSky(C);
    this.buildGround(d, C);

    const x0 = -30, x1 = d.length + 30;
    const add = (obj, x, z, rotY = 0) => {
      obj.position.x = x;
      obj.position.z = z;
      if (rotY) obj.rotation.y = rotY;
      this.group.add(obj);
      return obj;
    };

    // far mountains & hills
    for (let x = x0 - 40; x < x1 + 40; x += 18 + r() * 14) add(P.mountain(r, 18 + r() * 16), x, -70 - r() * 20);
    for (let x = x0 - 20; x < x1 + 20; x += 12 + r() * 10) add(P.hill(r, 8 + r() * 6), x, -34 - r() * 10);

    // forest band behind the road
    for (let x = x0; x < x1; x += 1.6 + r() * 1.8) {
      if (r() > d.decor.treeDensity) continue;
      const z = this.zMin - 3.5 - r() * 16;
      const k = r();
      const tree = k < 0.55 ? P.pineTree(r) : k < 0.9 ? P.oakTree(r) : P.deadTree(r);
      add(tree, x + r(), z, r() * 6);
    }
    for (let x = x0; x < x1; x += 2 + r() * 3) {
      if (r() < d.decor.rockDensity) add(P.rock(r, 1 + r()), x, this.zMin - 1.2 - r() * 3);
      if (r() < 0.5) add(P.bush(r), x + 1, this.zMin - 1.4 - r() * 2.5);
    }
    // sparse, low decoration in front of the road (must not hide fighters)
    for (let x = x0; x < x1; x += 1.5 + r() * 2.5) {
      const z = this.zMax + 1.3 + r() * 4;
      const k = r();
      if (k < 0.5) add(P.grassTuft(r), x, z);
      else if (k < 0.7) add(P.rock(r, 0.6), x, z);
      else if (k < 0.8) add(P.bush(r), x, z + 1);
    }
    // grass tufts on the road edges
    for (let x = x0; x < x1; x += 0.8 + r() * 1.2) {
      add(P.grassTuft(r), x, r() < 0.5 ? this.zMin - 0.5 - r() * 0.8 : this.zMax + 0.5 + r() * 0.6);
    }

    for (const lm of d.landmarks) {
      let obj;
      switch (lm.type) {
        case 'hut': obj = P.hut(); break;
        case 'campfire': obj = P.campfire(); this.animated.push(obj.userData.update); break;
        case 'skullPole': obj = P.skullPole(); break;
        case 'fence': obj = P.fence(lm.len); break;
        case 'ruin': obj = P.ruin(r); break;
        case 'arch': obj = P.stoneArch(); break;
        case 'deadTree': obj = P.deadTree(r); break;
        default: continue;
      }
      const rot = obj.rotation.y;
      add(obj, lm.x, lm.z);
      obj.rotation.y = rot + (lm.rot || 0);
    }
  }

  buildSky(C) {
    const geo = new THREE.SphereGeometry(260, 24, 12);
    const top = new THREE.Color(C.skyTop), hor = new THREE.Color(C.skyHorizon);
    const col = [];
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = Math.max(0, pos.getY(i) / 260);
      const c = hor.clone().lerp(top, Math.pow(k, 0.6));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -1;
    this.group.add(this.sky);
  }

  buildGround(d, C) {
    const x0 = -60, x1 = d.length + 60, zNear = 22, zFar = -100;
    const w = x1 - x0, h = zNear - zFar;
    let geo = new THREE.PlaneGeometry(w, h, Math.round(w / 2), Math.round(h / 2));
    geo.rotateX(-Math.PI / 2);
    geo.translate(x0 + w / 2, 0, zFar + h / 2);
    geo = geo.toNonIndexed();

    const pos = geo.attributes.position;
    const roadA = this.zMin - 0.7, roadB = this.zMax + 0.7;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const outside = z < roadA - 1 ? roadA - 1 - z : z > roadB + 1 ? z - roadB - 1 : 0;
      if (outside > 0) pos.setY(i, (hash2(x, z) * 0.5 - 0.1) * Math.min(1, outside / 3) * (z < -30 ? 3 : 1));
    }
    const colors = [];
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i += 3) {
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const hsh = hash2(cx * 1.7, cz * 2.3);
      const edge = Math.min(Math.abs(cz - roadA), Math.abs(cz - roadB));
      const onRoad = cz > roadA && cz < roadB;
      let palette = onRoad || (edge < 0.8 && hsh > 0.5) ? C.dirt : C.grass;
      c.setHex(palette[Math.floor(hsh * palette.length) % palette.length]);
      for (let k = 0; k < 3; k++) colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));
    ground.receiveShadow = true;
    this.group.add(ground);
  }

  // ---------------------------------------------------------------- waves
  update(dt) {
    const g = this.game;
    for (const fn of this.animated) fn(g.time);
    this.sky.position.x = g.camX;
    const player = g.players[0];
    if (!player || this.completed) return;

    if (!this.wave && this.waveIdx < this.data.waves.length) {
      const w = this.data.waves[this.waveIdx];
      if (player.x >= w.at) this.startWave(w);
    }
    if (this.wave) this.updateWave();
  }

  startWave(w) {
    this.wave = { data: w, group: 0, members: [] };
    this.lockX = w.lock ?? w.at + 4;
    this.spawnGroup(w.groups[0]);
    for (const t of w.thieves || []) {
      const x = this.edgeX(t.side, 0);
      this.game.spawnEnemy('thief', x, t.z ?? rand(this.zMin, this.zMax), t.drops);
    }
    if (w.boss) {
      const boss = this.wave.members.find((e) => e.def.boss);
      if (boss) this.game.hud.setBoss(boss);
    }
  }

  edgeX(side, i) {
    const hw = this.game.gfx.halfWidth();
    return side === 'left' ? this.lockX - hw - 1.2 - i * 1.1 : this.lockX + hw + 1.2 + i * 1.1;
  }

  spawnGroup(list) {
    const count = { left: 0, right: 0 };
    for (const s of list) {
      const x = this.edgeX(s.side, count[s.side]++);
      const e = this.game.spawnEnemy(s.type, x, s.z ?? rand(this.zMin + 0.3, this.zMax - 0.3));
      this.wave.members.push(e);
    }
  }

  updateWave() {
    const w = this.wave;
    const alive = w.members.filter((e) => !e.dying && !e.removed).length;
    const groups = w.data.groups;
    if (w.group < groups.length - 1 && alive <= (w.data.reinforceAt ?? 0)) {
      w.group++;
      this.spawnGroup(groups[w.group]);
      return;
    }
    if (alive === 0 && w.group === groups.length - 1) {
      this.wave = null;
      this.lockX = null;
      this.waveIdx++;
      if (w.data.boss) {
        this.completed = true;
        this.game.hud.setBoss(null);
        this.game.onLevelComplete();
      } else {
        this.game.hud.go();
        this.game.audio.play('go');
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.isMesh) o.geometry.dispose();
    });
  }
}
