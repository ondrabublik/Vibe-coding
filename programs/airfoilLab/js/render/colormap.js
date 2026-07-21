(function (NS) {
  'use strict';

  // Direct copy from finiteVolumeMethod/js/render/colormap.js.
  const Colormap = NS.Colormap = {};

  function turbo(t) {
    t = Math.max(0, Math.min(1, t));
    const r = Math.round(255 * Math.max(0, Math.min(1,
      t < 0.25 ? 0.18 + 2.64 * t : t < 0.50 ? 0.84 + 0.48 * (t - 0.25) :
      t < 0.75 ? 0.96 - 1.44 * (t - 0.5) : 0.60 - 2.16 * (t - 0.75))));
    const g = Math.round(255 * Math.max(0, Math.min(1,
      t < 0.125 ? 0.06 + 5.84 * t : t < 0.375 ? 0.79 + 0.32 * (t - 0.125) :
      t < 0.625 ? 0.87 - 1.44 * (t - 0.375) : t < 0.875 ? 0.51 - 1.60 * (t - 0.625) :
      0.11 - 0.84 * (t - 0.875))));
    const b = Math.round(255 * Math.max(0, Math.min(1,
      t < 0.25 ? 0.24 + 2.76 * t : t < 0.375 ? 0.93 - 2.08 * (t - 0.25) :
      t < 0.50 ? 0.67 - 2.48 * (t - 0.375) : t < 0.75 ? 0.36 - 0.96 * (t - 0.5) :
      0.12 - 0.36 * (t - 0.75))));
    return [r, g, b];
  }

  const viridisCtrl = [
    [0.267, 0.005, 0.329], [0.127, 0.566, 0.551],
    [0.369, 0.788, 0.383], [0.993, 0.906, 0.144],
  ];
  function viridis(t) {
    t = Math.max(0, Math.min(1, t));
    const s = t * (viridisCtrl.length - 1);
    const i = Math.min(Math.floor(s), viridisCtrl.length - 2);
    const f = s - i;
    const a = viridisCtrl[i], b = viridisCtrl[i + 1];
    return [Math.round(255*(a[0]+f*(b[0]-a[0]))), Math.round(255*(a[1]+f*(b[1]-a[1]))), Math.round(255*(a[2]+f*(b[2]-a[2])))];
  }

  const cwCtrl = [
    [0.017,0.392,0.722],[0.550,0.712,0.892],[0.950,0.950,0.950],
    [0.952,0.635,0.506],[0.706,0.016,0.150],
  ];
  function coolwarm(t) {
    t = Math.max(0, Math.min(1, t));
    const s = t * (cwCtrl.length - 1);
    const i = Math.min(Math.floor(s), cwCtrl.length - 2);
    const f = s - i;
    const a = cwCtrl[i], b = cwCtrl[i + 1];
    return [Math.round(255*(a[0]+f*(b[0]-a[0]))), Math.round(255*(a[1]+f*(b[1]-a[1]))), Math.round(255*(a[2]+f*(b[2]-a[2])))];
  }

  const jetCtrl = [[0,0,0.5],[0,0,1],[0,1,1],[1,1,0],[1,0,0],[0.5,0,0]];
  const jetPos  = [0, 0.125, 0.375, 0.625, 0.875, 1.0];
  function jet(t) {
    t = Math.max(0, Math.min(1, t));
    for (let k = 0; k < jetPos.length - 1; k++) {
      if (t <= jetPos[k + 1]) {
        const f = (t - jetPos[k]) / (jetPos[k + 1] - jetPos[k]);
        const a = jetCtrl[k], b = jetCtrl[k + 1];
        return [Math.round(255*(a[0]+f*(b[0]-a[0]))), Math.round(255*(a[1]+f*(b[1]-a[1]))), Math.round(255*(a[2]+f*(b[2]-a[2])))];
      }
    }
    const l = jetCtrl[jetCtrl.length - 1];
    return [Math.round(255*l[0]), Math.round(255*l[1]), Math.round(255*l[2])];
  }

  function grayscale(t) { t = Math.max(0, Math.min(1, t)); const v = Math.round(255*t); return [v,v,v]; }

  const fns = { jet, turbo, viridis, coolwarm, grayscale };

  Colormap.map = function (v, vmin, vmax, name) {
    const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
    return (fns[name] || fns.turbo)(t);
  };

  Colormap.buildLUT = function (name, vmin, vmax) {
    const lut = new Uint8Array(256 * 3);
    const fn = fns[name] || fns.turbo;
    for (let i = 0; i < 256; i++) {
      const [r, g, b] = fn(i / 255);
      lut[i*3] = r; lut[i*3+1] = g; lut[i*3+2] = b;
    }
    return { lut, vmin, vmax };
  };

  Colormap.lutLookup = function (v, { lut, vmin, vmax }) {
    const t = vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5;
    const idx = Math.max(0, Math.min(255, Math.round(t * 255))) * 3;
    return [lut[idx], lut[idx+1], lut[idx+2]];
  };

  Colormap.names = Object.keys(fns);
})(window.AFL);
