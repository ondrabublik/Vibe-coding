/*
 * viewport.js - transformace svět <-> obrazovka, posun a zoom.
 * Svět: metry, osa y nahoru. Obrazovka: pixely, osa y dolů.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var V = {};

  V.create = function (canvas) {
    var vp = {
      canvas: canvas,
      ctx: canvas.getContext('2d'),
      scale: 300,        // px na metr
      cx: 0, cy: 0,      // střed pohledu ve světových souřadnicích
      w: 1, h: 1, dpr: 1
    };

    vp.resize = function () {
      var r = canvas.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      vp.w = Math.max(1, Math.round(r.width));
      vp.h = Math.max(1, Math.round(r.height));
      vp.dpr = dpr;
      canvas.width = Math.round(vp.w * dpr);
      canvas.height = Math.round(vp.h * dpr);
      vp.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    vp.sx = function (x) { return (x - vp.cx) * vp.scale + vp.w / 2; };
    vp.sy = function (y) { return vp.h / 2 - (y - vp.cy) * vp.scale; };
    vp.wx = function (sx) { return (sx - vp.w / 2) / vp.scale + vp.cx; };
    vp.wy = function (sy) { return (vp.h / 2 - sy) / vp.scale + vp.cy; };

    vp.toScreen = function (p) { return [vp.sx(p[0]), vp.sy(p[1])]; };
    vp.toWorld = function (p) { return [vp.wx(p[0]), vp.wy(p[1])]; };
    vp.pxToM = function (px) { return px / vp.scale; };

    vp.panByPixels = function (dx, dy) {
      vp.cx -= dx / vp.scale;
      vp.cy += dy / vp.scale;
    };

    vp.zoomAt = function (screenPt, factor) {
      var before = vp.toWorld(screenPt);
      vp.scale = Math.min(200000, Math.max(2, vp.scale * factor));
      var after = vp.toWorld(screenPt);
      vp.cx += before[0] - after[0];
      vp.cy += before[1] - after[1];
    };

    /** Přizpůsobí pohled obdélníku [xmin, ymin, xmax, ymax]. */
    vp.fit = function (bbox, padFrac) {
      if (!bbox) return;
      var pad = padFrac == null ? 0.18 : padFrac;
      var bw = Math.max(1e-3, bbox[2] - bbox[0]);
      var bh = Math.max(1e-3, bbox[3] - bbox[1]);
      vp.cx = (bbox[0] + bbox[2]) / 2;
      vp.cy = (bbox[1] + bbox[3]) / 2;
      var s = Math.min(vp.w / (bw * (1 + 2 * pad)), vp.h / (bh * (1 + 2 * pad)));
      vp.scale = Math.min(200000, Math.max(2, s));
    };

    /** Vhodný krok mřížky (1/2/5 × 10^k) tak, aby měl alespoň minPx pixelů. */
    vp.gridStep = function (minPx) {
      var target = (minPx || 28) / vp.scale;
      var mag = Math.pow(10, Math.floor(Math.log10(target)));
      var candidates = [1, 2, 5, 10];
      for (var i = 0; i < candidates.length; i++) {
        if (mag * candidates[i] >= target) return mag * candidates[i];
      }
      return mag * 10;
    };

    vp.resize();
    return vp;
  };

  MBD.Viewport = V;
})(typeof globalThis !== 'undefined' ? globalThis : this);
