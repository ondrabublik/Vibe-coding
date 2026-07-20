(function (NS) {
  'use strict';

  const Math_  = NS.Math_;
  const Flux   = NS.Flux;
  const BC     = NS.BC;
  const RK     = NS.RK;

  const EPS = 1e-12;

  NS.Solver = {};

  NS.Solver.create = function (initialGrid, params) {
    let grid = initialGrid;
    let { ni, nj } = grid;
    const n    = ni * nj;
    const next = (ni + 2) * (nj + 2);

    // State and extended state
    const state = Math_.makeState(n);
    const ext   = Math_.makeState(next);

    // Pre-allocated flux buffers
    const fI = Math_.makeState((ni + 1) * nj);    // I-face fluxes
    const fJ = Math_.makeState(ni * (nj + 1));     // J-face fluxes

    // Scratch for RK
    const scratch = RK.makeScratch(n);

    // Residual buffer
    const res = Math_.makeState(n);

    // Stats
    let time = 0;
    let dt   = 0;
    let stepCount = 0;
    let maxMach = 0;
    let minP = Infinity, maxP = 0;

    // ---- Initialize ----
    function initialize() {
      const { gamma, inletMach, inletP0, inletT0 } = params;
      const ic = Math_.inletState(inletMach, inletP0, inletT0, gamma);
      Math_.fillUniform(state, ni, nj, ic.rho, ic.rhou, ic.rhov, ic.E);
      time = 0;
      stepCount = 0;
    }

    // ---- Copy physical state to extended array (no ghost cells yet) ----
    function copyToExt(src) {
      const { cellIdx, extIdx } = grid;
      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const ci = cellIdx(i, j);
          const ei = extIdx(i + 1, j + 1);
          ext.rho[ei]  = src.rho[ci];
          ext.rhou[ei] = src.rhou[ci];
          ext.rhov[ei] = src.rhov[ci];
          ext.E[ei]    = src.E[ci];
        }
      }
    }

    // ---- Compute residual for a given physical state ----
    function computeResidual(src, resOut) {
      const { ni, nj, cellIdx, extIdx, ifaceIdx, jfaceIdx,
              iFaceNx, iFaceNy, iFaceArea,
              jFaceNx, jFaceNy, jFaceArea,
              cellVol } = grid;
      const gamma = params.gamma;
      const fluxFn = Flux.registry[params.fluxScheme] || Flux.registry.roe;

      // 1. Fill extended array with current state
      copyToExt(src);

      // 2. Apply BC (fills ghost cells in ext)
      BC.applyInlet(ext, grid, params);
      BC.applyOutlet(ext, grid, params);
      BC.applyWalls(ext, grid);

      const tmpF = [0, 0, 0, 0];

      // 3. I-face fluxes: loop I in [0..ni], j in [0..nj-1]
      for (let j = 0; j < nj; j++) {
        for (let I = 0; I <= ni; I++) {
          const idxL = extIdx(I,     j + 1);
          const idxR = extIdx(I + 1, j + 1);
          const fi   = ifaceIdx(I, j);
          const nx   = iFaceNx[fi];
          const ny   = iFaceNy[fi];
          const area = iFaceArea[fi];

          fluxFn(ext, idxL, idxR, nx, ny, gamma, tmpF);

          fI.rho[fi]  = tmpF[0] * area;
          fI.rhou[fi] = tmpF[1] * area;
          fI.rhov[fi] = tmpF[2] * area;
          fI.E[fi]    = tmpF[3] * area;
        }
      }

      // 4. J-face fluxes: loop i in [0..ni-1], J in [0..nj]
      for (let J = 0; J <= nj; J++) {
        for (let i = 0; i < ni; i++) {
          const idxB = extIdx(i + 1, J);
          const idxT = extIdx(i + 1, J + 1);
          const fj   = jfaceIdx(i, J);
          const nx   = jFaceNx[fj];
          const ny   = jFaceNy[fj];
          const area = jFaceArea[fj];

          fluxFn(ext, idxB, idxT, nx, ny, gamma, tmpF);

          fJ.rho[fj]  = tmpF[0] * area;
          fJ.rhou[fj] = tmpF[1] * area;
          fJ.rhov[fj] = tmpF[2] * area;
          fJ.E[fj]    = tmpF[3] * area;
        }
      }

      // 5. Assemble residual for physical cells
      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const ci = cellIdx(i, j);
          const vol = cellVol[ci];
          const invV = 1.0 / vol;

          const fiR = ifaceIdx(i + 1, j);  // right I-face
          const fiL = ifaceIdx(i,     j);  // left I-face
          const fjT = jfaceIdx(i, j + 1);  // top J-face
          const fjB = jfaceIdx(i, j);      // bottom J-face

          resOut.rho[ci]  = -invV * (fI.rho[fiR]  - fI.rho[fiL]  + fJ.rho[fjT]  - fJ.rho[fjB]);
          resOut.rhou[ci] = -invV * (fI.rhou[fiR] - fI.rhou[fiL] + fJ.rhou[fjT] - fJ.rhou[fjB]);
          resOut.rhov[ci] = -invV * (fI.rhov[fiR] - fI.rhov[fiL] + fJ.rhov[fjT] - fJ.rhov[fjB]);
          resOut.E[ci]    = -invV * (fI.E[fiR]    - fI.E[fiL]    + fJ.E[fjT]    - fJ.E[fjB]);
        }
      }
    }

    // ---- Compute CFL time step ----
    function computeDt() {
      const { ni, nj, cellIdx, ifaceIdx, jfaceIdx,
              iFaceArea, jFaceArea, cellVol } = grid;
      const gamma = params.gamma;
      let maxSR = 0;

      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const ci = cellIdx(i, j);
          const vol = cellVol[ci];
          const rho = Math.max(state.rho[ci], EPS);
          const u   = state.rhou[ci] / rho;
          const v   = state.rhov[ci] / rho;
          const E   = state.E[ci];
          const p   = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
          const c   = Math.sqrt(gamma * p / rho);
          const q   = Math.sqrt(u * u + v * v);

          const aL = iFaceArea[ifaceIdx(i,     j)];
          const aR = iFaceArea[ifaceIdx(i + 1, j)];
          const aB = jFaceArea[jfaceIdx(i, j)];
          const aT = jFaceArea[jfaceIdx(i, j + 1)];

          const aXi  = 0.5 * (aL + aR);
          const aEta = 0.5 * (aB + aT);

          // Spectral radii
          const srXi  = (q + c) * aXi;
          const srEta = (q + c) * aEta;
          const sr = (srXi + srEta) / vol;
          if (sr > maxSR) maxSR = sr;
        }
      }

      return maxSR > 0 ? params.cfl / maxSR : 1e-4;
    }

    // ---- Compute statistics (called after step) ----
    function computeStats() {
      const gamma = params.gamma;
      maxMach = 0; minP = Infinity; maxP = 0;
      const n = ni * nj;
      for (let k = 0; k < n; k++) {
        const rho = Math.max(state.rho[k], EPS);
        const u   = state.rhou[k] / rho;
        const v   = state.rhov[k] / rho;
        const E   = state.E[k];
        const p   = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
        const c   = Math.sqrt(gamma * p / rho);
        const M   = Math.sqrt(u * u + v * v) / c;
        if (M > maxMach) maxMach = M;
        if (p < minP) minP = p;
        if (p > maxP) maxP = p;
      }
    }

    // ---- Step: one RK advance ----
    function step() {
      dt = computeDt();
      const rkFn = RK.schemes[params.rkOrder] || RK.schemes[3];
      rkFn(state, dt, ni * nj, computeResidual, scratch);
      time += dt;
      stepCount++;
      computeStats();
    }

    // ---- Scalar field accessors for rendering ----
    function getScalar(field) {
      const gamma = params.gamma;
      const n = ni * nj;
      const out = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const rho = Math.max(state.rho[k], EPS);
        const u   = state.rhou[k] / rho;
        const v   = state.rhov[k] / rho;
        const E   = state.E[k];
        const p   = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
        const c   = Math.sqrt(gamma * p / rho);
        switch (field) {
          case 'mach':     out[k] = Math.sqrt(u * u + v * v) / c; break;
          case 'pressure': out[k] = p; break;
          case 'density':  out[k] = rho; break;
          case 'velocity': out[k] = Math.sqrt(u * u + v * v); break;
          case 'u':        out[k] = u; break;
          case 'v':        out[k] = v; break;
          default:         out[k] = Math.sqrt(u * u + v * v) / c;
        }
      }
      return out;
    }

    function setGrid(newGrid) {
      if (newGrid.ni !== ni || newGrid.nj !== nj) return false;
      grid = newGrid;
      return true;
    }

    initialize();

    return {
      state,
      initialize,
      setGrid,
      step,
      getScalar,
      getStats: () => ({ time, dt, stepCount, maxMach, minP, maxP }),
    };
  };
})(window.FVM);
