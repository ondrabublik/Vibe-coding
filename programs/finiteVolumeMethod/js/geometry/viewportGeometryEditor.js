(function (NS) {
  'use strict';

  const Profiles = NS.Profiles;
  const Nurbs = NS.Nurbs;
  const MID_START = Profiles.MID_START;
  const MID_END   = Profiles.MID_END;

  NS.ViewportGeometryEditor = {};

  NS.ViewportGeometryEditor.create = function (canvas, onUpdate) {
    const HIT_RADIUS = 12;
    let dragging = null;
    let transform = null;

    const state = {
      botWall: null,
      topWall: null,
    };

    function dist(ax, ay, bx, by) {
      return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
    }

    function cssToPx(e) {
      const rect = canvas.getBoundingClientRect();
      return {
        px: (e.clientX - rect.left) * (canvas.width  / (rect.width  || 1)),
        py: (e.clientY - rect.top)  * (canvas.height / (rect.height || 1)),
      };
    }

    function wallOf(name) {
      return name === 'bot' ? state.botWall : state.topWall;
    }

    function findNearest(px, py) {
      if (!transform) return null;
      let best = null;
      let bestD = HIT_RADIUS;

      function testPoint(wall, type, pt, k) {
        const { px: cx, py: cy } = transform.worldToScreen(pt.x, pt.y);
        const d = dist(px, py, cx, cy);
        if (d < bestD) {
          bestD = d;
          best = { wall, type, k };
        }
      }

      for (const wall of ['bot', 'top']) {
        const wc = wallOf(wall);
        if (!wc) continue;
        wc.points.forEach((pt, k) => {
          if (!isEndpoint(k, wc.points.length)) testPoint(wall, 'point', pt, k);
        });
        testPoint(wall, 'startTan', wc.startTan, -1);
        testPoint(wall, 'endTan', wc.endTan, -1);
      }
      return best;
    }

    function endpointY(wall) {
      return wall === 'bot' ? 0 : 1;
    }

    function isEndpoint(k, nPts) {
      return k === 0 || k === nPts - 1;
    }

    function pinEndpoints(wc, wall) {
      const n = wc.points.length;
      if (n < 2) return;
      const y = endpointY(wall);
      wc.points[0].x = MID_START;
      wc.points[0].y = y;
      wc.points[n - 1].x = MID_END;
      wc.points[n - 1].y = y;
    }

    function pinAllEndpoints() {
      if (state.botWall) pinEndpoints(state.botWall, 'bot');
      if (state.topWall) pinEndpoints(state.topWall, 'top');
    }

    function clampPoint(pt, wall) {
      pt.x = Math.max(MID_START, Math.min(MID_END, pt.x));
      const yLo = wall === 'bot' ? -0.05 : 0.5;
      const yHi = wall === 'bot' ? 0.5  : 1.3;
      pt.y = Math.max(yLo, Math.min(yHi, pt.y));
    }

    function setWalls(walls) {
      state.botWall = walls.botWall;
      state.topWall = walls.topWall;
      pinAllEndpoints();
    }

    function initDefault(nBot, nTop) {
      setWalls(Profiles.defaultWalls(nBot, nTop));
    }

    function initFlat(nBot, nTop) {
      setWalls(Profiles.flatWalls(nBot, nTop));
    }

    function resampleFromCurrent(nBot, nTop) {
      setWalls({
        botWall: Profiles.resampleWall(state.botWall, nBot, 0),
        topWall: Profiles.resampleWall(state.topWall, nTop, 1),
      });
    }

    function evalWallY(wallCurve, x, flatY) {
      if (x < MID_START || x > MID_END) return flatY;
      return Profiles.evaluateWall(wallCurve, x);
    }

    function drawOverlay(ctx, xf) {
      if (!xf) return;
      transform = xf;
      const { worldToScreen } = xf;

      function drawWallCurve(wallCurve, color) {
        if (!wallCurve || wallCurve.points.length < 2) return;
        const samples = wallCurve.gammArc
          ? Array.from({ length: 81 }, (_, k) => {
              const x = MID_START + k * (MID_END - MID_START) / 80;
              return { x, y: evalWallY(wallCurve, x, 0) };
            })
          : Nurbs.sample(wallCurve, 80);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        samples.forEach((p, k) => {
          const { px, py } = worldToScreen(p.x, p.y);
          k === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }

      function drawTangent(wallCurve, fromPt, tanPt, color, active) {
        const a = worldToScreen(fromPt.x, fromPt.y);
        const b = worldToScreen(tanPt.x, tanPt.y);
        ctx.strokeStyle = color;
        ctx.lineWidth = active ? 2 : 1.5;
        ctx.beginPath();
        ctx.moveTo(a.px, a.py);
        ctx.lineTo(b.px, b.py);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(b.px, b.py, active ? 7 : 5, 0, 2 * Math.PI);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      function drawHandles(wallCurve, wall, fill, stroke) {
        const n = wallCurve.points.length;
        for (let k = 0; k < n; k++) {
          if (isEndpoint(k, n)) continue;
          const pt = wallCurve.points[k];
          const { px, py } = worldToScreen(pt.x, pt.y);
          const active = dragging && dragging.wall === wall && dragging.type === 'point' && dragging.k === k;
          ctx.beginPath();
          ctx.arc(px, py, active ? 8 : 6, 0, 2 * Math.PI);
          ctx.fillStyle = fill;
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }

      ctx.save();
      drawWallCurve(state.botWall, 'rgba(74,170,255,0.85)');
      drawWallCurve(state.topWall, 'rgba(255,170,74,0.85)');

      if (state.botWall) {
        drawHandles(state.botWall, 'bot', '#4af', '#fff');
        drawTangent(state.botWall, state.botWall.points[0], state.botWall.startTan, '#6cf',
          dragging && dragging.wall === 'bot' && dragging.type === 'startTan');
        drawTangent(state.botWall, state.botWall.points[state.botWall.points.length - 1],
          state.botWall.endTan, '#6cf',
          dragging && dragging.wall === 'bot' && dragging.type === 'endTan');
      }

      if (state.topWall) {
        drawHandles(state.topWall, 'top', '#fa4', '#fff');
        drawTangent(state.topWall, state.topWall.points[0], state.topWall.startTan, '#fc6',
          dragging && dragging.wall === 'top' && dragging.type === 'startTan');
        drawTangent(state.topWall, state.topWall.points[state.topWall.points.length - 1],
          state.topWall.endTan, '#fc6',
          dragging && dragging.wall === 'top' && dragging.type === 'endTan');
      }
      ctx.restore();
    }

    function markEdited(wc) {
      if (!wc) return;
      if (wc.gammArc) delete wc.gammArc;
      Nurbs.invalidateCache(wc);
    }

    canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const { px, py } = cssToPx(e);
      const hit = findNearest(px, py);
      if (hit) {
        dragging = hit;
        canvas.style.cursor = 'grabbing';
        e.preventDefault();
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      const { px, py } = cssToPx(e);
      if (dragging) {
        if (!transform) return;
        const w = transform.screenToWorld(px, py);
        const wc = wallOf(dragging.wall);
        markEdited(wc);

        if (dragging.type === 'point') {
          const pt = wc.points[dragging.k];
          pt.x = w.x;
          pt.y = w.y;
          clampPoint(pt, dragging.wall);
          wc.points.sort((a, b) => a.x - b.x);
          pinEndpoints(wc, dragging.wall);
          dragging.k = wc.points.indexOf(pt);
        } else if (dragging.type === 'startTan') {
          wc.startTan.x = w.x;
          wc.startTan.y = w.y;
        } else if (dragging.type === 'endTan') {
          wc.endTan.x = w.x;
          wc.endTan.y = w.y;
        }
        onUpdate(state);
      } else {
        canvas.style.cursor = findNearest(px, py) ? 'grab' : 'default';
      }
    });

    function endDrag() {
      if (!dragging) return;
      dragging = null;
      canvas.style.cursor = 'default';
      onUpdate(state, true);
    }

    canvas.addEventListener('mouseup', endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    return {
      state,
      initDefault,
      initFlat,
      resampleFromCurrent,
      drawOverlay,
      setTransform(xf) { transform = xf; },
    };
  };
})(window.FVM);
