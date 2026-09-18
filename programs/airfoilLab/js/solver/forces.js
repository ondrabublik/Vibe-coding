(function (NS) {
  'use strict';

  // Aerodynamic force and pressure coefficient calculation.
  //
  // Forces are integrated over airfoil wall faces at j=0.
  // Freestream direction is the positive x-axis (flow is horizontal);
  // the airfoil is rotated by alpha, so lift/drag are obtained by transforming
  // the total force vector using the angle of attack.
  //
  // Cp = (p - p_inf) / q_inf  where q_inf = 0.5 * rho_inf * V_inf^2
  // Cl = L / (q_inf * chord)  chord = 1
  // Cd = D / (q_inf * chord)

  NS.Forces = {};

  const EPS = 1e-12;

  NS.Forces.compute = function (state, grid, params, freeStream) {
    const { ni, nj, cellIdx, jfaceIdx, jFaceNx, jFaceNy, jFaceArea,
            cellCx, isWallCell, surfaceStart, surfaceEnd } = grid;
    const { gamma } = params;
    const { rho: r_inf, V: V_inf, p: p_inf } = freeStream;

    const q_inf = 0.5 * r_inf * V_inf * V_inf;
    // Note: the airfoil is rotated by alpha, the freestream is always horizontal (+x).
    // Wind-axis lift = Fy (perpendicular to horizontal freestream).
    // Wind-axis drag = Fx (parallel to horizontal freestream).

    let Fx = 0, Fy = 0;

    const cpData = [];

    for (let i = surfaceStart; i < surfaceEnd; i++) {
      if (!isWallCell[i]) continue;

      const ci  = cellIdx(i, 0);  // first interior cell row (j=0)
      const fj  = jfaceIdx(i, 0); // J-face at J=0 (between ghost and cell j=0)

      // Pressure at wall cell (first interior layer)
      const rho  = Math.max(state.rho[ci], EPS);
      const u    = state.rhou[ci] / rho;
      const v    = state.rhov[ci] / rho;
      const E    = state.E[ci];
      const p    = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u*u + v*v)), EPS);

      // Cp based on wall-cell pressure
      const Cp = (p - p_inf) / Math.max(q_inf, EPS);

      // Face normal at j=0 points INTO the domain (away from airfoil surface)
      const nx = jFaceNx[fj];
      const ny = jFaceNy[fj];
      const A  = jFaceArea[fj];

      // Pressure force on body = -p * (outward from fluid) * A
      // Face normal is INTO fluid → force on body is INTO fluid direction × (-p)
      // = -p * (-nx, -ny) * A  = p * (nx, ny) * A ... wait:
      // The wall face normal points from the ghost (below wall) into the fluid domain.
      // Force on the FLUID from the wall pressure = p * n * A (n points into fluid).
      // By Newton's third law, force on BODY = -p * n * A (pointing away from fluid = into body).
      Fx += -p * nx * A;
      Fy += -p * ny * A;

      // Chord x-position for Cp plot
      const x = cellCx[ci];
      cpData.push({ x, i, Cp, nx, ny, isUpper: (i >= surfaceStart + Math.round((surfaceEnd - surfaceStart) / 2)) });
    }

    // Freestream is horizontal (+x). Wind-axis decomposition:
    const L = Fy;   // lift  = vertical component  (perpendicular to freestream)
    const D = Fx;   // drag  = horizontal component (parallel to freestream)

    const Cl = L / Math.max(q_inf, EPS);
    const Cd = D / Math.max(q_inf, EPS);

    // Separate upper/lower Cp by i-index relative to LE midpoint
    const nSurf = surfaceEnd - surfaceStart;
    const leMid = surfaceStart + Math.round(nSurf / 2);
    cpData.forEach(d => { d.isUpper = d.i >= leMid; });

    return { Cl, Cd, Cx: Fx, Cy: Fy, cpData };
  };
})(window.AFL);
