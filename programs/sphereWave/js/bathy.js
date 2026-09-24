// Real-world relief (ETOPO1 sampled at 0.25 deg, see data/etopo.js):
// decoding, bilinear lookup, per-cell averaging and the land/ocean mask.
(function () {
  "use strict";
  const SW = (window.SW = window.SW || {});

  let grid = null;
  function etopo() {
    if (grid) return grid;
    const src = window.ETOPO;
    const bin = atob(src.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    grid = { nx: src.nx, ny: src.ny, lat0: src.lat0, lon0: src.lon0, step: src.step, z: new Int16Array(bytes.buffer) };
    return grid;
  }

  // elevation [m] at latitude/longitude in degrees (bilinear)
  function elevationAt(latDeg, lonDeg) {
    const g = etopo();
    let fx = (lonDeg - g.lon0) / g.step;
    fx = ((fx % g.nx) + g.nx) % g.nx;
    const fy = Math.max(0, Math.min(g.ny - 1.000001, (latDeg - g.lat0) / g.step));
    const ix = Math.floor(fx), iy = Math.floor(fy);
    const tx = fx - ix, ty = fy - iy;
    const ix1 = (ix + 1) % g.nx;
    const z = g.z, r0 = iy * g.nx, r1 = (iy + 1) * g.nx;
    return (1 - ty) * ((1 - tx) * z[r0 + ix] + tx * z[r0 + ix1]) + ty * ((1 - tx) * z[r1 + ix] + tx * z[r1 + ix1]);
  }

  // Cell-averaged elevation: every grid sample is binned into its nearest
  // cell (area weighted); cells that catch no sample use the centre value.
  // Cells finer than ~1.5 data spacings just interpolate at their centre.
  function cellElevation(mesh) {
    const g = etopo();
    const N = mesh.N;
    const D2R = Math.PI / 180;
    if (mesh.stats.meanSpacing < 1.5 * g.step * D2R * SW.R_EARTH) {
      const elev = new Float64Array(N);
      for (let a = 0; a < N; a++) elev[a] = elevationAt(mesh.lat[a] / D2R, mesh.lon[a] / D2R);
      return elev;
    }
    const sum = new Float64Array(N), wsum = new Float64Array(N);
    let cur = 0, rowStart = 0;
    for (let iy = 0; iy < g.ny; iy++) {
      const la = (g.lat0 + iy * g.step) * D2R;
      const cl = Math.cos(la), sl = Math.sin(la);
      const w = Math.max(cl, 1e-4);
      cur = rowStart;
      for (let ix = 0; ix < g.nx; ix++) {
        const lo = (g.lon0 + ix * g.step) * D2R;
        cur = SW.findCell(mesh, cl * Math.cos(lo), cl * Math.sin(lo), sl, cur);
        if (ix === 0) rowStart = cur;
        sum[cur] += w * g.z[iy * g.nx + ix];
        wsum[cur] += w;
      }
    }
    const elev = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      elev[a] = wsum[a] > 0 ? sum[a] / wsum[a] : elevationAt(mesh.lat[a] / D2R, mesh.lon[a] / D2R);
    }
    return elev;
  }

  // Ocean mask: cells deeper than minDepth, restricted to connected water
  // bodies of at least minArea (removes inland depressions such as Qattara,
  // keeps e.g. the Black and Caspian seas).
  function oceanMask(mesh, elev, minDepth, minArea) {
    const N = mesh.N;
    const wet = new Uint8Array(N);
    for (let a = 0; a < N; a++) wet[a] = elev[a] < -minDepth ? 1 : 0;
    const comp = new Int32Array(N).fill(-1);
    const stack = new Int32Array(N);
    const ocean = new Uint8Array(N);
    let nc = 0;
    for (let s = 0; s < N; s++) {
      if (!wet[s] || comp[s] >= 0) continue;
      let sp = 0, area = 0;
      const members = [];
      stack[sp++] = s; comp[s] = nc;
      while (sp) {
        const a = stack[--sp];
        members.push(a);
        area += mesh.area[a];
        for (let k = mesh.cellStart[a]; k < mesh.cellStart[a + 1]; k++) {
          const c = mesh.cellNbr[k];
          if (wet[c] && comp[c] < 0) { comp[c] = nc; stack[sp++] = c; }
        }
      }
      if (area >= minArea) for (const a of members) ocean[a] = 1;
      nc++;
    }
    return ocean;
  }

  SW.Bathy = { etopo, elevationAt, cellElevation, oceanMask };
})();
