/*
 * system.js - převod modelu na soustavu rovnic.
 *
 * Rám (ground) nemá stupně volnosti - jeho souřadnice se do vektoru q
 * nezařazují a příslušné bloky Jacobiho matice se zahazují.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = MBD.LA;
  var Model = MBD.Model;
  var C = MBD.Constraints;
  var Sys = {};

  /**
   * Sestaví výpočetní soustavu z modelu.
   * Pohony a offsety se "zamrazí" podle aktuální polohy modelu.
   * opts.skipDrivers – vynechá pohony (interaktivní kinematika).
   */
  Sys.build = function (model, opts) {
    opts = opts || {};
    var skipDrivers = !!opts.skipDrivers;
    var bodies = model.bodies;
    var nb = bodies.length;
    var index = {};
    var dofIndex = new Int32Array(nb);
    var nq = 0;
    var i, b;

    for (i = 0; i < nb; i++) {
      b = bodies[i];
      index[b.id] = i;
      if (b.type === 'ground') {
        dofIndex[i] = -1;
      } else {
        dofIndex[i] = nq;
        nq += 3;
      }
    }

    var Mdiag = new Float64Array(nq);
    var freeBodies = [];
    var warnings = [];
    for (i = 0; i < nb; i++) {
      b = bodies[i];
      if (dofIndex[i] < 0) continue;
      var m = Model.massOf(b), J = Model.inertiaOf(b);
      if (!(m > 0)) { m = 1e-6; warnings.push('Těleso "' + b.name + '" má nulovou hmotnost.'); }
      if (!(J > 0)) { J = 1e-9; warnings.push('Těleso "' + b.name + '" má nulový moment inercie.'); }
      Mdiag[dofIndex[i]] = m;
      Mdiag[dofIndex[i] + 1] = m;
      Mdiag[dofIndex[i] + 2] = J;
      freeBodies.push(i);
    }

    // Elementární vazby seskupené podle zdroje (vazba / pohon) kvůli reakcím.
    var constraints = [];
    var rowOf = [];
    var groups = [];
    var nc = 0;

    function addGroup(kind, joint, ia, ib, list) {
      var g = {
        kind: kind,                 // 'joint' | 'driver'
        jointId: joint.id,
        joint: joint,
        name: joint.name,
        type: joint.type,
        bodyAIndex: ia,
        bodyBIndex: ib,
        row: nc,
        size: 0,
        first: constraints.length,
        count: list.length
      };
      for (var k = 0; k < list.length; k++) {
        constraints.push(list[k]);
        rowOf.push(nc);
        g.size += list[k].size;
        nc += list[k].size;
      }
      groups.push(g);
      return g;
    }

    for (var jj = 0; jj < model.joints.length; jj++) {
      var joint = model.joints[jj];
      var ia = index[joint.bodyA], ib = index[joint.bodyB];
      if (ia == null || ib == null) {
        warnings.push('Vazba "' + joint.name + '" odkazuje na neexistující těleso.');
        continue;
      }
      if (ia === ib) {
        warnings.push('Vazba "' + joint.name + '" spojuje těleso se sebou samým.');
        continue;
      }
      if (dofIndex[ia] < 0 && dofIndex[ib] < 0) {
        warnings.push('Vazba "' + joint.name + '" spojuje dvě části rámu - nemá vliv.');
        continue;
      }

      var A = bodies[ia], B = bodies[ib];

      if (joint.type === 'revolute') {
        addGroup('joint', joint, ia, ib, [C.coincident(ia, joint.sA, ib, joint.sB)]);
        if (!skipDrivers && joint.driver && joint.driver.enabled) {
          // Phi = phi_A - phi_B - f(t); záporné znaménko rychlosti zajistí, že
          // kladná hodnota pohonu = otáčení tělesa B proti směru hod. ručiček.
          addGroup('driver', joint, ia, ib, [
            C.relAngle(ia, ib, driverFunc(joint.driver, A.phi - B.phi, -1))
          ]);
        }
      } else if (joint.type === 'prismatic') {
        var ax = joint.axisA;
        var nrm = [-ax[1], ax[0]];
        addGroup('joint', joint, ia, ib, [
          C.relAngle(ia, ib, C.constFunc(joint.angleOffset)),
          C.projection(ia, nrm, joint.sA, ib, joint.sB, C.constFunc(0))
        ]);
        if (!skipDrivers && joint.driver && joint.driver.enabled) {
          // kladná hodnota pohonu = posuv tělesa B ve směru osy
          addGroup('driver', joint, ia, ib, [
            C.projection(ia, ax, joint.sA, ib, joint.sB,
              driverFunc(joint.driver, currentSlide(A, B, joint), 1))
          ]);
        }
      } else {
        warnings.push('Neznámý typ vazby: ' + joint.type);
      }
    }

    // zatížení
    var loads = [];
    for (var li = 0; li < model.loads.length; li++) {
      var load = model.loads[li];
      var lb = index[load.body];
      if (lb == null || dofIndex[lb] < 0) {
        if (lb == null) warnings.push('Zatížení "' + load.name + '" odkazuje na neexistující těleso.');
        else warnings.push('Zatížení "' + load.name + '" působí na rám - nemá vliv.');
        continue;
      }
      loads.push({ load: load, bodyIndex: lb });
    }

    var buffers = constraints.map(C.makeBuffer);

    var sys = {
      model: model,
      bodies: bodies,
      index: index,
      dofIndex: dofIndex,
      freeBodies: freeBodies,
      nq: nq,
      nc: nc,
      Mdiag: Mdiag,
      constraints: constraints,
      buffers: buffers,
      rowOf: rowOf,
      groups: groups,
      loads: loads,
      warnings: warnings,
      // pracovní pole (poloha/rychlost všech těles včetně rámu)
      P: null, V: null,
      Jfull: LA.matrix(nc, nq),
      cvec: new Float64Array(nc),
      nuvec: new Float64Array(nc),
      gammavec: new Float64Array(nc)
    };

    sys.P = new Array(nb);
    sys.V = new Array(nb);
    for (i = 0; i < nb; i++) {
      sys.P[i] = new Float64Array(3);
      sys.V[i] = new Float64Array(3);
    }
    Sys.resetGroundState(sys);
    return sys;
  };

  function driverFunc(driver, offset, sign) {
    if (driver.kind === 'expr') {
      var fn = Model.compileExpr(driver.expr);
      return C.exprFunc(offset, function (t) { return sign * fn(t); });
    }
    return C.rampFunc(offset, sign * driver.rate);
  }

  /** Aktuální hodnota posuvu v posuvné vazbě (projekce spojnice na osu). */
  function currentSlide(A, B, joint) {
    var pA = Model.toGlobal(A, joint.sA);
    var pB = Model.toGlobal(B, joint.sB);
    var ax = Model.dirToGlobal(A, joint.axisA);
    return (pB[0] - pA[0]) * ax[0] + (pB[1] - pA[1]) * ax[1];
  }
  Sys.currentSlide = currentSlide;

  /** Naplní stav rámu (pevná poloha, nulová rychlost). */
  Sys.resetGroundState = function (sys) {
    for (var i = 0; i < sys.bodies.length; i++) {
      if (sys.dofIndex[i] >= 0) continue;
      var b = sys.bodies[i];
      sys.P[i][0] = b.x; sys.P[i][1] = b.y; sys.P[i][2] = b.phi;
      sys.V[i][0] = 0; sys.V[i][1] = 0; sys.V[i][2] = 0;
    }
  };

  /** Vektor souřadnic q z aktuální polohy modelu. */
  Sys.stateFromModel = function (sys) {
    var q = new Float64Array(sys.nq);
    var qd = new Float64Array(sys.nq);
    for (var i = 0; i < sys.bodies.length; i++) {
      var k = sys.dofIndex[i];
      if (k < 0) continue;
      var b = sys.bodies[i];
      q[k] = b.x; q[k + 1] = b.y; q[k + 2] = b.phi;
      qd[k] = b.vx || 0; qd[k + 1] = b.vy || 0; qd[k + 2] = b.omega || 0;
    }
    return { q: q, qd: qd };
  };

  /** Zapíše souřadnice zpět do modelu (např. po sestavení mechanismu). */
  Sys.stateToModel = function (sys, q, qd) {
    for (var i = 0; i < sys.bodies.length; i++) {
      var k = sys.dofIndex[i];
      if (k < 0) continue;
      var b = sys.bodies[i];
      b.x = q[k]; b.y = q[k + 1]; b.phi = q[k + 2];
      if (qd) { b.vx = qd[k]; b.vy = qd[k + 1]; b.omega = qd[k + 2]; }
    }
  };

  /** Rozbalí q, qd do pracovních polí P, V. */
  Sys.scatter = function (sys, q, qd) {
    for (var i = 0; i < sys.bodies.length; i++) {
      var k = sys.dofIndex[i];
      if (k < 0) continue;
      var P = sys.P[i], V = sys.V[i];
      P[0] = q[k]; P[1] = q[k + 1]; P[2] = q[k + 2];
      if (qd) { V[0] = qd[k]; V[1] = qd[k + 1]; V[2] = qd[k + 2]; }
      else { V[0] = 0; V[1] = 0; V[2] = 0; }
    }
  };

  /**
   * Vyhodnotí všechny vazby: Jfull, c, nu, gamma.
   * Předpokládá naplněná pole P, V (viz scatter).
   */
  Sys.evaluateConstraints = function (sys, t) {
    var J = sys.Jfull, nq = sys.nq;
    for (var r = 0; r < sys.nc; r++) J[r].fill(0);

    var row = 0;
    for (var ci = 0; ci < sys.constraints.length; ci++) {
      var con = sys.constraints[ci];
      var buf = sys.buffers[ci];
      con.evaluate(sys.P, sys.V, t, buf);
      for (var e = 0; e < con.size; e++) {
        sys.cvec[row] = buf.c[e];
        sys.nuvec[row] = buf.nu[e];
        sys.gammavec[row] = buf.gamma[e];
        for (var k = 0; k < con.bodies.length; k++) {
          var di = sys.dofIndex[con.bodies[k]];
          if (di < 0) continue;
          var blk = buf.J[e][k];
          J[row][di] += blk[0];
          J[row][di + 1] += blk[1];
          J[row][di + 2] += blk[2];
        }
        row++;
      }
    }
    return sys;
  };

  /** Zobecněné síly Q (tíže + zatížení). */
  Sys.generalizedForces = function (sys, t, Q) {
    Q.fill(0);
    var model = sys.model;
    var i, k;

    if (model.gravity && model.gravity.enabled) {
      for (i = 0; i < sys.freeBodies.length; i++) {
        var bi = sys.freeBodies[i];
        k = sys.dofIndex[bi];
        var m = sys.Mdiag[k];
        Q[k] += m * model.gravity.gx;
        Q[k + 1] += m * model.gravity.gy;
      }
    }

    for (i = 0; i < sys.loads.length; i++) {
      var rec = sys.loads[i];
      var load = rec.load;
      k = sys.dofIndex[rec.bodyIndex];
      if (load.type === 'torque') {
        Q[k + 2] += Model.loadValue(load, t);
      } else {
        var f = Model.loadValue(load, t);
        var phi = sys.P[rec.bodyIndex][2];
        var F = (load.frame === 'body') ? C.rot(phi, f) : f;
        var s = C.rot(phi, load.point);
        Q[k] += F[0];
        Q[k + 1] += F[1];
        Q[k + 2] += s[0] * F[1] - s[1] * F[0];
      }
    }
    return Q;
  };

  MBD.System = Sys;
})(typeof globalThis !== 'undefined' ? globalThis : this);
