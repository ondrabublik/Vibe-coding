/*
 * constraints.js - elementární vazbové rovnice v absolutních souřadnicích.
 *
 * Souřadnice tělesa i:  q_i = [x_i, y_i, phi_i]
 * Rotační matice:       A(phi) = [c -s; s c],  B(phi) = dA/dphi = [-s -c; c -s]
 *
 * Každá elementární vazba poskytuje:
 *   c     ... hodnota vazbové funkce  Phi(q,t)
 *   J     ... Jacobiho matice  dPhi/dq  (bloky 1x3 pro každé zúčastněné těleso)
 *   nu    ... pravá strana rychlostní rovnice   J*qd = nu   (nu = -dPhi/dt)
 *   gamma ... pravá strana zrychlovací rovnice  J*qdd = gamma
 *
 * Složené vazby (rotační, posuvná) i pohony jsou skládány z těchto primitiv:
 *   rotační vazba  = coincident
 *   posuvná vazba  = relAngle(konst) + projection(normála, 0)
 *   pohon rotační  = relAngle(f(t))
 *   pohon posuvné  = projection(osa, f(t))
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var C = {};

  function rot(phi, s) {
    var c = Math.cos(phi), sn = Math.sin(phi);
    return [c * s[0] - sn * s[1], sn * s[0] + c * s[1]];
  }
  // B(phi)*s = derivace rot(phi,s) podle phi
  function rotD(phi, s) {
    var c = Math.cos(phi), sn = Math.sin(phi);
    return [-sn * s[0] - c * s[1], c * s[0] - sn * s[1]];
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1]; }

  C.rot = rot;
  C.rotD = rotD;

  // ------------------------------------------------------- časové funkce pohonu

  C.constFunc = function (value) {
    return {
      f: function () { return value; },
      fd: function () { return 0; },
      fdd: function () { return 0; }
    };
  };

  C.rampFunc = function (offset, rate) {
    return {
      f: function (t) { return offset + rate * t; },
      fd: function () { return rate; },
      fdd: function () { return 0; }
    };
  };

  /** Obecná funkce zadaná výrazem; derivace numericky (centrální diference). */
  C.exprFunc = function (offset, fn) {
    var h = 1e-4;
    return {
      f: function (t) { return offset + fn(t); },
      fd: function (t) { return (fn(t + h) - fn(t - h)) / (2 * h); },
      fdd: function (t) { return (fn(t + h) - 2 * fn(t) + fn(t - h)) / (h * h); }
    };
  };

  // ------------------------------------------------------------------ primitiva

  /**
   * Splynutí dvou bodů (2 rovnice):
   *   Phi = r_A + A(phi_A) sA - r_B - A(phi_B) sB = 0
   */
  C.coincident = function (ia, sA, ib, sB) {
    return {
      size: 2,
      bodies: [ia, ib],
      label: 'splynutí bodů',
      evaluate: function (P, V, t, out) {
        var pa = P[ia], pb = P[ib];
        var ra = rot(pa[2], sA), rb = rot(pb[2], sB);
        var da = rotD(pa[2], sA), db = rotD(pb[2], sB);

        out.c[0] = pa[0] + ra[0] - pb[0] - rb[0];
        out.c[1] = pa[1] + ra[1] - pb[1] - rb[1];

        out.J[0][0][0] = 1; out.J[0][0][1] = 0; out.J[0][0][2] = da[0];
        out.J[0][1][0] = -1; out.J[0][1][1] = 0; out.J[0][1][2] = -db[0];
        out.J[1][0][0] = 0; out.J[1][0][1] = 1; out.J[1][0][2] = da[1];
        out.J[1][1][0] = 0; out.J[1][1][1] = -1; out.J[1][1][2] = -db[1];

        out.nu[0] = 0; out.nu[1] = 0;

        var wa = V[ia][2], wb = V[ib][2];
        out.gamma[0] = ra[0] * wa * wa - rb[0] * wb * wb;
        out.gamma[1] = ra[1] * wa * wa - rb[1] * wb * wb;
      }
    };
  };

  /**
   * Relativní úhel (1 rovnice):
   *   Phi = phi_A - phi_B - f(t) = 0
   */
  C.relAngle = function (ia, ib, fun) {
    return {
      size: 1,
      bodies: [ia, ib],
      label: 'relativní úhel',
      evaluate: function (P, V, t, out) {
        out.c[0] = P[ia][2] - P[ib][2] - fun.f(t);
        out.J[0][0][0] = 0; out.J[0][0][1] = 0; out.J[0][0][2] = 1;
        out.J[0][1][0] = 0; out.J[0][1][1] = 0; out.J[0][1][2] = -1;
        out.nu[0] = fun.fd(t);
        out.gamma[0] = fun.fdd(t);
      }
    };
  };

  /**
   * Projekce spojnice do směru u pevně spojeného s tělesem A (1 rovnice):
   *   u = A(phi_A) uA,   d = r_B + A(phi_B) sB - r_A - A(phi_A) sA
   *   Phi = u.d - f(t) = 0
   * Pro u = normála a f = 0 vznikne kolmá podmínka posuvné vazby,
   * pro u = osa a f = s(t) předepsaný posuv.
   */
  C.projection = function (ia, uA, sA, ib, sB, fun) {
    return {
      size: 1,
      bodies: [ia, ib],
      label: 'projekce',
      evaluate: function (P, V, t, out) {
        var pa = P[ia], pb = P[ib], va = V[ia], vb = V[ib];
        var u = rot(pa[2], uA);        // směr ve globálním rámu
        var ut = rotD(pa[2], uA);      // du/dphi_A
        var qa = rot(pa[2], sA), qb = rot(pb[2], sB);
        var qad = rotD(pa[2], sA), qbd = rotD(pb[2], sB);

        var d = [pb[0] + qb[0] - pa[0] - qa[0], pb[1] + qb[1] - pa[1] - qa[1]];
        var wa = va[2], wb = vb[2];
        var dd = [
          vb[0] + qbd[0] * wb - va[0] - qad[0] * wa,
          vb[1] + qbd[1] * wb - va[1] - qad[1] * wa
        ];

        out.c[0] = dot(u, d) - fun.f(t);

        out.J[0][0][0] = -u[0];
        out.J[0][0][1] = -u[1];
        out.J[0][0][2] = dot(ut, d) - dot(u, qad);
        out.J[0][1][0] = u[0];
        out.J[0][1][1] = u[1];
        out.J[0][1][2] = dot(u, qbd);

        out.nu[0] = fun.fd(t);
        out.gamma[0] = dot(u, d) * wa * wa
          - 2 * wa * dot(ut, dd)
          + dot(u, qb) * wb * wb
          - dot(u, qa) * wa * wa
          + fun.fdd(t);
      }
    };
  };

  /** Připraví buffer pro výsledek vyhodnocení vazby. */
  C.makeBuffer = function (constraint) {
    var n = constraint.size, nb = constraint.bodies.length;
    var J = new Array(n);
    for (var i = 0; i < n; i++) {
      J[i] = new Array(nb);
      for (var k = 0; k < nb; k++) J[i][k] = new Float64Array(3);
    }
    return {
      c: new Float64Array(n),
      nu: new Float64Array(n),
      gamma: new Float64Array(n),
      J: J
    };
  };

  MBD.Constraints = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
