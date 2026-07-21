(function (NS) {
  'use strict';

  // Compressible Euler FVM solver for the O-mesh.
  // Inviscid flux: AUSM or Roe (params.fluxScheme). Time integration: RK2 (Heun).

  const Math_  = NS.Math_;
  const Flux   = NS.Flux;
  const Recon  = NS.Recon;
  const BC     = NS.BC;
  const RK     = NS.RK;

  NS.Solver = {};

  NS.Solver.create = function (grid, params, freeStream) {
    const { ni, nj, cellIdx, extIdx, ifaceIdx, jfaceIdx,
            iFaceNx, iFaceNy, iFaceArea,
            jFaceNx, jFaceNy, jFaceArea,
            cellVol } = grid;
    const { gamma } = params;
    const n    = ni * nj;
    const nExt = (ni + 2) * (nj + 2);

    const state   = Math_.makeState(n);
    const ext     = Math_.makeState(nExt);
    const fI      = Math_.makeState((ni + 1) * nj);
    const fJ      = Math_.makeState(ni * (nj + 1));
    const res     = Math_.makeState(n);
    const scratch = RK.makeScratch(n);

    let time = 0, dt = 0, stepCount = 0;
    let maxMach = 0, minP = Infinity, maxP = 0;
    let paused = params.paused || false;

    // ── Initialize ─────────────────────────────────────────────────────────
    function initialize() {
      const { rho, rhou, rhov, E } = Math_.conserved(
        freeStream.rho, freeStream.u, freeStream.v, freeStream.p, gamma);
      Math_.fillUniform(state, ni, nj, rho, rhou, rhov, E);
      time = 0; stepCount = 0; dt = 0;
      maxMach = freeStream.M; minP = freeStream.p; maxP = freeStream.p;
    }

    // ── Extended state copy ─────────────────────────────────────────────────
    function copyToExt(src) {
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

    // ── Residual ────────────────────────────────────────────────────────────
    function computeResidual(src, resOut) {
      copyToExt(src);

      // BCs fill ghost layers
      BC.applyWall(ext, grid, params);
      BC.applyFarfield(ext, grid, freeStream);

      const tmpF = [0, 0, 0, 0];
      const fluxFn   = Flux.registry[params.fluxScheme] || Flux.registry.ausm;
      const linear   = params.reconstruction === 'linear';
      const limiterFn = linear
        ? (Recon.limiters[params.limiter] || Recon.limiters.minmod)
        : null;

      // I-face fluxes (streamwise, around the airfoil)
      for (let j = 0; j < nj; j++) {
        for (let I = 0; I <= ni; I++) {
          const idxL  = extIdx(I,     j + 1);
          const idxR  = extIdx(I + 1, j + 1);
          const fi    = ifaceIdx(I, j);
          let L, R;
          if (linear) {
            // 4-point stencil; -1 signals out-of-bounds (slope clamped to 0)
            const idxLL = I >= 1      ? extIdx(I - 1, j + 1) : -1;
            const idxRR = I <= ni - 1 ? extIdx(I + 2, j + 1) : -1;
            [L, R] = Recon.reconstructFace(ext, idxLL, idxL, idxR, idxRR, gamma, limiterFn);
          } else {
            L = Flux.prims(ext, idxL, gamma);
            R = Flux.prims(ext, idxR, gamma);
          }
          fluxFn(L, R, iFaceNx[fi], iFaceNy[fi], gamma, tmpF);
          const a = iFaceArea[fi];
          fI.rho[fi]  = tmpF[0] * a;
          fI.rhou[fi] = tmpF[1] * a;
          fI.rhov[fi] = tmpF[2] * a;
          fI.E[fi]    = tmpF[3] * a;
        }
      }

      // J-face fluxes (wall-normal direction)
      for (let J = 0; J <= nj; J++) {
        for (let i = 0; i < ni; i++) {
          const idxB  = extIdx(i + 1, J);
          const idxT  = extIdx(i + 1, J + 1);
          const fj    = jfaceIdx(i, J);
          let L, R;
          if (linear) {
            const idxBB = J >= 1      ? extIdx(i + 1, J - 1) : -1;
            const idxTT = J <= nj - 1 ? extIdx(i + 1, J + 2) : -1;
            [L, R] = Recon.reconstructFace(ext, idxBB, idxB, idxT, idxTT, gamma, limiterFn);
          } else {
            L = Flux.prims(ext, idxB, gamma);
            R = Flux.prims(ext, idxT, gamma);
          }
          fluxFn(L, R, jFaceNx[fj], jFaceNy[fj], gamma, tmpF);
          const a = jFaceArea[fj];
          fJ.rho[fj]  = tmpF[0] * a;
          fJ.rhou[fj] = tmpF[1] * a;
          fJ.rhov[fj] = tmpF[2] * a;
          fJ.E[fj]    = tmpF[3] * a;
        }
      }

      // Assemble inviscid residual: dU/dt = -1/V * div(F_inviscid)
      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const ci = cellIdx(i, j);
          const iL = ifaceIdx(i,     j);
          const iR = ifaceIdx(i + 1, j);
          const jB = jfaceIdx(i, j);
          const jT = jfaceIdx(i, j + 1);
          const iV = 1.0 / cellVol[ci];
          resOut.rho[ci]  = -(fI.rho[iR]  - fI.rho[iL]  + fJ.rho[jT]  - fJ.rho[jB])  * iV;
          resOut.rhou[ci] = -(fI.rhou[iR] - fI.rhou[iL] + fJ.rhou[jT] - fJ.rhou[jB]) * iV;
          resOut.rhov[ci] = -(fI.rhov[iR] - fI.rhov[iL] + fJ.rhov[jT] - fJ.rhov[jB]) * iV;
          resOut.E[ci]    = -(fI.E[iR]    - fI.E[iL]    + fJ.E[jT]    - fJ.E[jB])    * iV;
        }
      }
    }

    // ── CFL time step ───────────────────────────────────────────────────────
    function computeDt() {
      const cfl = params.cfl;
      let minDt = Infinity;
      let mach = 0, pMin = Infinity, pMax = 0;
      for (let j = 0; j < nj; j++) {
        for (let i = 0; i < ni; i++) {
          const ci = cellIdx(i, j);
          const rho = Math.max(state.rho[ci], 1e-12);
          const u   = state.rhou[ci] / rho;
          const v   = state.rhov[ci] / rho;
          const p   = Math_.pressure(rho, state.rhou[ci], state.rhov[ci], state.E[ci], gamma);
          const c   = Math_.soundSpeed(rho, p, gamma);
          const V   = Math.sqrt(u*u + v*v);
          const M   = V / c;
          if (M > mach) mach = M;
          if (p < pMin) pMin = p;
          if (p > pMax) pMax = p;

          // Estimate max wave speed * characteristic length
          const vol = cellVol[ci];
          const faceArea = 0.5 * (iFaceArea[ifaceIdx(i, j)] + iFaceArea[ifaceIdx(i + 1, j)]
                                + jFaceArea[jfaceIdx(i, j)] + jFaceArea[jfaceIdx(i, j + 1)]);
          const lambda = (V + c) * faceArea;
          const dtCell = lambda < 1e-20 ? Infinity : cfl * vol / lambda;
          if (dtCell < minDt) minDt = dtCell;
        }
      }
      maxMach = mach; minP = pMin; maxP = pMax;
      return Math.min(minDt, 1.0);
    }

    initialize();

    return {
      step() {
        dt = computeDt();
        RK.advance(state, dt, n, computeResidual, scratch);
        time += dt;
        stepCount++;
      },

      get state()     { return state; },
      get time()      { return time; },
      get dt()        { return dt; },
      get stepCount() { return stepCount; },
      get maxMach()   { return maxMach; },
      get minP()      { return minP; },
      get maxP()      { return maxP; },

      reset() { initialize(); },

      getScalar(field) {
        const n = state.rho.length;
        const out = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          const rho = Math.max(state.rho[k], 1e-12);
          const u = state.rhou[k] / rho;
          const v = state.rhov[k] / rho;
          const p = Math_.pressure(rho, state.rhou[k], state.rhov[k], state.E[k], gamma);
          const c = Math_.soundSpeed(rho, p, gamma);
          switch (field) {
            case 'mach':     out[k] = Math.sqrt(u*u+v*v)/c; break;
            case 'pressure': out[k] = p; break;
            case 'density':  out[k] = rho; break;
            case 'velocity': out[k] = Math.sqrt(u*u+v*v); break;
            case 'u':        out[k] = u; break;
            case 'v':        out[k] = v; break;
            default:         out[k] = Math.sqrt(u*u+v*v)/c;
          }
        }
        return out;
      },
    };
  };
})(window.AFL);
