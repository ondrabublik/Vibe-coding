/*
 * editor.js - interaktivní modelování v canvasu.
 *
 * app (rozhraní očekávané editorem):
 *   app.model, app.vp, app.options, app.tool, app.selection, app.mode
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
    kinematics: 'Kinematika: tažením za těleso (nebo čep) pohybujete celým mechanismem. ' +
      'Vazby zůstanou splněny, pohony se ignorují. Klávesa K režim vypne.',
    rod: 'Tyč: stiskněte a tažením určete délku a směr. Konec uvnitř kotouče ' +
      'automaticky vytvoří rotační vazbu v místě připojení.',
    disk: 'Kotouč: klikněte do středu a tažením určete průměr (okraj).',
    slider: 'Objímka: klikněte do místa vložení (na tyči se srovná s jejím směrem).',
    revolute: 'Rotační vazba: přichytává se na čepy (konce i body na tyči, středy kotoučů). ' +
      'Blízké čepy se vycentrují; kliknutím na existující čep připojíte další těleso (sdílený čep).',
    prismatic: 'Posuvná vazba: klikněte na místo, kde se stýkají vodicí těleso a objímka ' +
      '(nebo objímka a rám). Tažením lze určit směr osy.',
    rolling: 'Valivá vazba (1 DOF): klikněte mezi dvěma kotouči. Vzdálenost středů ' +
      'zajistěte uložením os (rotační vazby), valivá vazba jen převádí otáčení.',
    torque: 'Moment: klikněte na těleso, na které má moment působit.',
    force: 'Síla: klikněte na těleso v místě působiště a tažením určete směr a velikost.',
    spring: 'Pružina: klikněte na první úchyt a tažením na druhý (těleso, čep nebo rám).',
    damper: 'Tlumič: klikněte na první úchyt a tažením na druhý (těleso, čep nebo rám).'
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
      return Model.containsPoint(b, p, tolM());
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
        if (Model.isLinkLoad(l)) {
          var A = Model.bodyById(app.model, l.bodyA);
          var B = Model.bodyById(app.model, l.bodyB);
          if (!A || !B) continue;
          var pA = Model.toGlobal(A, l.sA), pB = Model.toGlobal(B, l.sB);
          var mid = [(pA[0] + pB[0]) / 2, (pA[1] + pB[1]) / 2];
          if (Math.hypot(p[0] - mid[0], p[1] - mid[1]) <= tol * 1.4 ||
            distToSegment(p, pA, pB) <= tol) return { kind: 'load', id: l.id };
          continue;
        }
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
        } else if (b.type === 'disk') {
          // střed + čtyři body na obvodu (přichytávání okraje)
          var r = b.radius, c = Math.cos(b.phi), s = Math.sin(b.phi);
          pts.push([b.x + r * c, b.y + r * s], [b.x - r * c, b.y - r * s],
            [b.x - r * s, b.y + r * c], [b.x + r * s, b.y - r * c]);
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

    // ------------------------------------------------------ čepy / pin sites

    /** Projekce bodu na osu tyče (lokálně i globálně). */
    function projectOnRod(body, p) {
      var e = rodEndsGlobal(body);
      var vx = e[1][0] - e[0][0], vy = e[1][1] - e[0][1];
      var L2 = vx * vx + vy * vy;
      var t = L2 > 0 ? ((p[0] - e[0][0]) * vx + (p[1] - e[0][1]) * vy) / L2 : 0.5;
      t = Math.max(0, Math.min(1, t));
      var gp = [e[0][0] + t * vx, e[0][1] + t * vy];
      var localX = -body.L / 2 + t * body.L;
      var kind = (t < 0.04 || t > 0.96) ? 'rod-end' : 'rod-span';
      return {
        bodyId: body.id,
        local: [localX, 0],
        p: gp,
        kind: kind,
        end: t < 0.5 ? 0 : 1,
        t: t,
        dist: Math.hypot(p[0] - gp[0], p[1] - gp[1])
      };
    }

    /** Místa vhodná pro rotační vazbu / úchyty pružiny. cursor = volitelný bod pro body na tyči. */
    function collectPinSites(cursor) {
      var sites = [];
      var tol = revoluteSnapTol();
      sites.push({ bodyId: 'ground', local: [0, 0], p: [0, 0], kind: 'ground' });
      app.model.bodies.forEach(function (b) {
        if (b.type === 'ground') return;
        if (b.type === 'rod') {
          var e = rodEndsGlobal(b);
          sites.push({ bodyId: b.id, local: [-b.L / 2, 0], p: e[0], kind: 'rod-end', end: 0 });
          sites.push({ bodyId: b.id, local: [b.L / 2, 0], p: e[1], kind: 'rod-end', end: 1 });
          if (cursor) {
            var pr = projectOnRod(b, cursor);
            if (pr.dist <= Math.max(b.width / 2, tol) && pr.kind === 'rod-span') {
              sites.push(pr);
            }
          }
        } else if (b.type === 'disk') {
          sites.push({ bodyId: b.id, local: [0, 0], p: [b.x, b.y], kind: 'disk-center' });
        } else {
          sites.push({ bodyId: b.id, local: [0, 0], p: [b.x, b.y], kind: 'com' });
        }
      });
      app.model.joints.forEach(function (j) {
        if (j.type !== 'revolute') return;
        var jp = Model.jointPoint(app.model, j);
        sites.push({
          bodyId: j.bodyA, local: j.sA.slice(), p: jp,
          kind: 'joint', jointId: j.id
        });
        Model.revoluteMembers(j).forEach(function (m) {
          sites.push({
            bodyId: m.id, local: m.s.slice(), p: jp,
            kind: 'joint', jointId: j.id
          });
        });
      });
      return sites;
    }

    function nearestSites(p, tol, excludeBody) {
      var sites = collectPinSites(p).filter(function (s) {
        return !excludeBody || s.bodyId !== excludeBody;
      });
      var out = [];
      sites.forEach(function (s) {
        var d = Math.hypot(p[0] - s.p[0], p[1] - s.p[1]);
        if (d <= tol) out.push({ site: s, d: d });
      });
      out.sort(function (a, b) { return a.d - b.d; });
      return out;
    }

    /** Posune vazbový bod tělesa na cílovou globální polohu. */
    function movePinTo(body, local, target) {
      if (!body || body.type === 'ground') return;
      if (body.type === 'rod') {
        var half = body.L / 2;
        var end = Math.abs(local[0] + half) < 1e-9 ? 0 : (Math.abs(local[0] - half) < 1e-9 ? 1 : -1);
        if (end >= 0) {
          var ends = Model.rodEnds(body);
          var otherG = Model.toGlobal(body, ends[1 - end]);
          var L = Math.hypot(target[0] - otherG[0], target[1] - otherG[1]);
          if (L > 1e-6) {
            body.L = L;
            body.phi = Math.atan2(target[1] - otherG[1], target[0] - otherG[0]);
            if (end === 0) body.phi += Math.PI;
            body.x = (target[0] + otherG[0]) / 2;
            body.y = (target[1] + otherG[1]) / 2;
            Model.refreshMass(body);
          }
          return;
        }
      }
      var cur = Model.toGlobal(body, local);
      body.x += target[0] - cur[0];
      body.y += target[1] - cur[1];
    }

    function revoluteSnapTol() {
      return Math.max(SNAP_PX, 14) / app.vp.scale;
    }

    /** Náhled čepů pro nástroj rotační vazby. */
    function revolutePreview(p) {
      var tol = revoluteSnapTol();
      var sites = collectPinSites(p);
      var near = nearestSites(p, tol);
      var active = [];
      var cursor = p;
      // existující čep ke sdílení
      var share = near.find(function (n) { return n.site.kind === 'joint'; });
      if (share) {
        active = [share.site];
        cursor = share.site.p;
      } else if (near.length >= 2) {
        for (var i = 0; i < near.length; i++) {
          for (var k = i + 1; k < near.length; k++) {
            if (near[i].site.bodyId !== near[k].site.bodyId) {
              active = [near[i].site, near[k].site];
              cursor = [
                (near[i].site.p[0] + near[k].site.p[0]) / 2,
                (near[i].site.p[1] + near[k].site.p[1]) / 2
              ];
              break;
            }
          }
          if (active.length) break;
        }
      }
      if (!active.length && near.length) {
        active = [near[0].site];
        cursor = near[0].site.p;
      }
      if (!active.length) {
        var disk = diskAt(p);
        if (disk) cursor = p;
      }
      return {
        type: 'revolute-sites',
        sites: sites.map(function (s) { return s.p; }),
        active: active.map(function (s) { return s.p; }),
        a: cursor
      };
    }

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
      // preferovat tyč + kotouč (kotouč jako A)
      if (b0.type === 'disk' && b1.type === 'rod') return { a: list[0], b: list[1] };
      if (b1.type === 'disk' && b0.type === 'rod') return { a: list[1], b: list[0] };
      return { a: list[1], b: list[0] };
    }

    function alreadyLinked(aId, bId) {
      return app.model.joints.some(function (j) {
        return j.type === 'revolute' &&
          Model.revoluteHasBody(j, aId) && Model.revoluteHasBody(j, bId);
      });
    }

    /** Unikátní kandidáti čepů podle tělesa (nejbližší pro každé). */
    function distinctBodySites(near) {
      var map = {}, order = [];
      near.forEach(function (n) {
        var id = n.site.bodyId;
        if (!map[id] || n.d < map[id].d) {
          if (!map[id]) order.push(id);
          map[id] = n;
        }
      });
      return order.map(function (id) { return map[id].site; });
    }

    function createRevolute(p) {
      var tol = revoluteSnapTol();
      var near = nearestSites(p, tol);

      // 0) připojení k existujícímu čepu (sdílení)
      var shareHit = near.find(function (n) { return n.site.kind === 'joint' && n.site.jointId; });
      if (shareHit) {
        var ex = Model.byId(app.model, shareHit.site.jointId);
        if (ex && ex.type === 'revolute') {
          var jp = Model.jointPoint(app.model, ex);
          var newIds = [];
          // tělesa u kurzoru / blízké čepy, která ještě nejsou členy
          distinctBodySites(near).forEach(function (s) {
            if (!Model.revoluteHasBody(ex, s.bodyId)) newIds.push(s);
          });
          bodiesAt(p).forEach(function (id) {
            if (!Model.revoluteHasBody(ex, id) && !newIds.some(function (s) { return s.bodyId === id; })) {
              var b = Model.bodyById(app.model, id);
              if (b && b.type === 'rod') newIds.push(projectOnRod(b, jp));
              else if (b) newIds.push({ bodyId: id, local: Model.toLocal(b, jp), p: jp });
            }
          });
          if (newIds.length) {
            newIds.forEach(function (s) {
              var bb = Model.bodyById(app.model, s.bodyId);
              movePinTo(bb, s.local, jp);
              Model.addToRevolute(app.model, ex, s.bodyId, jp);
            });
            app.modelChanged();
            app.setSelection([ex.id]);
            app.setHint('Těleso připojeno ke sdílenému čepu („' + ex.name + '”).');
            return;
          }
        }
      }

      // 1) všechny blízké čepy různých těles (≥2) → jeden společný čep
      var distinct = distinctBodySites(near);
      // doplň projekce na tyče pod kurzorem
      bodiesAt(p).forEach(function (id) {
        if (distinct.some(function (s) { return s.bodyId === id; })) return;
        var b = Model.bodyById(app.model, id);
        if (b && b.type === 'rod') {
          var pr = projectOnRod(b, p);
          if (pr.dist <= Math.max(b.width / 2, tol)) distinct.push(pr);
        } else if (b && b.type === 'disk' && Model.containsPoint(b, p, tol)) {
          distinct.push({ bodyId: id, local: Model.toLocal(b, p), p: p.slice(), kind: 'disk-point' });
        }
      });

      if (distinct.length >= 2) {
        var jointPoint = [0, 0];
        distinct.forEach(function (s) {
          jointPoint[0] += s.p[0];
          jointPoint[1] += s.p[1];
        });
        jointPoint[0] /= distinct.length;
        jointPoint[1] /= distinct.length;

        var bodyIds = [];
        distinct.forEach(function (s) {
          movePinTo(Model.bodyById(app.model, s.bodyId), s.local, jointPoint);
          bodyIds.push(s.bodyId);
        });
        // po posunu přepočítat lokální body z jointPoint
        var j = Model.addRevolute(app.model, bodyIds[0], bodyIds[1], jointPoint, {
          name: 'Rot. ' + bodyIds.map(shortName).join('/'),
          bodies: bodyIds
        });
        // aktualizovat lokální souřadnice po movePinTo
        j.members = bodyIds.map(function (id) {
          return { id: id, s: Model.toLocal(Model.bodyById(app.model, id), jointPoint) };
        });
        Model.syncRevolutePair(j);
        app.modelChanged();
        app.setSelection([j.id]);
        return;
      }

      // 2) jeden čep + druhé těleso / rám
      if (distinct.length === 1 || near.length) {
        var siteA = distinct[0] || near[0].site;
        var jointPt = siteA.p.slice();
        var idA = siteA.bodyId;
        var idB = null;
        var under = bodiesAt(p);
        for (var u = 0; u < under.length; u++) {
          if (under[u] !== idA) { idB = under[u]; break; }
        }
        var disk = diskAt(p);
        if ((siteA.kind === 'rod-end' || siteA.kind === 'rod-span') && disk && disk.id !== idA) {
          idB = disk.id;
          if (Model.containsPoint(disk, p, tol)) jointPt = p.slice();
          movePinTo(Model.bodyById(app.model, idA), siteA.local, jointPt);
        } else if (!idB) {
          idB = 'ground';
        } else if (disk && idA !== disk.id) {
          var ba0 = Model.bodyById(app.model, idA);
          if (ba0 && ba0.type === 'rod' && Model.containsPoint(disk, jointPt, tol)) idB = disk.id;
        }

        if (idA === idB) {
          app.setHint('Rotační vazba: vyberte dvě různá tělesa.', true);
          return;
        }
        if (alreadyLinked(idA, idB)) {
          app.setHint('Tato tělesa už sdílejí rotační vazbu.', true);
          return;
        }
        var j2 = Model.addRevolute(app.model, idA, idB, jointPt, {
          name: 'Rot. ' + shortName(idA) + '/' + shortName(idB)
        });
        app.modelChanged();
        app.setSelection([j2.id]);
        return;
      }

      // 3) volný bod (kotouč / překryv tyčí)
      var diskFree = diskAt(p);
      var pair = pairForJoint(p, false);
      if (!pair && diskFree) pair = { a: 'ground', b: diskFree.id };
      if (!pair) {
        app.setHint('Rotační vazba: klikněte na čep, tyč nebo těleso.', true);
        return;
      }
      var jp3 = p.slice();
      var bodies3 = [pair.a, pair.b];
      // pokud je pod kurzorem víc tyčí, všechny na společný čep
      bodiesAt(p).forEach(function (id) {
        if (bodies3.indexOf(id) < 0) bodies3.push(id);
      });
      bodies3.forEach(function (id) {
        var b = Model.bodyById(app.model, id);
        if (!b || b.type === 'ground') return;
        if (b.type === 'rod') {
          var pr = projectOnRod(b, jp3);
          movePinTo(b, pr.local, pr.kind === 'rod-span' ? pr.p : jp3);
          if (pr.kind === 'rod-span') jp3 = pr.p; // sjednotit na průmět
        }
      });
      if (alreadyLinked(bodies3[0], bodies3[1])) {
        app.setHint('Tato tělesa už sdílejí rotační vazbu.', true);
        return;
      }
      var j3 = Model.addRevolute(app.model, bodies3[0], bodies3[1], jp3, {
        name: 'Rot. ' + bodies3.map(shortName).join('/'),
        bodies: bodies3
      });
      j3.members = bodies3.map(function (id) {
        return { id: id, s: Model.toLocal(Model.bodyById(app.model, id), jp3) };
      });
      Model.syncRevolutePair(j3);
      app.modelChanged();
      app.setSelection([j3.id]);
    }

    /** Pokud je body tyč a point je blízko některého konce, dorovná konec na point. */
    function alignRodEndToPoint(body, point) {
      if (!body || body.type !== 'rod') return;
      var pr = projectOnRod(body, point);
      var tol = revoluteSnapTol();
      if (pr.dist > tol * 1.5) return;
      movePinTo(body, pr.local, point);
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

    function createRolling(p) {
      var list = bodiesAt(p).filter(function (id) {
        var b = Model.bodyById(app.model, id);
        return b && b.type === 'disk';
      });
      if (list.length < 2) {
        // zkusit najít dva nejbližší kotouče, jejichž spojnice prochází poblíž p
        var disks = app.model.bodies.filter(function (b) { return b.type === 'disk'; });
        if (disks.length < 2) {
          app.setHint('Valivá vazba: potřebujete dvě rotační tělesa.', true);
          return;
        }
        var best = null, bestD = tolM() * 4;
        for (var i = 0; i < disks.length; i++) {
          for (var k = i + 1; k < disks.length; k++) {
            var a = disks[i], b = disks[k];
            var mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
            var d = Math.hypot(p[0] - mid[0], p[1] - mid[1]);
            var gap = Math.hypot(b.x - a.x, b.y - a.y);
            var expectExt = a.radius + b.radius;
            var expectInt = Math.abs(a.radius - b.radius);
            var near = Math.min(Math.abs(gap - expectExt), Math.abs(gap - expectInt));
            if (near < Math.max(a.radius, b.radius) * 0.35 + tolM() && d < bestD + Math.max(a.radius, b.radius)) {
              bestD = d;
              best = { a: a, b: b, gap: gap, expectExt: expectExt, expectInt: expectInt };
            }
          }
        }
        if (!best) {
          app.setHint('Valivá vazba: klikněte mezi dvěma kotouči (vnější nebo vnitřní kontakt).', true);
          return;
        }
        var side = Math.abs(best.gap - best.expectInt) < Math.abs(best.gap - best.expectExt) &&
          best.expectInt > 1e-6 ? 'internal' : 'external';
        // přiblížit středy na přesný kontakt
        alignDisks(best.a, best.b, side);
        var j = Model.addRolling(app.model, best.a.id, best.b.id, {
          side: side,
          name: 'Valivá ' + shortName(best.a.id) + '/' + shortName(best.b.id)
        });
        app.modelChanged();
        app.setSelection([j.id]);
        return;
      }
      var A = Model.bodyById(app.model, list[1]);
      var B = Model.bodyById(app.model, list[0]);
      var gap2 = Math.hypot(B.x - A.x, B.y - A.y);
      var side2 = (Math.abs(gap2 - Math.abs(A.radius - B.radius)) <
        Math.abs(gap2 - (A.radius + B.radius)) && Math.abs(A.radius - B.radius) > 1e-6)
        ? 'internal' : 'external';
      alignDisks(A, B, side2);
      var j2 = Model.addRolling(app.model, A.id, B.id, {
        side: side2,
        name: 'Valivá ' + shortName(A.id) + '/' + shortName(B.id)
      });
      app.modelChanged();
      app.setSelection([j2.id]);
    }

    /** Posune B tak, aby vzdálenost středů odpovídala vnějšímu/vnitřnímu kontaktu. */
    function alignDisks(A, B, side) {
      var dx = B.x - A.x, dy = B.y - A.y;
      var d = Math.hypot(dx, dy);
      var R = side === 'internal' ? Math.abs(A.radius - B.radius) : (A.radius + B.radius);
      if (d < 1e-9) { dx = 1; dy = 0; d = 1; }
      B.x = A.x + dx / d * R;
      B.y = A.y + dy / d * R;
    }

    function shortName(id) {
      if (id === 'ground') return 'rám';
      var b = Model.bodyById(app.model, id);
      return b ? b.name : id;
    }

    /** Kotouč, v jehož objemu leží bod (nejvýše nakreslený). */
    function diskAt(p) {
      var list = bodiesAt(p);
      for (var i = 0; i < list.length; i++) {
        var b = Model.bodyById(app.model, list[i]);
        if (b && b.type === 'disk') return b;
      }
      return null;
    }

    /** Připojí konec tyče (index 0|1) k hostiteli rotační vazbou v bodě p. */
    function attachRodEnd(rod, endIndex, p, host) {
      if (!host) return null;
      if (alreadyLinked(host.id, rod.id)) return null;
      var ends = Model.rodEnds(rod);
      var otherG = Model.toGlobal(rod, ends[1 - endIndex]);
      var L = Math.hypot(p[0] - otherG[0], p[1] - otherG[1]);
      if (L < 1e-6) return null;
      rod.L = L;
      rod.phi = Math.atan2(p[1] - otherG[1], p[0] - otherG[0]);
      if (endIndex === 0) rod.phi += Math.PI;
      rod.x = (p[0] + otherG[0]) / 2;
      rod.y = (p[1] + otherG[1]) / 2;
      Model.refreshMass(rod);
      var endG = Model.toGlobal(rod, Model.rodEnds(rod)[endIndex]);
      return Model.addRevolute(app.model, host.id, rod.id, endG, {
        name: 'Rot. ' + shortName(host.id) + '/' + shortName(rod.id)
      });
    }

    /** Úchyt pružiny/tlumiče: čep, těleso nebo rám. */
    function snapAttach(p, excludeBody) {
      var tol = revoluteSnapTol();
      var near = nearestSites(p, tol, excludeBody);
      if (near.length) {
        return {
          p: near[0].site.p.slice(),
          bodyId: near[0].site.bodyId,
          local: near[0].site.local.slice()
        };
      }
      var list = bodiesAt(p);
      for (var i = 0; i < list.length; i++) {
        if (excludeBody && list[i] === excludeBody) continue;
        var b = Model.bodyById(app.model, list[i]);
        if (!b) continue;
        // uvnitř kotouče – přesný bod kliknutí
        if (b.type === 'disk') {
          return { p: p.slice(), bodyId: b.id, local: Model.toLocal(b, p) };
        }
        return { p: [b.x, b.y], bodyId: b.id, local: [0, 0] };
      }
      if (Math.hypot(p[0], p[1]) < tol * 2) {
        return { p: [0, 0], bodyId: 'ground', local: [0, 0] };
      }
      // volný bod → ukotvení k rámu
      var sg = snap(p);
      return { p: sg.p.slice(), bodyId: 'ground', local: sg.p.slice() };
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
      if (app.mode === 'kinematics') return startKinematic(ev, p);
      if (tool === 'select') return startSelect(ev, p);
      if (tool === 'rod') {
        var diskHit = diskAt(p);
        var s = diskHit ? { p: p, hit: null } : snap(p);
        ed.drag = { mode: 'rod', a: s.p, diskA: diskHit || diskAt(s.p) };
        ed.preview = { type: 'rod', a: s.p, b: s.p };
      } else if (tool === 'disk') {
        var sc = snap(p).p;
        ed.drag = { mode: 'disk', a: sc };
        ed.preview = { type: 'disk', a: sc, r: 0 };
      } else if (tool === 'slider') {
        placeSlider(snap(p).p);
      } else if (tool === 'revolute') {
        createRevolute(p);
      } else if (tool === 'prismatic') {
        var sp = snap(p).p;
        ed.drag = { mode: 'prismatic', a: sp, moved: false };
        ed.preview = { type: 'point', a: sp };
      } else if (tool === 'rolling') {
        createRolling(snap(p).p);
      } else if (tool === 'torque') {
        placeTorque(p);
      } else if (tool === 'force') {
        var hit = bodiesAt(p);
        if (!hit.length) { app.setHint('Síla: klikněte na těleso.', true); return; }
        var sp2 = snap(p).p;
        ed.drag = { mode: 'force', body: hit[0], a: sp2 };
        ed.preview = { type: 'vector', a: sp2, b: sp2, text: '' };
      } else if (tool === 'spring' || tool === 'damper') {
        var att = snapAttach(p);
        ed.drag = {
          mode: 'link',
          kind: tool,
          bodyA: att.bodyId,
          a: att.p,
          localA: att.local
        };
        ed.preview = { type: tool, a: att.p, b: att.p };
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
        } else if (b.type === 'slider' || b.type === 'disk') {
          var reach = (b.type === 'disk' ? b.radius : b.width / 2) + 26 / app.vp.scale;
          var hp = Model.toGlobal(b, [reach, 0]);
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
        else if (Model.isLinkLoad(load)) {
          ed.drag = { mode: 'link-end', id: hit.id, end: nearerSpringEnd(load, p) };
        }
      }
      app.render();
    }

    function startKinematic(ev, p) {
      var hit = pick(p);
      var bodyId = null, sLocal = null;

      if (hit && hit.kind === 'body') {
        bodyId = hit.id;
        sLocal = Model.toLocal(Model.bodyById(app.model, bodyId), p);
      } else if (hit && hit.kind === 'joint') {
        var j = Model.byId(app.model, hit.id);
        bodyId = j.bodyB !== 'ground' ? j.bodyB : j.bodyA;
        if (bodyId === 'ground') bodyId = null;
        else {
          var jp = Model.jointPoint(app.model, j);
          sLocal = Model.toLocal(Model.bodyById(app.model, bodyId), jp);
        }
      } else if (hit && hit.kind === 'load') {
        var load = Model.byId(app.model, hit.id);
        if (load.type === 'spring' || load.type === 'damper') {
          bodyId = load.bodyA !== 'ground' ? load.bodyA : load.bodyB;
          if (bodyId === 'ground') bodyId = null;
          else {
            var sprB = Model.bodyById(app.model, bodyId);
            sLocal = Model.toLocal(sprB, p);
          }
        } else {
          var lb = Model.bodyById(app.model, load.body);
          if (lb && lb.type !== 'ground') {
            bodyId = lb.id;
            sLocal = Model.toLocal(lb, p);
          }
        }
      }

      if (!bodyId) {
        if (!ev.ctrlKey && !ev.shiftKey) app.setSelection([]);
        ed.drag = { mode: 'box', a: p };
        app.render();
        return;
      }

      if (app.selection.indexOf(bodyId) < 0) app.setSelection([bodyId]);

      var sys, q, bodyIndex;
      try {
        sys = MBD.System.build(app.model, { skipDrivers: true });
        bodyIndex = sys.index[bodyId];
        if (sys.dofIndex[bodyIndex] < 0) return;
        var st = MBD.System.stateFromModel(sys);
        MBD.Analysis.assemble(sys, st.q, 0);
        q = st.q;
      } catch (e) {
        app.setHint('Kinematiku nelze spustit: ' + e.message, true);
        return;
      }
      ed.drag = {
        mode: 'kinematic',
        sys: sys,
        q: q,
        bodyIndex: bodyIndex,
        sLocal: sLocal
      };
      canvas.style.cursor = 'grabbing';
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
        if (app.tool === 'revolute') {
          ed.preview = revolutePreview(p);
          ed.snapPoint = ed.preview.a;
          app.render();
        } else if (app.tool === 'spring' || app.tool === 'damper') {
          var att = snapAttach(p);
          ed.snapPoint = att.p;
          ed.preview = { type: 'point', a: att.p };
          app.render();
        } else if (app.tool === 'rod' || app.tool === 'prismatic' ||
          app.tool === 'slider' || app.tool === 'disk' || app.tool === 'rolling') {
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
        var diskB = diskAt(p);
        var sb = diskB ? { p: p } : snap(p);
        var b = sb.p;
        if (ev.shiftKey && !diskB) b = constrainAngle(d.a, b);
        ed.preview = { type: 'rod', a: d.a, b: b };
        d.b = b;
        d.diskB = diskB;
      } else if (d.mode === 'disk') {
        var edge = snap(p).p;
        var rDisk = Math.hypot(edge[0] - d.a[0], edge[1] - d.a[1]);
        ed.preview = { type: 'disk', a: d.a, b: edge, r: rDisk };
        d.b = edge;
        d.r = rDisk;
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
      } else if (d.mode === 'link') {
        var attB = snapAttach(p, d.bodyA);
        ed.preview = { type: d.kind, a: d.a, b: attB.p };
        d.b = attB.p;
        d.bodyB = attB.bodyId;
        d.localB = attB.local;
      } else if (d.mode === 'kinematic') {
        MBD.Analysis.followPoint(d.sys, d.q, d.bodyIndex, d.sLocal, p);
        MBD.System.stateToModel(d.sys, d.q, null);
        app.modelMoved();
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
          Model.revoluteMembers(j).forEach(function (m) {
            var bm = Model.bodyById(app.model, m.id);
            if (bm) m.s = Model.toLocal(bm, np);
          });
          Model.syncRevolutePair(j);
        } else if (j.type === 'prismatic') {
          j.sA = Model.toLocal(A, np);
        } else if (j.type === 'rolling') {
          // valivá vazba: přesunem měníme relativní polohu středů (kontakt)
          // bod kontaktu se drží pod kurzorem – posuneme středy podél spojnice
          var dx = B.x - A.x, dy = B.y - A.y;
          var d = Math.hypot(dx, dy) || 1;
          var R = j.side === 'internal' ? Math.abs(A.radius - B.radius) : (A.radius + B.radius);
          var ux = dx / d, uy = dy / d;
          // kontakt na A: A + rA * u; chceme kontakt ≈ np
          var rA = A.radius;
          if (j.side === 'internal' && A.radius < B.radius) {
            A.x = np[0] - B.radius * ux; // approximate: keep B, move A
            A.y = np[1] - B.radius * uy;
            B.x = A.x + ux * R;
            B.y = A.y + uy * R;
          } else {
            A.x = np[0] - rA * ux;
            A.y = np[1] - rA * uy;
            B.x = A.x + ux * R;
            B.y = A.y + uy * R;
          }
          // přepočet offsetu valení podle nové θ
          var theta = Math.atan2(B.y - A.y, B.x - A.x);
          var sigB = 1, sigTh = 1;
          if (j.side === 'internal') {
            if (A.radius >= B.radius) { sigB = -1; sigTh = -1; }
          }
          j.offset = A.radius * A.phi + sigB * B.radius * B.phi + sigTh * R * theta;
        } else {
          j.sA = Model.toLocal(A, np);
        }
        app.modelMoved();
      } else if (d.mode === 'loadpoint') {
        var ld = Model.byId(app.model, d.id);
        var lb = Model.bodyById(app.model, ld.body);
        ld.point = Model.toLocal(lb, snap(p).p);
        app.modelMoved();
      } else if (d.mode === 'link-end') {
        var spr = Model.byId(app.model, d.id);
        var attM = snapAttach(p);
        if (d.end === 'A') {
          spr.bodyA = attM.bodyId;
          spr.sA = attM.local;
        } else {
          spr.bodyB = attM.bodyId;
          spr.sB = attM.local;
        }
        if (spr.type === 'spring' && spr.L0 != null) {
          // délku L0 neměnit při přesouvání úchytu
        }
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
          var diskStart = d.diskA || diskAt(d.a);
          var diskEnd = d.diskB || diskAt(d.b);
          if (diskStart && diskStart === diskEnd) diskEnd = null;
          if (diskStart) attachRodEnd(rod, 0, d.a, diskStart);
          if (diskEnd) attachRodEnd(rod, 1, d.b, diskEnd);
          app.modelChanged();
          app.setSelection([rod.id]);
        }
      } else if (d.mode === 'disk' && d.r != null) {
        if (d.r * app.vp.scale > 6) {
          placeDisk(d.a, d.r);
        } else {
          app.setHint('Kotouč: tažením od středu určete průměr.', true);
        }
      } else if (d.mode === 'prismatic') {
        createPrismatic(d.a, d.moved ? d.dir : null);
      } else if (d.mode === 'force' && d.b) {
        finishForce(d);
      } else if (d.mode === 'link' && d.b) {
        finishLink(d);
      } else if (d.mode === 'box' && d.b) {
        boxSelect(d.a, d.b, ev.ctrlKey || ev.shiftKey);
      } else if (d.mode === 'kinematic') {
        app.model.bodies.forEach(function (b) {
          if (b.type === 'ground') return;
          b.vx = 0; b.vy = 0; b.omega = 0;
        });
        canvas.style.cursor = app.mode === 'kinematics' ? 'grab' : (app.tool === 'select' ? 'default' : 'crosshair');
        app.modelChanged();
      } else if (d.mode === 'move' || d.mode === 'endpoint' || d.mode === 'rotate' ||
        d.mode === 'joint' || d.mode === 'loadpoint' || d.mode === 'link-end') {
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

    function bodyOrGroundAt(p) {
      var list = bodiesAt(p);
      if (list.length) return list[0];
      if (Math.hypot(p[0], p[1]) < tolM() * 3) return 'ground';
      return null;
    }

    function nearerSpringEnd(load, p) {
      var A = Model.bodyById(app.model, load.bodyA);
      var B = Model.bodyById(app.model, load.bodyB);
      var pA = Model.toGlobal(A, load.sA), pB = Model.toGlobal(B, load.sB);
      return Math.hypot(p[0] - pA[0], p[1] - pA[1]) <= Math.hypot(p[0] - pB[0], p[1] - pB[1])
        ? 'A' : 'B';
    }

    function finishLink(d) {
      if (!d.bodyB) {
        var att = snapAttach(d.b, d.bodyA);
        d.bodyB = att.bodyId;
        d.b = att.p;
      }
      if (d.bodyA === d.bodyB && Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]) * app.vp.scale < 10) {
        app.setHint((d.kind === 'damper' ? 'Tlumič' : 'Pružina') + ': tažením určete druhý úchyt.', true);
        return;
      }
      var L = Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]);
      if (L * app.vp.scale < 8) {
        app.setHint((d.kind === 'damper' ? 'Tlumič' : 'Pružina') + ' je příliš krátký/á.', true);
        return;
      }
      var load;
      if (d.kind === 'damper') {
        load = Model.addDamper(app.model, d.bodyA, d.bodyB, d.a, d.b, { c: 5 });
      } else {
        load = Model.addSpring(app.model, d.bodyA, d.bodyB, d.a, d.b, { k: 200, c: 0 });
      }
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

    function placeDisk(p, radius) {
      var d = Model.addDisk(app.model, p, radius != null ? { radius: radius } : undefined);
      app.modelChanged();
      app.setSelection([d.id]);
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
    canvas.addEventListener('pointercancel', function () {
      ed.drag = null; ed.preview = null;
      canvas.style.cursor = app.mode === 'kinematics' ? 'grab' : (app.tool === 'select' ? 'default' : 'crosshair');
      app.render();
    });
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
