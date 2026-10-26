'use strict';
// Procedurální textury kreslené do plátna.
(function (FS) {
  const U = FS.U;
  const Tex = {};
  FS.Tex = Tex;

  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  // Tráva / zem – světlá detailní textura, barvu dodávají vrcholy terénu.
  Tex.groundDetail = function () {
    const S = 512;
    const { c, g } = U.canvas(S, S);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = U.pfbm2(x / S * 8, y / S * 8, 8, 4);
      const v = 0.86 + n * 0.25 + (hash(x, y) - 0.5) * 0.12;
      const i = (y * S + x) * 4;
      img.data[i] = v * 238; img.data[i + 1] = v * 240; img.data[i + 2] = v * 226; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const r = U.mulberry32(5);
    for (let k = 0; k < 9000; k++) {
      const x = r() * S, y = r() * S, len = 3 + r() * 11, a = r() * Math.PI * 2;
      const t = r();
      g.strokeStyle = t < 0.45 ? `rgba(40,70,20,${0.18 + r() * 0.2})` : t < 0.8 ? `rgba(255,255,225,${0.12 + r() * 0.16})` : `rgba(150,120,60,${0.15 + r() * 0.15})`;
      g.lineWidth = 0.8 + r() * 1.3;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (x + ox < -20 || x + ox > S + 20 || y + oy < -20 || y + oy > S + 20) continue;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      }
    }
    return U.tex(c);
  };

  // Dlažba z kamenných kostek (barva + normálová mapa)
  Tex.cobble = function () {
    const S = 1024, G = 15, cell = S / G;
    const pts = [];
    const r = U.mulberry32(99);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const tone = r();
      let base;
      if (tone < 0.3) base = [0.52, 0.5, 0.48];
      else if (tone < 0.55) base = [0.58, 0.52, 0.48];
      else if (tone < 0.75) base = [0.42, 0.41, 0.4];
      else base = [0.6, 0.57, 0.5];
      const br = 0.85 + r() * 0.3;
      pts.push({ x: (i + 0.2 + r() * 0.6) * cell, y: (j + 0.2 + r() * 0.6) * cell, col: base.map((v) => v * br), tx: r() - 0.5, ty: r() - 0.5, h: 0.75 + r() * 0.25 });
    }
    const hf = new Float32Array(S * S);
    const img = new ImageData(S, S);
    const d = img.data;
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
        let f1 = 1e9, f2 = 1e9, best = null, bx = 0, by = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          let ii = ci + di, jj = cj + dj, ox = 0, oy = 0;
          if (ii < 0) { ii += G; ox = -S; } else if (ii >= G) { ii -= G; ox = S; }
          if (jj < 0) { jj += G; oy = -S; } else if (jj >= G) { jj -= G; oy = S; }
          const p = pts[jj * G + ii];
          const dx = p.x + ox - x, dy = p.y + oy - y;
          const dd = Math.sqrt(dx * dx + dy * dy);
          if (dd < f1) { f2 = f1; f1 = dd; best = p; bx = dx; by = dy; } else if (dd < f2) f2 = dd;
        }
        const edge = (f2 - f1) * 0.5;
        const grain = hash(x, y);
        const n = U.pfbm2(x / S * 16, y / S * 16, 16, 3);
        const stone = U.smoothstep(2.5, 8, edge);
        const dome = 1 - Math.min(1, (f1 / (cell * 0.75)) ** 2) * 0.35;
        const tilt = (bx * best.tx + by * best.ty) / cell * 0.25;
        const h = stone * (best.h * dome + tilt + n * 0.08 + grain * 0.03);
        hf[y * S + x] = h;
        let col;
        if (stone > 0.02) {
          const sp = grain < 0.06 ? 0.55 : grain > 0.96 ? 1.3 : 1;
          col = best.col.map((v) => v * sp * (0.9 + n * 0.3));
          // tmavší okraje kamenů
          const e = U.smoothstep(2.5, 14, edge);
          col = col.map((v) => v * (0.72 + 0.28 * e));
          col = U.mix3([0.2, 0.18, 0.13], col, stone);
        } else {
          const gr = U.pfbm2(x / S * 40, y / S * 40, 40, 2);
          col = gr > 0.05 ? [0.22, 0.3, 0.1] : [0.2, 0.17, 0.12];
          col = col.map((v) => v * (0.8 + grain * 0.4));
        }
        const i = (y * S + x) * 4;
        d[i] = col[0] * 255; d[i + 1] = col[1] * 255; d[i + 2] = col[2] * 255; d[i + 3] = 255;
      }
    }
    const { c, g } = U.canvas(S, S);
    g.putImageData(img, 0, 0);
    const map = U.tex(c);
    const nmap = U.tex(U.heightToNormal(hf, S, S, 6), { srgb: false });
    return { map, normalMap: nmap };
  };

  Tex.asphalt = function () {
    const S = 512;
    const { c, g } = U.canvas(S, S);
    const img = g.createImageData(S, S);
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = U.pfbm2(x / S * 6, y / S * 6, 6, 4);
      const h = hash(x, y);
      let v = 0.36 + n * 0.08;
      if (h > 0.93) v += 0.14; else if (h < 0.08) v -= 0.08;
      const i = (y * S + x) * 4;
      img.data[i] = v * 255; img.data[i + 1] = v * 252; img.data[i + 2] = v * 246; img.data[i + 3] = 255;
      hf[y * S + x] = h > 0.9 ? 1 : 0.4 + n * 0.3;
    }
    g.putImageData(img, 0, 0);
    return { map: U.tex(c), normalMap: U.tex(U.heightToNormal(hf, S, S, 1.2), { srgb: false }) };
  };

  Tex.granite = function () {
    const S = 512;
    const { c, g } = U.canvas(S, S);
    const img = g.createImageData(S, S);
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const n = U.pfbm2(x / S * 5, y / S * 5, 5, 5);
      const n2 = U.pfbm2(x / S * 3 + 7, y / S * 3, 3, 3);
      const h = hash(x, y);
      let col = [0.58 + n * 0.12, 0.56 + n * 0.11, 0.52 + n * 0.1];
      if (n2 > 0.18) col = U.mix3(col, [0.64, 0.55, 0.5], 0.5);
      if (h < 0.07) col = col.map((v) => v * 0.45);
      else if (h > 0.95) col = col.map((v) => Math.min(1, v * 1.35));
      const lich = U.pfbm2(x / S * 9 + 3, y / S * 9 + 1, 9, 3);
      if (lich > 0.25) col = U.mix3(col, [0.78, 0.8, 0.7], U.smoothstep(0.25, 0.35, lich) * 0.7);
      if (lich < -0.32) col = U.mix3(col, [0.38, 0.4, 0.3], 0.5);
      const i = (y * S + x) * 4;
      img.data[i] = col[0] * 255; img.data[i + 1] = col[1] * 255; img.data[i + 2] = col[2] * 255; img.data[i + 3] = 255;
      hf[y * S + x] = n * 0.8 + h * 0.15;
    }
    g.putImageData(img, 0, 0);
    return { map: U.tex(c), normalMap: U.tex(U.heightToNormal(hf, S, S, 3), { srgb: false }) };
  };

  Tex.waterNormal = function () {
    const S = 256;
    const hf = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      hf[y * S + x] = U.pfbm2(x / S * 6, y / S * 6, 6, 5) + 0.5 * U.pfbm2(x / S * 14 + 3, y / S * 5, 14, 2);
    }
    const t = U.tex(U.heightToNormal(hf, S, S, 9), { srgb: false });
    return t;
  };

  Tex.birchBark = function () {
    const W = 256, H = 1024;
    const { c, g } = U.canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = U.pfbm2(x / W * 4, y / H * 16, 4, 4);
      let v = 0.88 + n * 0.12;
      const i = (y * W + x) * 4;
      img.data[i] = v * 240; img.data[i + 1] = v * 236; img.data[i + 2] = v * 224; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const r = U.mulberry32(11);
    // lenticely
    for (let k = 0; k < 520; k++) {
      const x = r() * W, y = r() * H, w = 6 + r() * 34, h = 1 + r() * 3.2;
      g.fillStyle = `rgba(${30 + r() * 30},${28 + r() * 20},${25},${0.55 + r() * 0.4})`;
      g.beginPath(); g.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill();
      if (x + w > W) { g.beginPath(); g.ellipse(x - W, y, w / 2, h / 2, 0, 0, Math.PI * 2); g.fill(); }
    }
    // tmavé skvrny (rozvětvení)
    for (let k = 0; k < 26; k++) {
      const x = r() * W, y = r() * H * 0.85, s = 8 + r() * 22;
      g.fillStyle = `rgba(20,18,16,${0.7 + r() * 0.3})`;
      g.beginPath();
      g.moveTo(x - s, y); g.quadraticCurveTo(x, y - s * 0.5, x + s, y); g.quadraticCurveTo(x, y + s * 0.9, x - s, y);
      g.fill();
    }
    // tmavá rozpraskaná báze (spodní část plátna = pata kmene)
    for (let y = H * 0.84; y < H; y += 2) {
      const t = (y - H * 0.84) / (H * 0.16);
      for (let k = 0; k < 6; k++) {
        if (r() < t * 0.9) {
          const x = r() * W;
          g.fillStyle = `rgba(${35 + r() * 25},${32 + r() * 20},28,${0.4 + t * 0.6})`;
          g.fillRect(x, y, 4 + r() * 18, 3 + r() * 6);
        }
      }
    }
    return U.tex(c);
  };

  Tex.bark = function (base = [0.32, 0.26, 0.2]) {
    const W = 256, H = 512;
    const { c, g } = U.canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const n = U.pfbm2(x / W * 6, y / H * 3, 6, 4);
      const crack = Math.abs(U.pnoise2(x / W * 14, y / H * 2.5, 14, 3));
      let v = 0.85 + n * 0.35;
      if (crack < 0.07) v *= 0.5;
      const i = (y * W + x) * 4;
      img.data[i] = base[0] * v * 255; img.data[i + 1] = base[1] * v * 255; img.data[i + 2] = base[2] * v * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return U.tex(c);
  };

  // Listové karty (průhledné pozadí)
  Tex.leaves = function (kind) {
    const S = 512;
    const { c, g } = U.canvas(S, S);
    const r = U.mulberry32(kind.length * 131 + 7);
    g.clearRect(0, 0, S, S);
    const palettes = {
      birch: [[0.42, 0.58, 0.18], [0.55, 0.66, 0.24], [0.66, 0.7, 0.3], [0.7, 0.66, 0.25]],
      poplar: [[0.3, 0.46, 0.16], [0.4, 0.55, 0.2], [0.5, 0.6, 0.25]],
      deciduous: [[0.22, 0.35, 0.12], [0.3, 0.44, 0.15], [0.36, 0.5, 0.18]],
      shrub: [[0.36, 0.52, 0.18], [0.46, 0.6, 0.22], [0.55, 0.66, 0.28]],
    };
    const pal = palettes[kind];
    const leafCol = (b) => {
      const p = pal[Math.floor(r() * pal.length)];
      return p.map((v) => v * b);
    };
    // větvičky
    g.strokeStyle = 'rgba(85,65,45,1)';
    for (let t = 0; t < 7; t++) {
      g.lineWidth = 2 + r() * 2;
      g.beginPath();
      const x0 = S * 0.5 + (r() - 0.5) * 60, y0 = S;
      g.moveTo(x0, y0);
      g.quadraticCurveTo(S * r(), S * 0.5 * r() + S * 0.3, S * (0.1 + r() * 0.8), S * (0.05 + r() * 0.4));
      g.stroke();
    }
    const count = kind === 'deciduous' ? 330 : kind === 'birch' ? 420 : 340;
    const size = kind === 'birch' ? 20 : kind === 'poplar' ? 26 : kind === 'deciduous' ? 24 : 22;
    for (let k = 0; k < count; k++) {
      const x = S * (0.06 + r() * 0.88), y = S * (0.04 + r() * 0.9);
      const dx = x - S * 0.5, dy = y - S * 0.5;
      if (dx * dx + dy * dy > (S * 0.47) ** 2) continue;
      const s = size * (0.7 + r() * 0.6);
      const a = r() * Math.PI * 2;
      const b = 0.7 + r() * 0.55;
      const col = leafCol(b);
      g.save(); g.translate(x, y); g.rotate(a);
      const grd = g.createLinearGradient(-s * 0.5, 0, s * 0.5, 0);
      grd.addColorStop(0, U.rgbStr(col.map((v) => v * 0.75)));
      grd.addColorStop(1, U.rgbStr(col.map((v) => v * 1.15)));
      g.fillStyle = grd;
      g.beginPath();
      if (kind === 'birch' || kind === 'poplar') {
        g.moveTo(-s * 0.5, 0); g.quadraticCurveTo(-s * 0.1, -s * 0.42, s * 0.5, 0); g.quadraticCurveTo(-s * 0.1, s * 0.42, -s * 0.5, 0);
      } else {
        g.ellipse(0, 0, s * 0.5, s * 0.24, 0, 0, Math.PI * 2);
      }
      g.fill();
      g.strokeStyle = U.rgbStr(col.map((v) => v * 1.3), 0.6); g.lineWidth = 1;
      g.beginPath(); g.moveTo(-s * 0.45, 0); g.lineTo(s * 0.4, 0); g.stroke();
      g.restore();
    }
    const t = U.tex(c, { repeat: false });
    return t;
  };

  Tex.planks = function (tint = [0.55, 0.4, 0.26]) {
    const W = 512, H = 512;
    const { c, g } = U.canvas(W, H);
    const img = g.createImageData(W, H);
    const pw = W / 6;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = Math.floor(x / pw);
      const lx = x - p * pw;
      const grain = Math.sin((lx + U.pnoise2(x / W * 4, y / H * 30, 4, 30) * 25) * 0.35 + p * 3) * 0.5 + 0.5;
      const n = U.pfbm2(x / W * 6, y / H * 2, 6, 3);
      let v = 0.78 + grain * 0.12 + n * 0.2 + ((p * 37) % 7) * 0.025;
      if (lx < 2.5 || lx > pw - 2.5) v *= 0.45;
      const i = (y * W + x) * 4;
      img.data[i] = tint[0] * v * 255; img.data[i + 1] = tint[1] * v * 255; img.data[i + 2] = tint[2] * v * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    // suky
    const r = U.mulberry32(3);
    for (let k = 0; k < 10; k++) {
      const x = r() * W, y = r() * H;
      g.fillStyle = 'rgba(60,35,20,0.6)';
      g.beginPath(); g.ellipse(x, y, 4 + r() * 4, 7 + r() * 6, 0, 0, Math.PI * 2); g.fill();
    }
    return U.tex(c);
  };

  Tex.awning = function () {
    const W = 512, H = 256;
    const { c, g } = U.canvas(W, H);
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#f3efe2' : '#2f7a3c';
      g.fillRect(i * W / stripes, 0, W / stripes + 1, H);
    }
    // jemná textura plátna
    const img = g.getImageData(0, 0, W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const v = 0.9 + hash(x, y) * 0.1 + ((x + y) % 4 === 0 ? -0.04 : 0);
      img.data[i] *= v; img.data[i + 1] *= v; img.data[i + 2] *= v;
    }
    g.putImageData(img, 0, 0);
    return U.tex(c);
  };
  Tex.valance = function () {
    const W = 512, H = 64;
    const { c, g } = U.canvas(W, H);
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle = i % 2 ? '#f3efe2' : '#2f7a3c';
      g.fillRect(i * W / stripes, 0, W / stripes + 1, H);
    }
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < stripes; i++) {
      g.beginPath();
      g.ellipse((i + 0.5) * W / stripes, H + 6, W / stripes * 0.5, 26, 0, Math.PI, 0);
      g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    const t = U.tex(c);
    return t;
  };

  Tex.sign = function (title, sub) {
    const W = 1024, H = 256;
    const { c, g } = U.canvas(W, H);
    g.fillStyle = '#3d2a1a'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = `rgba(${90 + i * 5},${60 + i * 3},35,0.35)`;
      g.fillRect(0, i * 32, W, 30);
    }
    g.strokeStyle = '#e8d8a8'; g.lineWidth = 8; g.strokeRect(14, 14, W - 28, H - 28);
    g.fillStyle = '#f6e7b8';
    g.font = 'bold 96px Georgia, serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(title, W / 2, H * 0.42);
    g.font = 'italic 44px Georgia, serif';
    g.fillStyle = '#d9c48a';
    g.fillText(sub, W / 2, H * 0.78);
    // rybky
    const fish = (x, y, s, flip) => {
      g.save(); g.translate(x, y); g.scale(flip ? -s : s, s);
      g.fillStyle = '#d9c48a';
      g.beginPath(); g.ellipse(0, 0, 40, 16, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-34, 0); g.lineTo(-62, -18); g.lineTo(-62, 18); g.closePath(); g.fill();
      g.fillStyle = '#3d2a1a'; g.beginPath(); g.arc(24, -4, 4, 0, Math.PI * 2); g.fill();
      g.restore();
    };
    fish(110, H * 0.78, 1, false); fish(W - 110, H * 0.78, 1, true);
    return U.tex(c, { repeat: false });
  };

  Tex.label = function (lines, bg, fg, w = 256, h = 160) {
    const { c, g } = U.canvas(w, h);
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 0, w, h * 0.12);
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((ln, i) => {
      const size = i === 0 ? Math.round(h * 0.26) : Math.round(h * 0.15);
      g.font = `bold ${size}px Arial, sans-serif`;
      g.fillText(ln, w / 2, h * (n === 1 ? 0.5 : 0.32 + i * 0.3), w * 0.92);
    });
    return U.tex(c, { repeat: false });
  };

  Tex.cork = function () {
    const W = 128, H = 512;
    const { c, g } = U.canvas(W, H);
    const img = g.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const h = hash(x, y), n = U.pfbm2(x / W * 4, y / H * 16, 4, 3);
      let v = 0.8 + n * 0.3;
      if (h < 0.1) v *= 0.6;
      // spáry mezi korkovými kroužky
      if (y % 40 < 1.5) v *= 0.75;
      const i = (y * W + x) * 4;
      img.data[i] = 196 * v; img.data[i + 1] = 150 * v; img.data[i + 2] = 102 * v; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return U.tex(c);
  };

  Tex.plaid = function (a = '#8a2a22', b = '#2a3a5a') {
    const S = 128;
    const { c, g } = U.canvas(S, S);
    g.fillStyle = a; g.fillRect(0, 0, S, S);
    g.fillStyle = b;
    g.globalAlpha = 0.55; g.fillRect(0, S * 0.25, S, S * 0.25); g.fillRect(S * 0.25, 0, S * 0.25, S);
    g.globalAlpha = 0.35; g.fillStyle = '#f0e0c0';
    g.fillRect(0, S * 0.75, S, 3); g.fillRect(S * 0.75, 0, 3, S);
    g.globalAlpha = 1;
    return U.tex(c);
  };

  Tex.fabric = function (col) {
    const S = 128;
    const { c, g } = U.canvas(S, S);
    g.fillStyle = col; g.fillRect(0, 0, S, S);
    const img = g.getImageData(0, 0, S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4;
      const v = 0.88 + hash(x, y) * 0.12 + (((x + y) & 3) === 0 ? -0.05 : 0);
      img.data[i] *= v; img.data[i + 1] *= v; img.data[i + 2] *= v;
    }
    g.putImageData(img, 0, 0);
    return U.tex(c);
  };

  Tex.dot = function () {
    const { c, g } = U.canvas(64, 64);
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return U.tex(c, { repeat: false });
  };
})(window.FS);
