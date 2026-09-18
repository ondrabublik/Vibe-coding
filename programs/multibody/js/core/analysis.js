/*
 * analysis.js - úlohy polohy, rychlosti, kinematiky a rozbor stupňů volnosti.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = MBD.LA;
  var Sys = MBD.System;
  var C = MBD.Constraints;
  var An = {};

  /**
   * Úloha polohy: Newtonova metoda na Phi(q,t) = 0.
   * Korekce se počítá jako minimální posun (least-norm), takže mechanismus
   * "doskočí" do nejbližší přípustné konfigurace a redundantní vazby nevadí.
   */
  An.assemble = function (sys, q, t, opts) {
    opts = opts || {};
    var tol = opts.tol || 1e-10;
    var maxIter = opts.maxIter || 40;
    var res = Infinity, it = 0;

    if (sys.nc === 0) return { converged: true, iterations: 0, residual: 0 };

    for (it = 0; it < maxIter; it++) {
      Sys.scatter(sys, q, null);
      Sys.evaluateConstraints(sys, t);
      res = LA.normInf(sys.cvec);
      if (res < tol) break;
      var rhs = new Float64Array(sys.nc);
      for (var i = 0; i < sys.nc; i++) rhs[i] = -sys.cvec[i];
      var dq = LA.solveLeastNorm(sys.Jfull, rhs, sys.nq);
      var step = LA.normInf(dq);
      var relax = step > 0.5 ? 0.5 / step : 1;   // omezení příliš velkého kroku
      for (i = 0; i < sys.nq; i++) q[i] += relax * dq[i];
    }

    Sys.scatter(sys, q, null);
    Sys.evaluateConstraints(sys, t);
    res = LA.normInf(sys.cvec);
    return { converged: res < Math.max(tol, 1e-8), iterations: it, residual: res };
  };

  /**
   * Interaktivní kinematika: posune uchopený bod co nejblíž k cíli, vazby
   * zůstanou splněny (tvrdá podmínka). Pohony do soustavy nepatří
   * (viz System.build(..., { skipDrivers: true })).
   *
   * Řeší v každé Newtonově iteraci
   *   min  ½ dqᵀ M dq + (w/2) ||G dq − dp||²    s.t.  J dq = −Phi
   * tedy nejmenší pohyb ve smyslu kinetické energie, který splní vazby
   * a přiblíží uchopený bod k myši. Nedosažitelný cíl se promítne na
   * přípustnou varietu (křivku / plochu pohyblivosti).
   */
  An.followPoint = function (sys, q, bodyIndex, sLocal, target, opts) {
    opts = opts || {};
    var tol = opts.tol || 1e-10;
    var maxIter = opts.maxIter || 30;
    var w = opts.weight != null ? opts.weight : 1e5;
    var t = opts.t || 0;
    var nq = sys.nq;
    if (nq === 0) return { converged: true, iterations: 0, residual: 0 };

    var k = sys.dofIndex[bodyIndex];
    var G = LA.matrix(2, nq);
    var dp = new Float64Array(2);
    var it, i;

    for (it = 0; it < maxIter; it++) {
      Sys.scatter(sys, q, null);
      Sys.evaluateConstraints(sys, t);

      var P = sys.P[bodyIndex];
      var ra = C.rot(P[2], sLocal);
      var da = C.rotD(P[2], sLocal);
      dp[0] = target[0] - (P[0] + ra[0]);
      dp[1] = target[1] - (P[1] + ra[1]);
      for (i = 0; i < nq; i++) { G[0][i] = 0; G[1][i] = 0; }
      if (k >= 0) {
        G[0][k] = 1; G[0][k + 2] = da[0];
        G[1][k + 1] = 1; G[1][k + 2] = da[1];
      }

      var jointRes = sys.nc ? LA.normInf(sys.cvec) : 0;
      if (jointRes < tol && Math.hypot(dp[0], dp[1]) < Math.max(tol, 1e-8)) break;

      var dq = solveFollowKKT(sys.Mdiag, sys.Jfull, sys.cvec, G, dp, w);
      if (!dq) break;
      var step = LA.normInf(dq);
      if (step < 1e-14) break;
      var relax = step > 0.4 ? 0.4 / step : 1;
      for (i = 0; i < nq; i++) q[i] += relax * dq[i];
    }

    var polish = An.assemble(sys, q, t, { tol: 1e-12, maxIter: 10 });
    return { converged: polish.converged, iterations: it, residual: polish.residual };
  };

  /**
   * KKT soustava pro followPoint. Při singularitě (redundantní vazby)
   * se regularizuje blok Lagrangeových multiplikátorů.
   */
  function solveFollowKKT(Mdiag, J, Phi, G, dp, w) {
    var nq = Mdiag.length;
    var nc = J.length;
    var n = nq + nc;
    if (nq === 0) return new Float64Array(0);

    var A = LA.matrix(n, n);
    var b = new Float64Array(n);
    var i, j, a;

    for (i = 0; i < nq; i++) A[i][i] = Mdiag[i];

    for (a = 0; a < G.length; a++) {
      var g = G[a], dpa = dp[a];
      for (i = 0; i < nq; i++) {
        var gi = g[i];
        if (gi === 0) continue;
        b[i] += w * gi * dpa;
        for (j = 0; j < nq; j++) A[i][j] += w * gi * g[j];
      }
    }

    for (i = 0; i < nc; i++) {
      var row = J[i];
      for (j = 0; j < nq; j++) {
        var v = row[j];
        if (v === 0) continue;
        A[nq + i][j] = v;
        A[j][nq + i] = v;
      }
      b[nq + i] = -Phi[i];
    }

    var scale = Math.max(1e-30, LA.maxAbs(A));
    var sol = LA.solve(A, b);
    var regs = [1e-10, 1e-7, 1e-4];
    for (var gix = 0; gix < regs.length && sol === null; gix++) {
      var Ar = LA.cloneMatrix(A);
      for (i = 0; i < nc; i++) Ar[nq + i][nq + i] -= regs[gix] * scale;
      sol = LA.solve(Ar, b);
    }
    if (sol === null) return null;
    return sol.subarray(0, nq);
  }

  /**
   * Úloha rychlosti: najde qd splňující Phi_q*qd = nu a nejbližší k zadanému
   * qd0 (počáteční rychlosti od uživatele / z pohonů).
   */
  An.velocity = function (sys, q, qd, t) {
    if (sys.nc === 0) return qd;
    Sys.scatter(sys, q, qd);
    Sys.evaluateConstraints(sys, t);
    var rhs = new Float64Array(sys.nc);
    for (var i = 0; i < sys.nc; i++) {
      var s = 0, row = sys.Jfull[i];
      for (var k = 0; k < sys.nq; k++) s += row[k] * qd[k];
      rhs[i] = sys.nuvec[i] - s;
    }
    var dqd = LA.solveLeastNorm(sys.Jfull, rhs, sys.nq);
    for (i = 0; i < sys.nq; i++) qd[i] += dqd[i];
    return qd;
  };

  /** Korekce polohy i rychlosti (používá integrátor při driftu). */
  An.project = function (sys, q, qd, t) {
    An.assemble(sys, q, t, { tol: 1e-12, maxIter: 8 });
    An.velocity(sys, q, qd, t);
  };

  /**
   * Rozbor soustavy: počet souřadnic, vazbových rovnic, hodnost, stupně volnosti.
   * Rozlišuje vazby bez pohonu (kinematické DOF) a s pohonem.
   */
  An.dofAnalysis = function (sys, q, t) {
    Sys.scatter(sys, q, null);
    Sys.evaluateConstraints(sys, t);
    var rank = LA.rank(sys.Jfull);

    // hodnost jen "pasivních" vazeb (bez pohonů) -> pohyblivost mechanismu
    var passiveRows = [];
    for (var gi = 0; gi < sys.groups.length; gi++) {
      var g = sys.groups[gi];
      if (g.kind !== 'joint') continue;
      for (var r = g.row; r < g.row + g.size; r++) passiveRows.push(sys.Jfull[r]);
    }
    var rankPassive = LA.rank(passiveRows);

    return {
      nq: sys.nq,
      nc: sys.nc,
      rank: rank,
      redundant: sys.nc - rank,
      dof: sys.nq - rank,
      mobility: sys.nq - rankPassive,
      nDrivers: sys.groups.filter(function (g) { return g.kind === 'driver'; }).length
    };
  };

  MBD.Analysis = An;
})(typeof globalThis !== 'undefined' ? globalThis : this);
