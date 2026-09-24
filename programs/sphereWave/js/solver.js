// Finite volume solvers on the hexagonal (Voronoi) sphere mesh.
//
//  linear    - linearised shallow water equations (= wave equation written as
//              a first-order system):  d(eta)/dt + div(H u) = 0,
//              du/dt + g grad(eta) = 0.  Staggered C-grid: eta is the cell
//              average, u the normal velocity on each cell face. Mass is a
//              pure face-flux balance; forward-backward time stepping is
//              non-dissipative and conserves volume to round-off.
//
//  nonlinear - full shallow water equations for h and the 3D Cartesian
//              momentum h*v (kept tangent to the sphere), collocated
//              Godunov-type scheme: Rusanov flux, MUSCL reconstruction of the
//              free surface and velocity with Venkatakrishnan limiter,
//              hydrostatic reconstruction (well balanced over the real
//              bathymetry), SSP-RK2, Coriolis force and Manning friction.
//
// Land cells are impermeable walls in both models.
(function () {
  "use strict";
  const SW = (window.SW = window.SW || {});
  const G = 9.81;
  const OMEGA = 7.2921e-5;

  function openEdges(mesh, ocean) {
    const inner = [], wall = [], wallCell = [], wallSign = [];
    for (let e = 0; e < mesh.E; e++) {
      const o1 = ocean[mesh.eC1[e]], o2 = ocean[mesh.eC2[e]];
      if (o1 && o2) inner.push(e);
      else if (o1) { wall.push(e); wallCell.push(mesh.eC1[e]); wallSign.push(1); }
      else if (o2) { wall.push(e); wallCell.push(mesh.eC2[e]); wallSign.push(-1); }
    }
    return {
      inner: Int32Array.from(inner),
      wall: Int32Array.from(wall), wallCell: Int32Array.from(wallCell), wallSign: Int8Array.from(wallSign),
    };
  }

  // ------------------------------------------------------------------------
  function LinearSolver(mesh, H, ocean) {
    const N = mesh.N;
    const { inner } = openEdges(mesh, ocean);
    const M = inner.length;
    const e1 = new Int32Array(M), e2 = new Int32Array(M);
    const cDiv = new Float64Array(M), cGrad = new Float64Array(M);
    const invA = new Float64Array(N);
    for (let a = 0; a < N; a++) invA[a] = ocean[a] ? 1 / mesh.area[a] : 0;
    const lam = new Float64Array(N);
    for (let k = 0; k < M; k++) {
      const e = inner[k], a = mesh.eC1[e], c = mesh.eC2[e];
      const He = 0.5 * (H[a] + H[c]);
      e1[k] = a; e2[k] = c;
      cDiv[k] = He * mesh.eLen[e];
      cGrad[k] = G / mesh.eDist[e];
      const w = (He * mesh.eLen[e]) / mesh.eDist[e];
      lam[a] += 2 * w * invA[a];
      lam[c] += 2 * w * invA[c];
    }
    // Gershgorin bound of the discrete operator div(H grad) -> exact
    // stability limit of the forward-backward scheme: dt^2 g lambda <= 4
    let lamMax = 0;
    for (let a = 0; a < N; a++) lamMax = Math.max(lamMax, lam[a]);
    const dtMax = (0.95 * 2) / Math.sqrt(G * lamMax);

    const eta = new Float64Array(N);
    const u = new Float64Array(M);

    return {
      kind: "linear",
      eta,
      dtMax,
      setInitial(eta0) { eta.set(eta0); u.fill(0); },
      step(dt) {
        for (let k = 0; k < M; k++) {
          const a = e1[k], c = e2[k];
          const q = dt * cDiv[k] * u[k];
          eta[a] -= q * invA[a];
          eta[c] += q * invA[c];
        }
        for (let k = 0; k < M; k++) u[k] -= dt * cGrad[k] * (eta[e2[k]] - eta[e1[k]]);
        return dt;
      },
      proposeDt() { return dtMax; },
    };
  }

  // ------------------------------------------------------------------------
  function NonlinearSolver(mesh, H, ocean, opts) {
    const R = SW.R_EARTH;
    const N = mesh.N;
    const { pos, eC1, eC2, eLen, eNrm, eMid, cellStart, cellNbr, cellEdge, cellSign } = mesh;
    const { inner, wall, wallCell, wallSign } = openEdges(mesh, ocean);
    const coriolis = !!opts.coriolis;
    const manning = opts.manning || 0;
    const CFL = 0.6;
    const HDRY = 1e-3;

    const b = new Float64Array(N);
    const invA = new Float64Array(N), perimA = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      b[a] = ocean[a] ? -H[a] : 1e4;
      if (!ocean[a]) continue;
      invA[a] = 1 / mesh.area[a];
      let p = 0;
      for (let k = cellStart[a]; k < cellStart[a + 1]; k++) p += eLen[cellEdge[k]];
      perimA[a] = p * invA[a];
    }
    // lever arms from cell centre / to face midpoint [m]
    const E = mesh.E;
    const r1 = new Float64Array(3 * E), r2 = new Float64Array(3 * E);
    for (let e = 0; e < E; e++) {
      const a = eC1[e], c = eC2[e];
      for (let d = 0; d < 3; d++) {
        r1[3 * e + d] = R * (eMid[3 * e + d] - pos[3 * a + d]);
        r2[3 * e + d] = R * (eMid[3 * e + d] - pos[3 * c + d]);
      }
    }

    const h = new Float64Array(N), mx = new Float64Array(N), my = new Float64Array(N), mz = new Float64Array(N);
    const h0 = new Float64Array(N), mx0 = new Float64Array(N), my0 = new Float64Array(N), mz0 = new Float64Array(N);
    const eta = new Float64Array(N);
    const vx = new Float64Array(N), vy = new Float64Array(N), vz = new Float64Array(N);
    const gE = new Float64Array(3 * N), gX = new Float64Array(3 * N), gY = new Float64Array(3 * N), gZ = new Float64Array(3 * N);
    const lE = new Float64Array(N), lX = new Float64Array(N), lY = new Float64Array(N), lZ = new Float64Array(N);
    const rh = new Float64Array(N), rx = new Float64Array(N), ry = new Float64Array(N), rz = new Float64Array(N);
    const mnE = new Float64Array(N), mxE = new Float64Array(N);
    const mnX = new Float64Array(N), mxX = new Float64Array(N);
    const mnY = new Float64Array(N), mxY = new Float64Array(N);
    const mnZ = new Float64Array(N), mxZ = new Float64Array(N);

    function primitives() {
      let emin = Infinity, emax = -Infinity, vmax = 0;
      for (let a = 0; a < N; a++) {
        if (!ocean[a]) continue;
        const hh = h[a];
        eta[a] = hh + b[a];
        if (hh > HDRY) { vx[a] = mx[a] / hh; vy[a] = my[a] / hh; vz[a] = mz[a] / hh; }
        else { vx[a] = vy[a] = vz[a] = 0; }
        if (eta[a] < emin) emin = eta[a];
        if (eta[a] > emax) emax = eta[a];
        const v = Math.abs(vx[a]) + Math.abs(vy[a]) + Math.abs(vz[a]);
        if (v > vmax) vmax = v;
      }
      return { epsE: 0.05 * (emax - emin) + 1e-9, epsV: 0.05 * vmax + 1e-9 };
    }

    // Per-slot (cell, face) geometry: outward normal, face length, lever
    // arm to the face midpoint and neighbour (-1 = land wall).
    const S = cellStart[N];
    const sN = new Float64Array(3 * S), sR = new Float64Array(3 * S), sL = new Float64Array(S);
    const sC = new Int32Array(S);
    for (let a = 0; a < N; a++) {
      for (let k = cellStart[a]; k < cellStart[a + 1]; k++) {
        const e = cellEdge[k], sg = cellSign[k], r = sg > 0 ? r1 : r2;
        for (let d = 0; d < 3; d++) { sN[3 * k + d] = sg * eNrm[3 * e + d]; sR[3 * k + d] = r[3 * e + d]; }
        sL[k] = eLen[e];
        sC[k] = ocean[cellNbr[k]] ? cellNbr[k] : -1;
      }
    }

    // Green-Gauss gradients (tangent to the sphere) and neighbour bounds
    function gradients() {
      for (let a = 0; a < N; a++) {
        if (!ocean[a]) continue;
        const ea = eta[a], ua = vx[a], va = vy[a], wa = vz[a];
        let gex = 0, gey = 0, gez = 0, gxx = 0, gxy = 0, gxz = 0, gyx = 0, gyy = 0, gyz = 0, gzx = 0, gzy = 0, gzz = 0;
        let e0 = ea, e1 = ea, x0 = ua, x1 = ua, y0 = va, y1 = va, z0 = wa, z1 = wa;
        const k1 = cellStart[a + 1];
        for (let k = cellStart[a]; k < k1; k++) {
          const c = sC[k];
          const nx = sN[3 * k], ny = sN[3 * k + 1], nz = sN[3 * k + 2], hl = 0.5 * sL[k];
          let ec, uc, vc, wc;
          if (c >= 0) { ec = eta[c]; uc = vx[c]; vc = vy[c]; wc = vz[c]; }
          else {
            const un = 2 * (ua * nx + va * ny + wa * nz);
            ec = ea; uc = ua - un * nx; vc = va - un * ny; wc = wa - un * nz;
          }
          const de = hl * (ec - ea), du = hl * (uc - ua), dv = hl * (vc - va), dw = hl * (wc - wa);
          gex += de * nx; gey += de * ny; gez += de * nz;
          gxx += du * nx; gxy += du * ny; gxz += du * nz;
          gyx += dv * nx; gyy += dv * ny; gyz += dv * nz;
          gzx += dw * nx; gzy += dw * ny; gzz += dw * nz;
          if (ec < e0) e0 = ec; else if (ec > e1) e1 = ec;
          if (uc < x0) x0 = uc; else if (uc > x1) x1 = uc;
          if (vc < y0) y0 = vc; else if (vc > y1) y1 = vc;
          if (wc < z0) z0 = wc; else if (wc > z1) z1 = wc;
        }
        const ia = invA[a], a3 = 3 * a;
        const px = pos[a3], py = pos[a3 + 1], pz = pos[a3 + 2];
        let d;
        d = gex * px + gey * py + gez * pz; gE[a3] = ia * (gex - d * px); gE[a3 + 1] = ia * (gey - d * py); gE[a3 + 2] = ia * (gez - d * pz);
        d = gxx * px + gxy * py + gxz * pz; gX[a3] = ia * (gxx - d * px); gX[a3 + 1] = ia * (gxy - d * py); gX[a3 + 2] = ia * (gxz - d * pz);
        d = gyx * px + gyy * py + gyz * pz; gY[a3] = ia * (gyx - d * px); gY[a3 + 1] = ia * (gyy - d * py); gY[a3 + 2] = ia * (gyz - d * pz);
        d = gzx * px + gzy * py + gzz * pz; gZ[a3] = ia * (gzx - d * px); gZ[a3 + 1] = ia * (gzy - d * py); gZ[a3 + 2] = ia * (gzz - d * pz);
        mnE[a] = e0; mxE[a] = e1; mnX[a] = x0; mxX[a] = x1; mnY[a] = y0; mxY[a] = y1; mnZ[a] = z0; mxZ[a] = z1;
      }
    }

    // Venkatakrishnan limiter: dm = unlimited increment to the face,
    // dp = admissible increment (to the neighbour max/min)
    function venkat(dm, dp, eps2) {
      const dm2 = dm * dm, dp2 = dp * dp;
      return (dp2 + eps2 + 2 * dm * dp) / (dp2 + 2 * dm2 + dm * dp + eps2);
    }
    function limiters(eps) {
      const e2 = eps.epsE * eps.epsE, v2 = eps.epsV * eps.epsV;
      for (let a = 0; a < N; a++) {
        if (!ocean[a]) continue;
        const a3 = 3 * a;
        const gex = gE[a3], gey = gE[a3 + 1], gez = gE[a3 + 2];
        const gxx = gX[a3], gxy = gX[a3 + 1], gxz = gX[a3 + 2];
        const gyx = gY[a3], gyy = gY[a3 + 1], gyz = gY[a3 + 2];
        const gzx = gZ[a3], gzy = gZ[a3 + 1], gzz = gZ[a3 + 2];
        const dEp = mxE[a] - eta[a], dEm = mnE[a] - eta[a];
        const dXp = mxX[a] - vx[a], dXm = mnX[a] - vx[a];
        const dYp = mxY[a] - vy[a], dYm = mnY[a] - vy[a];
        const dZp = mxZ[a] - vz[a], dZm = mnZ[a] - vz[a];
        let fE = 1, fX = 1, fY = 1, fZ = 1, f;
        const k1 = cellStart[a + 1];
        for (let k = cellStart[a]; k < k1; k++) {
          const qx = sR[3 * k], qy = sR[3 * k + 1], qz = sR[3 * k + 2];
          let dm = gex * qx + gey * qy + gez * qz;
          if (dm !== 0) { f = venkat(dm, dm > 0 ? dEp : dEm, e2); if (f < fE) fE = f; }
          dm = gxx * qx + gxy * qy + gxz * qz;
          if (dm !== 0) { f = venkat(dm, dm > 0 ? dXp : dXm, v2); if (f < fX) fX = f; }
          dm = gyx * qx + gyy * qy + gyz * qz;
          if (dm !== 0) { f = venkat(dm, dm > 0 ? dYp : dYm, v2); if (f < fY) fY = f; }
          dm = gzx * qx + gzy * qy + gzz * qz;
          if (dm !== 0) { f = venkat(dm, dm > 0 ? dZp : dZm, v2); if (f < fZ) fZ = f; }
        }
        lE[a] = fE; lX[a] = fX; lY[a] = fY; lZ[a] = fZ;
      }
    }

    function residual() {
      const eps = primitives();
      gradients();
      limiters(eps);
      rh.fill(0); rx.fill(0); ry.fill(0); rz.fill(0);

      for (let k = 0; k < inner.length; k++) {
        const e = inner[k], a = eC1[e], c = eC2[e];
        const nx = eNrm[3 * e], ny = eNrm[3 * e + 1], nz = eNrm[3 * e + 2], l = eLen[e];
        const ax = r1[3 * e], ay = r1[3 * e + 1], az = r1[3 * e + 2];
        const cx = r2[3 * e], cy = r2[3 * e + 1], cz = r2[3 * e + 2];
        const a3 = 3 * a, c3 = 3 * c;
        const etaL = eta[a] + lE[a] * (gE[a3] * ax + gE[a3 + 1] * ay + gE[a3 + 2] * az);
        const uL = vx[a] + lX[a] * (gX[a3] * ax + gX[a3 + 1] * ay + gX[a3 + 2] * az);
        const vL = vy[a] + lY[a] * (gY[a3] * ax + gY[a3 + 1] * ay + gY[a3 + 2] * az);
        const wL = vz[a] + lZ[a] * (gZ[a3] * ax + gZ[a3 + 1] * ay + gZ[a3 + 2] * az);
        const etaR = eta[c] + lE[c] * (gE[c3] * cx + gE[c3 + 1] * cy + gE[c3 + 2] * cz);
        const uR = vx[c] + lX[c] * (gX[c3] * cx + gX[c3 + 1] * cy + gX[c3 + 2] * cz);
        const vR = vy[c] + lY[c] * (gY[c3] * cx + gY[c3 + 1] * cy + gY[c3 + 2] * cz);
        const wR = vz[c] + lZ[c] * (gZ[c3] * cx + gZ[c3 + 1] * cy + gZ[c3 + 2] * cz);

        const hLf = Math.max(0, etaL - b[a]), hRf = Math.max(0, etaR - b[c]);
        const bs = Math.max(b[a], b[c]);
        const hL = Math.max(0, etaL - bs), hR = Math.max(0, etaR - bs);

        const unL = uL * nx + vL * ny + wL * nz, unR = uR * nx + vR * ny + wR * nz;
        const s = Math.max(Math.abs(unL) + Math.sqrt(G * hL), Math.abs(unR) + Math.sqrt(G * hR));
        const qL = hL * unL, qR = hR * unR;
        const Fh = 0.5 * (qL + qR) - 0.5 * s * (hR - hL);
        const pp = 0.25 * G * (hL * hL + hR * hR);
        const Fx = 0.5 * (qL * uL + qR * uR) + pp * nx - 0.5 * s * (hR * uR - hL * uL);
        const Fy = 0.5 * (qL * vL + qR * vR) + pp * ny - 0.5 * s * (hR * vR - hL * vL);
        const Fz = 0.5 * (qL * wL + qR * wR) + pp * nz - 0.5 * s * (hR * wR - hL * wL);
        // hydrostatic reconstruction + removal of the cell's own pressure
        // (sum of p n l over a closed cell) -> exactly well balanced
        const ha = h[a], hc = h[c];
        const corL = 0.5 * G * (hLf * hLf - hL * hL - ha * ha);
        const corR = 0.5 * G * (hRf * hRf - hR * hR - hc * hc);
        rh[a] -= l * Fh; rh[c] += l * Fh;
        rx[a] -= l * (Fx + corL * nx); rx[c] += l * (Fx + corR * nx);
        ry[a] -= l * (Fy + corL * ny); ry[c] += l * (Fy + corR * ny);
        rz[a] -= l * (Fz + corL * nz); rz[c] += l * (Fz + corR * nz);
      }

      // reflective walls (mirror state), no mass flux
      for (let k = 0; k < wall.length; k++) {
        const e = wall[k], a = wallCell[k], sg = wallSign[k];
        const nx = sg * eNrm[3 * e], ny = sg * eNrm[3 * e + 1], nz = sg * eNrm[3 * e + 2], l = eLen[e];
        const r = sg > 0 ? r1 : r2;
        const ax = r[3 * e], ay = r[3 * e + 1], az = r[3 * e + 2];
        const a3 = 3 * a;
        const etaL = eta[a] + lE[a] * (gE[a3] * ax + gE[a3 + 1] * ay + gE[a3 + 2] * az);
        const uL = vx[a] + lX[a] * (gX[a3] * ax + gX[a3 + 1] * ay + gX[a3 + 2] * az);
        const vL = vy[a] + lY[a] * (gY[a3] * ax + gY[a3 + 1] * ay + gY[a3 + 2] * az);
        const wL = vz[a] + lZ[a] * (gZ[a3] * ax + gZ[a3 + 1] * ay + gZ[a3 + 2] * az);
        const hL = Math.max(0, etaL - b[a]);
        const un = uL * nx + vL * ny + wL * nz;
        const s = Math.abs(un) + Math.sqrt(G * hL);
        const ha = h[a];
        const P = hL * un * un + 0.5 * G * hL * hL + s * hL * un - 0.5 * G * ha * ha;
        rx[a] -= l * P * nx; ry[a] -= l * P * ny; rz[a] -= l * P * nz;
      }

      for (let a = 0; a < N; a++) {
        if (!ocean[a]) continue;
        const ia = invA[a];
        rh[a] *= ia; rx[a] *= ia; ry[a] *= ia; rz[a] *= ia;
        if (coriolis) {
          const px = pos[3 * a], py = pos[3 * a + 1], pz = pos[3 * a + 2];
          const f = 2 * OMEGA * pz;
          rx[a] -= f * (py * mz[a] - pz * my[a]);
          ry[a] -= f * (pz * mx[a] - px * mz[a]);
          rz[a] -= f * (px * my[a] - py * mx[a]);
        }
      }
    }

    function fixup(a) {
      const px = pos[3 * a], py = pos[3 * a + 1], pz = pos[3 * a + 2];
      const d = mx[a] * px + my[a] * py + mz[a] * pz;
      mx[a] -= d * px; my[a] -= d * py; mz[a] -= d * pz;
      if (h[a] < HDRY) { if (h[a] < 0) h[a] = 0; mx[a] = my[a] = mz[a] = 0; }
    }

    function syncEta() {
      for (let a = 0; a < N; a++) eta[a] = ocean[a] ? h[a] + b[a] : 0;
    }

    return {
      kind: "nonlinear",
      eta,
      setInitial(eta0) {
        for (let a = 0; a < N; a++) {
          h[a] = ocean[a] ? Math.max(0, H[a] + eta0[a]) : 0;
          mx[a] = my[a] = mz[a] = 0;
        }
        syncEta();
      },
      proposeDt() {
        let dt = Infinity;
        for (let a = 0; a < N; a++) {
          if (!ocean[a]) continue;
          const hh = h[a];
          let v = 0;
          if (hh > HDRY) v = Math.hypot(mx[a], my[a], mz[a]) / hh;
          const lam = v + Math.sqrt(G * hh) + 1e-6;
          const d = CFL / (lam * perimA[a]);
          if (d < dt) dt = d;
        }
        return dt;
      },
      step(dt) {
        h0.set(h); mx0.set(mx); my0.set(my); mz0.set(mz);
        residual();
        for (let a = 0; a < N; a++) {
          if (!ocean[a]) continue;
          h[a] += dt * rh[a]; mx[a] += dt * rx[a]; my[a] += dt * ry[a]; mz[a] += dt * rz[a];
          fixup(a);
        }
        residual();
        for (let a = 0; a < N; a++) {
          if (!ocean[a]) continue;
          h[a] = 0.5 * (h0[a] + h[a] + dt * rh[a]);
          mx[a] = 0.5 * (mx0[a] + mx[a] + dt * rx[a]);
          my[a] = 0.5 * (my0[a] + my[a] + dt * ry[a]);
          mz[a] = 0.5 * (mz0[a] + mz[a] + dt * rz[a]);
          fixup(a);
          if (manning > 0 && h[a] > HDRY) {
            const v = Math.hypot(mx[a], my[a], mz[a]) / h[a];
            const fac = 1 + (dt * G * manning * manning * v) / Math.pow(h[a], 4 / 3);
            mx[a] /= fac; my[a] /= fac; mz[a] /= fac;
          }
        }
        syncEta();
        return dt;
      },
    };
  }

  // ------------------------------------------------------------------------
  // Simulation wrapper: time, max amplitude, arrival time and gauges.
  function Simulation(mesh, H, ocean, opts) {
    const solver = opts.model === "nonlinear" ? NonlinearSolver(mesh, H, ocean, opts) : LinearSolver(mesh, H, ocean);
    const N = mesh.N;
    const maxEta = new Float64Array(N);
    const arrival = new Float64Array(N);
    const sim = {
      solver,
      t: 0,
      steps: 0,
      lastDt: 0,
      arrivalThreshold: opts.arrivalThreshold || 0.01,
      maxEta,
      arrival,
      gauges: [],
      get eta() { return solver.eta; },
      setInitial(eta0) {
        solver.setInitial(eta0);
        sim.t = 0; sim.steps = 0;
        const eta = solver.eta;
        for (let a = 0; a < N; a++) {
          maxEta[a] = ocean[a] ? Math.max(0, eta[a]) : 0;
          arrival[a] = ocean[a] && Math.abs(eta[a]) > sim.arrivalThreshold ? 0 : -1;
        }
        for (const g of sim.gauges) { g.t = [0]; g.v = [eta[g.cell]]; }
      },
      step(tEnd) {
        let dt = solver.proposeDt();
        if (tEnd !== undefined && sim.t + dt > tEnd) dt = Math.max(tEnd - sim.t, 1e-3);
        solver.step(dt);
        sim.t += dt; sim.steps++; sim.lastDt = dt;
        const eta = solver.eta, thr = sim.arrivalThreshold, t = sim.t;
        let bad = false;
        for (let a = 0; a < N; a++) {
          if (!ocean[a]) continue;
          const v = eta[a];
          if (v > maxEta[a]) maxEta[a] = v;
          if (arrival[a] < 0 && Math.abs(v) > thr) arrival[a] = t;
          if (v !== v) bad = true;
        }
        for (const g of sim.gauges) { g.t.push(t); g.v.push(eta[g.cell]); }
        return !bad;
      },
      addGauge(cell, label) {
        const g = { cell, label, t: [sim.t], v: [solver.eta[cell]] };
        sim.gauges.push(g);
        return g;
      },
    };
    return sim;
  }

  SW.G = G;
  SW.Simulation = Simulation;
})();
