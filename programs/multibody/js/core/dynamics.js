/*
 * dynamics.js - pohybové rovnice a reakce ve vazbách.
 *
 * Formulace s Lagrangeovými multiplikátory (absolutní souřadnice):
 *
 *   | M   Phi_q^T | | qdd |   | Q     |
 *   | Phi_q   0   | | lam | = | gamma |
 *
 * Baumgarteho stabilizace tlumí drift vazeb:
 *   gamma* = gamma - 2*alpha*(Phi_q*qd - nu) - beta^2 * Phi
 *
 * Vazbová (reakční) zobecněná síla působící na těleso:
 *   R = -Phi_q^T * lambda
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = MBD.LA;
  var Sys = MBD.System;
  var Dyn = {};

  /**
   * Vyřeší zrychlení a multiplikátory pro daný stav.
   * opts: { alpha, beta } - Baumgarteho koeficienty (0 = bez stabilizace)
   */
  Dyn.solve = function (sys, q, qd, t, opts) {
    opts = opts || {};
    var alpha = opts.alpha || 0, beta = opts.beta || 0;

    Sys.scatter(sys, q, qd);
    Sys.evaluateConstraints(sys, t);

    var Q = sys._Q || (sys._Q = new Float64Array(sys.nq));
    Sys.generalizedForces(sys, t, Q);

    var nc = sys.nc, nq = sys.nq;
    var g = sys._gstab || (sys._gstab = new Float64Array(nc));
    var J = sys.Jfull;

    for (var i = 0; i < nc; i++) {
      var v = 0;
      if (alpha !== 0) {
        var row = J[i];
        for (var k = 0; k < nq; k++) v += row[k] * qd[k];
        v -= sys.nuvec[i];
      }
      g[i] = sys.gammavec[i] - 2 * alpha * v - beta * beta * sys.cvec[i];
    }

    var res = LA.solveAugmented(sys.Mdiag, J, Q, g);
    if (!res) return null;
    return {
      qdd: res.qdd,
      lambda: res.lambda,
      regularized: res.regularized,
      Q: Q
    };
  };

  /** Norma porušení vazeb v poloze (max). Vyžaduje předchozí evaluateConstraints. */
  Dyn.violation = function (sys) {
    return LA.normInf(sys.cvec);
  };

  /**
   * Reakce ve vazbách z multiplikátorů. Vrací pole záznamů v pořadí sys.groups:
   *   onA, onB      ... [Fx, Fy, M] - zobecněná síla, kterou vazba působí na
   *                     těleso A / B (moment k těžišti daného tělesa)
   *   Mpoint        ... reakční moment vztažený k bodu vazby (u rotační ~ 0,
   *                     u posuvné jde o skutečný vazbový moment)
   *   magnitude     ... velikost výsledné síly
   *   value         ... u pohonu hnací moment [N·m] / hnací síla [N]
   * Kladný smysl: účinek, kterým vazba (resp. pohon) působí na těleso B.
   */
  Dyn.reactions = function (sys, lambda) {
    var C = MBD.Constraints;
    var out = [];
    for (var gi = 0; gi < sys.groups.length; gi++) {
      var g = sys.groups[gi];
      var onA = new Float64Array(3), onB = new Float64Array(3);
      for (var ci = g.first; ci < g.first + g.count; ci++) {
        var con = sys.constraints[ci];
        var buf = sys.buffers[ci];
        var row0 = sys.rowOf[ci];
        for (var e = 0; e < con.size; e++) {
          var lam = lambda[row0 + e];
          if (lam === 0) continue;
          for (var k = 0; k < con.bodies.length; k++) {
            var target = (con.bodies[k] === g.bodyAIndex) ? onA : onB;
            var blk = buf.J[e][k];
            target[0] -= blk[0] * lam;
            target[1] -= blk[1] * lam;
            target[2] -= blk[2] * lam;
          }
        }
      }

      // moment k bodu vazby (bod je definován na tělese A)
      var pa = sys.P[g.bodyAIndex], pb = sys.P[g.bodyBIndex];
      var sA = g.joint.sA || [0, 0];
      var rs = C.rot(pa[2], sA);
      var px = pa[0] + rs[0], py = pa[1] + rs[1];
      var dx = px - pb[0], dy = py - pb[1];
      var Mpoint = onB[2] - (dx * onB[1] - dy * onB[0]);

      var value = 0;
      if (g.kind === 'driver') {
        var lam0 = lambda[g.row];
        value = (g.type === 'revolute') ? lam0 : -lam0;
      }

      out.push({
        jointId: g.jointId,
        kind: g.kind,
        type: g.type,
        name: g.name,
        onA: onA,
        onB: onB,
        point: [px, py],
        Mpoint: Mpoint,
        magnitude: Math.hypot(onB[0], onB[1]),
        value: value
      });
    }
    return out;
  };

  /** Kinetická energie soustavy. */
  Dyn.kineticEnergy = function (sys, qd) {
    var e = 0;
    for (var i = 0; i < sys.nq; i++) e += 0.5 * sys.Mdiag[i] * qd[i] * qd[i];
    return e;
  };

  /** Potenciální energie v tíhovém poli (vztažená k počátku). */
  Dyn.potentialEnergy = function (sys, q) {
    var gm = sys.model.gravity;
    if (!gm || !gm.enabled) return 0;
    var e = 0;
    for (var i = 0; i < sys.freeBodies.length; i++) {
      var k = sys.dofIndex[sys.freeBodies[i]];
      var m = sys.Mdiag[k];
      e -= m * (gm.gx * q[k] + gm.gy * q[k + 1]);
    }
    return e;
  };

  MBD.Dynamics = Dyn;
})(typeof globalThis !== 'undefined' ? globalThis : this);
