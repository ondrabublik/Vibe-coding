/*
 * editor.js - interaktivní modelování v canvasu.
 *
 * app (rozhraní očekávané editorem):
 *   app.model, app.vp, app.options, app.tool, app.selection
 *   app.setSelection(ids), app.render(), app.modelChanged(), app.setHint(text)
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = MBD.Model;
  var E = {};

  var SNAP_PX = 12;
  var PICK_PX = 8;

  E.HINTS = {
    select: 'Vybrat: klikněte na těleso/vazbu, tažením přesunete. Ctrl+klik = více prvků, ' +
      'koncové body vybrané tyče lze táhnout. Delete maže.',
    rod: 'Tyč: stiskněte a tažením určete délku a směr.',
    slider: 'Objímka: klikněte do místa vložení (na tyči se srovná s jejím směrem).',
    revolute: 'Rotační vazba: klikněte do místa čepu. Spojí dvě tělesa pod kurzorem, ' +
      'nebo těleso s rámem.',
    prismatic: 'Posuvná vazba: klikněte na místo, kde se stýkají vodicí těleso a objímka ' +
      '(nebo objímka a rám). Tažením lze určit směr osy.',
    torque: 'Moment: klikněte na těleso, na které má moment působit.',
    force: 'Síla: klikněte na těleso v místě působiště a tažením určete směr a velikost.'
  };

  E.create = function (app) {
    var ed = {
      app: app,
      drag: null,
      hoverId: null,
      preview: null,
      snapPoint: null,
      cursor: null
    };

    var canvas = app.vp.canvas;

    // ------------------------------------------------------------- geometrie

    function toW(ev) {
      var r = canvas.getBoundingClientRect();
      return app.vp.toWorld([ev.clientX - r.left, ev.clientY - r.top]);
    }

    function tolM() { return PICK_PX / app.vp.scale; }

    function distToSegment(p, a, b) {
      var vx = b[0] - a[0], vy = b[1] - a[1];
      var wx = p[0] - a[0], wy = p[1] - a[1];
      var L2 = vx * vx + vy * vy;
      var t = L2 > 0 ? Math.max(0, Math.min(1, (wx * vx + wy * vy) / L2)) : 0;
      return Math.hypot(wx - t * vx, wy - t * vy);
    }

    function rodEndsGlobal(b) {
      var e = Model.rodEnds(b);
      return [Model.toGlobal(b, e[0]), Model.toGlobal(b, e[1])];
    }
    ed.rodEndsGlobal = rodEndsGlobal;

    function hitBody(b, p) {
      if (b.type === 'ground') return false;
      var tol = tolM();
      if (b.type === 'rod') {
        var e = rodEndsGlobal(b);
        return distToSegment(p, e[0], e[1]) <= Math.max(b.width / 2, tol);
      }
      var l = Model.toLocal(b, p);
      return Math.abs(l[0]) <= b.width / 2 + tol && Math.abs(l[1]) <= b.height / 2 + tol;
    }

    /** Tělesa pod bodem, nejvýše nakreslené první (bez rámu). */
    function bodiesAt(p) {
      var out = [];
      for (var i = app.model.bodies.length - 1; i >= 0; i--) {
        var b = app.model.bodies[i];
        if (b.type === 'ground') continue;
        if (hitBody(b, p)) out.push(b.id);
      }
      return out;
    }
    ed.bodiesAt = bodiesAt;

    /** Výběr prvku pod kurzorem: vazby > zatížení > tělesa. */
    function pick(p) {
      var tol = tolM() * 1.6, i;
      for (i = app.model.joints.length - 1; i >= 0; i--) {
        var j = app.model.joints[i];
        var jp = Model.jointPoint(app.model, j);
        if (Math.hypot(p[0] - jp[0], p[1] - jp[1]) <= tol) return { kind: 'joint', id: j.id };
      }
      for (i = app.model.loads.length - 1; i >= 0; i--) {
        var l = app.model.loads[i];
        var b = Model.bodyById(app.model, l.body);
        if (!b) continue;
        var lp = l.type === 'force' ? Model.toGlobal(b, l.point) : [b.x, b.y];
        if (Math.hypot(p[0] - lp[0], p[1] - lp[1]) <= tol * 1.2) return { kind: 'load', id: l.id };
      }
      var list = bodiesAt(p);
      if (list.length) return { kind: 'body', id: list[0] };
      return null;
    }
    ed.pick = pick;

    /** Body, na které se přichytává (bez tělesa excludeId). */
    function snapTargets(excludeId) {
      var pts = [[0, 0]];
      app.model.bodies.forEach(function (b) {
        if (b.type === 'ground' || b.id === excludeId) return;
        pts.push([b.x, b.y]);
        if (b.type === 'rod') {
          var e = rodEndsGlobal(b);
          pts.push(e[0], e[1]);
        }
      });
      app.model.joints.forEach(function (j) {
        if (j.bodyA === excludeId || j.bodyB === excludeId) return;
        pts.push(Model.jointPoint(app.model, j));
      });
      return pts;
    }

    function snap(p, excludeId) {
      if (!app.options.snap) return { p: p, hit: null };
      var tol = SNAP_PX / app.vp.scale;
      var best = null, bestD = tol;
      snapTargets(excludeId).forEach(function (q) {
        var d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < bestD) { bestD = d; best = q; }
      });
      if (best) return { p: [best[0], best[1]], hit: best };
      var step = app.vp.gridStep(26);
      var g = [Math.round(p[0] / step) * step, Math.round(p[1] / step) * step];
      if (Math.hypot(p[0] - g[0], p[1] - g[1]) < tol) return { p: g, hit: null };
      return { p: p, hit: null };
    }
    ed.snap = snap;

    /** Přichytávání směru osy: lokální osy vodicího tělesa a násobky 15°. */
    function snapDirection(dir, guide) {
      var ang = Math.atan2(dir[1], dir[0]);
      var cands = [];
      if (guide && guide.type !== 'ground') {
        cands.push(guide.phi, guide.phi + Math.PI / 2);
      }
      for (var k = 0; k < 24; k++) cands.push(k * Math.PI / 12);
      var best = ang, bestD = 8 * Math.PI / 180;
      cands.forEach(function (c) {
        var d = Math.abs(((ang - c + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
        if (d < bestD) { bestD = d; best = c; }
      });
      return [Math.cos(best), Math.sin(best)];
    }

    // ------------------------------------------------------ tvorba vazeb

    function pairForJoint(p, preferSliderAsB) {
      var list = bodiesAt(p);
      if (list.length === 0) return null;
      if (list.length === 1) return { a: 'ground', b: list[0] };
      var b0 = Model.bodyById(app.model, list[0]);
      var b1 = Model.bodyById(app.model, list[1]);
      if (preferSliderAsB) {
        if (b0.type === 'slider' && b1.type !== 'slider') return { a: list[1], b: list[0] };
        if (b1.type === 'slider' && b0.type !== 'slider') return { a: list[0], b: list[1] };
      }
      return { a: list[1], b: list[0] };
    }

    function createRevolute(p) {
      var pair = pairForJoint(p, false);
      if (!pair) {
        app.setHint('Rotační vazba: v tomto místě není žádné těleso.', true);
        return;
      }
      var j = Model.addRevolute(app.model, pair.a, pair.b, p, {
        name: 'Rot. ' + shortName(pair.a) + '/' + shortName(pair.b)
      });
      app.modelChanged();
      app.setSelection([j.id]);
    }

    function createPrismatic(p, dir) {
      var pair = pairForJoint(p, true);
      if (!pair) {
        app.setHint('Posuvná vazba: v tomto místě není žádné těleso.', true);
        return;
      }
      var guide = Model.bodyById(app.model, pair.a);
      var axis = dir;
      if (!axis) {
        axis = guide.type === 'ground' ? [1, 0] : Model.dirToGlobal(guide, [1, 0]);
      }
      var j = Model.addPrismatic(app.model, pair.a, pair.b, axis, {
        name: 'Posuv ' + shortName(pair.a) + '/' + shortName(pair.b)
      });
      app.modelChanged();
      app.setSelection([j.id]);
    }

    function shortName(id) {
      if (id === 'ground') return 'rám';
      var b = Model.bodyById(app.model, id);
      return b ? b.name : id;
    }

    // ------------------------------------------------------------ interakce

    function onDown(ev) {
      canvas.focus();
      var mid = ev.button === 1 || (ev.button === 2) || (ev.button === 0 && ev.altKey);
      var p = toW(ev);
      if (mid) {
        ed.drag = { mode: 'pan', last: [ev.clientX, ev.clientY] };
        canvas.setPointerCapture(ev.pointerId);
        ev.preventDefault();
        return;
      }
      if (ev.button !== 0) return;
      canvas.setPointerCapture(ev.pointerId);

      var tool = app.tool;
      if (tool === 'select') return startSelect(ev, p);
      if (tool === 'rod') {
        var s = snap(p);
        ed.drag = { mode: 'rod', a: s.p };
        ed.preview = { type: 'rod', a: s.p, b: s.p };
      } else if (tool === 'slider') {
        placeSlider(snap(p).p);
      } else if (tool === 'revolute') {
        createRevolute(snap(p).p);
      } else if (tool === 'prismatic') {
        var sp = snap(p).p;
        ed.drag = { mode: 'prismatic', a: sp, moved: false };
        ed.preview = { type: 'point', a: sp };
      } else if (tool === 'torque') {
        placeTorque(p);
      } else if (tool === 'force') {
        var hit = bodiesAt(p);
        if (!hit.length) { app.setHint('Síla: klikněte na těleso.', true); return; }
        var sp2 = snap(p).p;
        ed.drag = { mode: 'force', body: hit[0], a: sp2 };
        ed.preview = { type: 'vector', a: sp2, b: sp2, text: '' };
      }
      app.render();
    }

    function startSelect(ev, p) {
      var sel = app.selection;
      var tol = tolM() * 1.8;

      // úchopy vybrané tyče / objímky
      for (var i = 0; i < sel.length; i++) {
        var b = Model.bodyById(app.model, sel[i]);
        if (!b) continue;
        if (b.type === 'rod') {
          var e = rodEndsGlobal(b);
          for (var k = 0; k < 2; k++) {
            if (Math.hypot(p[0] - e[k][0], p[1] - e[k][1]) <= tol) {
              ed.drag = { mode: 'endpoint', body: b.id, end: k, other: e[1 - k] };
              return;
            }
          }
        } else if (b.type === 'slider') {
          var hp = Model.toGlobal(b, [b.width / 2 + 26 / app.vp.scale, 0]);
          if (Math.hypot(p[0] - hp[0], p[1] - hp[1]) <= tol) {
            ed.drag = { mode: 'rotate', body: b.id };
            return;
          }
        }
      }

      var hit = pick(p);
      if (!hit) {
        if (!ev.ctrlKey && !ev.shiftKey) app.setSelection([]);
        ed.drag = { mode: 'box', a: p };
        app.render();
        return;
      }

      if (ev.ctrlKey || ev.shiftKey) {
        var next = app.selection.slice();
        var idx = next.indexOf(hit.id);
        if (idx >= 0) next.splice(idx, 1); else next.push(hit.id);
        app.setSelection(next);
      } else if (app.selection.indexOf(hit.id) < 0) {
        app.setSelection([hit.id]);
      }

      if (hit.kind === 'body') {
        ed.drag = { mode: 'move', ids: app.selection.filter(isMovableBody), start: p, orig: snapshot() };
      } else if (hit.kind === 'joint') {
        ed.drag = { mode: 'joint', id: hit.id };
      } else if (hit.kind === 'load') {
        var load = Model.byId(app.model, hit.id);
        if (load.type === 'force') ed.drag = { mode: 'loadpoint', id: hit.id };
      }
      app.render();
    }

    function isMovableBody(id) {
      var b = Model.bodyById(app.model, id);
      return !!b && b.type !== 'ground';
    }

    function snapshot() {
      var s = {};
      app.model.bodies.forEach(function (b) { s[b.id] = { x: b.x, y: b.y, phi: b.phi }; });
      return s;
    }

    function onMove(ev) {
      var p = toW(ev);
      ed.cursor = p;
      var d = ed.drag;

      if (!d) {
        var hit = pick(p);
        var id = hit ? hit.id : null;
        if (id !== ed.hoverId) { ed.hoverId = id; app.render(); }
        if (app.tool === 'rod' || app.tool === 'revolute' || app.tool === 'prismatic' ||
          app.tool === 'slider') {
          var s = snap(p);
          ed.snapPoint = s.hit ? s.p : null;
          ed.preview = { type: 'point', a: s.p };
          app.render();
        } else if (ed.preview) { ed.preview = null; app.render(); }
        app.showCoords(p);
        return;
      }

      if (d.mode === 'pan') {
        app.vp.panByPixels(ev.clientX - d.last[0], ev.clientY - d.last[1]);
        d.last = [ev.clientX, ev.clientY];
        app.render();
        return;
      }

      if (d.mode === 'rod') {
        var sb = snap(p);
        var b = sb.p;
        if (ev.shiftKey) b = constrainAngle(d.a, b);
        ed.preview = { type: 'rod', a: d.a, b: b };
        d.b = b;
      } else if (d.mode === 'prismatic') {
        var dir = [p[0] - d.a[0], p[1] - d.a[1]];
        if (Math.hypot(dir[0], dir[1]) * app.vp.scale > 10) {
          d.moved = true;
          var guide = guideAt(d.a);
          d.dir = snapDirection(dir, guide);
          ed.preview = { type: 'axis', a: d.a, dir: d.dir };
        }
      } else if (d.mode === 'force') {
        ed.preview = { type: 'vector', a: d.a, b: p, text: forceLabel(d.a, p) };
        d.b = p;
      } else if (d.mode === 'move') {
        var target = snap(p, d.ids[0]).p;
        var dx = target[0] - d.start[0], dy = target[1] - d.start[1];
        d.ids.forEach(function (id) {
          var bb = Model.bodyById(app.model, id);
          bb.x = d.orig[id].x + dx;
          bb.y = d.orig[id].y + dy;
        });
        app.modelMoved();
      } else if (d.mode === 'endpoint') {
        var q = snap(p, d.body).p;
        var rod = Model.bodyById(app.model, d.body);
        var L = Math.hypot(q[0] - d.other[0], q[1] - d.other[1]);
        if (L > 1e-4) {
          rod.L = L;
          rod.phi = Math.atan2(q[1] - d.other[1], q[0] - d.other[0]);
          if (d.end === 0) rod.phi += Math.PI;
          rod.x = (q[0] + d.other[0]) / 2;
          rod.y = (q[1] + d.other[1]) / 2;
          Model.refreshMass(rod);
          app.modelMoved();
        }
      } else if (d.mode === 'rotate') {
        var sl = Model.bodyById(app.model, d.body);
        var a = Math.atan2(p[1] - sl.y, p[0] - sl.x);
        if (ev.shiftKey) a = Math.round(a / (Math.PI / 12)) * (Math.PI / 12);
        sl.phi = a;
        app.modelMoved();
      } else if (d.mode === 'joint') {
        var j = Model.byId(app.model, d.id);
        var np = snap(p).p;
        var A = Model.bodyById(app.model, j.bodyA);
        var B = Model.bodyById(app.model, j.bodyB);
        if (j.type === 'revolute') {
          j.sA = Model.toLocal(A, np);
          j.sB = Model.toLocal(B, np);
        } else {
          j.sA = Model.toLocal(A, np);
        }
        app.modelMoved();
      } else if (d.mode === 'loadpoint') {
        var ld = Model.byId(app.model, d.id);
        var lb = Model.bodyById(app.model, ld.body);
        ld.point = Model.toLocal(lb, snap(p).p);
        app.modelMoved();
      } else if (d.mode === 'box') {
        d.b = p;
      }
      app.render();
      app.showCoords(p);
    }

    function guideAt(p) {
      var pair = pairForJoint(p, true);
      return pair ? Model.bodyById(app.model, pair.a) : null;
    }

    function constrainAngle(a, b) {
      var dx = b[0] - a[0], dy = b[1] - a[1];
      var L = Math.hypot(dx, dy);
      var ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
      return [a[0] + L * Math.cos(ang), a[1] + L * Math.sin(ang)];
    }

    function forceLabel(a, b) {
      var lenPx = Math.hypot(b[0] - a[0], b[1] - a[1]) * app.vp.scale;
      return MBD.Dom.fmt(Math.round(lenPx * 2), 0) + ' N';
    }

    function onUp(ev) {
      var d = ed.drag;
      ed.drag = null;
      ed.preview = null;
      if (!d) return;
      var p = toW(ev);

      if (d.mode === 'rod' && d.b) {
        var L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
        if (L * app.vp.scale > 8) {
          var rod = Model.addRod(app.model, d.a, d.b);
          app.modelChanged();
          app.setSelection([rod.id]);
        }
      } else if (d.mode === 'prismatic') {
        createPrismatic(d.a, d.moved ? d.dir : null);
      } else if (d.mode === 'force' && d.b) {
        finishForce(d);
      } else if (d.mode === 'box' && d.b) {
        boxSelect(d.a, d.b, ev.ctrlKey || ev.shiftKey);
      } else if (d.mode === 'move' || d.mode === 'endpoint' || d.mode === 'rotate' ||
        d.mode === 'joint' || d.mode === 'loadpoint') {
        app.modelChanged();
      }
      app.render();
    }

    function finishForce(d) {
      var body = Model.bodyById(app.model, d.body);
      var dx = d.b[0] - d.a[0], dy = d.b[1] - d.a[1];
      var lenPx = Math.hypot(dx, dy) * app.vp.scale;
      var mag = Math.max(1, Math.round(lenPx * 2));
      var n = Math.hypot(dx, dy);
      var dir = n > 1e-9 ? [dx / n, dy / n] : [1, 0];
      var load = Model.addForce(app.model, body.id, Model.toLocal(body, d.a),
        [dir[0] * mag, dir[1] * mag]);
      app.modelChanged();
      app.setSelection([load.id]);
    }

    function boxSelect(a, b, additive) {
      var x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]);
      var y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
      if ((x1 - x0) * app.vp.scale < 4 && (y1 - y0) * app.vp.scale < 4) return;
      var ids = additive ? app.selection.slice() : [];
      app.model.bodies.forEach(function (bd) {
        if (bd.type === 'ground') return;
        if (bd.x >= x0 && bd.x <= x1 && bd.y >= y0 && bd.y <= y1 && ids.indexOf(bd.id) < 0) ids.push(bd.id);
      });
      app.setSelection(ids);
    }

    function placeSlider(p) {
      var under = bodiesAt(p);
      var phi = 0;
      for (var i = 0; i < under.length; i++) {
        var b = Model.bodyById(app.model, under[i]);
        if (b.type === 'rod') { phi = b.phi; break; }
      }
      var s = Model.addSlider(app.model, p, { phi: phi });
      app.modelChanged();
      app.setSelection([s.id]);
    }

    function placeTorque(p) {
      var under = bodiesAt(p);
      if (!under.length) { app.setHint('Moment: klikněte na těleso.', true); return; }
      var l = Model.addTorque(app.model, under[0], 5);
      app.modelChanged();
      app.setSelection([l.id]);
    }

    function onWheel(ev) {
      ev.preventDefault();
      var r = canvas.getBoundingClientRect();
      var f = Math.exp(-ev.deltaY * 0.0015);
      app.vp.zoomAt([ev.clientX - r.left, ev.clientY - r.top], f);
      app.render();
    }

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', function () { ed.drag = null; ed.preview = null; app.render(); });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerleave', function () {
      ed.cursor = null; ed.snapPoint = null;
      if (!ed.drag) { ed.preview = null; app.render(); }
    });

    ed.previewScene = function () {
      if (ed.drag && ed.drag.mode === 'box' && ed.drag.b) {
        return { type: 'box', a: ed.drag.a, b: ed.drag.b };
      }
      return ed.preview;
    };

    return ed;
  };

  MBD.Editor = E;
})(typeof globalThis !== 'undefined' ? globalThis : this);
