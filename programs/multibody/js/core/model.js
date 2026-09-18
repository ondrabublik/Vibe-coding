/*
 * model.js - definice datového modelu mechanismu.
 *
 * Model je čistě datová struktura (serializovatelná do JSON):
 *   bodies : tělesa  - 'ground' (rám), 'rod' (tyč), 'slider' (objímka),
 *                      'disk' (rotační těleso / kotouč)
 *   joints : vazby   - 'revolute' (rotační), 'prismatic' (posuvná),
 *                      'rolling' (valivá mezi dvěma kotouči), volitelně s pohonem
 *   loads  : zatížení - 'torque', 'force', 'spring' (pružina/tlumič)
 *
 * Souřadnice tělesa: x, y = poloha těžiště, phi = otočení [rad].
 * Lokální souřadný systém tělesa má počátek v těžišti, osu x podél tyče
 * (u objímky podél její "delší" strany, u kotouče značka úhlu).
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = {};

  Model.DEFAULTS = {
    rod: { lineDensity: 2.0, width: 0.024 },
    slider: { mass: 0.4, width: 0.08, height: 0.05 },
    disk: { mass: 1.0, radius: 0.12 }
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
    if (body.type === 'disk') return 0.5 * m * body.radius * body.radius;
    return m * (body.width * body.width + body.height * body.height) / 12;
  };

  /** Poloměr kotouče (pro valivou vazbu i zásahovou oblast). */
  Model.diskRadius = function (body) {
    return body && body.type === 'disk' ? body.radius : 0;
  };

  /** Je bod uvnitř objemu tělesa (kotouč / objímka / okolí tyče)? */
  Model.containsPoint = function (body, p, tol) {
    if (!body || body.type === 'ground') return false;
    tol = tol || 0;
    if (body.type === 'disk') {
      return Math.hypot(p[0] - body.x, p[1] - body.y) <= body.radius + tol;
    }
    if (body.type === 'rod') {
      var e = Model.rodEnds(body);
      var a = Model.toGlobal(body, e[0]), b = Model.toGlobal(body, e[1]);
      var vx = b[0] - a[0], vy = b[1] - a[1];
      var wx = p[0] - a[0], wy = p[1] - a[1];
      var L2 = vx * vx + vy * vy;
      var t = L2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
      return Math.hypot(wx - t * vx, wy - t * vy) <= body.width / 2 + tol;
    }
    var l = Model.toLocal(body, p);
    return Math.abs(l[0]) <= body.width / 2 + tol && Math.abs(l[1]) <= body.height / 2 + tol;
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

  /** Rotační těleso (kotouč) se středem v p. */
  Model.addDisk = function (model, p, opts) {
    opts = opts || {};
    var d = Model.DEFAULTS.disk;
    var body = {
      id: Model.uid(model, 'b'),
      name: opts.name || ('Kotouč ' + model._seq),
      type: 'disk',
      radius: opts.radius != null ? opts.radius : d.radius,
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

  /** Rotační vazba. globalPoint = poloha čepu ve globálních souřadnicích.
   *  opts.bodies – volitelně více těles na stejném čepu (sdílená vazba). */
  Model.addRevolute = function (model, aId, bId, globalPoint, opts) {
    opts = opts || {};
    var ids = opts.bodies && opts.bodies.length >= 2 ? opts.bodies.slice() : [aId, bId];
    // unikátní zachování pořadí
    var seen = {}, uniq = [];
    ids.forEach(function (id) {
      if (!seen[id] && Model.bodyById(model, id)) { seen[id] = true; uniq.push(id); }
    });
    if (uniq.length < 2) throw new Error('Rotační vazba vyžaduje alespoň dvě tělesa.');
    var members = uniq.map(function (id) {
      return { id: id, s: Model.toLocal(Model.bodyById(model, id), globalPoint) };
    });
    var joint = {
      id: Model.uid(model, 'j'),
      name: opts.name || ('Rot. vazba ' + model._seq),
      type: 'revolute',
      bodyA: members[0].id,
      bodyB: members[1].id,
      sA: members[0].s,
      sB: members[1].s,
      members: members,
      driver: null
    };
    model.joints.push(joint);
    return joint;
  };

  /** Členové rotační vazby (zpětná kompatibilita se staršími soubory). */
  Model.revoluteMembers = function (joint) {
    if (joint.members && joint.members.length >= 2) return joint.members;
    return [
      { id: joint.bodyA, s: joint.sA },
      { id: joint.bodyB, s: joint.sB }
    ];
  };

  Model.syncRevolutePair = function (joint) {
    var m = Model.revoluteMembers(joint);
    joint.members = m;
    joint.bodyA = m[0].id;
    joint.bodyB = m[1].id;
    joint.sA = m[0].s;
    joint.sB = m[1].s;
  };

  /** Připojí další těleso ke stávajícímu čepu (sdílená rotační vazba). */
  Model.addToRevolute = function (model, joint, bodyId, globalPoint) {
    if (joint.type !== 'revolute') throw new Error('Lze připojit jen k rotační vazbě.');
    var mem = Model.revoluteMembers(joint);
    for (var i = 0; i < mem.length; i++) if (mem[i].id === bodyId) return joint;
    var B = Model.bodyById(model, bodyId);
    if (!B) throw new Error('Těleso neexistuje.');
    var p = globalPoint || Model.jointPoint(model, joint);
    mem.push({ id: bodyId, s: Model.toLocal(B, p) });
    joint.members = mem;
    Model.syncRevolutePair(joint);
    return joint;
  };

  /** Je těleso členem rotační vazby? */
  Model.revoluteHasBody = function (joint, bodyId) {
    return Model.revoluteMembers(joint).some(function (m) { return m.id === bodyId; });
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

  /**
   * Valivá vazba mezi dvěma kotouči (1 stupeň volnosti).
   * Předepisuje valení bez skluzu; vzdálenost středů musí zajistit jiná vazba
   * (typicky rotační uložení obou os).
   */
  Model.addRolling = function (model, aId, bId, opts) {
    opts = opts || {};
    var A = Model.bodyById(model, aId), B = Model.bodyById(model, bId);
    if (!A || !B || A.type !== 'disk' || B.type !== 'disk') {
      throw new Error('Valivá vazba spojuje dvě rotační tělesa (kotouče).');
    }
    var side = opts.side === 'internal' ? 'internal' : 'external';
    var rA = A.radius, rB = B.radius;
    var dx = B.x - A.x, dy = B.y - A.y;
    var theta = Math.atan2(dy, dx);
    var Rsum = side === 'internal' ? Math.abs(rA - rB) : (rA + rB);
    var sigB = side === 'internal' ? (rA >= rB ? -1 : 1) : 1;
    var sigTh = side === 'internal' ? (rA >= rB ? -1 : 1) : 1;
    var offset = rA * A.phi + sigB * rB * B.phi + sigTh * Rsum * theta;
    var joint = {
      id: Model.uid(model, 'j'),
      name: opts.name || ('Valivá ' + model._seq),
      type: 'rolling',
      bodyA: aId, bodyB: bId,
      side: side,
      sA: [0, 0],
      sB: [0, 0],
      offset: offset,
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
    if (joint.type === 'rolling') {
      return { enabled: true, kind: 'rate', rate: 5, expr: '0.5*t*t' };
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

  /**
   * Lineární pružina (volitelně s tlumením) mezi dvěma body na tělesech.
   * bodyB může být 'ground'. L0 = klidová délka (výchozí = aktuální délka).
   */
  Model.addSpring = function (model, aId, bId, globalA, globalB, opts) {
    opts = opts || {};
    var A = Model.bodyById(model, aId), B = Model.bodyById(model, bId);
    if (!A || !B) throw new Error('Pružina vyžaduje dvě existující tělesa.');
    var pA = globalA || [A.x, A.y];
    var pB = globalB || [B.x, B.y];
    var L = Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
    var load = {
      id: Model.uid(model, 'l'),
      name: opts.name || ('Pružina ' + model._seq),
      type: 'spring',
      bodyA: aId,
      bodyB: bId,
      sA: Model.toLocal(A, pA),
      sB: Model.toLocal(B, pB),
      k: opts.k != null ? opts.k : 100,
      c: opts.c != null ? opts.c : 0,
      L0: opts.L0 != null ? opts.L0 : L
    };
    model.loads.push(load);
    return load;
  };

  /**
   * Lineární tlumič (viskózní) mezi dvěma body. Síla F = c·L̇.
   */
  Model.addDamper = function (model, aId, bId, globalA, globalB, opts) {
    opts = opts || {};
    var A = Model.bodyById(model, aId), B = Model.bodyById(model, bId);
    if (!A || !B) throw new Error('Tlumič vyžaduje dvě existující tělesa.');
    var pA = globalA || [A.x, A.y];
    var pB = globalB || [B.x, B.y];
    var load = {
      id: Model.uid(model, 'l'),
      name: opts.name || ('Tlumič ' + model._seq),
      type: 'damper',
      bodyA: aId,
      bodyB: bId,
      sA: Model.toLocal(A, pA),
      sB: Model.toLocal(B, pB),
      k: 0,
      c: opts.c != null ? opts.c : 5,
      L0: 0
    };
    model.loads.push(load);
    return load;
  };

  /** Aktuální délka pružiny / tlumiče. */
  Model.springLength = function (model, load) {
    var A = Model.bodyById(model, load.bodyA), B = Model.bodyById(model, load.bodyB);
    if (!A || !B) return 0;
    var pA = Model.toGlobal(A, load.sA), pB = Model.toGlobal(B, load.sB);
    return Math.hypot(pB[0] - pA[0], pB[1] - pA[1]);
  };

  Model.isLinkLoad = function (load) {
    return load && (load.type === 'spring' || load.type === 'damper');
  };

  // --------------------------------------------------------------- odstraňování

  Model.remove = function (model, id) {
    var body = Model.bodyById(model, id);
    if (body) {
      if (body.type === 'ground') return false;
      model.bodies = model.bodies.filter(function (b) { return b.id !== id; });
      model.joints = model.joints.filter(function (j) {
        if (j.type === 'revolute') {
          var mem = Model.revoluteMembers(j).filter(function (m) { return m.id !== id; });
          if (mem.length < 2) return false;
          j.members = mem;
          Model.syncRevolutePair(j);
          return true;
        }
        return j.bodyA !== id && j.bodyB !== id;
      });
      model.loads = model.loads.filter(function (l) {
        if (Model.isLinkLoad(l)) return l.bodyA !== id && l.bodyB !== id;
        return l.body !== id;
      });
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
    if (load.type === 'spring') return null;
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
      case 'disk': return 'Rotační těleso';
      case 'revolute': return 'Rotační vazba';
      case 'prismatic': return 'Posuvná vazba';
      case 'rolling': return 'Valivá vazba';
      case 'torque': return 'Moment';
      case 'force': return 'Síla';
      case 'spring': return 'Pružina';
      case 'damper': return 'Tlumič';
      default: return item.type;
    }
  };

  /** Globální poloha bodu vazby (na tělese A); u valivé = bod kontaktu. */
  Model.jointPoint = function (model, joint) {
    if (joint.type === 'rolling') return Model.rollingContact(model, joint);
    var A = Model.bodyById(model, joint.bodyA);
    return Model.toGlobal(A, joint.sA);
  };

  /** Bod kontaktu valivé vazby (mezi středy A a B). */
  Model.rollingContact = function (model, joint) {
    var A = Model.bodyById(model, joint.bodyA);
    var B = Model.bodyById(model, joint.bodyB);
    if (!A || !B) return [0, 0];
    var dx = B.x - A.x, dy = B.y - A.y;
    var d = Math.hypot(dx, dy) || 1;
    var rA = A.radius || 0;
    if (joint.side === 'internal' && A.radius < B.radius) {
      return [B.x - (B.radius) * dx / d, B.y - (B.radius) * dy / d];
    }
    return [A.x + rA * dx / d, A.y + rA * dy / d];
  };

  Model.jointAxis = function (model, joint) {
    var A = Model.bodyById(model, joint.bodyA);
    return Model.dirToGlobal(A, joint.axisA);
  };

  MBD.Model = Model;
})(typeof globalThis !== 'undefined' ? globalThis : this);
