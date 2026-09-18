/*
 * linalg.js - hustá lineární algebra pro malé soustavy (desítky rovnic).
 * Matice jsou reprezentovány jako pole Float64Array (řádky).
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = {};

  LA.matrix = function (n, m) {
    var a = new Array(n);
    for (var i = 0; i < n; i++) a[i] = new Float64Array(m);
    return a;
  };

  LA.cloneMatrix = function (A) {
    var out = new Array(A.length);
    for (var i = 0; i < A.length; i++) out[i] = Float64Array.from(A[i]);
    return out;
  };

  LA.maxAbs = function (A) {
    var m = 0;
    for (var i = 0; i < A.length; i++) {
      var r = A[i];
      for (var j = 0; j < r.length; j++) {
        var v = Math.abs(r[j]);
        if (v > m) m = v;
      }
    }
    return m;
  };

  LA.normInf = function (v) {
    var m = 0;
    for (var i = 0; i < v.length; i++) {
      var a = Math.abs(v[i]);
      if (a > m) m = a;
    }
    return m;
  };

  LA.norm2 = function (v) {
    var s = 0;
    for (var i = 0; i < v.length; i++) s += v[i] * v[i];
    return Math.sqrt(s);
  };

  /**
   * Řeší A x = b Gaussovou eliminací s částečnou pivotací.
   * Vstupní matice se nemění. Vrací Float64Array nebo null (singulární).
   */
  LA.solve = function (A, b) {
    var n = A.length;
    if (n === 0) return new Float64Array(0);
    var M = LA.cloneMatrix(A);
    var x = Float64Array.from(b);
    var tol = 1e-12 * Math.max(1, LA.maxAbs(M));

    for (var k = 0; k < n; k++) {
      var p = k, best = Math.abs(M[k][k]);
      for (var i = k + 1; i < n; i++) {
        var v = Math.abs(M[i][k]);
        if (v > best) { best = v; p = i; }
      }
      if (best <= tol) return null;
      if (p !== k) {
        var tr = M[p]; M[p] = M[k]; M[k] = tr;
        var tx = x[p]; x[p] = x[k]; x[k] = tx;
      }
      var piv = M[k][k];
      for (i = k + 1; i < n; i++) {
        var f = M[i][k] / piv;
        if (f === 0) continue;
        M[i][k] = 0;
        var ri = M[i], rk = M[k];
        for (var j = k + 1; j < n; j++) ri[j] -= f * rk[j];
        x[i] -= f * x[k];
      }
    }
    for (i = n - 1; i >= 0; i--) {
      var s = x[i];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  };

  /** Numerická hodnost matice (Gaussova eliminace s pivotací). */
  LA.rank = function (A, relTol) {
    var n = A.length;
    if (n === 0) return 0;
    var m = A[0].length;
    var M = LA.cloneMatrix(A);
    var tol = (relTol || 1e-10) * Math.max(1, LA.maxAbs(M));
    var rank = 0;
    var row = 0;
    for (var col = 0; col < m && row < n; col++) {
      var p = -1, best = tol;
      for (var i = row; i < n; i++) {
        var v = Math.abs(M[i][col]);
        if (v > best) { best = v; p = i; }
      }
      if (p < 0) continue;
      var t = M[p]; M[p] = M[row]; M[row] = t;
      var piv = M[row][col];
      for (i = row + 1; i < n; i++) {
        var f = M[i][col] / piv;
        if (f === 0) continue;
        for (var j = col; j < m; j++) M[i][j] -= f * M[row][j];
      }
      row++; rank++;
    }
    return rank;
  };

  /**
   * Minimální řešení (v normě 2) přeurčené/nedourčené soustavy J dq = r:
   *   dq = J^T (J J^T + eps I)^-1 r
   * Vhodné pro korekci polohy/rychlosti i při redundantních vazbách.
   */
  LA.solveLeastNorm = function (J, r, nq) {
    var nc = J.length;
    var dq = new Float64Array(nq);
    if (nc === 0) return dq;

    var S = LA.matrix(nc, nc);
    for (var i = 0; i < nc; i++) {
      for (var j = i; j < nc; j++) {
        var s = 0, ri = J[i], rj = J[j];
        for (var k = 0; k < nq; k++) s += ri[k] * rj[k];
        S[i][j] = s; S[j][i] = s;
      }
    }
    var scale = Math.max(1e-30, LA.maxAbs(S));
    var y = null;
    var regs = [0, 1e-12, 1e-9, 1e-6, 1e-3];
    for (var g = 0; g < regs.length && y === null; g++) {
      var Sr = LA.cloneMatrix(S);
      if (regs[g] > 0) for (i = 0; i < nc; i++) Sr[i][i] += regs[g] * scale;
      y = LA.solve(Sr, r);
    }
    if (y === null) return dq;

    for (i = 0; i < nc; i++) {
      var yi = y[i];
      if (yi === 0) continue;
      var rowi = J[i];
      for (k = 0; k < nq; k++) dq[k] += rowi[k] * yi;
    }
    return dq;
  };

  /**
   * Řeší rozšířenou (augmentovanou) soustavu pohybových rovnic
   *   | M   J^T | | qdd |   | Q     |
   *   | J    0  | | lam | = | gamma |
   * M je zadaná diagonálou. Při singularitě (redundantní vazby) se použije
   * malá regularizace pravého dolního bloku - výsledné reakce jsou pak
   * jedním z možných rozdělení (upozornění řeší vyšší vrstva).
   */
  LA.solveAugmented = function (Mdiag, J, Q, gamma) {
    var nq = Mdiag.length;
    var nc = J.length;
    var n = nq + nc;
    var A = LA.matrix(n, n);
    var b = new Float64Array(n);
    var i, j;

    for (i = 0; i < nq; i++) {
      A[i][i] = Mdiag[i];
      b[i] = Q[i];
    }
    for (i = 0; i < nc; i++) {
      var row = J[i];
      for (j = 0; j < nq; j++) {
        var v = row[j];
        if (v === 0) continue;
        A[nq + i][j] = v;
        A[j][nq + i] = v;
      }
      b[nq + i] = gamma[i];
    }

    var scale = Math.max(1e-30, LA.maxAbs(A));
    var sol = LA.solve(A, b);
    var regularized = false;
    var regs = [1e-10, 1e-7, 1e-4];
    for (var g = 0; g < regs.length && sol === null; g++) {
      var Ar = LA.cloneMatrix(A);
      for (i = 0; i < nc; i++) Ar[nq + i][nq + i] -= regs[g] * scale;
      sol = LA.solve(Ar, b);
      regularized = true;
    }
    if (sol === null) return null;

    return {
      qdd: sol.subarray(0, nq),
      lambda: sol.subarray(nq),
      regularized: regularized
    };
  };

  MBD.LA = LA;
})(typeof globalThis !== 'undefined' ? globalThis : this);
