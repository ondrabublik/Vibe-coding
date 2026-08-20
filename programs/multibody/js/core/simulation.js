/*
 * simulation.js - časová integrace (RK4) a záznam výsledků.
 *
 * Běh se dá krokovat po dávkách (advance), aby neblokoval UI.
 * Výsledek obsahuje:
 *   frames  ... snímky pro animaci (polohy, rychlosti, zrychlení, reakce)
 *   signals ... časové řady pro grafy (kinematika, reakce, hnací účinky)
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var LA = MBD.LA;
  var Sys = MBD.System;
  var Dyn = MBD.Dynamics;
  var An = MBD.Analysis;
  var Sim = {};

  var RAD = 180 / Math.PI;

  // ------------------------------------------------------------------ signály

  function buildSignals(sys) {
    var sig = [];
    var groups = [];

    function add(group, key, label, unit, get) {
      sig.push({ key: group.id + '/' + key, label: label, unit: unit, group: group.id, get: get, data: [] });
      group.count++;
    }

    for (var i = 0; i < sys.freeBodies.length; i++) {
      (function (bi) {
        var b = sys.bodies[bi];
        var k = sys.dofIndex[bi];
        var group = { id: b.id, label: b.name, kind: 'body', count: 0 };
        groups.push(group);
        add(group, 'x', 'x', 'm', function (c) { return c.q[k]; });
        add(group, 'y', 'y', 'm', function (c) { return c.q[k + 1]; });
        add(group, 'phi', 'φ', '°', function (c) { return c.q[k + 2] * RAD; });
        add(group, 'vx', 'v_x', 'm/s', function (c) { return c.qd[k]; });
        add(group, 'vy', 'v_y', 'm/s', function (c) { return c.qd[k + 1]; });
        add(group, 'v', '|v|', 'm/s', function (c) { return Math.hypot(c.qd[k], c.qd[k + 1]); });
        add(group, 'omega', 'ω', 'rad/s', function (c) { return c.qd[k + 2]; });
        add(group, 'ax', 'a_x', 'm/s²', function (c) { return c.qdd[k]; });
        add(group, 'ay', 'a_y', 'm/s²', function (c) { return c.qdd[k + 1]; });
        add(group, 'a', '|a|', 'm/s²', function (c) { return Math.hypot(c.qdd[k], c.qdd[k + 1]); });
        add(group, 'alpha', 'α', 'rad/s²', function (c) { return c.qdd[k + 2]; });
      })(sys.freeBodies[i]);
    }

    for (i = 0; i < sys.groups.length; i++) {
      (function (gi) {
        var g = sys.groups[gi];
        if (g.kind === 'joint') {
          var group = { id: 'R:' + g.jointId, label: 'Reakce – ' + g.name, kind: 'reaction', count: 0 };
          groups.push(group);
          add(group, 'Fx', 'F_x', 'N', function (c) { return c.reactions[gi].onB[0]; });
          add(group, 'Fy', 'F_y', 'N', function (c) { return c.reactions[gi].onB[1]; });
          add(group, 'F', '|F|', 'N', function (c) { return c.reactions[gi].magnitude; });
          add(group, 'M', 'M (k bodu vazby)', 'N·m', function (c) { return c.reactions[gi].Mpoint; });
        } else {
          var group2 = { id: 'D:' + g.jointId, label: 'Pohon – ' + g.name, kind: 'driver', count: 0 };
          groups.push(group2);
          if (g.type === 'revolute') {
            add(group2, 'Md', 'hnací moment', 'N·m', function (c) { return c.reactions[gi].value; });
          } else {
            add(group2, 'Fd', 'hnací síla', 'N', function (c) { return c.reactions[gi].value; });
          }
        }
      })(i);
    }

    var sg = { id: 'system', label: 'Soustava', kind: 'system', count: 0 };
    groups.push(sg);
    add(sg, 'Ek', 'E_kin', 'J', function (c) { return c.ekin; });
    add(sg, 'Ep', 'E_pot', 'J', function (c) { return c.epot; });
    add(sg, 'E', 'E_celk', 'J', function (c) { return c.ekin + c.epot; });
    add(sg, 'viol', 'porušení vazeb', '-', function (c) { return c.viol; });

    return { signals: sig, groups: groups };
  }

  // ------------------------------------------------------------------ příprava

  /**
   * Připraví běh simulace: sestaví soustavu, vyřeší počáteční polohu a rychlost.
   */
  Sim.prepare = function (model, options) {
    options = options || {};
    var sim = model.sim || {};
    var sys = Sys.build(model);
    var st = Sys.stateFromModel(sys);
    var t0 = 0;

    var asm = An.assemble(sys, st.q, t0);
    An.velocity(sys, st.q, st.qd, t0);
    var dof = An.dofAnalysis(sys, st.q, t0);

    var jointGroups = [], driverGroups = [];
    for (var i = 0; i < sys.groups.length; i++) {
      if (sys.groups[i].kind === 'joint') jointGroups.push(i);
      else driverGroups.push(i);
    }

    var sigDef = buildSignals(sys);

    var run = {
      sys: sys,
      model: model,
      t: t0,
      q: st.q,
      qd: st.qd,
      h: Math.max(1e-6, sim.h || 0.002),
      tEnd: Math.max(0, sim.tEnd != null ? sim.tEnd : 2),
      recordEvery: Math.max(1, Math.round(sim.recordEvery || 5)),
      opts: {
        alpha: sim.alpha != null ? sim.alpha : 20,
        beta: sim.beta != null ? sim.beta : 20
      },
      project: sim.project !== false,
      stepIndex: 0,
      totalSteps: 0,
      done: false,
      error: null,
      assembly: asm,
      dof: dof,
      warnings: sys.warnings.slice(),
      jointGroups: jointGroups,
      driverGroups: driverGroups,
      result: {
        model: model,
        nBodies: sys.bodies.length,
        bodyIds: sys.bodies.map(function (b) { return b.id; }),
        jointOrder: jointGroups.map(function (gi) { return sys.groups[gi].jointId; }),
        driverOrder: driverGroups.map(function (gi) { return sys.groups[gi].jointId; }),
        frames: [],
        times: [],
        signals: sigDef.signals,
        signalGroups: sigDef.groups,
        dof: dof,
        warnings: sys.warnings.slice()
      },
      _buf: allocBuffers(sys.nq)
    };

    run.totalSteps = Math.max(1, Math.ceil(run.tEnd / run.h));
    if (!asm.converged) {
      run.warnings.push('Počáteční polohu se nepodařilo přesně sestavit (zbytek ' +
        asm.residual.toExponential(2) + '). Zkontrolujte geometrii vazeb.');
    }
    if (dof.redundant > 0) {
      run.warnings.push('Soustava obsahuje ' + dof.redundant +
        ' redundantních vazbových rovnic – reakce nejsou určeny jednoznačně.');
    }
    if (dof.dof < 0) {
      run.warnings.push('Soustava je přeurčená.');
    }
    run.result.warnings = run.warnings;

    record(run);
    return run;
  };

  function allocBuffers(nq) {
    return {
      k1q: new Float64Array(nq), k1v: new Float64Array(nq),
      k2q: new Float64Array(nq), k2v: new Float64Array(nq),
      k3q: new Float64Array(nq), k3v: new Float64Array(nq),
      k4q: new Float64Array(nq), k4v: new Float64Array(nq),
      tq: new Float64Array(nq), tv: new Float64Array(nq)
    };
  }

  // ------------------------------------------------------------------- záznam

  function record(run) {
    var sys = run.sys, nb = sys.bodies.length;
    var res = Dyn.solve(sys, run.q, run.qd, run.t, run.opts);
    if (!res) {
      run.error = 'Soustavu rovnic nelze vyřešit (singulární matice) v čase t = ' +
        run.t.toFixed(4) + ' s.';
      return false;
    }
    var reactions = Dyn.reactions(sys, res.lambda);
    var viol = Dyn.violation(sys);

    var pose = new Float64Array(3 * nb);
    var vel = new Float64Array(3 * nb);
    var acc = new Float64Array(3 * nb);
    for (var i = 0; i < nb; i++) {
      var k = sys.dofIndex[i];
      if (k < 0) {
        pose[3 * i] = sys.P[i][0]; pose[3 * i + 1] = sys.P[i][1]; pose[3 * i + 2] = sys.P[i][2];
      } else {
        pose[3 * i] = run.q[k]; pose[3 * i + 1] = run.q[k + 1]; pose[3 * i + 2] = run.q[k + 2];
        vel[3 * i] = run.qd[k]; vel[3 * i + 1] = run.qd[k + 1]; vel[3 * i + 2] = run.qd[k + 2];
        acc[3 * i] = res.qdd[k]; acc[3 * i + 1] = res.qdd[k + 1]; acc[3 * i + 2] = res.qdd[k + 2];
      }
    }

    var nj = run.jointGroups.length;
    var reac = new Float64Array(3 * nj);
    for (i = 0; i < nj; i++) {
      var r = reactions[run.jointGroups[i]];
      reac[3 * i] = r.onB[0]; reac[3 * i + 1] = r.onB[1]; reac[3 * i + 2] = r.Mpoint;
    }
    var nd = run.driverGroups.length;
    var drv = new Float64Array(nd);
    for (i = 0; i < nd; i++) drv[i] = reactions[run.driverGroups[i]].value;

    run.result.frames.push({ t: run.t, pose: pose, vel: vel, acc: acc, reac: reac, drv: drv });
    run.result.times.push(run.t);

    var ctx = {
      q: run.q, qd: run.qd, qdd: res.qdd, reactions: reactions,
      viol: viol, t: run.t,
      ekin: Dyn.kineticEnergy(sys, run.qd),
      epot: Dyn.potentialEnergy(sys, run.q)
    };
    var sigs = run.result.signals;
    for (i = 0; i < sigs.length; i++) sigs[i].data.push(sigs[i].get(ctx));
    return true;
  }

  // -------------------------------------------------------------------- RK4

  function accel(run, t, q, qd, outv) {
    var res = Dyn.solve(run.sys, q, qd, t, run.opts);
    if (!res) return false;
    outv.set(res.qdd);
    return true;
  }

  function rk4Step(run) {
    var b = run._buf, nq = run.sys.nq, h = run.h, t = run.t;
    var q = run.q, v = run.qd, i;

    if (!accel(run, t, q, v, b.k1v)) return false;
    b.k1q.set(v);

    for (i = 0; i < nq; i++) { b.tq[i] = q[i] + 0.5 * h * b.k1q[i]; b.tv[i] = v[i] + 0.5 * h * b.k1v[i]; }
    if (!accel(run, t + 0.5 * h, b.tq, b.tv, b.k2v)) return false;
    b.k2q.set(b.tv);

    for (i = 0; i < nq; i++) { b.tq[i] = q[i] + 0.5 * h * b.k2q[i]; b.tv[i] = v[i] + 0.5 * h * b.k2v[i]; }
    if (!accel(run, t + 0.5 * h, b.tq, b.tv, b.k3v)) return false;
    b.k3q.set(b.tv);

    for (i = 0; i < nq; i++) { b.tq[i] = q[i] + h * b.k3q[i]; b.tv[i] = v[i] + h * b.k3v[i]; }
    if (!accel(run, t + h, b.tq, b.tv, b.k4v)) return false;
    b.k4q.set(b.tv);

    for (i = 0; i < nq; i++) {
      q[i] += h / 6 * (b.k1q[i] + 2 * b.k2q[i] + 2 * b.k3q[i] + b.k4q[i]);
      v[i] += h / 6 * (b.k1v[i] + 2 * b.k2v[i] + 2 * b.k3v[i] + b.k4v[i]);
    }
    run.t = t + h;
    run.stepIndex++;
    return true;
  }

  /** Provede nejvýše maxSteps kroků. Vrací počet skutečně provedených kroků. */
  Sim.advance = function (run, maxSteps) {
    var done = 0;
    while (done < maxSteps && !run.done && !run.error) {
      if (!rk4Step(run)) {
        run.error = 'Numerické řešení selhalo v čase t = ' + run.t.toFixed(4) + ' s.';
        break;
      }
      if (!isFinite(run.q[0]) || LA.normInf(run.q) > 1e9) {
        run.error = 'Řešení divergovalo v čase t = ' + run.t.toFixed(4) + ' s. ' +
          'Zkuste menší krok integrace.';
        break;
      }
      if (run.project) {
        Sys.scatter(run.sys, run.q, run.qd);
        Sys.evaluateConstraints(run.sys, run.t);
        if (Dyn.violation(run.sys) > 1e-9) An.project(run.sys, run.q, run.qd, run.t);
      }
      done++;
      var last = run.stepIndex >= run.totalSteps;
      if (run.stepIndex % run.recordEvery === 0 || last) {
        if (!record(run)) break;
      }
      if (last) run.done = true;
    }
    if (run.error) run.done = true;
    return done;
  };

  /** Synchronní běh (testy, malé úlohy). */
  Sim.runSync = function (model) {
    var run = Sim.prepare(model);
    if (!run.error) Sim.advance(run, run.totalSteps + 1);
    return run;
  };

  /** Průběh 0..1 */
  Sim.progress = function (run) {
    return Math.min(1, run.stepIndex / run.totalSteps);
  };

  MBD.Simulation = Sim;
})(typeof globalThis !== 'undefined' ? globalThis : this);
