// Initial sea-surface displacement for earthquake and asteroid-impact sources.
(function () {
  "use strict";
  const SW = (window.SW = window.SW || {});
  const D2R = Math.PI / 180;

  // Local east/north coordinates [m] of every cell around (lat0, lon0).
  function localCoords(mesh, lat0, lon0) {
    const R = SW.R_EARTH, N = mesh.N, pos = mesh.pos;
    const cl = Math.cos(lat0 * D2R), sl = Math.sin(lat0 * D2R), co = Math.cos(lon0 * D2R), so = Math.sin(lon0 * D2R);
    const p0 = [cl * co, cl * so, sl];
    const east = [-so, co, 0];
    const north = [-sl * co, -sl * so, cl];
    const E = new Float64Array(N), Nn = new Float64Array(N);
    for (let a = 0; a < N; a++) {
      const x = pos[3 * a], y = pos[3 * a + 1], z = pos[3 * a + 2];
      const dp = x * p0[0] + y * p0[1] + z * p0[2];
      let tx = x - dp * p0[0], ty = y - dp * p0[1], tz = z - dp * p0[2];
      const tl = Math.hypot(tx, ty, tz);
      const d = Math.atan2(tl, dp) * R;
      if (tl < 1e-15) continue;
      tx /= tl; ty /= tl; tz /= tl;
      E[a] = d * (tx * east[0] + ty * east[1] + tz * east[2]);
      Nn[a] = d * (tx * north[0] + ty * north[1] + tz * north[2]);
    }
    return { E, N: Nn };
  }

  // Volume-conserving biharmonic filter: removes the grid-scale (~2 cell)
  // content of an initial condition, which the grid cannot propagate
  // correctly and which would otherwise trail the wave as dispersive noise,
  // while longer waves are almost untouched (damping ~ k^4).
  function smoothToGrid(mesh, ocean, eta, passes) {
    const { eC1, eC2, area } = mesh;
    const lap = (f) => {
      const out = new Float64Array(f.length);
      for (let e = 0; e < mesh.E; e++) {
        const a = eC1[e], c = eC2[e];
        if (!ocean[a] || !ocean[c]) continue;
        const q = (f[c] - f[a]) * Math.min(area[a], area[c]);
        out[a] += q / area[a];
        out[c] -= q / area[c];
      }
      return out;
    };
    for (let p = 0; p < passes; p++) {
      const l2 = lap(lap(eta));
      for (let a = 0; a < eta.length; a++) eta[a] -= l2[a] / 81;
    }
    return eta;
  }

  // ---- earthquake --------------------------------------------------------
  // Rupture size for subduction interface events (Strasser et al. 2010).
  function faultScaling(Mw) {
    return {
      L: Math.pow(10, -2.477 + 0.585 * Mw),  // km
      W: Math.pow(10, -0.882 + 0.351 * Mw),  // km
    };
  }

  // Parametric thrust-fault uplift resembling the Okada solution: uplift over
  // the shallow (seaward) part of the fault, subsidence landward of it.
  // strike clockwise from north; the fault dips to the right of strike.
  function earthquake(mesh, ocean, p) {
    const mu = 4e10;
    const M0 = Math.pow(10, 1.5 * p.Mw + 9.1);
    const L = p.L * 1000, W = p.W * 1000;
    const slip = M0 / (mu * L * W);
    const dip = p.dip * D2R;
    const Wp = W * Math.cos(dip);
    const A = slip * (0.3 + 0.6 * Math.sin(dip));
    const th = p.strike * D2R;
    const { E, N } = localCoords(mesh, p.lat, p.lon);
    const eta = new Float64Array(mesh.N);
    let umax = 0, umin = 0;
    for (let a = 0; a < mesh.N; a++) {
      if (!ocean[a]) continue;
      const s = E[a] * Math.sin(th) + N[a] * Math.cos(th);          // along strike
      const x = E[a] * Math.cos(th) - N[a] * Math.sin(th) + 0.55 * Wp; // down-dip, 0 = trench
      const as = Math.abs(s) / L;
      if (as > 0.65) continue;
      const taper = as < 0.35 ? 1 : 0.5 * (1 + Math.cos((Math.PI * (as - 0.35)) / 0.3));
      const up = Math.exp(-Math.pow((x - 0.35 * Wp) / (0.3 * Wp), 2));
      const dn = Math.exp(-Math.pow((x - 1.1 * Wp) / (0.32 * Wp), 2));
      const v = A * taper * (up - 0.35 * dn);
      eta[a] = v;
      if (v > umax) umax = v;
      if (v < umin) umin = v;
    }
    smoothToGrid(mesh, ocean, eta, 2);
    return {
      eta,
      info: { M0, L: p.L, W: p.W, slip, uplift: umax, subsidence: umin },
    };
  }

  // ---- asteroid impact ---------------------------------------------------
  // Transient cavity from Schmidt-Holsapple gravity scaling for water
  // (C_D = 1.88, beta = 0.22); cavity shape after Ward & Asphaug (2000):
  // eta = D (r^2/R^2 - 1) out to r = sqrt(2) R (zero net volume).
  // Cavities smaller than the mesh are spread over ~1.5 cells keeping the
  // potential energy (D R = const).
  function impact(mesh, ocean, H, p) {
    const rhoW = 1025, g = SW.G;
    const a = p.diameter / 2;
    const v = p.velocity * 1000;
    const mass = (p.density * 4 * Math.PI * a * a * a) / 3;
    const energy = 0.5 * mass * v * v;
    const Dc = 1.88 * a * Math.cbrt((4 * Math.PI) / 3) * Math.cbrt(p.density / rhoW) * Math.pow((v * v) / (g * a), 0.22);
    const Rc = Dc / 2;
    const cell = mesh.stats.meanSpacing;
    const Reff = Math.max(Rc, 1.5 * cell);
    const cavityDepth = Dc / 3;
    const { E, N } = localCoords(mesh, p.lat, p.lon);
    // local depth at the impact point limits the cavity
    let c0 = 0, best = Infinity;
    for (let k = 0; k < mesh.N; k++) {
      const d = E[k] * E[k] + N[k] * N[k];
      if (d < best) { best = d; c0 = k; }
    }
    const localDepth = ocean[c0] ? H[c0] : 0;
    const D = Math.min(cavityDepth, localDepth) * (Rc / Reff);
    const eta = new Float64Array(mesh.N);
    const rOut = Math.SQRT2 * Reff;
    for (let k = 0; k < mesh.N; k++) {
      if (!ocean[k]) continue;
      const r = Math.hypot(E[k], N[k]);
      if (r > 1.15 * rOut) continue;
      let val = D * ((r * r) / (Reff * Reff) - 1);
      if (r > 0.85 * rOut) val *= 0.5 * (1 + Math.cos((Math.PI * (r - 0.85 * rOut)) / (0.3 * rOut)));
      eta[k] = Math.max(val, -0.95 * H[k]);
    }
    smoothToGrid(mesh, ocean, eta, 2);
    for (let k = 0; k < mesh.N; k++) if (ocean[k]) eta[k] = Math.max(eta[k], -0.95 * H[k]);
    return {
      eta,
      info: {
        energyMt: energy / 4.184e15,
        cavityDiameter: Dc,
        cavityDepth: Math.min(cavityDepth, localDepth),
        localDepth,
        effRadius: Reff,
        effDepth: D,
        smoothed: Reff > Rc,
      },
    };
  }

  const EQ_PRESETS = [
    { name: "Tóhoku 2011 (Japonsko)", lat: 38.1, lon: 143.1, Mw: 9.0, L: 500, W: 200, strike: 193, dip: 14 },
    { name: "Sumatra–Andamany 2004", lat: 7.5, lon: 93.6, Mw: 9.1, L: 1300, W: 160, strike: 335, dip: 12 },
    { name: "Valdivia 1960 (Chile)", lat: -41.0, lon: -74.6, Mw: 9.5, L: 900, W: 200, strike: 7, dip: 20 },
    { name: "Aljaška 1964", lat: 58.9, lon: -148.5, Mw: 9.2, L: 700, W: 250, strike: 240, dip: 10 },
    { name: "Maule 2010 (Chile)", lat: -36.0, lon: -73.3, Mw: 8.8, L: 450, W: 150, strike: 16, dip: 18 },
    { name: "Cascadia 1700", lat: 45.0, lon: -125.1, Mw: 9.0, L: 1000, W: 110, strike: 0, dip: 12 },
    { name: "Lisabon 1755", lat: 36.6, lon: -10.5, Mw: 8.5, L: 200, W: 80, strike: 60, dip: 40 },
    { name: "Nankai (scénář)", lat: 32.8, lon: 135.5, Mw: 8.7, L: 550, W: 150, strike: 245, dip: 12 },
  ];

  const IMPACT_PRESETS = [
    { name: "Kámen 100 m", diameter: 100, velocity: 20, density: 3000, lat: 30, lon: -40 },
    { name: "Apophis ~370 m", diameter: 370, velocity: 12.6, density: 3200, lat: 30, lon: -40 },
    { name: "Planetka 1 km", diameter: 1000, velocity: 20, density: 3000, lat: 30, lon: -40 },
    { name: "Eltanin (~2,5 mil. let) 2 km", diameter: 2000, velocity: 20, density: 3000, lat: -57.5, lon: -90.5 },
    { name: "Chicxulub-velikost 10 km (oceán)", diameter: 10000, velocity: 20, density: 3000, lat: 20, lon: -60 },
  ];

  SW.Sources = { earthquake, impact, faultScaling, EQ_PRESETS, IMPACT_PRESETS };
})();
