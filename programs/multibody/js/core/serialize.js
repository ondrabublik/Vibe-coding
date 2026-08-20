/*
 * serialize.js - ukládání a načítání modelu (JSON).
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = MBD.Model;
  var S = {};

  S.toJSON = function (model) {
    return JSON.stringify(model, null, 2);
  };

  /** Načte model z JSON a doplní chybějící položky (dopředná kompatibilita). */
  S.fromJSON = function (text) {
    var raw = JSON.parse(text);
    if (!raw || raw.format !== 'mbd-planar') throw new Error('Neznámý formát souboru.');
    var base = Model.create(raw.name);
    var m = Object.assign(base, raw);
    m.gravity = Object.assign(base.gravity, raw.gravity || {});
    m.sim = Object.assign(base.sim, raw.sim || {});
    m.bodies = raw.bodies || base.bodies;
    m.joints = raw.joints || [];
    m.loads = raw.loads || [];

    if (!Model.bodyById(m, 'ground')) m.bodies.unshift(base.bodies[0]);

    // dopočet chybějících odvozených hodnot a kontrola integrity
    m.bodies.forEach(function (b) {
      if (b.type === 'ground') return;
      if (b.vx == null) b.vx = 0;
      if (b.vy == null) b.vy = 0;
      if (b.omega == null) b.omega = 0;
      Model.refreshMass(b);
    });
    m.joints = m.joints.filter(function (j) {
      return Model.bodyById(m, j.bodyA) && Model.bodyById(m, j.bodyB);
    });
    m.loads = m.loads.filter(function (l) { return Model.bodyById(m, l.body); });

    var maxSeq = 1;
    [].concat(m.bodies, m.joints, m.loads).forEach(function (it) {
      var n = parseInt(String(it.id).replace(/^\D+/, ''), 10);
      if (isFinite(n) && n >= maxSeq) maxSeq = n + 1;
    });
    m._seq = Math.max(m._seq || 1, maxSeq);
    return m;
  };

  /** Export výsledků do CSV (oddělovač ';' kvůli českému Excelu). */
  S.resultsToCSV = function (result, keys) {
    var sigs = result.signals.filter(function (s) {
      return !keys || keys.indexOf(s.key) >= 0;
    });
    var head = ['t [s]'].concat(sigs.map(function (s) {
      return s.key + ' [' + s.unit + ']';
    }));
    var lines = [head.join(';')];
    for (var i = 0; i < result.times.length; i++) {
      var row = [num(result.times[i])];
      for (var k = 0; k < sigs.length; k++) row.push(num(sigs[k].data[i]));
      lines.push(row.join(';'));
    }
    return lines.join('\r\n');
  };

  function num(v) {
    if (v == null || !isFinite(v)) return '';
    return String(v).replace('.', ',');
  }

  MBD.Serialize = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
