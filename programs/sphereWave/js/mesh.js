// Icosahedral hexagonal (Voronoi) mesh on the sphere.
// Subdividing each of the 20 icosahedron faces into n x n triangles gives a
// triangulation with 10n^2+2 vertices; its dual consists of hexagons plus the
// 12 unavoidable pentagons at the original icosahedron vertices. Grid points
// come from great-circle subdivision of the faces (quasi-uniform cell areas),
// optional Lloyd iterations move them toward a centroidal Voronoi tessellation.
(function () {
  "use strict";
  const SW = (window.SW = window.SW || {});
  const R_EARTH = 6371000;
  SW.R_EARTH = R_EARTH;

  function icosahedron() {
    const t = (1 + Math.sqrt(5)) / 2;
    const v = [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
    ].map((p) => {
      const l = Math.hypot(p[0], p[1], p[2]);
      return [p[0] / l, p[1] / l, p[2] / l];
    });
    const f = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    // make every face counter-clockwise seen from outside
    for (const fc of f) {
      const [a, b, c] = fc.map((i) => v[i]);
      const cr = cross3(sub3(b, a), sub3(c, a));
      if (cr[0] * (a[0] + b[0] + c[0]) + cr[1] * (a[1] + b[1] + c[1]) + cr[2] * (a[2] + b[2] + c[2]) < 0) {
        const tmp = fc[1]; fc[1] = fc[2]; fc[2] = tmp;
      }
    }
    return { v, f };
  }

  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; }
  function slerp(a, b, t) {
    const om = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])));
    if (om < 1e-12) return a.slice();
    const sa = Math.sin((1 - t) * om) / Math.sin(om), sb = Math.sin(t * om) / Math.sin(om);
    return [sa * a[0] + sb * b[0], sa * a[1] + sb * b[1], sa * a[2] + sb * b[2]];
  }

  // Point (i,j) of the n-frequency subdivision of spherical face (a,b,c)
  // ("class I, method 2" geodesic): the three families of grid lines are
  // great circles through equally spaced points on the face edges; the point
  // is the mean of the three pairwise intersections. Edge points reduce to
  // exact slerps, so neighbouring faces agree. Much more uniform than the
  // gnomonic projection of a flat grid.
  function facePoint(a, b, c, i, j, n) {
    const k = n - i - j;
    if (i === 0 && j === 0) return a.slice();
    if (i === n) return b.slice();
    if (j === n) return c.slice();
    if (j === 0) return slerp(a, b, i / n);
    if (i === 0) return slerp(a, c, j / n);
    if (k === 0) return slerp(b, c, j / n);
    const gJ = cross3(slerp(a, c, j / n), slerp(b, c, j / n)); // weight on c = j/n
    const gI = cross3(slerp(a, b, i / n), slerp(c, b, i / n)); // weight on b = i/n
    const gK = cross3(slerp(b, a, k / n), slerp(c, a, k / n)); // weight on a = k/n
    const ctr = [a[0] + b[0] + c[0], a[1] + b[1] + c[1], a[2] + b[2] + c[2]];
    let sx = 0, sy = 0, sz = 0;
    for (const [g1, g2] of [[gJ, gI], [gI, gK], [gK, gJ]]) {
      let q = norm3(cross3(g1, g2));
      if (q[0] * ctr[0] + q[1] * ctr[1] + q[2] * ctr[2] < 0) q = [-q[0], -q[1], -q[2]];
      sx += q[0]; sy += q[1]; sz += q[2];
    }
    return norm3([sx, sy, sz]);
  }

  // angle between unit vectors stored in flat arrays
  function angleBetween(A, i, B, j) {
    const ax = A[3 * i], ay = A[3 * i + 1], az = A[3 * i + 2];
    const bx = B[3 * j], by = B[3 * j + 1], bz = B[3 * j + 2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    return Math.atan2(Math.hypot(cx, cy, cz), ax * bx + ay * by + az * bz);
  }

  // spherical excess of triangle (a,b,c) of unit vectors
  function sphTriArea(ax, ay, az, bx, by, bz, cx, cy, cz) {
    const det = ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
    const den = 1 + ax * bx + ay * by + az * bz + bx * cx + by * cy + bz * cz + cx * ax + cy * ay + cz * az;
    return 2 * Math.atan2(Math.abs(det), den);
  }

  function buildMesh(n, lloydIters) {
    const ico = icosahedron();
    const V = 10 * n * n + 2;
    const T = 20 * n * n;
    const pos = new Float64Array(3 * V);

    // ---- vertex numbering -------------------------------------------------
    const edgeKey = new Map();
    let ne = 0;
    for (const [a, b, c] of ico.f) {
      for (const [u, w] of [[a, b], [b, c], [c, a]]) {
        const k = Math.min(u, w) * 12 + Math.max(u, w);
        if (!edgeKey.has(k)) edgeKey.set(k, ne++);
      }
    }
    const edgeBase = 12;
    const faceBase = 12 + 30 * (n - 1);
    const perFace = ((n - 1) * (n - 2)) / 2;
    const rowOff = new Int32Array(n + 1);
    for (let i = 2; i <= n; i++) rowOff[i] = rowOff[i - 1] + (n - 1 - (i - 1));

    function edgePt(u, w, t) {
      const k = edgeKey.get(Math.min(u, w) * 12 + Math.max(u, w));
      return edgeBase + k * (n - 1) + (u < w ? t : n - t) - 1;
    }
    function vid(fi, i, j) {
      const [a, b, c] = ico.f[fi];
      if (i === 0 && j === 0) return a;
      if (i === n) return b;
      if (j === n) return c;
      if (j === 0) return edgePt(a, b, i);
      if (i === 0) return edgePt(a, c, j);
      if (i + j === n) return edgePt(b, c, j);
      return faceBase + fi * perFace + rowOff[i] + (j - 1);
    }

    const tri = new Uint32Array(3 * T);
    let tc = 0;
    for (let fi = 0; fi < 20; fi++) {
      const [a, b, c] = ico.f[fi].map((k) => ico.v[k]);
      const ids = [];
      for (let i = 0; i <= n; i++) {
        ids.push(new Int32Array(n + 1 - i));
        for (let j = 0; j <= n - i; j++) {
          const id = vid(fi, i, j);
          ids[i][j] = id;
          const p = facePoint(a, b, c, i, j, n);
          pos[3 * id] = p[0]; pos[3 * id + 1] = p[1]; pos[3 * id + 2] = p[2];
        }
      }
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n - i; j++) {
          tri[tc++] = ids[i][j]; tri[tc++] = ids[i + 1][j]; tri[tc++] = ids[i][j + 1];
          if (i + j < n - 1) {
            tri[tc++] = ids[i + 1][j]; tri[tc++] = ids[i + 1][j + 1]; tri[tc++] = ids[i][j + 1];
          }
        }
      }
    }

    // ---- vertex -> triangles, ordered counter-clockwise --------------------
    const cellStart = new Int32Array(V + 1);
    for (let k = 0; k < 3 * T; k++) cellStart[tri[k] + 1]++;
    for (let i = 0; i < V; i++) cellStart[i + 1] += cellStart[i];
    const fill = cellStart.slice(0, V);
    const vt = new Int32Array(3 * T);
    for (let t = 0; t < T; t++) for (let k = 0; k < 3; k++) vt[fill[tri[3 * t + k]]++] = t;

    const cellTri = new Int32Array(3 * T);
    const cellNbr = new Int32Array(3 * T);
    function thirdAfter(t, a) { // vertex c of triangle t written as (a,b,c)
      const t0 = tri[3 * t], t1 = tri[3 * t + 1];
      return a === t0 ? tri[3 * t + 2] : a === t1 ? t0 : t1;
    }
    function secondAfter(t, a) { // vertex b of triangle t written as (a,b,c)
      const t0 = tri[3 * t], t1 = tri[3 * t + 1], t2 = tri[3 * t + 2];
      return a === t0 ? t1 : a === t1 ? t2 : t0;
    }
    for (let a = 0; a < V; a++) {
      const s = cellStart[a], d = cellStart[a + 1] - s;
      let t = vt[s];
      for (let k = 0; k < d; k++) {
        cellTri[s + k] = t;
        const c = thirdAfter(t, a);
        cellNbr[s + k] = c;
        // next triangle around a contains half-edge a->c
        for (let m = 0; m < d; m++) {
          const tt = vt[s + m];
          if (secondAfter(tt, a) === c) { t = tt; break; }
        }
      }
    }

    // ---- triangle circumcenters (Voronoi corners) -------------------------
    const cc = new Float64Array(3 * T);
    function computeCorners() {
      for (let t = 0; t < T; t++) {
        const a = 3 * tri[3 * t], b = 3 * tri[3 * t + 1], c = 3 * tri[3 * t + 2];
        const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
        const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
        let x = uy * vz - uz * vy, y = uz * vx - ux * vz, z = ux * vy - uy * vx;
        const l = Math.hypot(x, y, z);
        cc[3 * t] = x / l; cc[3 * t + 1] = y / l; cc[3 * t + 2] = z / l;
      }
    }

    // ---- Lloyd relaxation toward a centroidal Voronoi tessellation --------
    const np = new Float64Array(3 * V);
    for (let it = 0; it < lloydIters; it++) {
      computeCorners();
      for (let a = 0; a < V; a++) {
        const s = cellStart[a], d = cellStart[a + 1] - s;
        const px = pos[3 * a], py = pos[3 * a + 1], pz = pos[3 * a + 2];
        let sx = 0, sy = 0, sz = 0;
        for (let k = 0; k < d; k++) {
          const t1 = 3 * cellTri[s + k], t2 = 3 * cellTri[s + ((k + 1) % d)];
          const ax = cc[t1] - px, ay = cc[t1 + 1] - py, az = cc[t1 + 2] - pz;
          const bx = cc[t2] - px, by = cc[t2 + 1] - py, bz = cc[t2 + 2] - pz;
          const w = Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
          sx += w * (px + cc[t1] + cc[t2]);
          sy += w * (py + cc[t1 + 1] + cc[t2 + 1]);
          sz += w * (pz + cc[t1 + 2] + cc[t2 + 2]);
        }
        const l = Math.hypot(sx, sy, sz);
        np[3 * a] = sx / l; np[3 * a + 1] = sy / l; np[3 * a + 2] = sz / l;
      }
      pos.set(np);
    }
    computeCorners();

    // ---- edges ------------------------------------------------------------
    const E = 30 * n * n;
    const eC1 = new Int32Array(E), eC2 = new Int32Array(E);
    const eT1 = new Int32Array(E), eT2 = new Int32Array(E);
    const cellEdge = new Int32Array(3 * T);
    const cellSign = new Int8Array(3 * T);
    let ec = 0;
    for (let a = 0; a < V; a++) {
      const s = cellStart[a], d = cellStart[a + 1] - s;
      for (let k = 0; k < d; k++) {
        const c = cellNbr[s + k];
        if (a < c) {
          eC1[ec] = a; eC2[ec] = c;
          eT1[ec] = cellTri[s + k]; eT2[ec] = cellTri[s + ((k + 1) % d)];
          cellEdge[s + k] = ec; cellSign[s + k] = 1;
          ec++;
        }
      }
    }
    for (let a = 0; a < V; a++) {
      const s = cellStart[a], d = cellStart[a + 1] - s;
      for (let k = 0; k < d; k++) {
        const c = cellNbr[s + k];
        if (a > c) {
          const sc = cellStart[c], dc = cellStart[c + 1] - sc;
          for (let m = 0; m < dc; m++) {
            if (cellNbr[sc + m] === a) { cellEdge[s + k] = cellEdge[sc + m]; break; }
          }
          cellSign[s + k] = -1;
        }
      }
    }

    const eLen = new Float64Array(E), eDist = new Float64Array(E);
    // Float32 is plenty for directions and keeps large meshes in memory
    const eMid = new Float32Array(3 * E), eNrm = new Float32Array(3 * E);
    for (let e = 0; e < E; e++) {
      const t1 = eT1[e], t2 = eT2[e], a = eC1[e], c = eC2[e];
      eLen[e] = angleBetween(cc, t1, cc, t2) * R_EARTH;
      eDist[e] = angleBetween(pos, a, pos, c) * R_EARTH;
      let mx = cc[3 * t1] + cc[3 * t2], my = cc[3 * t1 + 1] + cc[3 * t2 + 1], mz = cc[3 * t1 + 2] + cc[3 * t2 + 2];
      let l = Math.hypot(mx, my, mz);
      mx /= l; my /= l; mz /= l;
      eMid[3 * e] = mx; eMid[3 * e + 1] = my; eMid[3 * e + 2] = mz;
      let tx = pos[3 * c] - pos[3 * a], ty = pos[3 * c + 1] - pos[3 * a + 1], tz = pos[3 * c + 2] - pos[3 * a + 2];
      const dp = tx * mx + ty * my + tz * mz;
      tx -= dp * mx; ty -= dp * my; tz -= dp * mz;
      l = Math.hypot(tx, ty, tz);
      eNrm[3 * e] = tx / l; eNrm[3 * e + 1] = ty / l; eNrm[3 * e + 2] = tz / l;
    }

    // ---- cell areas and statistics ----------------------------------------
    const area = new Float64Array(V);
    const lat = new Float64Array(V), lon = new Float64Array(V);
    let aMin = Infinity, aMax = 0, aSum = 0;
    for (let a = 0; a < V; a++) {
      const s = cellStart[a], d = cellStart[a + 1] - s;
      const px = pos[3 * a], py = pos[3 * a + 1], pz = pos[3 * a + 2];
      let ar = 0;
      for (let k = 0; k < d; k++) {
        const t1 = 3 * cellTri[s + k], t2 = 3 * cellTri[s + ((k + 1) % d)];
        ar += sphTriArea(px, py, pz, cc[t1], cc[t1 + 1], cc[t1 + 2], cc[t2], cc[t2 + 1], cc[t2 + 2]);
      }
      area[a] = ar * R_EARTH * R_EARTH;
      aSum += area[a];
      if (d === 6) { aMin = Math.min(aMin, area[a]); aMax = Math.max(aMax, area[a]); }
      lat[a] = Math.asin(Math.max(-1, Math.min(1, pz)));
      lon[a] = Math.atan2(py, px);
    }
    let lMin = Infinity, lMax = 0, dSum = 0;
    for (let e = 0; e < E; e++) {
      lMin = Math.min(lMin, eLen[e]); lMax = Math.max(lMax, eLen[e]); dSum += eDist[e];
    }

    return {
      n, N: V, T, E,
      pos, lat, lon, area,
      tri, corners: Float32Array.from(cc),
      cellStart, cellTri, cellNbr, cellEdge, cellSign,
      eC1, eC2, eT1, eT2, eLen, eDist, eMid, eNrm,
      stats: {
        hexAreaRatio: aMax / aMin,
        edgeLenRatio: lMax / lMin,
        meanSpacing: dSum / E,
        totalAreaErr: aSum / (4 * Math.PI * R_EARTH * R_EARTH) - 1,
      },
    };
  }

  // Greedy walk to the cell whose centre is nearest to unit vector (x,y,z).
  function findCell(mesh, x, y, z, start) {
    const { pos, cellStart, cellNbr } = mesh;
    let c = start >= 0 && start < mesh.N ? start : 0;
    for (;;) {
      let best = c, bd = pos[3 * c] * x + pos[3 * c + 1] * y + pos[3 * c + 2] * z;
      for (let k = cellStart[c]; k < cellStart[c + 1]; k++) {
        const m = cellNbr[k];
        const d = pos[3 * m] * x + pos[3 * m + 1] * y + pos[3 * m + 2] * z;
        if (d > bd) { bd = d; best = m; }
      }
      if (best === c) return c;
      c = best;
    }
  }

  SW.buildMesh = buildMesh;
  SW.findCell = findCell;
})();
