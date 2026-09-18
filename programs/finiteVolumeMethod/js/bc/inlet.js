(function (NS) {
  'use strict';

  const Math_ = NS.Math_;
  NS.BC = NS.BC || {};

  NS.BC.applyInlet = function (ext, grid, params) {
    const { ni, nj, ifaceIdx, iFaceNx, iFaceNy, extIdx } = grid;
    const { gamma, inletMach, inletP0, inletT0, inletMode } = params;

    // Precompute inlet isentropic state
    const inSt = Math_.inletState(inletMach, inletP0, inletT0, gamma);
    const inRho = inSt.rho;
    const inP   = Math_.pressure(inSt.rho, inSt.rhou, inSt.rhov, inSt.E, gamma);
    const inC   = Math_.soundSpeed(inRho, inP, gamma);
    const inU   = inSt.rhou / inRho;
    const sIn   = Math_.entropy(inRho, inP, gamma);
    // Incoming Riemann invariant J+ = u_n_in + 2*c_in/(gamma-1)
    const Jp = inU + 2.0 * inC / (gamma - 1.0);  // approximate as axial u_n

    for (let j = 0; j < nj; j++) {
      const ghostI = extIdx(0, j + 1);
      const physI  = extIdx(1, j + 1);

      if (inletMode === 'supersonic') {
        // Fix all: ghost = inlet state
        ext.rho[ghostI]  = inSt.rho;
        ext.rhou[ghostI] = inSt.rhou;
        ext.rhov[ghostI] = inSt.rhov;
        ext.E[ghostI]    = inSt.E;
      } else {
        // Subsonic: 1D characteristic BC
        // Get face normal (points into domain)
        const fi = ifaceIdx(0, j);
        const nx = iFaceNx[fi];
        const ny = iFaceNy[fi];

        // Interior state
        const rho1  = Math.max(ext.rho[physI], 1e-12);
        const u1    = ext.rhou[physI] / rho1;
        const v1    = ext.rhov[physI] / rho1;
        const p1    = Math_.pressure(ext.rho[physI], ext.rhou[physI], ext.rhov[physI], ext.E[physI], gamma);
        const c1    = Math_.soundSpeed(rho1, p1, gamma);
        const un1   = u1 * nx + v1 * ny;

        // Outgoing Riemann invariant J- = u_n1 - 2*c1/(gamma-1)
        const Jm = un1 - 2.0 * c1 / (gamma - 1.0);

        const unG = 0.5 * (Jp + Jm);
        const cG  = 0.25 * (gamma - 1.0) * (Jp - Jm);

        if (cG <= 0) {
          // Fallback: fix inlet state
          ext.rho[ghostI]  = inSt.rho;
          ext.rhou[ghostI] = inSt.rhou;
          ext.rhov[ghostI] = inSt.rhov;
          ext.E[ghostI]    = inSt.E;
          continue;
        }

        // Recover rho from inlet entropy
        const rhoG = Math.pow(cG * cG / (gamma * sIn), 1.0 / (gamma - 1.0));
        const pG   = sIn * Math.pow(rhoG, gamma);

        // Reconstruct velocity vector: u_n in normal dir, v_t=0
        const ug = unG * nx;
        const vg = unG * ny;

        ext.rho[ghostI]  = rhoG;
        ext.rhou[ghostI] = rhoG * ug;
        ext.rhov[ghostI] = rhoG * vg;
        ext.E[ghostI]    = pG / (gamma - 1.0) + 0.5 * rhoG * (ug * ug + vg * vg);
      }
    }
  };
})(window.FVM);
