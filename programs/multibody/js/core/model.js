/*
 * model.js - definice datového modelu mechanismu.
 *
 * Model je čistě datová struktura (serializovatelná do JSON):
 *   bodies : tělesa  - 'ground' (rám), 'rod' (binární člen / tyč), 'slider' (objímka)
 *   joints : vazby   - 'revolute' (rotační), 'prismatic' (posuvná), volitelně s pohonem
 *   loads  : zatížení - 'torque' (moment), 'force' (síla)
 *
 * Souřadnice tělesa: x, y = poloha těžiště, phi = otočení [rad].
 * Lokální souřadný systém tělesa má počátek v těžišti, osu x podél tyče
 * (u objímky podél její "delší" strany).
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = {};

  Model.DEFAULTS = {
    rod: { lineDensity: 2.0, width: 0.024 },
    slider: { mass: 0.4, width: 0.08, height: 0.05 }
  };

  Model.create = function (name) {
    return {
      format: 'mbd-planar',
      version: 1,
      name: name || 'Nový model',
      gravity: { enabled: true, gx: 0, gy: -9.81 },
      bodies: [{
        id: 'ground', name: 'Rám', type: 'ground',
        x: 0, y: 0, phi: 0, vx: 0, vy: 0, omega: 0
      }],
      joints: [],
      loads: [],
      sim: {
        tEnd: 2, h: 0.002, recordEvery: 5,
        alpha: 20, beta: 20, project: true
      },
      _seq: 1
    };
  };

  Model.uid = function (model, prefix) {
    return prefix + (model._seq++);
  };

  // ---------------------------------------------------------------- vyhledávání

  Model.byId = function (model, id) {
    var i;
    for (i = 0; i < model.bodies.length; i++) if (model.bodies[i].id === id) return model.bodies[i];
    for (i = 0; i < model.joints.length; i++) if (model.joints[i].id === id) return model.joints[i];
    for (i = 0; i < model.loads.length; i++) if (model.loads[i].id === id) return model.loads[i];
    return null;
  };

  Model.bodyById = function (model, id) {
    for (var i = 0; i < model.bodies.length; i++) if (model.bodies[i].id === id) return model.bodies[i];
    return null;
  };

  Model.kindOf = function (model, id) {
    var i;
    for (i = 0; i < model.bodies.length; i++) if (model.bodies[i].id === id) return 'body';
    for (i = 0; i < model.joints.length; i++) if (model.joints[i].id === id) return 'joint';
    for (i = 0; i < model.loads.length; i++) if (model.loads[i].id === id) return 'load';
    return null;
  };

  // ------------------------------------------------------------- hmotové vlastnosti

  Model.massOf = function (body) {
    if (body.type === 'ground') return 0;
    if (body.type === 'rod' && body.autoMass !== false) return body.lineDensity * body.L;
    return body.mass;
  };

  Model.inertiaOf = function (body) {
    if (body.type === 'ground') return 0;
    if (body.autoInertia === false) return body.inertia;
    var m = Model.massOf(body);
    if (body.type === 'rod') return m * body.L * body.L / 12;
    return m * (body.width * body.width + body.height * body.height) / 12;
  };

  // ----------------------------------------------------------- transformace bod<->svět

  Model.toGlobal = function (body, s) {
    var c = Math.cos(body.phi), sn = Math.sin(body.phi);
    return [body.x + c * s[0] - sn * s[1], body.y + sn * s[0] + c * s[1]];
  };

  Model.toLocal = function (body, p) {
    var c = Math.cos(body.phi), sn = Math.sin(body.phi);
    var dx = p[0] - body.x, dy = p[1] - body.y;
    return [c * dx + sn * dy, -sn * dx + c * dy];
  };

  Model.dirToGlobal = function (body, v) {
    var c = Math.cos(body.phi), sn = Math.sin(body.phi);
    return [c * v[0] - sn * v[1], sn * v[0] + c * v[1]];
  };

  Model.dirToLocal = function (body, v) {
    var c = Math.cos(body.phi), sn = Math.sin(body.phi);
    return [c * v[0] + sn * v[1], -sn * v[0] + c * v[1]];
  };

  /** Koncové body tyče v lokálních souřadnicích. */
  Model.rodEnds = function (body) {
    return [[-body.L / 2, 0], [body.L / 2, 0]];
  };

  // -------------------------------------------------------------------- tělesa

  Model.addRod = function (model, p1, p2, opts) {
    opts = opts || {};
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var L = Math.hypot(dx, dy);
    if (L < 1e-6) { L = 0.1; dx = 0.1; dy = 0; }
    var body = {
      id: Model.uid(model, 'b'),
      name: opts.name || ('Tyč ' + model._seq),
      type: 'rod',
      L: L,
      width: opts.width != null ? opts.width : Model.DEFAULTS.rod.width,
      x: (p1[0] + p2[0]) / 2,
      y: (p1[1] + p2[1]) / 2,
      phi: Math.atan2(dy, dx),
      vx: 0, vy: 0, omega: 0,
      autoMass: opts.autoMass !== false,
      lineDensity: opts.lineDensity != null ? opts.lineDensity : Model.DEFAULTS.rod.lineDensity,
      mass: opts.mass != null ? opts.mass : Model.DEFAULTS.rod.lineDensity * L,
      autoInertia: opts.autoInertia !== false,
      inertia: 0
    };
    body.inertia = Model.inertiaOf(body);
    model.bodies.push(body);
    return body;
  };

  Model.addSlider = function (model, p, opts) {
    opts = opts || {};
    var d = Model.DEFAULTS.slider;
    var body = {
      id: Model.uid(model, 'b'),
      name: opts.name || ('Objímka ' + model._seq),
      type: 'slider',
      width: opts.width != null ? opts.width : d.width,
      height: opts.height != null ? opts.height : d.height,
      x: p[0], y: p[1],
      phi: opts.phi != null ? opts.phi : 0,
      vx: 0, vy: 0, omega: 0,
      autoMass: false,
      mass: opts.mass != null ? opts.mass : d.mass,
      autoInertia: opts.autoInertia !== false,
      inertia: 0
    };
    body.inertia = Model.inertiaOf(body);
    model.bodies.push(body);
    return body;
  };

  /** Přepočte odvozené hmotové vlastnosti (po změně geometrie/hustoty). */
  Model.refreshMass = function (body) {
    if (body.type === 'ground') return;
    if (body.autoMass !== false && body.type === 'rod') body.mass = Model.massOf(body);
    if (body.autoInertia !== false) body.inertia = Model.inertiaOf(body);
  };

  // -------------------------------------------------------------------- vazby

  /** Rotační vazba. globalPoint = poloha čepu ve globálních souřadnicích. */
  Model.addRevolute = function (model, aId, bId, globalPoint, opts) {
    opts = opts || {};
    var A = Model.bodyById(model, aId), B = Model.bodyById(model, bId);
    var joint = {
      id: Model.uid(model, 'j'),
      name: opts.name || ('Rot. vazba ' + model._seq),
      type: 'revolute',
      bodyA: aId, bodyB: bId,
      sA: Model.toLocal(A, globalPoint),
      sB: Model.toLocal(B, globalPoint),
      driver: null
    };
    model.joints.push(joint);
    return joint;
  };

  /**
   * Posuvná vazba. Těleso A je vodicí (v jeho lokálním rámu je uložena osa
   * posuvu), těleso B po ose klouže. Osa prochází těžištěm tělesa B v jeho
   * výchozí poloze - vazba je tak na začátku vždy splněna.
   */
  Model.addPrismatic = function (model, aId, bId, globalAxis, opts) {
    opts = opts || {};
    var A = Model.bodyById(model, aId), B = Model.bodyById(model, bId);
    var n = Math.hypot(globalAxis[0], globalAxis[1]) || 1;
    var axis = [globalAxis[0] / n, globalAxis[1] / n];
    var through = opts.point || [B.x, B.y];
    var joint = {
      id: Model.uid(model, 'j'),
      name: opts.name || ('Posuv. vazba ' + model._seq),
      type: 'prismatic',
      bodyA: aId, bodyB: bId,
      sA: Model.toLocal(A, through),
      sB: opts.sB ? [opts.sB[0], opts.sB[1]] : [0, 0],
      axisA: Model.dirToLocal(A, axis),
      angleOffset: A.phi - B.phi,
      driver: null
    };
    model.joints.push(joint);
    return joint;
  };

  /** Pohon vazby: rotační -> úhlová rychlost, posuvná -> rychlost posuvu. */
  Model.setDriver = function (joint, driver) {
    joint.driver = driver;
    return joint;
  };

  Model.defaultDriver = function (joint) {
    if (joint.type === 'revolute') {
      return { enabled: true, kind: 'rate', rate: 10, expr: '0.5*t*t' };
    }
    return { enabled: true, kind: 'rate', rate: 0.2, expr: '0.05*t*t' };
  };

  // ----------------------------------------------------------------- zatížení

  Model.addTorque = function (model, bodyId, value, opts) {
    opts = opts || {};
    var load = {
      id: Model.uid(model, 'l'),
      name: opts.name || ('Moment ' + model._seq),
      type: 'torque',
      body: bodyId,
      mode: opts.mode || 'const',
      value: value != null ? value : 1,
      expr: opts.expr || '10*Math.sin(2*t)'
    };
    model.loads.push(load);
    return load;
  };

  Model.addForce = function (model, bodyId, localPoint, vec, opts) {
    opts = opts || {};
    var load = {
      id: Model.uid(model, 'l'),
      name: opts.name || ('Síla ' + model._seq),
      type: 'force',
      body: bodyId,
      point: [localPoint[0], localPoint[1]],
      frame: opts.frame || 'global',
      mode: opts.mode || 'const',
      fx: vec[0], fy: vec[1],
      exprX: opts.exprX || '0',
      exprY: opts.exprY || '0'
    };
    model.loads.push(load);
    return load;
  };

  // --------------------------------------------------------------- odstraňování

  Model.remove = function (model, id) {
    var body = Model.bodyById(model, id);
    if (body) {
      if (body.type === 'ground') return false;
      model.bodies = model.bodies.filter(function (b) { return b.id !== id; });
      model.joints = model.joints.filter(function (j) { return j.bodyA !== id && j.bodyB !== id; });
      model.loads = model.loads.filter(function (l) { return l.body !== id; });
      return true;
    }
    var n0 = model.joints.length + model.loads.length;
    model.joints = model.joints.filter(function (j) { return j.id !== id; });
    model.loads = model.loads.filter(function (l) { return l.id !== id; });
    return (model.joints.length + model.loads.length) !== n0;
  };

  // ------------------------------------------------------- vyhodnocení výrazů

  var exprCache = {};

  /** Zkompiluje výraz f(t); v těle výrazu jsou dostupné funkce z Math. */
  Model.compileExpr = function (expr) {
    if (exprCache[expr]) return exprCache[expr];
    var fn;
    try {
      /* jshint evil:true */
      var raw = new Function('t', 'with (Math) { return (' + expr + '); }');
      fn = function (t) {
        var v = raw(t);
        return (typeof v === 'number' && isFinite(v)) ? v : 0;
      };
      fn(0);
    } catch (e) {
      fn = function () { return 0; };
      fn.error = e.message;
    }
    exprCache[expr] = fn;
    return fn;
  };

  /** Okamžitá hodnota zatížení (moment nebo složka síly). */
  Model.loadValue = function (load, t) {
    if (load.type === 'torque') {
      if (load.mode === 'expr') return Model.compileExpr(load.expr)(t);
      return load.value;
    }
    if (load.mode === 'expr') {
      return [Model.compileExpr(load.exprX)(t), Model.compileExpr(load.exprY)(t)];
    }
    return [load.fx, load.fy];
  };

  // ------------------------------------------------------------- pomocné výpisy

  Model.typeLabel = function (item) {
    switch (item.type) {
      case 'ground': return 'Rám';
      case 'rod': return 'Tyč';
      case 'slider': return 'Objímka';
      case 'revolute': return 'Rotační vazba';
      case 'prismatic': return 'Posuvná vazba';
      case 'torque': return 'Moment';
      case 'force': return 'Síla';
      default: return item.type;
    }
  };

  /** Globální poloha bodu vazby (na tělese A). */
  Model.jointPoint = function (model, joint) {
    var A = Model.bodyById(model, joint.bodyA);
    return Model.toGlobal(A, joint.sA);
  };

  Model.jointAxis = function (model, joint) {
    var A = Model.bodyById(model, joint.bodyA);
    return Model.dirToGlobal(A, joint.axisA);
  };

  MBD.Model = Model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
