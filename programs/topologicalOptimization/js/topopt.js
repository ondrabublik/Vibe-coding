/**
 * SIMP topology optimization (compliance minimization under volume constraint).
 */
const TopOpt = (() => {
  const KE = FEM.elementStiffness(0.3);
  const penal = 3.0;
  const Emin = 1e-9;
  const E0 = 1.0;

  function buildFilter(nelx, nely, rmin) {
    const n = nelx * nely;
    const H = Array.from({ length: n }, () => []);
    const Hs = new Float64Array(n);

    for (let i = 0; i < nelx; i++) {
      for (let j = 0; j < nely; j++) {
        const e1 = i * nely + j;
        const iMin = Math.max(i - Math.ceil(rmin) + 1, 0);
        const iMax = Math.min(i + Math.ceil(rmin), nelx);
        const jMin = Math.max(j - Math.ceil(rmin) + 1, 0);
        const jMax = Math.min(j + Math.ceil(rmin), nely);
        for (let k = iMin; k < iMax; k++) {
          for (let l = jMin; l < jMax; l++) {
            const e2 = k * nely + l;
            const fac = rmin - Math.sqrt((i - k) * (i - k) + (j - l) * (j - l));
            if (fac > 0) {
              H[e1].push({ e: e2, w: fac });
              Hs[e1] += fac;
            }
          }
        }
      }
    }
    return { H, Hs };
  }

  function filterSensitivity(dc, x, filter) {
    const n = dc.length;
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const { e, w } of filter.H[i]) {
        s += w * x[e] * dc[e];
      }
      out[i] = s / (filter.Hs[i] * Math.max(1e-3, x[i]));
    }
    return out;
  }

  function ocUpdate(x, dc, volfrac, move = 0.2) {
    const n = x.length;
    let l1 = 0;
    let l2 = 1e9;
    const xnew = new Float64Array(n);
    const target = volfrac * n;

    while ((l2 - l1) / (l1 + l2) > 1e-3) {
      const lmid = 0.5 * (l1 + l2);
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const be = Math.sqrt(Math.max(0, -dc[i]) / lmid);
        let xi = x[i] * be;
        const lo = Math.max(0.001, x[i] - move);
        const hi = Math.min(1.0, x[i] + move);
        if (xi > hi) xi = hi;
        if (xi < lo) xi = lo;
        xnew[i] = xi;
        sum += xi;
      }
      if (sum > target) l1 = lmid;
      else l2 = lmid;
    }
    return xnew;
  }

  function meanChange(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
    return s / a.length;
  }

  /**
   * Run one optimization iteration. Mutates state.x and returns metrics.
   */
  function iterate(state) {
    const { nelx, nely, volfrac, fixed, forces, filter } = state;
    const n = nelx * nely;
    const ndof = 2 * (nelx + 1) * (nely + 1);

    const fixedSet = new Set(fixed);
    const free = [];
    const freeMap = new Int32Array(ndof);
    freeMap.fill(-1);
    for (let i = 0; i < ndof; i++) {
      if (!fixedSet.has(i)) {
        freeMap[i] = free.length;
        free.push(i);
      }
    }

    if (free.length === 0) {
      throw new Error("Všechny stupně volnosti jsou uchycené.");
    }

    const Ffull = new Float64Array(ndof);
    let hasForce = false;
    for (const f of forces) {
      Ffull[f.dof] += f.value;
      if (Math.abs(f.value) > 0) hasForce = true;
    }
    if (!hasForce) throw new Error("Není zadaná žádná síla.");
    if (fixed.length === 0) throw new Error("Není zadané žádné uchycení.");

    const Ff = new Float64Array(free.length);
    for (let i = 0; i < free.length; i++) Ff[i] = Ffull[free[i]];

    const K = FEM.assembleFree(nelx, nely, state.x, penal, KE, free, freeMap);
    const Uf = new Float64Array(free.length);
    Linalg.cg(K, Ff, Uf, { tol: 1e-6, maxIter: Math.min(2 * free.length, 5000) });

    const U = new Float64Array(ndof);
    for (let i = 0; i < free.length; i++) U[free[i]] = Uf[i];

    const dc = new Float64Array(n);
    let compliance = 0;

    for (let elx = 0; elx < nelx; elx++) {
      for (let ely = 0; ely < nely; ely++) {
        const e = ely + elx * nely;
        const ed = FEM.edof(nelx, nely, elx, ely);
        let ce = 0;
        for (let i = 0; i < 8; i++) {
          let s = 0;
          for (let j = 0; j < 8; j++) s += KE[i * 8 + j] * U[ed[j]];
          ce += U[ed[i]] * s;
        }
        const xe = state.x[e];
        compliance += (Emin + Math.pow(xe, penal) * (E0 - Emin)) * ce;
        dc[e] = -penal * Math.pow(xe, penal - 1) * (E0 - Emin) * ce;
      }
    }

    const dcFilt = filterSensitivity(dc, state.x, filter);
    const xold = state.x;
    state.x = ocUpdate(xold, dcFilt, volfrac);
    const change = meanChange(state.x, xold);
    let vol = 0;
    for (let i = 0; i < n; i++) vol += state.x[i];
    vol /= n;

    return { compliance, change, volume: vol };
  }

  function createState(nelx, nely, volfrac, rmin, fixed, forces) {
    const x = new Float64Array(nelx * nely);
    x.fill(volfrac);
    return {
      nelx,
      nely,
      volfrac,
      rmin,
      fixed: fixed.slice(),
      forces: forces.map((f) => ({ ...f })),
      filter: buildFilter(nelx, nely, rmin),
      x,
    };
  }

  return { createState, iterate, buildFilter };
})();
