(function (NS) {
  'use strict';

  // MUSCL linear reconstruction with slope limiters.
  // Operates on primitive variables (ρ, u, v, p) for numerical stability.
  // Reference: van Leer (1979), MUSCL approach for 2-D Euler equations.

  NS.Recon = NS.Recon || {};

  const EPS = 1e-12;

  // ── Limiter functions φ(a, b) → limited slope ─────────────────────────────

  function minmod(a, b) {
    if (a * b <= 0) return 0;
    return Math.abs(a) <= Math.abs(b) ? a : b;
  }

  function vanleer(a, b) {
    const ab = a * b;
    if (ab <= 0) return 0;
    return 2.0 * ab / (a + b);
  }

  function superbee(a, b) {
    if (a * b <= 0) return 0;
    const sign = a > 0 ? 1 : -1;
    const s1 = sign * Math.min(Math.abs(a), 2.0 * Math.abs(b));
    const s2 = sign * Math.min(2.0 * Math.abs(a), Math.abs(b));
    return Math.abs(s1) > Math.abs(s2) ? s1 : s2;
  }

  NS.Recon.limiters = { minmod, vanleer, superbee };

  // ── Primitive extraction ───────────────────────────────────────────────────

  function primsAt(ext, idx, gamma) {
    const rho  = Math.max(ext.rho[idx], EPS);
    const irho = 1.0 / rho;
    const u    = ext.rhou[idx] * irho;
    const v    = ext.rhov[idx] * irho;
    const E    = ext.E[idx];
    const p    = Math.max((gamma - 1.0) * (E - 0.5 * rho * (u * u + v * v)), EPS);
    const c    = Math.sqrt(gamma * p * irho);
    return { rho, u, v, p, E, c, H: (E + p) * irho };
  }

  // Rebuild full prim state from limited (ρ, u, v, p).
  function primToFull(rho, u, v, p, gamma) {
    rho = Math.max(rho, EPS);
    p   = Math.max(p,   EPS);
    const E = p / (gamma - 1.0) + 0.5 * rho * (u * u + v * v);
    const c = Math.sqrt(gamma * p / rho);
    return { rho, u, v, p, E, c, H: (E + p) / rho };
  }

  // ── Face reconstruction ────────────────────────────────────────────────────
  //
  // Stencil: LL | L | R | RR   (idxLL or idxRR = -1 → boundary, slope = 0)
  //
  // Returns [L_face, R_face] as full prim objects compatible with flux solvers.

  NS.Recon.reconstructFace = function (ext, idxLL, idxL, idxR, idxRR, gamma, limiterFn) {
    const L = primsAt(ext, idxL, gamma);
    const R = primsAt(ext, idxR, gamma);

    const rhoLL = idxLL >= 0 ? Math.max(ext.rho[idxLL], EPS) : L.rho;
    const uLL   = idxLL >= 0 ? ext.rhou[idxLL] / rhoLL : L.u;
    const vLL   = idxLL >= 0 ? ext.rhov[idxLL] / rhoLL : L.v;
    const pLL   = idxLL >= 0 ? Math.max((gamma - 1.0) * (ext.E[idxLL] - 0.5 * rhoLL * (uLL * uLL + vLL * vLL)), EPS) : L.p;

    const rhoRR = idxRR >= 0 ? Math.max(ext.rho[idxRR], EPS) : R.rho;
    const uRR   = idxRR >= 0 ? ext.rhou[idxRR] / rhoRR : R.u;
    const vRR   = idxRR >= 0 ? ext.rhov[idxRR] / rhoRR : R.v;
    const pRR   = idxRR >= 0 ? Math.max((gamma - 1.0) * (ext.E[idxRR] - 0.5 * rhoRR * (uRR * uRR + vRR * vRR)), EPS) : R.p;

    // Limited slopes for the L cell (left side of face)
    const drhoL = idxLL >= 0 ? limiterFn(L.rho - rhoLL, R.rho - L.rho) : 0;
    const duL   = idxLL >= 0 ? limiterFn(L.u   - uLL,   R.u   - L.u)   : 0;
    const dvL   = idxLL >= 0 ? limiterFn(L.v   - vLL,   R.v   - L.v)   : 0;
    const dpL   = idxLL >= 0 ? limiterFn(L.p   - pLL,   R.p   - L.p)   : 0;

    // Limited slopes for the R cell (right side of face)
    const drhoR = idxRR >= 0 ? limiterFn(R.rho - L.rho, rhoRR - R.rho) : 0;
    const duR   = idxRR >= 0 ? limiterFn(R.u   - L.u,   uRR   - R.u)   : 0;
    const dvR   = idxRR >= 0 ? limiterFn(R.v   - L.v,   vRR   - R.v)   : 0;
    const dpR   = idxRR >= 0 ? limiterFn(R.p   - L.p,   pRR   - R.p)   : 0;

    const Lface = primToFull(L.rho + 0.5 * drhoL, L.u + 0.5 * duL, L.v + 0.5 * dvL, L.p + 0.5 * dpL, gamma);
    const Rface = primToFull(R.rho - 0.5 * drhoR, R.u - 0.5 * duR, R.v - 0.5 * dvR, R.p - 0.5 * dpR, gamma);

    return [Lface, Rface];
  };

})(window.AFL);
