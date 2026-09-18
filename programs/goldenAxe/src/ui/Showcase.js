import * as THREE from 'three';
import { CharacterModel } from '../render/CharacterModel.js';
import { Animator } from '../render/Animator.js';
import { mat } from '../world/Props.js';

const SHOW_COMBO = [
  { anim: 'slash', dur: 0.4, hitStart: 0.15 },
  { anim: 'thrust', dur: 0.4, hitStart: 0.14 },
  { anim: 'overhead', dur: 0.6, hitStart: 0.26 },
];

// Small 3D stage behind the title and character-select screens.
export class Showcase {
  constructor(gfx, chars) {
    this.gfx = gfx;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x140c08);
    this.scene.fog = new THREE.Fog(0x140c08, 10, 30);
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    this.time = 0;

    this.scene.add(new THREE.HemisphereLight(0x8a7aa0, 0x2a1a10, 0.8));
    const key = new THREE.DirectionalLight(0xffd8a0, 2.2);
    key.position.set(3, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);
    this.spot = new THREE.SpotLight(0xffcc66, 60, 14, 0.45, 0.6, 1.5);
    this.spot.position.set(0, 7, 3);
    this.scene.add(this.spot, this.spot.target);

    const floor = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, 0.4, 10), mat(0x4a3a2c));
    floor.position.y = -0.2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3 + (i % 3), 0.6), mat(0x5a5048));
      pillar.position.set(Math.cos(a) * 7.5, 1.5, Math.sin(a) * 7.5 - 2);
      this.scene.add(pillar);
    }

    this.heroes = chars.map((c, i) => {
      const model = new CharacterModel(c.model);
      model.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      model.root.position.set((i - 1) * 2.2, 0, 0);
      this.scene.add(model.root);
      return { model, animator: new Animator(model), t: 0, combo: 0 };
    });
  }

  update(dt, mode, selected) {
    this.time += dt;
    this.heroes.forEach((h, i) => {
      const active = mode === 'select' && i === selected;
      h.model.setFacing(1);
      h.model.root.rotation.y = active ? -0.9 : -1.2;
      let a;
      if (active) {
        h.t += dt;
        const atk = SHOW_COMBO[h.combo];
        if (h.t > atk.dur + 0.15) { h.t = 0; h.combo = (h.combo + 1) % SHOW_COMBO.length; }
        a = { state: h.t <= atk.dur ? 'attack' : 'idle', t: h.t, time: this.time, attack: atk, phase: 0, vy: 0 };
      } else {
        h.t = 0; h.combo = 0;
        a = { state: 'idle', t: 0, time: this.time + i, phase: 0, vy: 0 };
      }
      h.animator.update(a, dt);
      h.model.setFlash(active ? 0.12 : 0, 0xffaa55);
    });

    const target = mode === 'select' ? this.heroes[selected].model.root.position : new THREE.Vector3(0, 0, 0);
    this.spot.target.position.lerp(target, 1 - Math.exp(-dt * 8));
    this.spot.position.x = this.spot.target.position.x;

    const orbit = mode === 'title' ? Math.sin(this.time * 0.25) * 0.5 : 0;
    this.camera.position.set(Math.sin(orbit) * 9, mode === 'title' ? 2.2 : 2.6, Math.cos(orbit) * 9);
    this.camera.lookAt(0, mode === 'title' ? 1.8 : 1.2, 0);
  }

  render() {
    const r = this.gfx.renderer;
    this.camera.aspect = r.domElement.clientWidth / r.domElement.clientHeight || 1;
    this.camera.updateProjectionMatrix();
    r.render(this.scene, this.camera);
  }
}
