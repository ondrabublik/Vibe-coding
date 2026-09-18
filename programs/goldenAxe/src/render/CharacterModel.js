import * as THREE from 'three';

// Procedural low-poly character rig.
// Local space: forward = +x, up = +y, the character's right side = +z (toward the camera).
// Limb joints swing around their local z axis: positive = forward.
// Public interface used by the rest of the game: root, applyPose(), setFacing(), setFlash(), dispose().
// A GLB-based model can later replace this class as long as it implements the same interface.

const DEFAULTS = {
  skin: 0xe0a878, cloth: 0x3355aa, pants: 0x553322, boots: 0x3a2616, hair: 0x442211,
  metal: 0xc8ccd4, accent: 0x8a5a2b, scale: 1, bulk: 1,
  torso: 'shirt',      // bare | shirt | bikini | armor
  legs: 'pants',       // bare | pants
  hairStyle: 'short',  // short | long | bald
  helmet: null,        // horned | spiked | hood
  beard: false, female: false, sack: false, pauldrons: false,
  weapon: 'sword',     // greatsword | sword | axe | club | flail | spear | hammer | none
};

function limb(w, h, d, mat) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, -h / 2, 0); // pivot at the top
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

function block(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

export class CharacterModel {
  constructor(spec = {}) {
    const s = { ...DEFAULTS, ...spec };
    this.spec = s;
    this.materials = [];
    const mat = (color, extra = {}) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...extra });
      this.materials.push(m);
      return m;
    };
    const M = {
      skin: mat(s.skin), cloth: mat(s.cloth), pants: mat(s.pants), boots: mat(s.boots),
      hair: mat(s.hair), accent: mat(s.accent), dark: mat(0x1a1410),
      metal: mat(s.metal, { metalness: 0.6, roughness: 0.35 }),
      wood: mat(0x6b4a2b), leather: mat(0x4a2e18),
    };
    this.M = M;
    const b = s.bulk;
    this.legLen = 0.9;

    this.root = new THREE.Group();
    this.body = new THREE.Group(); // rotates as a whole when knocked down
    this.root.add(this.body);

    // --- hips & legs
    this.hips = new THREE.Group();
    this.hips.position.y = this.legLen;
    this.body.add(this.hips);
    this.hips.add(block(0.26, 0.22, 0.36 * b, s.legs === 'bare' ? M.cloth : M.pants, 0, 0.02, 0));
    this.hips.add(block(0.28, 0.07, 0.38 * b, M.leather, 0, 0.13, 0));

    const makeLeg = (side) => {
      const hip = new THREE.Group();
      hip.position.set(0, -0.02, side * 0.11 * b);
      this.hips.add(hip);
      hip.add(limb(0.16 * Math.sqrt(b), 0.44, 0.16 * Math.sqrt(b), s.legs === 'bare' ? M.skin : M.pants));
      const knee = new THREE.Group();
      knee.position.y = -0.44;
      hip.add(knee);
      knee.add(limb(0.14 * Math.sqrt(b), 0.3, 0.14 * Math.sqrt(b), s.legs === 'bare' ? M.skin : M.pants));
      knee.add(block(0.24, 0.18, 0.17 * Math.sqrt(b), M.boots, 0.04, -0.37, 0));
      return { hip, knee };
    };
    const legL = makeLeg(-1), legR = makeLeg(1);
    this.legL = legL.hip; this.kneeL = legL.knee;
    this.legR = legR.hip; this.kneeR = legR.knee;

    // --- torso
    this.torso = new THREE.Group();
    this.torso.position.y = 0.1;
    this.hips.add(this.torso);
    const chestMat = s.torso === 'shirt' ? M.cloth : s.torso === 'armor' ? M.metal : M.skin;
    this.torso.add(block(0.26, 0.55, 0.42 * b, chestMat, 0, 0.3, 0));
    if (s.torso === 'armor') this.torso.add(block(0.28, 0.2, 0.44 * b, M.cloth, 0, 0.12, 0));
    if (s.torso === 'bikini') this.torso.add(block(0.29, 0.13, 0.4 * b, M.cloth, 0.01, 0.42, 0));
    if (s.torso === 'bare' && !s.female) {
      // diagonal leather strap across the chest
      const strap = block(0.28, 0.07, 0.62 * b, M.leather, 0, 0.32, 0);
      strap.rotation.x = 0.75;
      this.torso.add(strap);
    }
    if (s.pauldrons) {
      this.torso.add(block(0.26, 0.12, 0.2, M.metal, 0, 0.58, 0.25 * b));
      this.torso.add(block(0.26, 0.12, 0.2, M.metal, 0, 0.58, -0.25 * b));
    }
    if (s.sack) {
      const sack = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34, 0), mat(0x9a7a4a));
      sack.position.set(-0.3, 0.35, 0);
      sack.scale.set(1, 1.15, 1);
      sack.castShadow = true;
      this.torso.add(sack);
    }

    // --- head
    this.head = new THREE.Group();
    this.head.position.y = 0.58;
    this.torso.add(this.head);
    this.head.add(block(0.1, 0.08, 0.1, M.skin, 0, 0.02, 0));
    this.head.add(block(0.24, 0.26, 0.22, M.skin, 0.01, 0.18, 0));
    this.head.add(block(0.02, 0.04, 0.04, M.dark, 0.125, 0.2, 0.055));
    this.head.add(block(0.02, 0.04, 0.04, M.dark, 0.125, 0.2, -0.055));
    if (s.hairStyle !== 'bald' && s.helmet !== 'hood') {
      this.head.add(block(0.26, 0.08, 0.25, M.hair, -0.01, 0.33, 0));
      this.head.add(block(0.08, 0.22, 0.25, M.hair, -0.1, 0.22, 0));
      if (s.hairStyle === 'long') this.head.add(block(0.09, s.female ? 0.5 : 0.36, 0.26, M.hair, -0.14, s.female ? -0.02 : 0.04, 0));
    }
    if (s.helmet === 'horned' || s.helmet === 'spiked') {
      this.head.add(block(0.28, 0.13, 0.27, M.metal, 0, 0.34, 0));
      if (s.helmet === 'horned') {
        for (const side of [-1, 1]) {
          const horn = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.28, 5), mat(0xeee2c4));
          horn.position.set(0, 0.42, side * 0.18);
          horn.rotation.x = side * 0.7;
          horn.castShadow = true;
          this.head.add(horn);
        }
      } else {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 5), M.metal);
        spike.position.set(0, 0.5, 0);
        this.head.add(spike);
      }
    }
    if (s.helmet === 'hood') {
      this.head.add(block(0.3, 0.2, 0.3, M.cloth, -0.02, 0.32, 0));
      this.head.add(block(0.12, 0.3, 0.3, M.cloth, -0.1, 0.16, 0));
    }
    if (s.beard) {
      this.head.add(block(0.14, 0.3, 0.24, M.hair, 0.09, 0.0, 0));
      this.head.add(block(0.08, 0.05, 0.2, M.hair, 0.13, 0.16, 0)); // moustache
    }

    // --- arms
    const makeArm = (side) => {
      const sh = new THREE.Group();
      sh.position.set(0, 0.5, side * 0.27 * b);
      this.torso.add(sh);
      const armW = 0.12 * Math.sqrt(b);
      sh.add(limb(armW + 0.01, 0.34, armW + 0.01, s.torso === 'shirt' ? M.cloth : M.skin));
      const el = new THREE.Group();
      el.position.y = -0.34;
      sh.add(el);
      el.add(limb(armW, 0.3, armW, M.skin));
      el.add(block(armW + 0.03, 0.14, armW + 0.03, M.leather, 0, -0.2, 0));
      el.add(block(0.12, 0.1, 0.12, M.skin, 0, -0.35, 0));
      const hand = new THREE.Group();
      hand.position.y = -0.36;
      el.add(hand);
      return { sh, el, hand };
    };
    const armL = makeArm(-1), armR = makeArm(1);
    this.shL = armL.sh; this.elL = armL.el;
    this.shR = armR.sh; this.elR = armR.el;

    const weapon = this.buildWeapon(s.weapon, M, mat);
    if (weapon) {
      weapon.rotation.z = 1.0; // grip angle: blade points forward-down with the arm hanging
      armR.hand.add(weapon);
    }

    this.scale = s.scale;
    this.root.scale.setScalar(s.scale);
    this.root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  }

  // Weapons are built pointing along local -y (continuation of the forearm).
  buildWeapon(type, M, mat) {
    const g = new THREE.Group();
    switch (type) {
      case 'greatsword':
        g.add(block(0.05, 0.24, 0.05, M.leather, 0, -0.02, 0));
        g.add(block(0.07, 0.05, 0.32, M.accent, 0, -0.15, 0));
        g.add(block(0.035, 1.05, 0.13, M.metal, 0, -0.7, 0));
        break;
      case 'sword':
        g.add(block(0.04, 0.2, 0.04, M.leather, 0, -0.02, 0));
        g.add(block(0.06, 0.04, 0.24, mat(0xd4a017, { metalness: 0.7, roughness: 0.3 }), 0, -0.13, 0));
        g.add(block(0.03, 0.8, 0.09, M.metal, 0, -0.55, 0));
        break;
      case 'axe':
        g.add(block(0.06, 1.0, 0.06, M.wood, 0, -0.35, 0));
        g.add(block(0.32, 0.3, 0.05, M.metal, 0.17, -0.74, 0));
        g.add(block(0.12, 0.14, 0.05, M.metal, -0.08, -0.74, 0));
        break;
      case 'club': {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 0.85, 6), M.wood);
        c.position.y = -0.36;
        c.castShadow = true;
        g.add(c);
        break;
      }
      case 'flail': {
        g.add(block(0.05, 0.4, 0.05, M.wood, 0, -0.12, 0));
        g.add(block(0.02, 0.3, 0.02, M.dark, 0, -0.45, 0));
        const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), M.metal);
        ball.position.y = -0.66;
        ball.castShadow = true;
        g.add(ball);
        break;
      }
      case 'spear': {
        g.add(block(0.04, 1.6, 0.04, M.wood, 0, -0.35, 0));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.25, 4), M.metal);
        tip.position.y = -1.27;
        tip.rotation.z = Math.PI;
        g.add(tip);
        break;
      }
      case 'hammer':
        g.add(block(0.07, 1.15, 0.07, M.wood, 0, -0.4, 0));
        g.add(block(0.28, 0.3, 0.3, mat(0x55585e, { metalness: 0.5, roughness: 0.4 }), 0, -1.0, 0));
        break;
      default:
        return null;
    }
    return g;
  }

  setFacing(f) {
    this.root.scale.set(f * this.scale, this.scale, this.scale);
    // turn slightly toward the camera so the figure reads as 3D
    this.root.rotation.y = -0.35 * f;
  }

  setFlash(amount, color = 0xffffff) {
    if (amount === this._flash && color === this._flashColor) return;
    this._flash = amount;
    this._flashColor = color;
    for (const m of this.materials) {
      m.emissive.setHex(color);
      m.emissiveIntensity = amount;
    }
  }

  applyPose(p) {
    this.body.rotation.z = p.bodyRot;
    this.body.position.y = p.bodyY;
    this.hips.position.y = this.legLen + p.hipY;
    this.torso.rotation.z = p.lean;
    this.head.rotation.z = p.head;
    this.shL.rotation.set(p.lShX, 0, p.lSh);
    this.shR.rotation.set(-p.rShX, 0, p.rSh);
    this.elL.rotation.z = p.lEl;
    this.elR.rotation.z = p.rEl;
    this.legL.rotation.z = p.lHip;
    this.legR.rotation.z = p.rHip;
    this.kneeL.rotation.z = p.lKnee;
    this.kneeR.rotation.z = p.rKnee;
  }

  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
    for (const m of this.materials) m.dispose();
  }
}
