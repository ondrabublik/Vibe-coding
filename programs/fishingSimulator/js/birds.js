'use strict';
// Rackové: kroužení nad rybníkem, střemhlavé lovy u hladiny a občas krádež malé ryby z břehu.
(function (FS) {
  const U = FS.U, W = FS.World;
  const B = { list: [] };
  FS.Birds = B;
  const V3 = THREE.Vector3;

  function makeGull() {
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: '#f4f4f0' });
    const grey = new THREE.MeshLambertMaterial({ color: '#9aa3ab' });
    const black = new THREE.MeshLambertMaterial({ color: '#1c1c1c' });
    const yellow = new THREE.MeshLambertMaterial({ color: '#f0c020' });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.26, 4, 8), white);
    body.rotation.z = Math.PI / 2; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); head.position.set(0.2, 0.05, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.09, 6), yellow); beak.rotation.z = -Math.PI / 2; beak.position.set(0.3, 0.04, 0); g.add(beak);
    for (const s of [1, -1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 4), black); eye.position.set(0.25, 0.08, s * 0.045); g.add(eye);
    }
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.015, 0.11), white); tail.position.set(-0.24, 0.02, 0); g.add(tail);
    const wings = [];
    for (const s of [1, -1]) {
      const pivot = new THREE.Group(); pivot.position.set(0.02, 0.05, s * 0.06); g.add(pivot);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.012, 0.32), grey); inner.position.z = s * 0.16; pivot.add(inner);
      const outerPivot = new THREE.Group(); outerPivot.position.z = s * 0.32; pivot.add(outerPivot);
      const outer = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.01, 0.28), grey); outer.position.set(-0.02, 0, s * 0.14); outerPivot.add(outer);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.011, 0.1), black); tip.position.set(-0.04, 0, s * 0.3); outerPivot.add(tip);
      wings.push({ pivot, outerPivot, s });
    }
    g.scale.setScalar(1.3);
    return { g, wings };
  }

  B.init = function (scene) {
    for (let i = 0; i < 3; i++) {
      const m = makeGull();
      scene.add(m.g);
      B.list.push({ ...m, state: 'circle', ang: Math.random() * 6.28, rad: U.grr(14, 26), h: U.grr(10, 18), spd: U.grr(5, 7), pos: new V3(), vel: new V3(), t: Math.random() * 10, cx: -12 + U.grr(-6, 6), cz: -22 + U.grr(-5, 5) });
    }
    B.callT = 4;
  };

  function flap(b, rate, amp, dt) {
    b.t += dt * rate;
    for (const w of b.wings) {
      w.pivot.rotation.x = w.s * Math.sin(b.t) * amp;
      w.outerPivot.rotation.x = w.s * Math.sin(b.t - 0.6) * amp * 0.6;
    }
  }
  function face(b, dir) {
    const yaw = Math.atan2(dir.z, dir.x);
    b.g.rotation.set(0, -yaw, U.clamp(dir.y * 0.6, -0.8, 0.8), 'YZX');
  }

  // pomocné vektory pro kroužení (běží každý snímek u každého ptáka)
  const _tgt = new V3(), _d = new V3(), _face = new V3();
  B.update = function (dt) {
    const time = FS.uniforms.uTime.value;
    for (const b of B.list) {
      if (b.state === 'circle') {
        b.ang += (b.spd / b.rad) * dt;
        const tgt = _tgt.set(b.cx + Math.cos(b.ang) * b.rad, b.h + Math.sin(time * 0.3 + b.rad) * 1.5, b.cz + Math.sin(b.ang) * b.rad);
        if (!b.pos.lengthSq()) b.pos.copy(tgt);
        const d = _d.subVectors(tgt, b.pos);
        b.pos.addScaledVector(d, Math.min(1, dt * 2));
        face(b, _face.set(-Math.sin(b.ang), d.y * 0.2, Math.cos(b.ang)));
        const glide = Math.sin(time * 0.4 + b.rad) > 0.2;
        flap(b, glide ? 1 : 9, glide ? 0.08 : 0.6, dt);
        if (Math.random() < dt * 0.025) {
          const p = FS.FishAI.randomWaterPoint(null, 0.8);
          b.state = 'dive'; b.target = new V3(p.x, 0.25, p.z);
        }
      } else if (b.state === 'dive' || b.state === 'steal') {
        const tgt = b.state === 'steal' ? b.prey.getWorldPosition(new V3()).add(new V3(0, 0.25, 0)) : b.target;
        const d = tgt.clone().sub(b.pos);
        const dist = d.length();
        b.pos.addScaledVector(d.normalize(), Math.min(dist, (b.state === 'steal' ? 11 : 9) * dt));
        face(b, d);
        flap(b, dist < 4 ? 12 : 2, dist < 4 ? 0.7 : 0.15, dt);
        if (dist < 0.35) {
          if (b.state === 'dive') {
            FS.FX.splash(b.pos.x, b.pos.z, 0.25); FS.Water.addRipple(b.pos.x, b.pos.z, 0.6);
            b.state = 'rise'; b.riseT = 0;
          } else {
            // drapne rybu a uletí
            b.g.attach(b.prey);
            b.prey.position.set(0.05, -0.15, 0);
            b.token.done = true;
            b.state = 'escape'; b.riseT = 0;
            B.call(1);
          }
        }
      } else if (b.state === 'rise' || b.state === 'escape') {
        b.riseT += dt;
        const away = b.state === 'escape' ? new V3(b.pos.x - FS.Player.pos.x, 0, b.pos.z - FS.Player.pos.z).normalize() : new V3(Math.cos(b.ang + 1.6), 0, Math.sin(b.ang + 1.6));
        const dir = away.add(new V3(0, 0.7, 0)).normalize();
        b.pos.addScaledVector(dir, 7 * dt);
        face(b, dir);
        flap(b, 11, 0.65, dt);
        if (b.riseT > (b.state === 'escape' ? 7 : 2.5)) {
          if (b.prey) { b.g.remove(b.prey); b.prey = null; }
          b.state = 'circle';
          b.ang = Math.atan2(b.pos.z - b.cz, b.pos.x - b.cx);
          b.rad = Math.max(10, Math.min(30, Math.hypot(b.pos.x - b.cx, b.pos.z - b.cz)));
        }
      }
      b.g.position.copy(b.pos);
    }
    B.callT -= dt;
    if (B.callT < 0) { B.callT = U.grr(7, 18); B.call(0.6); }
  };

  B.steal = function (prey) {
    const free = B.list.filter((b) => b.state === 'circle');
    if (!free.length) return null;
    const b = free[Math.floor(Math.random() * free.length)];
    b.state = 'steal'; b.prey = prey; b.token = { done: false };
    B.call(1);
    return b.token;
  };

  B.call = function (vol) { if (FS.Audio.gull) FS.Audio.gull(vol); };
})(window.FS);
