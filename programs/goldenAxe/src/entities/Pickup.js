import * as THREE from 'three';
import { clamp } from '../core/util.js';

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.5, ...extra });
const MATS = {
  potion: std(0x2f6bff, { emissive: 0x1a3cff, emissiveIntensity: 0.6, roughness: 0.2 }),
  cork: std(0x9a7040),
  meat: std(0x9b3a22),
  bone: std(0xf1e6cc),
};

function buildMesh(type) {
  const g = new THREE.Group();
  if (type === 'potion') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.17, 0), MATS.potion);
    body.position.y = 0.17;
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 6), MATS.potion);
    neck.position.y = 0.37;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.07, 6), MATS.cork);
    cork.position.y = 0.46;
    g.add(body, neck, cork);
  } else {
    const meat = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), MATS.meat);
    meat.scale.set(1.3, 0.9, 1);
    meat.position.y = 0.2;
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 5), MATS.bone);
    bone.rotation.z = Math.PI / 2;
    bone.position.y = 0.2;
    g.add(meat, bone);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// Items dropped by thieves: 'potion' (+1 magic) or 'meat' (heals).
export class Pickup {
  constructor(game, type, x, z, vx = 0) {
    this.game = game;
    this.type = type;
    this.x = x; this.z = z; this.y = 0.8;
    this.vx = vx; this.vy = 5;
    this.age = 0;
    this.removed = false;
    this.mesh = buildMesh(type);
    game.gfx.scene.add(this.mesh);
    this.shadow = game.gfx.makeBlobShadow(0.22);
  }

  update(dt) {
    this.age += dt;
    if (this.y > 0 || this.vy > 0) {
      this.vy -= 22 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) { this.y = 0; this.vy = 0; this.vx = 0; }
    }
    const g = this.game, hw = g.gfx.halfWidth() - 0.5;
    this.x = clamp(this.x, g.camX - hw, g.camX + hw);

    if (this.age > 0.4) {
      for (const p of g.players) {
        if (!p.alive || p.y > 0.3) continue;
        if (Math.abs(p.x - this.x) < 0.7 && Math.abs(p.z - this.z) < 0.5) {
          if (this.type === 'potion') p.addPotion();
          else p.heal(p.maxHp * 0.4);
          p.score += 100;
          g.audio.play('pickup');
          g.effects.sparks(this.x, 0.4, this.z, this.type === 'potion' ? 0x6fa0ff : 0xffd070, 8);
          this.removed = true;
          break;
        }
      }
    }
  }

  syncModel() {
    const bob = this.y === 0 ? Math.sin(this.age * 5) * 0.05 + 0.05 : 0;
    this.mesh.position.set(this.x, this.y + bob, this.z);
    this.mesh.rotation.y = this.age * 2;
    this.shadow.position.set(this.x, 0.03, this.z);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    this.shadow.removeFromParent();
  }
}
