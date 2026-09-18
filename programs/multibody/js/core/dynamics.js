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
  var C = MBD.Constraints;
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

      // moment k bodu vazby (bod je definován na tělese A; u valivé = kontakt)
      var pa = sys.P[g.bodyAIndex], pb = sys.P[g.bodyBIndex];
      var px, py;
      if (g.type === 'rolling') {
        var dxc = pb[0] - pa[0], dyc = pb[1] - pa[1];
        var dc = Math.hypot(dxc, dyc) || 1;
        var bodyA = sys.bodies[g.bodyAIndex];
        var rA = bodyA.radius || 0;
        if (g.joint.side === 'internal' && bodyA.radius < sys.bodies[g.bodyBIndex].radius) {
          var bodyB = sys.bodies[g.bodyBIndex];
          px = pb[0] - bodyB.radius * dxc / dc;
          py = pb[1] - bodyB.radius * dyc / dc;
        } else {
          px = pa[0] + rA * dxc / dc;
          py = pa[1] + rA * dyc / dc;
        }
      } else {
        var sA = g.joint.sA || [0, 0];
        var rs = C.rot(pa[2], sA);
        px = pa[0] + rs[0];
        py = pa[1] + rs[1];
      }
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

  /** Potenciální energie v tíhovém poli (vztažená k počátku) + pružiny. */
  Dyn.potentialEnergy = function (sys, q) {
    var gm = sys.model.gravity;
    var e = 0;
    var i, k;
    if (gm && gm.enabled) {
      for (i = 0; i < sys.freeBodies.length; i++) {
        k = sys.dofIndex[sys.freeBodies[i]];
        var m = sys.Mdiag[k];
        e -= m * (gm.gx * q[k] + gm.gy * q[k + 1]);
      }
    }
    Sys.scatter(sys, q, null);
    for (i = 0; i < sys.loads.length; i++) {
      var load = sys.loads[i].load;
      if (load.type !== 'spring') continue;
      var ia = sys.loads[i].bodyIndex, ib = sys.loads[i].bodyBIndex;
      var pa = sys.P[ia], pb = sys.P[ib];
      var sa = C.rot(pa[2], load.sA || [0, 0]);
      var sb = C.rot(pb[2], load.sB || [0, 0]);
      var L = Math.hypot(pb[0] + sb[0] - pa[0] - sa[0], pb[1] + sb[1] - pa[1] - sa[1]);
      var L0 = load.L0 != null ? load.L0 : L;
      var kk = load.k != null ? load.k : 0;
      e += 0.5 * kk * (L - L0) * (L - L0);
    }
    return e;
  };

  MBD.Dynamics = Dyn;
})(typeof globalThis !== 'undefined' ? globalThis : this);
