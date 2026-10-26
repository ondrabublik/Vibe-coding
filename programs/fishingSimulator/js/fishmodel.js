'use strict';
// Procedurální detailní modely ryb: tělo z profilů, šupiny, skřele, postranní čára,
// paprsčité ploutve, oči s duhovkou, vousky. Vlnění těla v shaderu.
(function (FS) {
  const U = FS.U;
  const FM = {};
  FS.FishModel = FM;
  const CX = 0.42; // posun, aby počátek ležel zhruba v těžišti
  FM.CX = CX;
  const cache = {};

  function profiles(sh) {
    return { T: U.curve1D(sh.top), B: U.curve1D(sh.bot), Wd: U.curve1D(sh.w) };
  }

  function bodyPoint(P, sh, t, phi) {
    const T = P.T(t), B = P.B(t), Wd = P.Wd(t);
    const c = Math.cos(phi), s = Math.sin(phi);
    let y = c >= 0 ? T * c : B * c;
    let z = Wd * Math.sign(s) * Math.pow(Math.abs(s), sh.ex);
    // skřele – jemný val před okrajem
    const g = sh.gill;
    const ridge = Math.exp(-(((t - (g - 0.012)) / 0.013) ** 2)) * 0.04 * U.smoothstep(0.15, 0.75, Math.abs(s));
    y *= 1 + ridge * 0.4; z *= 1 + ridge;
    // ústní štěrbina
    const mLen = sh.mouthLen || (sh.wideMouth ? 0.06 : 0.04);
    if (t < mLen) {
      const cm = -(sh.mouthY || 0) * 0.5 - 0.05;
      const k = (1 - U.smoothstep(0, sh.wideMouth ? 0.2 : 0.13, Math.abs(c - cm))) * (1 - t / mLen);
      z *= 1 - k * (sh.wideMouth ? 0.45 : 0.3);
      y *= 1 - k * 0.1;
    }
    y += (sh.mouthY || 0) * 0.02 * (1 - U.smoothstep(0, 0.14, t));
    return [-t * sh.bl + CX, y, z];
  }

  function buildBody(sp, P) {
    const sh = sp.shape;
    const NT = 56, NA = 28;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < NT; i++) {
      const t = 0.5 * (1 - Math.cos(Math.PI * i / (NT - 1)));
      for (let j = 0; j <= NA; j++) {
        const phi = (j / NA) * Math.PI * 2;
        const p = bodyPoint(P, sh, t, phi);
        pos.push(p[0], p[1], p[2]);
        uv.push(t, 1 - j / NA);
        if (i < NT - 1 && j < NA) {
          const a = i * (NA + 1) + j, b = a + NA + 1;
          // pořadí vrcholů tak, aby přední stěny (a normály) mířily ven – jinak se blízký bok ořízne
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    // svár: zprůměrovat normály
    const n = g.attributes.normal;
    for (let i = 0; i < NT; i++) {
      const a = i * (NA + 1), b = a + NA;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b);
      const l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    // čenich – normála dopředu
    for (let j = 0; j <= NA; j++) n.setXYZ(j, 1, 0, 0);
    return g;
  }

  // pás ploutve: fn(s, r) -> [x,y,z]; uv do atlasu
  function strip(nS, nR, fn, slot) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= nS; i++) {
      const s = i / nS;
      for (let j = 0; j <= nR; j++) {
        const r = j / nR;
        const p = fn(s, r);
        pos.push(p[0], p[1], p[2]);
        uv.push((slot + 0.02 + s * 0.96) / 8, 0.02 + r * 0.96);
        if (i < nS && j < nR) {
          const a = i * (nR + 1) + j, b = a + nR + 1;
          idx.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  const SLOTS = { dorsal: 0, dorsal2: 1, caudal: 2, anal: 3, pect: 4, pelvic: 5 };

  function buildFins(sp, P) {
    const sh = sp.shape;
    const geos = [];
    const xOf = (t) => -t * sh.bl + CX;
    const yOff = (t) => (sh.mouthY || 0) * 0.02 * (1 - U.smoothstep(0, 0.14, t));
    // hřbetní
    sh.dorsal.forEach((d, k) => {
      const H = U.curve1D(d.h.map((v, i) => [i / (d.h.length - 1), v]));
      const rays = d.spiny ? 13 : 14;
      const lean = d.round ? 0.12 : 0.38;
      geos.push(strip(26, 8, (s, r) => {
        const t = U.lerp(d.t0, d.t1, s);
        const bx = xOf(t), by = P.T(t) + yOff(t) - 0.0025;
        const h = Math.max(H(s), 0.002);
        const x = bx - (h * lean + d.sweep * s) * r;
        const y = by + h * r;
        const z = Math.sin(s * rays * Math.PI * 2) * 0.0012 * r;
        return [x, y, z];
      }, k === 0 ? SLOTS.dorsal : SLOTS.dorsal2));
    });
    // řitní
    {
      const d = sh.anal;
      const H = U.curve1D(d.h.map((v, i) => [i / (d.h.length - 1), v]));
      const lean = d.round ? 0.12 : 0.35;
      geos.push(strip(22, 7, (s, r) => {
        const t = U.lerp(d.t0, d.t1, s);
        const bx = xOf(t), by = -P.B(t) + yOff(t) + 0.0025;
        const h = Math.max(H(s), 0.002);
        return [bx - (h * lean + d.sweep * s) * r, by - h * r, Math.sin(s * 22 * Math.PI) * 0.001 * r];
      }, SLOTS.anal));
    }
    // ocasní
    {
      const c = sh.caudal;
      const pt = P.T(1) * 0.95, pb = P.B(1) * 0.95;
      const bx = xOf(1) + 0.006;
      const low = c.lowLonger || 0;
      geos.push(strip(30, 9, (s, r) => {
        const by = U.lerp(pt, -pb, s);
        let ex, ey;
        if (c.type === 'round' || c.type === 'eel') {
          const a = Math.PI / 2 - s * Math.PI;
          ex = bx - c.len * (0.55 + 0.45 * Math.cos(a));
          ey = c.h * Math.sin(a);
        } else {
          const up = s < 0.5;
          const p = up ? s / 0.5 : (1 - s) / 0.5; // 0 u špičky, 1 u zářezu
          const tipX = bx - c.len * (up ? 1 : 1 + low), notchX = bx - c.len * (1 - c.notch);
          const curve = Math.sin(p * Math.PI / 2);
          ex = U.lerp(tipX, notchX, curve);
          const tipY = up ? c.h : -c.h * (1 + low * 0.6);
          ey = U.lerp(tipY, 0, Math.pow(p, 0.85));
        }
        const x = U.lerp(bx, ex, r), y = U.lerp(by, ey, r) ;
        return [x, y, Math.sin(s * 19 * Math.PI * 2) * 0.0012 * r];
      }, SLOTS.caudal));
    }
    // párové ploutve
    const paired = (f, slot, D, spread, yfrac, zfrac) => {
      if (!f) return;
      for (const side of [1, -1]) {
        const t = f.t;
        const yf = yfrac !== undefined ? yfrac : f.y;
        const O = [xOf(t), (yf >= 0 ? yf * P.T(t) : yf * P.B(t)) + yOff(t), side * P.Wd(t) * zfrac];
        const Dn = new THREE.Vector3(D[0], D[1], D[2] * side).normalize();
        const E = new THREE.Vector3(0.15, 1, 0.12 * side).normalize();
        geos.push(strip(12, 7, (s, r) => {
          const base = [O[0] - s * 0.02, O[1] + (0.5 - s) * 0.006, O[2]];
          const dir = Dn.clone().addScaledVector(E, (0.5 - s) * spread).normalize();
          const prof = f.round ? 0.55 + 0.45 * Math.sin(Math.PI * (0.1 + 0.8 * s)) : 1 - 0.5 * s;
          const l = f.len * prof * r;
          return [base[0] + dir.x * l, base[1] + dir.y * l, base[2] + dir.z * l];
        }, slot));
      }
    };
    paired(sh.pect, SLOTS.pect, [-0.85, -0.2, 0.5], 0.9, undefined, 0.92);
    if (sh.pelv) paired(sh.pelv, SLOTS.pelvic, [-0.8, -0.45, 0.32], 0.7, -0.86, 0.5);
    return U.mergeGeometries(geos);
  }

  function buildBarbels(sp, P) {
    const sh = sp.shape;
    const geos = [];
    const xOf = (t) => -t * sh.bl + CX;
    (sh.barbels || []).forEach((b) => {
      for (const side of [1, -1]) {
        const t = b.t;
        const y = b.y >= 0 ? b.y * P.T(t) : b.y * P.B(t);
        const O = new THREE.Vector3(xOf(t), y, side * (b.inner ? P.Wd(t) * 0.35 : P.Wd(t) * 0.85));
        const L = b.len;
        const pts = [];
        for (let i = 0; i < 8; i++) {
          const f = i / 7;
          let p;
          if (b.long) p = new THREE.Vector3(-L * 0.7 * f, L * 0.08 * Math.sin(f * 3) - L * 0.28 * f * f, side * L * (0.3 * Math.sin(f * 1.4) + 0.02));
          else p = new THREE.Vector3(L * 0.15 * f - L * 0.35 * f * f, -L * 0.75 * f, side * L * 0.35 * f);
          pts.push(O.clone().add(p));
        }
        const r0 = b.long ? 0.0055 : 0.0032;
        geos.push(U.tube(pts, (s) => r0 * (1 - s * 0.82), 6));
      }
    });
    if (sh.fangs) {
      for (const side of [1, -1]) {
        const c = new THREE.ConeGeometry(0.0018, 0.008, 6);
        c.rotateZ(Math.PI);
        c.translate(CX - 0.012, -0.004, side * 0.006);
        geos.push(c);
      }
    }
    if (!geos.length) return null;
    return U.mergeGeometries(geos.map((g) => { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); return g; }));
  }

  // ---------- textury ----------
  const TW = 1024, TH = 512;
  function yOf(hf, side) {
    const v = Math.acos(U.clamp(hf, -1, 1)) / (Math.PI * 2);
    return side > 0 ? TH * (1 - v) : TH * v;
  }
  function paintBody(sp, P) {
    const L = sp.look, sh = sp.shape;
    const { c, g } = U.canvas(TW, TH);
    const { c: bc, g: bg } = U.canvas(TW, TH);
    const img = g.createImageData(TW, TH);
    const d = img.data;
    const back = L.back, side = L.side, belly = L.belly;
    const gill = sh.gill;
    for (let py = 0; py < TH; py++) {
      const v = 1 - (py + 0.5) / TH;
      const hf = Math.cos(v * Math.PI * 2);
      for (let px = 0; px < TW; px++) {
        const t = (px + 0.5) / TW;
        let col;
        if (hf > 0) col = U.mix3(side, back, Math.pow(U.smoothstep(-0.08, 0.92, hf), 0.85));
        else col = U.mix3(side, belly, U.smoothstep(0.02, 0.72, -hf));
        // hlava: tmavší temeno, lesklé skřele
        if (t < gill) {
          const k = 1 - U.smoothstep(gill - 0.05, gill, t);
          col = col.map((x) => x * (1 - 0.08 * k * Math.max(0, hf)));
        }
        // ocasní násadec lehce tmavší
        col = col.map((x) => x * (1 - 0.1 * U.smoothstep(0.75, 1, t) * Math.max(0, hf)));
        const pat = L.pattern;
        const ps = L.patternStrength === undefined ? 1 : L.patternStrength;
        if (pat === 'bars' || pat === 'zander') {
          const nb = pat === 'bars' ? 7 : 9;
          const t0 = pat === 'bars' ? 0.27 : 0.26, step = pat === 'bars' ? 0.095 : 0.075;
          for (let k = 0; k < nb; k++) {
            const bt = t0 + k * step - 0.025 * hf;
            const w = (pat === 'bars' ? 0.024 : 0.02) * (1 + 0.4 * hf);
            const dd = Math.abs(t - bt);
            if (dd < w * 1.6) {
              const f = (1 - U.smoothstep(w * 0.5, w * 1.6, dd)) * U.smoothstep(pat === 'bars' ? -0.55 : -0.2, 0.25, hf);
              const s = pat === 'bars' ? 0.62 : 0.38;
              col = U.mix3(col, [0.05, 0.08, 0.04], f * s * ps);
            }
          }
        }
        if (pat === 'mottle') {
          const n = U.fbm2(t * 18, hf * 4.2, 4);
          const n2 = U.fbm2(t * 40 + 7, hf * 9, 2);
          if (n > 0.06) col = col.map((x) => x * (1 - ps * (0.5 - 0.2 * n2)));
          else if (n < -0.18) col = U.mix3(col, [0.42, 0.42, 0.3], 0.45 * ps * U.smoothstep(-0.18, -0.4, n));
        }
        if (pat === 'koi') {
          // bílý podklad, oranžovočervené a černé skvrny jako u koi
          const n = U.fbm2(t * 6 + 3, hf * 2.4 + 1, 4) + 0.25 * Math.max(0, hf);
          const n2 = U.fbm2(t * 11 + 9, hf * 4 + 5, 3);
          if (n > 0.04) col = U.mix3(col, [0.96, 0.3, 0.06], U.smoothstep(0.04, 0.09, n));
          if (n2 > 0.3 && hf > -0.3) col = U.mix3(col, [0.06, 0.05, 0.05], U.smoothstep(0.3, 0.36, n2) * 0.9);
        }
        const vn = U.fbm2(t * 34, hf * 10, 3);
        const k = 0.93 + vn * 0.14;
        const i = (py * TW + px) * 4;
        d[i] = U.clamp(col[0] * k, 0, 1) * 255; d[i + 1] = U.clamp(col[1] * k, 0, 1) * 255; d[i + 2] = U.clamp(col[2] * k, 0, 1) * 255; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    bg.fillStyle = 'rgb(128,128,128)'; bg.fillRect(0, 0, TW, TH);

    const R = U.mulberry32(sp.id.length * 977 + 13);
    // skvrny
    if (L.pattern === 'pike') {
      for (let k = 0; k < 170; k++) {
        const t = 0.24 + R() * 0.74, hf = -0.4 + R() * 1.15;
        for (const sdn of [1, -1]) {
          g.fillStyle = `rgba(${200 + R() * 30},${205 + R() * 20},${120 + R() * 40},${(0.55 + R() * 0.3) * (L.patternStrength === undefined ? 1 : Math.max(0.3, L.patternStrength))})`;
          g.beginPath(); g.ellipse(t * TW, yOf(hf, sdn), 5 + R() * 9, 2.5 + R() * 3, (R() - 0.5) * 0.4, 0, Math.PI * 2); g.fill();
        }
      }
    }
    if (L.pattern === 'zander') {
      for (let k = 0; k < 40; k++) {
        const t = 0.3 + R() * 0.65, hf = 0.1 + R() * 0.8;
        for (const sdn of [1, -1]) { g.fillStyle = 'rgba(30,35,30,0.35)'; g.beginPath(); g.arc(t * TW, yOf(hf, sdn), 2 + R() * 3, 0, 7); g.fill(); }
      }
    }
    if (L.tailSpot) {
      for (const sdn of [1, -1]) {
        const grd = g.createRadialGradient(0.95 * TW, yOf(0.05, sdn), 0, 0.95 * TW, yOf(0.05, sdn), 18);
        grd.addColorStop(0, 'rgba(25,20,10,0.55)'); grd.addColorStop(1, 'rgba(25,20,10,0)');
        g.fillStyle = grd; g.beginPath(); g.arc(0.95 * TW, yOf(0.05, sdn), 18, 0, 7); g.fill();
      }
    }

    // šupiny
    const circ = (() => {
      const t = 0.4, a = (P.T(t) + P.B(t)) / 2, b = P.Wd(t);
      return Math.PI * (1.5 * (a + b) - Math.sqrt(a * b));
    })();
    const sc = L.scales;
    if (sc && sc !== 'none') {
      const rows = L.scaleRows || 40;
      const cw = (TW * (1 - gill)) / rows;
      const ch = cw * (TH / circ) / TW * 1.0;
      const Rr = Math.max(cw, ch) * (sc === 'mirror' ? 1.0 : 0.74);
      const contrast = sc === 'tiny' ? 0.35 : sc === 'small' ? 0.7 : 1;
      g.globalCompositeOperation = 'soft-light';
      const drawScale = (x, y, r, gc, bump) => {
        const grd = gc.createRadialGradient(x - r * 0.45, y, r * 0.1, x - r * 0.2, y, r);
        if (bump) {
          grd.addColorStop(0, 'rgb(105,105,105)'); grd.addColorStop(0.78, 'rgb(175,175,175)'); grd.addColorStop(0.92, 'rgb(150,150,150)'); grd.addColorStop(1, 'rgb(60,60,60)');
        } else {
          const lo = Math.round(128 - 40 * contrast), hi = Math.round(128 + 55 * contrast), ed = Math.round(128 - 75 * contrast);
          grd.addColorStop(0, `rgb(${lo},${lo},${lo})`); grd.addColorStop(0.8, `rgb(${hi},${hi},${hi})`); grd.addColorStop(0.93, `rgb(${hi - 10},${hi - 10},${hi - 10})`); grd.addColorStop(1, `rgb(${ed},${ed},${ed})`);
        }
        gc.fillStyle = grd;
        gc.beginPath(); gc.arc(x, y, r, 0, Math.PI * 2); gc.fill();
      };
      const list = [];
      if (sc === 'mirror') {
        const rowsHf = [[0.9, 1.3], [0.05, 1.5], [-0.55, 0.9]];
        rowsHf.forEach(([hf, sz], ri) => {
          for (let t = gill + 0.03; t < 0.98; t += (Rr * 2.1 * sz) / TW * (0.8 + R() * 0.4)) {
            if (ri === 2 && R() < 0.6) continue;
            const hh = hf + (R() - 0.5) * 0.15;
            list.push({ x: t * TW, hf: hh, r: Rr * sz * (0.7 + R() * 0.6) });
          }
        });
      } else {
        const nCol = Math.ceil((TH / 2) / ch) + 1;
        for (let i = rows + 1; i >= 0; i--) {
          const x = gill * TW + i * cw;
          for (let j = 0; j <= nCol; j++) {
            const yA = TH - (j + (i % 2 ? 0.5 : 0)) * ch; // od hřbetu dolů (strana A)
            if (yA < TH / 2 - ch) continue;
            const v = 1 - yA / TH;
            list.push({ x, hf: Math.cos(v * Math.PI * 2), r: Rr });
          }
        }
      }
      list.sort((a, b) => b.x - a.x);
      for (const s of list) {
        for (const sdn of [1, -1]) {
          const y = yOf(s.hf, sdn);
          drawScale(s.x, y, s.r, g, false);
          bg.globalCompositeOperation = 'source-over';
          if (sc !== 'tiny') drawScale(s.x, y, s.r, bg, true);
        }
      }
      g.globalCompositeOperation = 'source-over';
      if (sc === 'net') {
        g.globalCompositeOperation = 'multiply';
        g.strokeStyle = 'rgba(70,70,55,0.55)'; g.lineWidth = 2;
        for (const s of list) for (const sdn of [1, -1]) { g.beginPath(); g.arc(s.x, yOf(s.hf, sdn), s.r * 0.97, -1.2, 1.2); g.stroke(); }
        g.globalCompositeOperation = 'source-over';
      }
      if (sc === 'mirror') {
        g.globalCompositeOperation = 'overlay';
        for (const s of list) for (const sdn of [1, -1]) {
          g.fillStyle = 'rgba(255,230,160,0.25)';
          g.beginPath(); g.arc(s.x, yOf(s.hf, sdn), s.r * 0.9, 0, 7); g.fill();
        }
        g.globalCompositeOperation = 'source-over';
      }
    }
    if (sc === 'none' || sc === 'tiny') {
      // jemná kůže
      bg.globalAlpha = 0.25;
      for (let k = 0; k < 4000; k++) { bg.fillStyle = R() < 0.5 ? '#9a9a9a' : '#6a6a6a'; bg.fillRect(R() * TW, R() * TH, 2, 2); }
      bg.globalAlpha = 1;
    }

    // postranní čára
    const llHf = (t) => 0.12 - 0.22 * Math.sin(Math.PI * U.clamp((t - gill) / (1 - gill), 0, 1)) * (sp.id === 'stika' || sp.id === 'uhor' || sp.id === 'sumec' ? 0.2 : 1);
    for (const sdn of [1, -1]) {
      for (let t = gill + 0.01; t < 0.99; t += 0.0065) {
        const x = t * TW, y = yOf(llHf(t), sdn);
        g.fillStyle = 'rgba(20,20,15,0.35)'; g.fillRect(x - 1.5, y - 1.2, 3, 2.4);
        g.fillStyle = 'rgba(255,255,240,0.25)'; g.fillRect(x - 1, y + 1.2, 2, 1);
        bg.fillStyle = '#404040'; bg.fillRect(x - 1, y - 1, 2, 2);
      }
    }
    // skřele a ústa
    for (const sdn of [1, -1]) {
      const drawArc = (gc, tLine, bulge, col, w, hfMax) => {
        gc.strokeStyle = col; gc.lineWidth = w;
        gc.beginPath();
        for (let k = 0; k <= 30; k++) {
          const hf = hfMax - (k / 30) * (hfMax + 0.85);
          const x = (tLine + bulge * (1 - hf * hf)) * TW;
          const y = yOf(hf, sdn);
          k ? gc.lineTo(x, y) : gc.moveTo(x, y);
        }
        gc.stroke();
      };
      drawArc(g, gill, 0.012, 'rgba(15,12,8,0.55)', 3, 0.8);
      drawArc(g, gill - 0.004, 0.012, 'rgba(255,250,230,0.28)', 3, 0.8);
      drawArc(g, gill - 0.045, 0.012, 'rgba(20,15,10,0.22)', 2, 0.55);
      drawArc(bg, gill, 0.012, '#202020', 5, 0.8);
      drawArc(bg, gill - 0.045, 0.012, '#606060', 3, 0.55);
      // ústa
      const mLen = sh.mouthLen || (sh.wideMouth ? 0.06 : 0.04);
      const mhf = -(sh.mouthY || 0) * 0.5 - 0.05;
      g.strokeStyle = 'rgba(25,10,10,0.75)'; g.lineWidth = sh.wideMouth ? 4 : 3;
      g.beginPath(); g.moveTo(0, yOf(mhf, sdn)); g.lineTo(mLen * TW, yOf(mhf - 0.08, sdn)); g.stroke();
      g.strokeStyle = 'rgba(210,150,130,0.35)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, yOf(mhf + 0.07, sdn)); g.lineTo(mLen * TW * 0.9, yOf(mhf - 0.02, sdn)); g.stroke();
      bg.strokeStyle = '#101010'; bg.lineWidth = 4;
      bg.beginPath(); bg.moveTo(0, yOf(mhf, sdn)); bg.lineTo(mLen * TW, yOf(mhf - 0.08, sdn)); bg.stroke();
      // nosní otvory
      g.fillStyle = 'rgba(10,10,10,0.6)';
      g.beginPath(); g.arc((sh.eye.t * 0.55) * TW, yOf(Math.min(0.9, sh.eye.y + 0.25), sdn), 2.2, 0, 7); g.fill();
    }
    const map = U.tex(c, { repeat: false });
    map.wrapS = THREE.ClampToEdgeWrapping; map.wrapT = THREE.RepeatWrapping;
    const bump = U.tex(bc, { srgb: false, repeat: false });
    return { map, bump };
  }

  function paintFins(sp) {
    const L = sp.look, sh = sp.shape;
    const S = 256;
    const { c, g } = U.canvas(S * 8, S);
    const img = g.createImageData(S * 8, S);
    const d = img.data;
    const keys = ['dorsal', 'dorsal2', 'caudal', 'anal', 'pect', 'pelvic'];
    keys.forEach((key, slot) => {
      const col = L.fins[key] || L.fins.dorsal;
      const colLow = key === 'caudal' && L.fins.caudalLow ? L.fins.caudalLow : col;
      const spiny = key === 'dorsal' ? !!sh.dorsal[0].spiny : false;
      const spot = key === 'dorsal' && sh.dorsal[0].spot;
      const rays = key === 'caudal' ? 19 : key === 'pect' || key === 'pelvic' ? 11 : key === 'dorsal' ? (spiny ? 13 : 15) : 12;
      const spotted = L.pattern === 'pike' || L.pattern === 'zander';
      for (let y = 0; y < S; y++) {
        const v = 1 - (y + 0.5) / S; // 0 základna, 1 okraj
        for (let x = 0; x < S; x++) {
          const u = (x + 0.5) / S;
          let base = key === 'caudal' ? U.mix3(col, colLow, U.smoothstep(0.45, 0.8, u)) : col;
          const f = (u * rays) % 1;
          const rayD = Math.abs(f - 0.5);
          const ray = 1 - U.smoothstep(0.04, 0.13, rayD);
          // článkování paprsků
          const seg = (Math.floor(v * 14 + (Math.floor(u * rays) % 2) * 0.5) % 2) ? 1 : 0.85;
          let c3 = base.map((q) => q * (1 + 0.35 * v) * (1 - ray * 0.35 * seg));
          let a = 0.94 - 0.42 * v + ray * 0.3;
          if (spiny) {
            const notch = 0.7 + 0.28 * (1 - rayD * 2);
            if (v > notch && ray < 0.5) a *= 1 - U.smoothstep(notch, notch + 0.06, v);
          }
          // roztřepený okraj
          const edge = 0.93 + U.noise2(u * 30 + slot * 10, 3) * 0.04;
          a *= 1 - U.smoothstep(edge, edge + 0.04, v);
          if (spot && u > 0.68 && v > 0.25 && v < 0.85) {
            const k = U.smoothstep(0.68, 0.8, u) * (1 - U.smoothstep(0.75, 0.85, v));
            c3 = U.mix3(c3, [0.03, 0.03, 0.05], k * 0.9);
          }
          if (spotted && (key === 'dorsal' || key === 'dorsal2' || key === 'caudal' || key === 'anal')) {
            const sx = (u * rays * 0.5) % 1, sy = (v * 6 + (Math.floor(u * rays * 0.5) % 2) * 0.5) % 1;
            if ((sx - 0.5) ** 2 + (sy - 0.5) ** 2 < 0.06) c3 = c3.map((q) => q * 0.35);
          }
          const i = (y * S * 8 + slot * S + x) * 4;
          d[i] = U.clamp(c3[0], 0, 1) * 255; d[i + 1] = U.clamp(c3[1], 0, 1) * 255; d[i + 2] = U.clamp(c3[2], 0, 1) * 255;
          d[i + 3] = U.clamp(a, 0, 1) * 255;
        }
      }
    });
    g.putImageData(img, 0, 0);
    const t = U.tex(c, { repeat: false });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  }

  function paintEye(sp) {
    const L = sp.look;
    const W = 256, H = 128;
    const { c, g } = U.canvas(W, H);
    g.fillStyle = '#151210'; g.fillRect(0, 0, W, H);
    const cx = W * 0.25, cy = H * 0.5;
    const ir = (58 / 180) * H, pr = (L.glassyEye ? 30 : 26) / 180 * H;
    const iris = L.iris;
    const grd = g.createRadialGradient(cx, cy, pr * 0.8, cx, cy, ir);
    grd.addColorStop(0, U.rgbStr(iris.map((v) => Math.min(1, v * 1.15))));
    grd.addColorStop(0.55, U.rgbStr(iris));
    grd.addColorStop(0.92, U.rgbStr(iris.map((v) => v * 0.45)));
    grd.addColorStop(1, '#151210');
    g.fillStyle = grd; g.beginPath(); g.arc(cx, cy, ir, 0, Math.PI * 2); g.fill();
    // vlákna duhovky
    const r = U.mulberry32(5);
    for (let k = 0; k < 90; k++) {
      const a = r() * Math.PI * 2;
      g.strokeStyle = `rgba(${r() < 0.5 ? '255,240,200' : '40,25,10'},${0.1 + r() * 0.15})`;
      g.lineWidth = 1;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * pr * 1.05, cy + Math.sin(a) * pr * 1.05); g.lineTo(cx + Math.cos(a) * ir * 0.9, cy + Math.sin(a) * ir * 0.9); g.stroke();
    }
    // zornice
    const pg = g.createRadialGradient(cx - pr * 0.2, cy - pr * 0.2, 0, cx, cy, pr);
    if (L.glassyEye) { pg.addColorStop(0, '#5a6260'); pg.addColorStop(1, '#202624'); }
    else { pg.addColorStop(0, '#16202a'); pg.addColorStop(1, '#020203'); }
    g.fillStyle = pg; g.beginPath(); g.arc(cx, cy, pr, 0, Math.PI * 2); g.fill();
    return U.tex(c, { repeat: false });
  }

  FM.prepare = function (sp) {
    // geometrie podle druhu, textury podle vzhledu (varianty mají vlastní)
    const key = sp.lookKey || sp.id;
    if (cache[key]) return cache[key];
    const base = cache[sp.id] && !sp.lookKey ? null : (sp.lookKey ? FM.prepare(FS.SpeciesById[sp.id]) : null);
    const P = base ? base.P : profiles(sp.shape);
    const body = base ? base.body : buildBody(sp, P);
    const fins = base ? base.fins : buildFins(sp, P);
    const barbels = base ? base.barbels : buildBarbels(sp, P);
    const tex = paintBody(sp, P);
    const finTex = paintFins(sp);
    const eyeTex = paintEye(sp);
    const sh = sp.shape;
    const er = sh.eye.r;
    const eyeGeo = new THREE.SphereGeometry(er, 22, 16);
    const et = sh.eye.t;
    const ey = sh.eye.y >= 0 ? sh.eye.y * P.T(et) : sh.eye.y * P.B(et);
    const zs = P.Wd(et) * Math.pow(Math.sqrt(Math.max(0, 1 - sh.eye.y * sh.eye.y)), sh.ex);
    const eyePos = new THREE.Vector3(-et * sh.bl + CX, ey + (sh.mouthY || 0) * 0.02 * (1 - U.smoothstep(0, 0.14, et)), zs - er * 0.5);
    const dark = U.col(...sp.look.fins.dorsal.map((v) => v * 0.8));
    cache[key] = { P, body, fins, barbels, tex, finTex, eyeTex, eyeGeo, eyePos, dark };
    return cache[key];
  };

  // shader vlnění
  // Vlnění těla: postupná vlna od hlavy k ocasu s rostoucí amplitudou (karangiformní plavání),
  // ohyb celého těla do oblouku při zatáčení (uCurve) a odpovídající natočení normál.
  function bendPatch(u) {
    const cx = CX.toFixed(3);
    const LAT = `
        float bx_ = clamp(${cx} - P_.x, 0.0, 1.2);
        float env_ = uEel > 0.5 ? (0.35 + 0.65 * bx_) : (0.12 + 0.88 * bx_ * bx_);
        float denv_ = uEel > 0.5 ? 0.65 : 1.76 * bx_;
        float ph_ = bx_ * uK - uPhase;
        float lat_ = uAmp * env_ * sin(ph_) + uCurve * bx_ * bx_ - uAmp * 0.18 * sin(-uPhase) * (1.0 - bx_);
        float dlat_ = uAmp * (denv_ * sin(ph_) + env_ * cos(ph_) * uK) + uCurve * 2.0 * bx_ + uAmp * 0.18 * sin(-uPhase);`;
    return (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = 'uniform float uAmp, uPhase, uK, uEel, uCurve;\n' + sh.vertexShader
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        { vec3 P_ = position; ${LAT}
          objectNormal = normalize(vec3(objectNormal.x + dlat_ * objectNormal.z, objectNormal.y, objectNormal.z)); }`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        { vec3 P_ = transformed; ${LAT}
          transformed.z += lat_;
          transformed.x -= 0.5 * lat_ * dlat_ * 0.2; }`);
    };
  }

  FM.create = function (spId, lengthM, lookSp) {
    const sp = lookSp || FS.SpeciesById[spId];
    const C = FM.prepare(sp);
    const L = sp.look;
    const u = {
      uAmp: { value: 0.03 }, uPhase: { value: Math.random() * 10 }, uK: { value: sp.swim === 'eel' ? 13 : 6.2 }, uEel: { value: sp.swim === 'eel' ? 1 : 0 },
      uCurve: { value: 0 },
    };
    const patch = bendPatch(u);
    const bodyMat = new THREE.MeshPhysicalMaterial({
      map: C.tex.map, bumpMap: C.tex.bump, bumpScale: 0.0035 * lengthM,
      roughness: L.rough, metalness: L.metal, clearcoat: L.clear * 0.6, clearcoatRoughness: 0.2, envMapIntensity: 0.85,
    });
    FS.applyMurk(bodyMat, patch, 'fish-body');
    const finMat = new THREE.MeshStandardMaterial({ map: C.finTex, transparent: true, alphaTest: 0.06, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.0, depthWrite: true });
    FS.applyMurk(finMat, patch, 'fish-fin');
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: C.eyeTex, roughness: 0.25, metalness: 0.0, clearcoat: 0.7, clearcoatRoughness: 0.05, envMapIntensity: 0.45 });
    FS.applyMurk(eyeMat, patch, 'fish-eye');
    const group = new THREE.Group();
    const inner = new THREE.Group();
    inner.scale.setScalar(lengthM);
    group.add(inner);
    const body = new THREE.Mesh(C.body, bodyMat);
    const fins = new THREE.Mesh(C.fins, finMat);
    fins.renderOrder = 2;
    inner.add(body, fins);
    for (const side of [1, -1]) {
      const e = new THREE.Mesh(C.eyeGeo, eyeMat);
      e.position.copy(C.eyePos); e.position.z *= side;
      e.rotation.y = side > 0 ? 0.28 : Math.PI - 0.28;
      inner.add(e);
    }
    if (C.barbels) {
      const bm = new THREE.MeshStandardMaterial({ color: C.dark, roughness: 0.4 });
      FS.applyMurk(bm, patch, 'fish-barbel');
      inner.add(new THREE.Mesh(C.barbels, bm));
    }
    group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.layers.set(2); } });
    return { group, inner, u, sp, length: lengthM, mats: [bodyMat, finMat, eyeMat] };
  };

  FM.setLayer = function (fish, layer) {
    fish.group.traverse((o) => { if (o.isMesh) o.layers.set(layer); });
  };
})(window.FS);
