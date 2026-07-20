(function (NS) {
  'use strict';

  const Flux = NS.Flux;

  // Harten entropy fix for a single eigenvalue
  function entFix(lambda, eps) {
    const al = Math.abs(lambda);
    return al < 2.0 * eps ? (lambda * lambda + 4.0 * eps * eps) / (4.0 * eps) : al;
  }

  // Roe approximate Riemann solver with Harten entropy fix.
  function roe(ext, idxL, idxR, nx, ny, gamma, fOut) {
    const L = Flux.prims(ext, idxL, gamma);
    const R = Flux.prims(ext, idxR, gamma);

    // Roe averages (density-weighted)
    const sqL = Math.sqrt(L.rho);
    const sqR = Math.sqrt(R.rho);
    const denom = sqL + sqR;

    const u_r = (sqL * L.u + sqR * R.u) / denom;
    const v_r = (sqL * L.v + sqR * R.v) / denom;
    const H_r = (sqL * L.H + sqR * R.H) / denom;
    const q2r = u_r * u_r + v_r * v_r;
    const c2r = (gamma - 1.0) * (H_r - 0.5 * q2r);
    const rho_r = sqL * sqR;   // geometric mean density

    if (c2r <= 0) {
      // Degenerate: use simple average flux
      const fL = Flux.physFlux(L.rho, L.u, L.v, L.E, L.p, nx, ny);
      const fR = Flux.physFlux(R.rho, R.u, R.v, R.E, R.p, nx, ny);
      fOut[0] = 0.5 * (fL[0] + fR[0]);
      fOut[1] = 0.5 * (fL[1] + fR[1]);
      fOut[2] = 0.5 * (fL[2] + fR[2]);
      fOut[3] = 0.5 * (fL[3] + fR[3]);
      return;
    }

    const c_r = Math.sqrt(c2r);
    const un_r = u_r * nx + v_r * ny;
    const ut_r = -u_r * ny + v_r * nx;

    // Eigenvalues
    const lam1 = un_r - c_r;
    const lam2 = un_r;
    const lam4 = un_r + c_r;

    // Entropy fix threshold: 5% of acoustic eigenvalue spread
    const eps = 0.05 * c_r;
    const al1 = entFix(lam1, eps);
    const al2 = entFix(lam2, eps);
    const al3 = al2;  // shear
    const al4 = entFix(lam4, eps);

    // Jump in primitive-like variables
    const dp  = R.p - L.p;
    const un_L = L.u * nx + L.v * ny;
    const un_R = R.u * nx + R.v * ny;
    const ut_L = -L.u * ny + L.v * nx;
    const ut_R = -R.u * ny + R.v * nx;
    const dun = un_R - un_L;
    const dut = ut_R - ut_L;
    const drho = R.rho - L.rho;

    // Wave strengths
    const inv_c2 = 1.0 / c2r;
    const alpha4 = (dp + rho_r * c_r * dun) / (2.0 * c2r);
    const alpha1 = (dp - rho_r * c_r * dun) / (2.0 * c2r);
    const alpha3 = rho_r * dut;
    const alpha2 = drho - dp * inv_c2;

    // Dissipation vector (eigenvectors × wave strengths × |eigenvalues|)
    const a1c4 = al4 * alpha4;
    const a1c1 = al1 * alpha1;
    const a1c2 = al2 * alpha2;
    const a1c3 = al3 * alpha3;

    const D0 = a1c4 + a1c1 + a1c2;
    const D1 = a1c4 * (u_r + c_r * nx) + a1c1 * (u_r - c_r * nx) + a1c2 * u_r + a1c3 * (-ny);
    const D2 = a1c4 * (v_r + c_r * ny) + a1c1 * (v_r - c_r * ny) + a1c2 * v_r + a1c3 * (  nx);
    const D3 = a1c4 * (H_r + c_r * un_r) + a1c1 * (H_r - c_r * un_r) + a1c2 * 0.5 * q2r + a1c3 * (-ut_r);

    // Physical fluxes
    const fL = Flux.physFlux(L.rho, L.u, L.v, L.E, L.p, nx, ny);
    const fR = Flux.physFlux(R.rho, R.u, R.v, R.E, R.p, nx, ny);

    fOut[0] = 0.5 * (fL[0] + fR[0]) - 0.5 * D0;
    fOut[1] = 0.5 * (fL[1] + fR[1]) - 0.5 * D1;
    fOut[2] = 0.5 * (fL[2] + fR[2]) - 0.5 * D2;
    fOut[3] = 0.5 * (fL[3] + fR[3]) - 0.5 * D3;
  }

  Flux.registry.roe = roe;
})(window.FVM);
