/*
 * analysis.js - úlohy polohy, rychlosti a rozbor stupňů volnosti.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = MBD.LA;
  var Sys = MBD.System;
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
