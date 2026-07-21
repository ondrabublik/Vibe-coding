(function (NS) {
  'use strict';

  // Far-field boundary conditions for the O-mesh.
  //
  // Top J-ghost (j=nj+1): subsonic/supersonic Riemann characteristic BC.
  // Circumferential I-ghosts (i=0, i=ni+1): periodic TE seam (periodic.js).

  NS.BC = NS.BC || {};

  const EPS = 1e-12;

  NS.BC.applyFarfield = function (ext, grid, freeStream) {
    const { ni, nj, extIdx, jfaceIdx, jFaceNx, jFaceNy } = grid;
    const { rho: r_inf, u: u_inf, v: v_inf, p: p_inf, c: c_inf, E: E_inf } = freeStream;
    const gamma = freeStream.gamma;

    // ── Top J-ghost (j=nj+1) ────────────────────────────────────────────────
    for (let i = 0; i < ni; i++) {
      const ghostI = extIdx(i + 1, nj + 1);
      const physI  = extIdx(i + 1, nj);

      // Outward face normal at J=nj (points away from domain into far-field)
      const fi = jfaceIdx(i, nj);
      const nx = jFaceNx[fi];
      const ny = jFaceNy[fi];

      const rho1 = Math.max(ext.rho[physI], EPS);
      const u1   = ext.rhou[physI] / rho1;
      const v1   = ext.rhov[physI] / rho1;
      const p1   = Math.max((gamma - 1.0) * (ext.E[physI] - 0.5 * rho1 * (u1*u1 + v1*v1)), EPS);
      const c1   = Math.sqrt(gamma * p1 / rho1);
      const un1  = u1 * nx + v1 * ny;
      const un_inf = u_inf * nx + v_inf * ny;

      // Absolute Mach at this face
      const M_loc = Math.abs(un1) / c1;

      if (M_loc >= 1.0 && un1 > 0) {
        // Supersonic outflow: extrapolate interior
        ext.rho[ghostI]  = rho1;
        ext.rhou[ghostI] = rho1 * u1;
        ext.rhov[ghostI] = rho1 * v1;
        ext.E[ghostI]    = ext.E[physI];
      } else if (M_loc >= 1.0 && un1 <= 0) {
        // Supersonic inflow: fix to freestream
        ext.rho[ghostI]  = r_inf;
        ext.rhou[ghostI] = r_inf * u_inf;
        ext.rhov[ghostI] = r_inf * v_inf;
        ext.E[ghostI]    = E_inf;
      } else {
        // Subsonic: Riemann characteristic BC
        // R+ = outgoing (from interior), R- = incoming (from far-field)
        const Jp = un1    + 2.0 * c1    / (gamma - 1.0);  // from interior
        const Jm = un_inf - 2.0 * c_inf / (gamma - 1.0);  // from far-field
        const un_g = 0.5 * (Jp + Jm);
        const c_g  = 0.25 * (gamma - 1.0) * (Jp - Jm);

        if (c_g <= 0) {
          // Fallback: fix to freestream
          ext.rho[ghostI]  = r_inf;
          ext.rhou[ghostI] = r_inf * u_inf;
          ext.rhov[ghostI] = r_inf * v_inf;
          ext.E[ghostI]    = E_inf;
          continue;
        }

        // Use entropy from appropriate side
        const s_ref = un_g <= 0  // inflow: entropy from freestream
          ? p_inf / Math.pow(r_inf, gamma)
          : p1    / Math.pow(rho1,  gamma);

        const rho_g = Math.pow(c_g * c_g / (gamma * s_ref), 1.0 / (gamma - 1.0));
        const p_g   = s_ref * Math.pow(rho_g, gamma);

        // Tangential velocity from freestream (consistent for any inflow direction)
        const ut_inf = -u_inf * ny + v_inf * nx;
        const ug = un_g * nx - ut_inf * ny;
        const vg = un_g * ny + ut_inf * nx;

        ext.rho[ghostI]  = rho_g;
        ext.rhou[ghostI] = rho_g * ug;
        ext.rhov[ghostI] = rho_g * vg;
        ext.E[ghostI]    = p_g / (gamma - 1.0) + 0.5 * rho_g * (ug*ug + vg*vg);
      }
    }

    NS.BC.applyPeriodicSeam(ext, grid);

    function copyExt(dst, src) {
      ext.rho[dst] = ext.rho[src]; ext.rhou[dst] = ext.rhou[src];
      ext.rhov[dst] = ext.rhov[src]; ext.E[dst] = ext.E[src];
    }
    copyExt(extIdx(0, nj + 1),      extIdx(1,  nj + 1));
    copyExt(extIdx(ni + 1, nj + 1), extIdx(ni, nj + 1));
  };
})(window.AFL);
