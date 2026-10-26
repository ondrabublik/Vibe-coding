'use strict';
// Prut v první osobě: ohýbaný blank, rukojeť, naviják, očka; vlasec (verlet lano) a montáž.
(function (FS) {
  const U = FS.U;
  const Rod = {};
  FS.Rod = Rod;
  const V3 = THREE.Vector3;
  const NB = 26; // body blanku
  const NR = 40; // uzly lana

  Rod.init = function (scene) {
    Rod.scene = scene;
    Rod.blank = new U.Tube(NB, 7);
    Rod.blankMat = new THREE.MeshPhysicalMaterial({ color: '#1d1d22', roughness: 0.25, clearcoat: 0.8 });
    Rod.blankMesh = new THREE.Mesh(Rod.blank.geo, Rod.blankMat);
    Rod.blankMesh.frustumCulled = false;
    Rod.blankMesh.castShadow = false;
    scene.add(Rod.blankMesh);
    Rod.handle = new THREE.Group();
    scene.add(Rod.handle);
    Rod.guides = [];
    Rod.tip = new V3(0, 2, -2);
    Rod.tipVel = new V3();
    Rod.pts = [];
    for (let i = 0; i < NB; i++) Rod.pts.push(new V3());
    // vlasec
    const lg = new THREE.BufferGeometry();
    Rod.linePos = new Float32Array((NR + 12) * 3);
    lg.setAttribute('position', new THREE.BufferAttribute(Rod.linePos, 3));
    Rod.lineGeo = lg;
    Rod.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xeef6f4, transparent: true, opacity: 0.75 }));
    Rod.line.frustumCulled = false;
    Rod.line.renderOrder = 9;
    scene.add(Rod.line);
    const lg2 = new THREE.BufferGeometry();
    lg2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    Rod.leader = new THREE.Line(lg2, new THREE.LineBasicMaterial({ color: 0xdfe8e6, transparent: true, opacity: 0.55 }));
    Rod.leader.frustumCulled = false;
    scene.add(Rod.leader);
    Rod.rope = [];
    for (let i = 0; i < NR; i++) Rod.rope.push({ p: new V3(), o: new V3() });
    Rod.ropeInit = false;
    // montáž
    Rod.floatObj = new THREE.Group(); scene.add(Rod.floatObj);
    Rod.baitObj = new THREE.Group(); scene.add(Rod.baitObj);
    Rod.lureObj = new THREE.Group(); scene.add(Rod.lureObj);
    Rod.shots = new THREE.Group();
    for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), FS.Gear.murky(new THREE.MeshStandardMaterial({ color: '#555a5e', metalness: 0.6, roughness: 0.4 }))); s.position.y = -k * 0.012; Rod.shots.add(s); }
    scene.add(Rod.shots);
  };

  Rod.equip = function (rodItem, reelItem) {
    Rod.item = rodItem; Rod.reelItem = reelItem;
    const L = rodItem.s.len, th = rodItem.look.thick || 1;
    Rod.len = L;
    Rod.th = th;
    Rod.blankMat.color.set(rodItem.look.blank);
    Rod.blankMat.roughness = rodItem.look.bamboo ? 0.55 : 0.22;
    Rod.blankMat.clearcoat = rodItem.look.bamboo ? 0.1 : 0.8;
    Rod.applySkin(FS.Game.state.skin);
    // rukojeť
    while (Rod.handle.children.length) Rod.handle.remove(Rod.handle.children[0]);
    const hm = rodItem.look.handle === 'cork' ? new THREE.MeshStandardMaterial({ map: FS.Tex.cork(), roughness: 0.8 }) : new THREE.MeshStandardMaterial({ color: '#1a1a1a', roughness: 0.85 });
    const hg = new THREE.CylinderGeometry(0.0125 * th, 0.0135 * th, 0.46, 14); hg.rotateX(Math.PI / 2); hg.translate(0, 0, 0.23);
    const handle = new THREE.Mesh(hg, hm);
    const capG = new THREE.SphereGeometry(0.0145 * th, 12, 8); const cap = new THREE.Mesh(capG, new THREE.MeshStandardMaterial({ color: '#202020', roughness: 0.6 })); cap.scale.z = 0.6;
    const seatG = new THREE.CylinderGeometry(0.0115 * th, 0.0115 * th, 0.1, 14); seatG.rotateX(Math.PI / 2); seatG.translate(0, 0, 0.3);
    const seat = new THREE.Mesh(seatG, FS.Gear.metal('#3a3d42', 0.35));
    const reel = FS.Gear.reelModel(reelItem);
    reel.position.set(0, -0.012 * th, 0.3);
    Rod.reel = reel;
    Rod.handle.add(handle, cap, seat, reel);
    // očka
    Rod.guides.forEach((g) => Rod.scene.remove(g));
    Rod.guides = [];
    const nG = Math.round(5 + L);
    for (let k = 0; k < nG; k++) {
      const f = k / (nG - 1);
      const r = U.lerp(0.014, 0.0035, Math.pow(f, 0.6)) * th;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0011 * th, 5, 14), FS.Gear.metal('#c4c8cc', 0.18));
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0007, 0.0009, 1, 4), FS.Gear.metal('#2a2a2a', 0.4));
      const grp = new THREE.Group(); grp.add(ring, leg);
      grp.userData = { s: U.lerp(0.25, 0.995, Math.pow(f, 0.85)), r, ring, leg };
      Rod.scene.add(grp);
      Rod.guides.push(grp);
    }
  };

  // barva prutu z automatu
  Rod.applySkin = function (id) {
    const sk = (FS.Skins && FS.Skins[id]) || { name: '' };
    const m = Rod.blankMat, it = Rod.item;
    if (!it) return;
    m.color.set(sk.color || (sk.map ? '#ffffff' : it.look.blank));
    m.map = sk.map ? (sk._tex || (sk._tex = sk.map())) : null;
    m.metalness = sk.metal || 0;
    m.roughness = sk.rough !== undefined ? sk.rough : it.look.bamboo ? 0.55 : 0.22;
    m.emissive.set(sk.emissive ? sk.color : '#000000');
    m.emissiveIntensity = sk.emissive || 0;
    m.needsUpdate = true;
  };

  Rod.setRig = function (floatItem, baitId, lureId, hookSize) {
    const clear = (g) => { while (g.children.length) g.remove(g.children[0]); };
    clear(Rod.floatObj); clear(Rod.baitObj); clear(Rod.lureObj);
    Rod.lureSpin = null; Rod.lureWobble = null; Rod.baitFish = null;
    if (floatItem) {
      const f = FS.Gear.floatModel(floatItem.look);
      f.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); FS.applyMurk(o.material, null, 'gear'); } });
      f.scale.setScalar(2.4);
      Rod.floatObj.add(f);
    }
    if (lureId) {
      const l = FS.Gear.lureModel(lureId);
      l.scale.setScalar(1.25);
      Rod.lureObj.add(l);
      Rod.lureSpin = l.userData.spin; Rod.lureWobble = l.userData.wobble;
    } else {
      const h = FS.Gear.hookModel(hookSize || 2);
      h.scale.multiplyScalar(1.3);
      Rod.baitObj.add(h);
      if (baitId) {
        const b = FS.Gear.baitModel(baitId);
        b.scale.setScalar(1.3);
        Rod.baitObj.add(b);
        Rod.baitFish = b.userData.fish || null;
      }
    }
  };

  const _up = new V3(0, 1, 0), _tmp = new V3(), _tmp2 = new V3(), _m = new THREE.Matrix4();
  const _x = new V3(), _y = new V3(), _z = new V3();
  // pomocné vektory pro Rod.update – bez nových objektů každý snímek (méně úklidu paměti)
  const _sv = new V3(), _prevOff = new V3(), _axis = new V3(), _P1 = new V3(), _P2 = new V3(), _off = new V3();
  const _tan = new V3(), _down = new V3(), _pt = new V3(), _gq = new THREE.Quaternion(), _zAxis = new V3(0, 0, 1);
  // p: {butt, dir, tension, load, lineDir}
  Rod.update = function (dt, p) {
    const L = Rod.len;
    const straight = _tmp.copy(p.butt).addScaledVector(p.dir, L);
    const dtc = Math.min(Math.max(dt, 1e-4), 0.05);
    // zatížení vyhlazené – jinak se ohyb a napětí vlasce navzájem rozkmitávají
    const ratioRaw = Math.min(1.4, p.tension / Math.max(0.5, p.load));
    Rod.load = (Rod.load || 0) + (ratioRaw - (Rod.load || 0)) * Math.min(1, dtc * 6);
    const ratio = Rod.load;
    // cílový průhyb špičky vůči rovnému prutu: ve směru vlasce + vlastní váha
    const target = _tmp2.set(0, 0, 0);
    if (p.lineDir) target.addScaledVector(p.lineDir, L * 0.36 * ratio);
    target.y -= L * 0.025 * (1 - Math.abs(p.dir.y));
    // průhyb se k cíli jen plynule přibližuje (bez pružiny = bez kmitání)
    if (!Rod.prevStraight) { Rod.prevStraight = straight.clone(); Rod.off = new V3(); Rod.offVel = new V3(); }
    const sv = _sv.subVectors(straight, Rod.prevStraight).divideScalar(dtc);
    Rod.prevStraight.copy(straight);
    const prevOff = _prevOff.copy(Rod.off);
    Rod.off.lerp(target, 1 - Math.exp(-dtc * 10));
    // krátký „cuk" (záběr dravce) se rychle utlumí
    Rod.off.addScaledVector(Rod.offVel, dtc);
    Rod.offVel.multiplyScalar(Math.exp(-dtc * 12));
    if (Rod.off.length() > L * 0.7) Rod.off.setLength(L * 0.7);
    Rod.tipVel.copy(sv).addScaledVector(prevOff.sub(Rod.off), -1 / dtc);
    Rod.tip.copy(straight).add(Rod.off);
    // zachovat délku tětivy
    const chord = _tmp2.subVectors(Rod.tip, p.butt);
    const cl = chord.length();
    const cosB = U.clamp(chord.dot(p.dir) / (cl || 1), -1, 1);
    const bendAng = Math.acos(cosB);
    if (bendAng > 1.4) { // omezit ohyb
      const axis = _axis.crossVectors(p.dir, chord).normalize();
      chord.copy(p.dir).applyAxisAngle(axis, 1.4);
    }
    const want = L * (1 - 0.11 * bendAng * bendAng);
    chord.normalize().multiplyScalar(want);
    Rod.tip.copy(p.butt).add(chord);
    Rod.bend = bendAng;
    // Bézier
    const P0 = p.butt, P1 = _P1.copy(p.butt).addScaledVector(p.dir, L * 0.5);
    const off = _off.subVectors(Rod.tip, straight);
    const P2 = _P2.copy(p.butt).addScaledVector(p.dir, L * 0.8).addScaledVector(off, 0.3);
    const P3 = Rod.tip;
    const bez = (s, out) => {
      const a = 1 - s;
      return out.set(0, 0, 0).addScaledVector(P0, a * a * a).addScaledVector(P1, 3 * a * a * s).addScaledVector(P2, 3 * a * s * s).addScaledVector(P3, s * s * s);
    };
    for (let i = 0; i < NB; i++) bez(U.lerp(0.03, 1, i / (NB - 1)), Rod.pts[i]); // blank začíná uvnitř rukojeti – bez mezery
    const th = Rod.th;
    Rod.blank.update(Rod.pts, (s) => (0.0074 * (1 - s) + 0.0011 * s) * th);
    Rod.bez = bez;
    // rukojeť – báze (z podél prutu, y „nahoru" kolmo)
    _z.copy(p.dir);
    _y.copy(_up).addScaledVector(_z, -_up.dot(_z)).normalize();
    _x.crossVectors(_y, _z);
    _m.makeBasis(_x, _y, _z);
    Rod.handle.position.copy(p.butt);
    Rod.handle.quaternion.setFromRotationMatrix(_m);
    // očka visí pod prutem
    const tan = _tan, down = _down, pt = _pt, q = _gq;
    for (const g of Rod.guides) {
      const s = U.lerp(0.13, 1, g.userData.s) ;
      const ss = (g.userData.s);
      bez(ss, pt);
      bez(Math.min(1, ss + 0.01), tan); tan.sub(pt).normalize();
      down.set(0, -1, 0).addScaledVector(tan, tan.y).normalize();
      const hgt = g.userData.r * 1.6 + 0.004;
      g.position.copy(pt).addScaledVector(down, hgt);
      q.setFromUnitVectors(_zAxis, tan);
      g.userData.ring.quaternion.copy(q);
      g.userData.leg.position.copy(down).multiplyScalar(-hgt * 0.5);
      g.userData.leg.scale.y = hgt;
      g.userData.leg.quaternion.setFromUnitVectors(_up, down);
      void s;
    }
    Rod.handle.updateMatrixWorld(true);
    if (!Rod.spoolPos) Rod.spoolPos = new V3();
    Rod.reel.getWorldPosition(Rod.spoolPos).addScaledVector(_y, -0.065).addScaledVector(_z, 0.05);
  };

  Rod.setReeling = function (rate, dt) {
    if (Rod.reel && Rod.reel.userData.crank) Rod.reel.userData.crank.rotation.x -= rate * dt * 9;
  };

  // vlasec od špičky ke konci (lano)
  Rod.updateLine = function (dt, lineLen, end, taut) {
    const tip = Rod.tip;
    const rope = Rod.rope;
    const dist = tip.distanceTo(end);
    if (!Rod.ropeInit) {
      rope.forEach((n, i) => { n.p.lerpVectors(tip, end, i / (NR - 1)); n.o.copy(n.p); });
      Rod.ropeInit = true;
    }
    // jednoduchý tvar: přímka, při povoleném vlasci plynulý průvěs (parabola),
    // část nad vodou/zemí nepropadne pod hladinu
    const slack = taut ? 0 : Math.max(0, lineLen - dist);
    const sagTarget = Math.min(Math.sqrt(slack * Math.max(dist, 0.1)) * 0.5, dist * 0.25 + 0.05);
    Rod.sag = Rod.sag === undefined ? sagTarget : Rod.sag + (sagTarget - Rod.sag) * (1 - Math.exp(-Math.min(dt, 0.05) * 5));
    for (let i = 0; i < NR; i++) {
      const t = i / (NR - 1);
      const p = rope[i].p.lerpVectors(tip, end, t);
      p.y -= Rod.sag * 4 * t * (1 - t);
      if (i > 0 && i < NR - 1) {
        const straightY = tip.y + (end.y - tip.y) * t;
        const floor = Math.min(Math.max(FS.World.heightAt(p.x, p.z), 0) + 0.004, straightY);
        if (p.y < floor) p.y = floor;
      }
    }
    // body: cívka -> očka -> špička -> lano
    const arr = Rod.linePos;
    let k = 0;
    const push = (v) => { arr[k++] = v.x; arr[k++] = v.y; arr[k++] = v.z; };
    if (Rod.spoolPos) push(Rod.spoolPos);
    for (const g of Rod.guides) push(g.position);
    for (let i = 0; i < NR; i++) push(rope[i].p);
    Rod.lineGeo.setDrawRange(0, k / 3);
    Rod.lineGeo.attributes.position.needsUpdate = true;
  };

  Rod.setLeader = function (a, b) {
    const arr = Rod.leader.geometry.attributes.position.array;
    if (!a) { Rod.leader.visible = false; return; }
    Rod.leader.visible = true;
    arr[0] = a.x; arr[1] = a.y; arr[2] = a.z; arr[3] = b.x; arr[4] = b.y; arr[5] = b.z;
    Rod.leader.geometry.attributes.position.needsUpdate = true;
  };

  Rod.setVisible = function (v) {
    Rod.blankMesh.visible = v; Rod.handle.visible = v; Rod.line.visible = v;
    Rod.guides.forEach((g) => (g.visible = v));
    if (!v) { Rod.floatObj.visible = Rod.baitObj.visible = Rod.lureObj.visible = Rod.leader.visible = Rod.shots.visible = false; }
  };
})(window.FS);
