/*
 * plots.js - výběr výstupních veličin a vykreslení grafů.
 * Signály se seskupují podle jednotky, každá jednotka má vlastní graf.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var D = MBD.Dom;
  var P = {};

  var PALETTE = ['#4ea1ff', '#7cd0a0', '#f0b350', '#ff6b6b', '#c678dd', '#56d4dd',
    '#e5c07b', '#98c379', '#d19a66', '#61afef'];

  // ------------------------------------------------------------- seznam signálů

  P.renderList = function (container, app) {
    D.clear(container);
    var res = app.result;
    if (!res) {
      container.appendChild(D.el('div', { class: 'empty', text: 'Nejprve spusťte analýzu (▶ Analýza).' }));
      return;
    }
    var byGroup = {};
    res.signals.forEach(function (s) {
      (byGroup[s.group] = byGroup[s.group] || []).push(s);
    });

    res.signalGroups.forEach(function (g) {
      var list = byGroup[g.id];
      if (!list || !list.length) return;
      var head = D.el('div', { class: 'sig-group' }, [
        D.el('span', { text: g.label }),
        D.el('span', {
          class: 'unit', text: 'vše', style: { cursor: 'pointer' },
          onclick: function () {
            var allOn = list.every(function (s) { return app.plotKeys.indexOf(s.key) >= 0; });
            list.forEach(function (s) { app.togglePlot(s.key, !allOn); });
            app.refreshPlots();
          }
        })
      ]);
      container.appendChild(head);
      list.forEach(function (s) {
        var cb = D.el('input', { type: 'checkbox' });
        cb.checked = app.plotKeys.indexOf(s.key) >= 0;
        var row = D.el('label', { class: 'sig-item' }, [
          cb,
          D.el('span', { text: s.label }),
          D.el('span', { class: 'unit', text: s.unit })
        ]);
        cb.addEventListener('change', function () {
          app.togglePlot(s.key, cb.checked);
          app.refreshPlots();
        });
        container.appendChild(row);
      });
    });
  };

  // -------------------------------------------------------------------- grafy

  P.renderCharts = function (container, app) {
    D.clear(container);
    var res = app.result;
    if (!res) {
      container.appendChild(D.el('div', {
        class: 'charts-empty',
        text: 'Grafy se zobrazí po spuštění dynamické analýzy. Vlevo pak zaškrtněte ' +
          'požadované veličiny (kinematika těles, reakce ve vazbách, hnací moment).'
      }));
      return;
    }
    var chosen = res.signals.filter(function (s) { return app.plotKeys.indexOf(s.key) >= 0; });
    if (!chosen.length) {
      container.appendChild(D.el('div', {
        class: 'charts-empty',
        text: 'Vyberte veličiny v levém seznamu. Tip: „Reakce – …“ dává silové účinky ve vazbě, ' +
          '„Pohon – …“ hnací moment nutný k předepsanému pohybu.'
      }));
      return;
    }

    var units = [];
    var byUnit = {};
    chosen.forEach(function (s) {
      if (!byUnit[s.unit]) { byUnit[s.unit] = []; units.push(s.unit); }
      byUnit[s.unit].push(s);
    });

    var ci = 0;
    units.forEach(function (u) {
      var series = byUnit[u].map(function (s) {
        return { label: groupLabel(res, s) + ' ' + s.label, data: s.data, color: PALETTE[ci++ % PALETTE.length] };
      });
      container.appendChild(makeChart(app, res.times, series, u));
    });
  };

  function groupLabel(res, s) {
    for (var i = 0; i < res.signalGroups.length; i++) {
      if (res.signalGroups[i].id === s.group) return res.signalGroups[i].label;
    }
    return s.group;
  }

  function makeChart(app, times, series, unit) {
    var canvas = D.el('canvas');
    var box = D.el('div', { class: 'chart-box' }, [canvas]);
    var state = { hover: -1 };

    function redraw() {
      drawChart(canvas, times, series, unit, app.time, state.hover);
    }
    box._redraw = redraw;

    canvas.addEventListener('mousemove', function (ev) {
      var r = canvas.getBoundingClientRect();
      state.hover = indexAt(canvas, times, ev.clientX - r.left);
      redraw();
    });
    canvas.addEventListener('mouseleave', function () { state.hover = -1; redraw(); });
    canvas.addEventListener('click', function (ev) {
      var r = canvas.getBoundingClientRect();
      var i = indexAt(canvas, times, ev.clientX - r.left);
      if (i >= 0) app.seekIndex(i);
    });

    requestAnimationFrame(redraw);
    return box;
  }

  var MARGIN = { l: 58, r: 10, t: 8, b: 24 };

  function plotRect(canvas) {
    var w = canvas.clientWidth || 400;
    var h = canvas.clientHeight || 150;
    return { x0: MARGIN.l, x1: w - MARGIN.r, y0: MARGIN.t, y1: h - MARGIN.b, w: w, h: h };
  }

  function indexAt(canvas, times, px) {
    var r = plotRect(canvas);
    if (!times.length) return -1;
    var f = (px - r.x0) / Math.max(1, r.x1 - r.x0);
    var i = Math.round(f * (times.length - 1));
    return Math.max(0, Math.min(times.length - 1, i));
  }

  function drawChart(canvas, times, series, unit, tMark, hover) {
    var h = 158;
    var w = canvas.parentNode.clientWidth || 400;
    var dpr = window.devicePixelRatio || 1;
    canvas.style.height = h + 'px';
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var r = { x0: MARGIN.l, x1: w - MARGIN.r, y0: MARGIN.t, y1: h - MARGIN.b };

    ctx.clearRect(0, 0, w, h);

    var lo = Infinity, hi = -Infinity;
    series.forEach(function (s) {
      for (var i = 0; i < s.data.length; i++) {
        var v = s.data[i];
        if (!isFinite(v)) continue;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    });
    if (!isFinite(lo)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-12) { var m = Math.max(1e-9, Math.abs(hi) * 0.1); lo -= m; hi += m; }
    var pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;

    var t0 = times[0] || 0, t1 = times[times.length - 1] || 1;
    if (t1 - t0 < 1e-12) t1 = t0 + 1;

    function X(t) { return r.x0 + (t - t0) / (t1 - t0) * (r.x1 - r.x0); }
    function Y(v) { return r.y1 - (v - lo) / (hi - lo) * (r.y1 - r.y0); }

    // mřížka a osy
    ctx.font = '10px "Cascadia Mono", Consolas, monospace';
    ctx.strokeStyle = '#232b35';
    ctx.fillStyle = '#7b879a';
    ctx.lineWidth = 1;
    var yt = niceTicks(lo, hi, 4);
    yt.forEach(function (v) {
      var y = Math.round(Y(v)) + 0.5;
      ctx.strokeStyle = Math.abs(v) < 1e-12 ? '#39424f' : '#232b35';
      ctx.beginPath(); ctx.moveTo(r.x0, y); ctx.lineTo(r.x1, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtTick(v), r.x0 - 5, y);
    });
    var xt = niceTicks(t0, t1, 6);
    xt.forEach(function (v) {
      var x = Math.round(X(v)) + 0.5;
      ctx.strokeStyle = '#232b35';
      ctx.beginPath(); ctx.moveTo(x, r.y0); ctx.lineTo(x, r.y1); ctx.stroke();
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(fmtTick(v), x, r.y1 + 4);
    });
    ctx.strokeStyle = '#39424f';
    ctx.strokeRect(r.x0 + 0.5, r.y0 + 0.5, r.x1 - r.x0, r.y1 - r.y0);

    ctx.save();
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillStyle = '#8e9bad';
    ctx.fillText('[' + unit + ']', 4, 2);
    ctx.restore();

    // průběhy
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
    ctx.clip();
    series.forEach(function (s) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      var started = false;
      for (var i = 0; i < times.length && i < s.data.length; i++) {
        var v = s.data[i];
        if (!isFinite(v)) { started = false; continue; }
        var x = X(times[i]), y = Y(v);
        if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
      }
      ctx.stroke();
    });
    ctx.restore();

    // značka aktuálního času animace
    if (tMark != null && tMark >= t0 && tMark <= t1) {
      var xm = Math.round(X(tMark)) + 0.5;
      ctx.strokeStyle = 'rgba(255,178,63,.9)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(xm, r.y0); ctx.lineTo(xm, r.y1); ctx.stroke();
      ctx.setLineDash([]);
    }

    // legenda + odečet
    var lx = r.x0 + 8, ly = r.y0 + 8;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    series.forEach(function (s) {
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, ly + 3, 8, 3);
      ctx.fillStyle = '#c3ccd8';
      var txt = s.label;
      if (hover >= 0 && hover < s.data.length) txt += ' = ' + D.fmt(s.data[hover], 4);
      ctx.fillText(txt, lx + 13, ly);
      ly += 13;
    });

    if (hover >= 0 && hover < times.length) {
      var xh = Math.round(X(times[hover])) + 0.5;
      ctx.strokeStyle = 'rgba(219,225,234,.35)';
      ctx.beginPath(); ctx.moveTo(xh, r.y0); ctx.lineTo(xh, r.y1); ctx.stroke();
      ctx.fillStyle = '#8e9bad';
      ctx.textAlign = xh > (r.x0 + r.x1) / 2 ? 'right' : 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText('t = ' + times[hover].toFixed(4) + ' s', xh + (xh > (r.x0 + r.x1) / 2 ? -4 : 4), r.y1 - 2);
    }
  }

  function niceTicks(lo, hi, count) {
    var span = hi - lo;
    if (!(span > 0)) return [lo];
    var raw = span / count;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = mag * (norm > 5 ? 10 : norm > 2 ? 5 : norm > 1 ? 2 : 1);
    var out = [];
    var start = Math.ceil(lo / step) * step;
    for (var v = start; v <= hi + step * 1e-6 && out.length < 20; v += step) out.push(v);
    return out;
  }

  function fmtTick(v) {
    if (Math.abs(v) < 1e-12) return '0';
    var a = Math.abs(v);
    if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
    var dec = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : 3;
    return v.toFixed(dec);
  }

  /** Překreslí existující grafy (např. při posunu času). */
  P.redrawAll = function (container) {
    for (var i = 0; i < container.children.length; i++) {
      var c = container.children[i];
      if (c._redraw) c._redraw();
    }
  };

  MBD.Plots = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
