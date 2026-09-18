/**
 * Sparse CSR matrix + conjugate gradient solver for FEM.
 */
const Linalg = (() => {
  function SparseCSR(n) {
    this.n = n;
    this.diag = new Float64Array(n);
    this.rows = Array.from({ length: n }, () => new Map());
  }

  SparseCSR.prototype.set = function (i, j, v) {
    if (i === j) {
      this.diag[i] = v;
      return;
    }
    if (Math.abs(v) < 1e-30) return;
    this.rows[i].set(j, v);
  };

  SparseCSR.prototype.add = function (i, j, v) {
    if (Math.abs(v) < 1e-30) return;
    if (i === j) {
      this.diag[i] += v;
      return;
    }
    const row = this.rows[i];
    row.set(j, (row.get(j) || 0) + v);
  };

  SparseCSR.prototype.mulVec = function (x, y) {
    const n = this.n;
    for (let i = 0; i < n; i++) {
      let s = this.diag[i] * x[i];
      for (const [j, a] of this.rows[i]) s += a * x[j];
      y[i] = s;
    }
  };

  function dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  function axpy(y, a, x) {
    for (let i = 0; i < y.length; i++) y[i] += a * x[i];
  }

  function scale(y, a) {
    for (let i = 0; i < y.length; i++) y[i] *= a;
  }

  function copy(src, dst) {
    dst.set(src);
  }

  /**
   * Jacobi-preconditioned CG. Returns iterations used.
   */
  function cg(A, b, x, opts = {}) {
    const n = A.n;
    const maxIter = opts.maxIter ?? Math.min(4 * n, 8000);
    const tol = opts.tol ?? 1e-8;
    const invD = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const d = A.diag[i];
      invD[i] = Math.abs(d) > 1e-30 ? 1 / d : 1;
    }

    const r = new Float64Array(n);
    const z = new Float64Array(n);
    const p = new Float64Array(n);
    const Ap = new Float64Array(n);

    A.mulVec(x, Ap);
    for (let i = 0; i < n; i++) r[i] = b[i] - Ap[i];
    for (let i = 0; i < n; i++) z[i] = invD[i] * r[i];
    copy(z, p);

    let rz = dot(r, z);
    const bNorm = Math.sqrt(dot(b, b)) || 1;
    let iter = 0;

    for (; iter < maxIter; iter++) {
      A.mulVec(p, Ap);
      const pAp = dot(p, Ap);
      if (Math.abs(pAp) < 1e-30) break;
      const alpha = rz / pAp;
      axpy(x, alpha, p);
      axpy(r, -alpha, Ap);

      const rNorm = Math.sqrt(dot(r, r));
      if (rNorm / bNorm < tol) {
        iter++;
        break;
      }

      for (let i = 0; i < n; i++) z[i] = invD[i] * r[i];
      const rzNew = dot(r, z);
      const beta = rzNew / (rz || 1e-30);
      for (let i = 0; i < n; i++) p[i] = z[i] + beta * p[i];
      rz = rzNew;
    }

    return iter;
  }

  return { SparseCSR, cg, dot };
})();
