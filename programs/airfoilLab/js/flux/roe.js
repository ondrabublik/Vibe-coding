(function (NS) {
  'use strict';

  // Roe approximate Riemann solver for the 2-D Euler equations.
  // Face-normal form with Harten–Hyman entropy fix.

  const Flux = NS.Flux;
  const EPS = 1e-12;

  function physFlux(rho, u, v, p, E, nx, ny, f) {
    const un = u * nx + v * ny;
    f[0] = rho * un;
    f[1] = rho * u * un + p * nx;
    f[2] = rho * v * un + p * ny;
    f[3] = (E + p) * un;
  }

  function entropyFix(lam, eps) {
    const a = Math.abs(lam);
    return a >= eps ? a : 0.5 * (lam * lam / eps + eps);
  }

  function roe(ext, idxL, idxR, nx, ny, gamma, fOut) {
    const L = Flux.prims(ext, idxL, gamma);
    const R = Flux.prims(ext, idxR, gamma);

    // Physical fluxes
    const fL = [0, 0, 0, 0], fR = [0, 0, 0, 0];
    physFlux(L.rho, L.u, L.v, L.p, L.E, nx, ny, fL);
    physFlux(R.rho, R.u, R.v, R.p, R.E, nx, ny, fR);

    // Roe averages
    const rL = Math.sqrt(L.rho);
    const rR = Math.sqrt(R.rho);
    const den = 1.0 / (rL + rR);
    const uAvg = (rL * L.u + rR * R.u) * den;
    const vAvg = (rL * L.v + rR * R.v) * den;
    const HAvg = (rL * L.H + rR * R.H) * den;
    const q2 = uAvg * uAvg + vAvg * vAvg;
    const c2 = Math.max((gamma - 1.0) * (HAvg - 0.5 * q2), EPS);
    const cAvg = Math.sqrt(c2);
    const rhoAvg = rL * rR;
    const unAvg = uAvg * nx + vAvg * ny;
    const utAvg = -uAvg * ny + vAvg * nx;

    const unL = L.u * nx + L.v * ny;
    const unR = R.u * nx + R.v * ny;
    const utL = -L.u * ny + L.v * nx;
    const utR = -R.u * ny + R.v * nx;

    const drho = R.rho - L.rho;
    const dp   = R.p - L.p;
    const dun  = unR - unL;
    const dut  = utR - utL;

    // Wave strengths
    const a2 = drho - dp / c2;
    const a3 = rhoAvg * dut;
    const a1 = (dp - rhoAvg * cAvg * dun) / (2.0 * c2);
    const a4 = (dp + rhoAvg * cAvg * dun) / (2.0 * c2);

    // Eigenvalues with entropy fix
    const eps = 0.1 * cAvg;
    const l1 = entropyFix(unAvg - cAvg, eps);
    const l2 = entropyFix(unAvg, eps);
    const l3 = l2;
    const l4 = entropyFix(unAvg + cAvg, eps);

    // Dissipation: Σ |λ_k| α_k r_k
    const d0 = l1 * a1 + l2 * a2 + l4 * a4;
    const d1 = l1 * a1 * (uAvg - cAvg * nx)
             + l2 * a2 * uAvg
             + l3 * a3 * (-ny)
             + l4 * a4 * (uAvg + cAvg * nx);
    const d2 = l1 * a1 * (vAvg - cAvg * ny)
             + l2 * a2 * vAvg
             + l3 * a3 * nx
             + l4 * a4 * (vAvg + cAvg * ny);
    const d3 = l1 * a1 * (HAvg - unAvg * cAvg)
             + l2 * a2 * (0.5 * q2)
             + l3 * a3 * utAvg
             + l4 * a4 * (HAvg + unAvg * cAvg);

    fOut[0] = 0.5 * (fL[0] + fR[0] - d0);
    fOut[1] = 0.5 * (fL[1] + fR[1] - d1);
    fOut[2] = 0.5 * (fL[2] + fR[2] - d2);
    fOut[3] = 0.5 * (fL[3] + fR[3] - d3);
  }

  Flux.registry.roe = roe;
})(window.AFL);
