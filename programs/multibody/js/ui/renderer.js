/*
 * renderer.js - vykreslení mechanismu do canvasu.
 *
 * Renderer je bezstavový: dostane scénu (model + volitelné polohy z animace,
 * výběr, náhled rozpracované operace) a vše nakreslí.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = MBD.Model;
  var R = {};

  var COL = {
    grid: '#1b2027',
    gridMajor: '#232b35',
    axis: '#39424f',
    rod: '#9fb6d1',
    rodFill: 'rgba(120,150,185,.28)',
    slider: '#a7c6cd',
    sliderFill: 'rgba(120,170,180,.24)',
    ground: '#7a8798',
    joint: '#e9eef5',
    prismatic: '#78d0a0',
    driver: '#7cd0a0',
    load: '#f0b350',
    sel: '#ffb23f',
    hover: '#4ea1ff',
    vel: '#4ea1ff',
    acc: '#c678dd',
    reac: '#ff6b6b',
    trace: 'rgba(78,161,255,.55)',
    text: '#c3ccd8',
    dim: '#7b879a'
  };
  R.COL = COL;

  R.draw = function (vp, scene) {
    var ctx = vp.ctx;
    var opt = scene.options || {};
    ctx.save();
    ctx.clearRect(0, 0, vp.w, vp.h);
    ctx.fillStyle = '#0f1216';
    ctx.fillRect(0, 0, vp.w, vp.h);

    if (opt.grid !== false) drawGrid(vp);
    drawAxes(vp);

    var poseOf = makePoseLookup(scene);

    if (opt.trace !== false && scene.traces) scene.traces.forEach(function (tr) { drawTrace(vp, tr); });

    scene.model.joints.forEach(function (j) {
      if (j.type === 'prismatic') drawPrismaticGuide(vp, scene, j, poseOf);
    });
    scene.model.joints.forEach(function (j) { drawGroundSymbol(vp, scene, j, poseOf); });

    scene.model.bodies.forEach(function (b) {
      if (b.type !== 'ground') drawBody(vp, scene, b, poseOf(b.id));
    });
    scene.model.joints.forEach(function (j) { drawJoint(vp, scene, j, poseOf); });
    scene.model.loads.forEach(function (l) { drawLoad(vp, scene, l, poseOf); });

    if (scene.frame) drawVectors(vp, scene, poseOf);
    if (scene.preview) drawPreview(vp, scene);

    ctx.restore();
  };

  function makePoseLookup(scene) {
    var poses = scene.poses;
    var byId = {};
    scene.model.bodies.forEach(function (b) { byId[b.id] = b; });
    return function (id) {
      if (poses && poses[id]) return poses[id];
      var b = byId[id];
      return b ? [b.x, b.y, b.phi] : [0, 0, 0];
    };
  }
  R.makePoseLookup = makePoseLookup;

  /** Pomocné těleso s polohou z animace (pro transformace bodů). */
  function posed(body, p) {
    return { x: p[0], y: p[1], phi: p[2], type: body.type, L: body.L, width: body.width, height: body.height };
  }
  R.posed = posed;

  // ---------------------------------------------------------------- primitiva

  function line(vp, a, b, color, width, dash) {
    var ctx = vp.ctx;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 1;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(vp.sx(a[0]), vp.sy(a[1]));
    ctx.lineTo(vp.sx(b[0]), vp.sy(b[1]));
    ctx.stroke();
    ctx.restore();
  }

  function circle(vp, p, rPx, stroke, fill, width) {
    var ctx = vp.ctx;
    ctx.beginPath();
    ctx.arc(vp.sx(p[0]), vp.sy(p[1]), rPx, 0, 2 * Math.PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width || 1.5; ctx.stroke(); }
  }

  function label(vp, p, text, color, dx, dy) {
    var ctx = vp.ctx;
    ctx.save();
    ctx.font = '11px "Segoe UI", sans-serif';
    ctx.fillStyle = color || COL.text;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, vp.sx(p[0]) + (dx || 8), vp.sy(p[1]) + (dy || -10));
    ctx.restore();
  }

  /** Šipka; délka je zadaná v pixelech (vektorové zobrazení). */
  function arrowPx(vp, from, dirPx, color, width, headPx) {
    var ctx = vp.ctx;
    var x0 = vp.sx(from[0]), y0 = vp.sy(from[1]);
    var x1 = x0 + dirPx[0], y1 = y0 + dirPx[1];
    var len = Math.hypot(dirPx[0], dirPx[1]);
    if (len < 1) return;
    var h = Math.min(headPx || 9, len * 0.5);
    var ux = dirPx[0] / len, uy = dirPx[1] / len;
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width || 1.6;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - h * ux + h * 0.42 * uy, y1 - h * uy - h * 0.42 * ux);
    ctx.lineTo(x1 - h * ux - h * 0.42 * uy, y1 - h * uy + h * 0.42 * ux);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  R.arrowPx = arrowPx;

  /** Kruhová šipka (moment) o daném poloměru v pixelech. */
  function momentArrow(vp, p, rPx, ccw, color) {
    var ctx = vp.ctx;
    var x = vp.sx(p[0]), y = vp.sy(p[1]);
    ctx.save();
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(x, y, rPx, ccw ? -0.35 * Math.PI : 0.35 * Math.PI, ccw ? 1.15 * Math.PI : -1.15 * Math.PI, !ccw);
    ctx.stroke();
    var a = ccw ? 1.15 * Math.PI : -1.15 * Math.PI;
    var hx = x + rPx * Math.cos(a), hy = y + rPx * Math.sin(a);
    var tx = ccw ? -Math.sin(a) : Math.sin(a), ty = ccw ? Math.cos(a) : -Math.cos(a);
    ctx.beginPath();
    ctx.moveTo(hx + 8 * tx, hy + 8 * ty);
    ctx.lineTo(hx - 4 * tx + 4 * Math.cos(a), hy - 4 * ty + 4 * Math.sin(a));
    ctx.lineTo(hx - 4 * tx - 4 * Math.cos(a), hy - 4 * ty - 4 * Math.sin(a));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // -------------------------------------------------------------------- mřížka

  function drawGrid(vp) {
    var ctx = vp.ctx;
    var step = vp.gridStep(26);
    var x0 = Math.floor(vp.wx(0) / step) * step;
    var x1 = vp.wx(vp.w);
    var y0 = Math.floor(vp.wy(vp.h) / step) * step;
    var y1 = vp.wy(0);
    ctx.save();
    ctx.lineWidth = 1;
    for (var x = x0; x <= x1; x += step) {
      var major = Math.abs(x / (step * 5) - Math.round(x / (step * 5))) < 1e-6;
      ctx.strokeStyle = major ? COL.gridMajor : COL.grid;
      var sx = Math.round(vp.sx(x)) + 0.5;
      ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, vp.h); ctx.stroke();
    }
    for (var y = y0; y <= y1; y += step) {
      var majorY = Math.abs(y / (step * 5) - Math.round(y / (step * 5))) < 1e-6;
      ctx.strokeStyle = majorY ? COL.gridMajor : COL.grid;
      var sy = Math.round(vp.sy(y)) + 0.5;
      ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(vp.w, sy); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAxes(vp) {
    var ctx = vp.ctx;
    ctx.save();
    ctx.strokeStyle = COL.axis; ctx.lineWidth = 1;
    var sy = Math.round(vp.sy(0)) + 0.5, sx = Math.round(vp.sx(0)) + 0.5;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(vp.w, sy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, vp.h); ctx.stroke();
    ctx.restore();
  }

  function drawTrace(vp, tr) {
    var ctx = vp.ctx;
    if (!tr.points || tr.points.length < 2) return;
    ctx.save();
    ctx.strokeStyle = tr.color || COL.trace;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(vp.sx(tr.points[0][0]), vp.sy(tr.points[0][1]));
    for (var i = 1; i < tr.points.length; i++) {
      ctx.lineTo(vp.sx(tr.points[i][0]), vp.sy(tr.points[i][1]));
    }
    ctx.stroke();
    ctx.restore();
  }

  // -------------------------------------------------------------------- tělesa

  function drawBody(vp, scene, body, p) {
    var ctx = vp.ctx;
    var sel = scene.selection && scene.selection.indexOf(body.id) >= 0;
    var hov = scene.hover === body.id;
    var stroke = sel ? COL.sel : (hov ? COL.hover : (body.type === 'rod' ? COL.rod : COL.slider));
    var fill = body.type === 'rod' ? COL.rodFill : COL.sliderFill;
    var pb = posed(body, p);

    if (body.type === 'rod') {
      var e = Model.rodEnds(body);
      var a = Model.toGlobal(pb, e[0]), b = Model.toGlobal(pb, e[1]);
      var wPx = Math.max(5, body.width * vp.scale);
      ctx.save();
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(vp.sx(a[0]), vp.sy(a[1]));
      ctx.lineTo(vp.sx(b[0]), vp.sy(b[1]));
      ctx.strokeStyle = fill; ctx.lineWidth = wPx; ctx.stroke();
      ctx.strokeStyle = stroke; ctx.lineWidth = sel ? 2 : 1.4; ctx.stroke();
      ctx.restore();
      var rPx = Math.max(3.5, wPx * 0.42);
      circle(vp, a, rPx, stroke, '#0f1216', sel ? 2 : 1.4);
      circle(vp, b, rPx, stroke, '#0f1216', sel ? 2 : 1.4);
    } else {
      var w = body.width / 2, h = body.height / 2;
      var pts = [[-w, -h], [w, -h], [w, h], [-w, h]].map(function (s) { return Model.toGlobal(pb, s); });
      ctx.save();
      ctx.beginPath();
      pts.forEach(function (q, i) {
        var X = vp.sx(q[0]), Y = vp.sy(q[1]);
        if (i === 0) ctx.moveTo(X, Y); else ctx.lineTo(X, Y);
      });
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = stroke; ctx.lineWidth = sel ? 2.4 : 1.6; ctx.stroke();
      ctx.restore();
      if (sel) {
        var hp = Model.toGlobal(pb, [body.width / 2 + 26 / vp.scale, 0]);
        line(vp, [p[0], p[1]], hp, COL.sel, 1, [3, 3]);
        circle(vp, hp, 4, COL.sel, '#0f1216', 1.5);
      }
    }

    drawCom(vp, [p[0], p[1]], sel);
    if (scene.showNames !== false) label(vp, [p[0], p[1]], body.name, sel ? COL.sel : COL.dim, 10, -12);
  }

  /** Značka těžiště (čtvrtky). */
  function drawCom(vp, p, sel) {
    var ctx = vp.ctx;
    var x = vp.sx(p[0]), y = vp.sy(p[1]), r = 5;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.fillStyle = '#0f1216'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, -Math.PI / 2, 0); ctx.closePath();
    ctx.fillStyle = sel ? COL.sel : '#dbe1ea'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r, Math.PI / 2, Math.PI); ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
    ctx.strokeStyle = sel ? COL.sel : '#dbe1ea'; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------------- vazby

  function jointPointGlobal(scene, joint, poseOf, which) {
    var model = scene.model;
    var id = which === 'B' ? joint.bodyB : joint.bodyA;
    var body = Model.bodyById(model, id);
    if (!body) return [0, 0];
    var p = poseOf(id);
    return Model.toGlobal(posed(body, p), which === 'B' ? joint.sB : joint.sA);
  }
  R.jointPointGlobal = jointPointGlobal;

  function jointAxisGlobal(scene, joint, poseOf) {
    var body = Model.bodyById(scene.model, joint.bodyA);
    if (!body) return [1, 0];
    var p = poseOf(joint.bodyA);
    return Model.dirToGlobal(posed(body, p), joint.axisA);
  }
  R.jointAxisGlobal = jointAxisGlobal;

  function drawJoint(vp, scene, joint, poseOf) {
    var sel = scene.selection && scene.selection.indexOf(joint.id) >= 0;
    var hov = scene.hover === joint.id;
    var col = sel ? COL.sel : (hov ? COL.hover : COL.joint);
    var p = jointPointGlobal(scene, joint, poseOf, 'A');

    if (joint.type === 'revolute') {
      circle(vp, p, 6, col, '#0f1216', sel ? 2.4 : 1.8);
      circle(vp, p, 1.6, col, col, 1);
    } else {
      // symbol posuvné vazby: dvě vodicí čáry po stranách kluzného tělesa
      var ax = jointAxisGlobal(scene, joint, poseOf);
      var c = jointPointGlobal(scene, joint, poseOf, 'B');
      var n = [-ax[1], ax[0]];
      var off = 10 / vp.scale;
      var half = 18 / vp.scale;
      for (var s = -1; s <= 1; s += 2) {
        line(vp,
          [c[0] - ax[0] * half + n[0] * off * s, c[1] - ax[1] * half + n[1] * off * s],
          [c[0] + ax[0] * half + n[0] * off * s, c[1] + ax[1] * half + n[1] * off * s],
          col, sel ? 2.6 : 2);
      }
    }

    if (joint.driver && joint.driver.enabled) {
      var rate = joint.driver.kind === 'rate' ? joint.driver.rate : 1;
      var txt;
      if (joint.type === 'revolute') {
        momentArrow(vp, p, 15, rate >= 0, COL.driver);
        txt = joint.driver.kind === 'rate'
          ? 'ω = ' + MBD.Dom.roundStr(joint.driver.rate) + ' rad/s' : 'pohon φ(t)';
      } else {
        var a2 = jointAxisGlobal(scene, joint, poseOf);
        var c2 = jointPointGlobal(scene, joint, poseOf, 'B');
        var sgn = rate >= 0 ? 1 : -1;
        arrowPx(vp, c2, [a2[0] * 26 * sgn, -a2[1] * 26 * sgn], COL.driver, 2, 9);
        txt = joint.driver.kind === 'rate'
          ? 'v = ' + MBD.Dom.roundStr(joint.driver.rate) + ' m/s' : 'pohon s(t)';
      }
      label(vp, p, txt, COL.driver, 18, 14);
    }
  }

  function drawPrismaticGuide(vp, scene, joint, poseOf) {
    var pa = jointPointGlobal(scene, joint, poseOf, 'A');
    var ax = jointAxisGlobal(scene, joint, poseOf);
    var len = Math.max(0.15, 90 / vp.scale);
    line(vp, [pa[0] - ax[0] * len, pa[1] - ax[1] * len],
      [pa[0] + ax[0] * len, pa[1] + ax[1] * len], COL.prismatic, 1, [7, 5]);
  }

  function drawGroundSymbol(vp, scene, joint, poseOf) {
    var isA = joint.bodyA === 'ground', isB = joint.bodyB === 'ground';
    if (!isA && !isB) return;
    var p = jointPointGlobal(scene, joint, poseOf, isA ? 'A' : 'B');
    var ctx = vp.ctx;
    var x = vp.sx(p[0]), y = vp.sy(p[1]);
    ctx.save();
    ctx.strokeStyle = COL.ground; ctx.lineWidth = 1.4;

    if (joint.type === 'revolute') {
      ctx.beginPath();
      ctx.moveTo(x, y); ctx.lineTo(x - 11, y + 16); ctx.lineTo(x + 11, y + 16); ctx.closePath();
      ctx.stroke();
      hatch(ctx, x - 15, y + 16, 30, 7);
    } else {
      var ax = jointAxisGlobal(scene, joint, poseOf);
      var ang = Math.atan2(-ax[1], ax[0]);
      ctx.translate(x, y); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(-34, 15); ctx.lineTo(34, 15); ctx.stroke();
      hatch(ctx, -34, 15, 68, 7);
    }
    ctx.restore();
  }

  function hatch(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y);
    ctx.stroke();
    ctx.lineWidth = 1;
    for (var i = 0; i <= w; i += 7) {
      ctx.beginPath();
      ctx.moveTo(x + i, y);
      ctx.lineTo(x + i - h, y + h);
      ctx.stroke();
    }
  }

  // ------------------------------------------------------------------ zatížení

  function drawLoad(vp, scene, load, poseOf) {
    var body = Model.bodyById(scene.model, load.body);
    if (!body) return;
    var sel = scene.selection && scene.selection.indexOf(load.id) >= 0;
    var col = sel ? COL.sel : COL.load;
    var p = poseOf(load.body);
    var pb = posed(body, p);

    if (load.type === 'torque') {
      var val = Model.loadValue(load, scene.time || 0);
      momentArrow(vp, [p[0], p[1]], 22, val >= 0, col);
      label(vp, [p[0], p[1]], 'M = ' + MBD.Dom.fmt(val, 2) + ' N·m', col, 26, -4);
    } else {
      var pt = Model.toGlobal(pb, load.point);
      var f = Model.loadValue(load, scene.time || 0);
      var F = load.frame === 'body' ? Model.dirToGlobal(pb, f) : f;
      var mag = Math.hypot(F[0], F[1]);
      var lenPx = 46;
      if (mag > 1e-9) {
        arrowPx(vp, [pt[0] - F[0] / mag * lenPx / vp.scale, pt[1] - F[1] / mag * lenPx / vp.scale],
          [F[0] / mag * lenPx, -F[1] / mag * lenPx], col, 2, 10);
      }
      circle(vp, pt, 2.5, col, col, 1);
      label(vp, pt, 'F = ' + MBD.Dom.fmt(mag, 1) + ' N', col, 8, 12);
    }
  }

  // -------------------------------------------------------------- vektory (výsledky)

  function drawVectors(vp, scene, poseOf) {
    var opt = scene.options || {};
    var f = scene.frame, res = scene.result;
    if (!f || !res) return;
    var sc = scene.scales || {};
    var sel = scene.selection || [];
    var ids = res.bodyIds;

    for (var i = 0; i < ids.length; i++) {
      var body = Model.bodyById(scene.model, ids[i]);
      if (!body || body.type === 'ground') continue;
      if (sel.length && sel.indexOf(ids[i]) < 0) continue;
      var p = [f.pose[3 * i], f.pose[3 * i + 1]];
      if (opt.vel) {
        var v = [f.vel[3 * i], f.vel[3 * i + 1]];
        drawScaled(vp, p, v, sc.vel, COL.vel, '|v| = ' + MBD.Dom.fmt(Math.hypot(v[0], v[1]), 3) + ' m/s');
      }
      if (opt.acc) {
        var a = [f.acc[3 * i], f.acc[3 * i + 1]];
        drawScaled(vp, p, a, sc.acc, COL.acc, '|a| = ' + MBD.Dom.fmt(Math.hypot(a[0], a[1]), 2) + ' m/s²');
      }
    }

    if (opt.reac && res.jointOrder) {
      for (var k = 0; k < res.jointOrder.length; k++) {
        var joint = null;
        for (var q = 0; q < scene.model.joints.length; q++) {
          if (scene.model.joints[q].id === res.jointOrder[k]) { joint = scene.model.joints[q]; break; }
        }
        if (!joint) continue;
        if (sel.length && sel.indexOf(joint.id) < 0 &&
          sel.indexOf(joint.bodyA) < 0 && sel.indexOf(joint.bodyB) < 0) continue;
        var pj = jointPointGlobal(scene, joint, poseOf, 'A');
        var F = [f.reac[3 * k], f.reac[3 * k + 1]];
        drawScaled(vp, pj, F, sc.reac, COL.reac,
          '|F| = ' + MBD.Dom.fmt(Math.hypot(F[0], F[1]), 1) + ' N');
      }
    }
  }

  function drawScaled(vp, p, v, scale, color, text) {
    var mag = Math.hypot(v[0], v[1]);
    if (!(mag > 1e-12) || !(scale > 0)) return;
    var lenPx = Math.min(110, 70 * mag / scale);
    if (lenPx < 3) return;
    arrowPx(vp, p, [v[0] / mag * lenPx, -v[1] / mag * lenPx], color, 1.8, 9);
    label(vp, [p[0] + v[0] / mag * lenPx / vp.scale, p[1] + v[1] / mag * lenPx / vp.scale],
      text, color, 6, -6);
  }

  // --------------------------------------------------------------------- náhled

  function drawPreview(vp, scene) {
    var pv = scene.preview;
    var ctx = vp.ctx;
    if (pv.type === 'rod') {
      line(vp, pv.a, pv.b, COL.hover, 2, [6, 4]);
      circle(vp, pv.a, 3, COL.hover, COL.hover, 1);
      circle(vp, pv.b, 3, COL.hover, COL.hover, 1);
      var L = Math.hypot(pv.b[0] - pv.a[0], pv.b[1] - pv.a[1]);
      label(vp, pv.b, 'L = ' + MBD.Dom.fmt(L, 3) + ' m', COL.hover, 8, -8);
    } else if (pv.type === 'axis') {
      var len = Math.max(0.1, 120 / vp.scale);
      var d = Math.hypot(pv.dir[0], pv.dir[1]) || 1;
      var u = [pv.dir[0] / d, pv.dir[1] / d];
      line(vp, [pv.a[0] - u[0] * len, pv.a[1] - u[1] * len],
        [pv.a[0] + u[0] * len, pv.a[1] + u[1] * len], COL.prismatic, 2, [7, 5]);
      var deg = Math.atan2(u[1], u[0]) * 180 / Math.PI;
      label(vp, pv.a, 'osa ' + MBD.Dom.fmt(deg, 1) + '°', COL.prismatic, 10, -10);
    } else if (pv.type === 'vector') {
      var dx = (pv.b[0] - pv.a[0]) * vp.scale, dy = -(pv.b[1] - pv.a[1]) * vp.scale;
      arrowPx(vp, pv.a, [dx, dy], COL.load, 2, 10);
      label(vp, pv.b, pv.text || '', COL.load, 8, -8);
    } else if (pv.type === 'point') {
      circle(vp, pv.a, 7, COL.hover, 'rgba(78,161,255,.2)', 1.5);
    } else if (pv.type === 'box') {
      var x0 = Math.min(vp.sx(pv.a[0]), vp.sx(pv.b[0]));
      var y0 = Math.min(vp.sy(pv.a[1]), vp.sy(pv.b[1]));
      ctx.save();
      ctx.strokeStyle = COL.hover;
      ctx.fillStyle = 'rgba(78,161,255,.08)';
      ctx.setLineDash([4, 3]);
      var w = Math.abs(vp.sx(pv.b[0]) - vp.sx(pv.a[0]));
      var h = Math.abs(vp.sy(pv.b[1]) - vp.sy(pv.a[1]));
      ctx.fillRect(x0, y0, w, h);
      ctx.strokeRect(x0, y0, w, h);
      ctx.restore();
    }
    if (pv.snap) circle(vp, pv.snap, 8, COL.hover, null, 1);
  }

  MBD.Renderer = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
