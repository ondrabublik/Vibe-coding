// Hypsometric relief map (elevation colours + hill shading) with a
// "what if the sea rose" slider.

import { loadImage, imagePixels, URLS } from '../core/data.js';
import { rampColor } from '../core/canvasMap.js';
import { formatNumber } from '../core/geo.js';

// Grey level → metres, fitted to ~20 known places (Moscow, Madrid, Denver, Bogotá,
// La Paz…): about 25 m per grey level; the highest peaks are smoothed in the
// image, hence the steeper top segment. All elevations are approximate.
const toMetres = (g) => (g <= 180 ? g * 25 : 4500 + (g - 180) * 70);

const RAMP = [
  [0, '#5a9a58'], [100, '#79ad64'], [300, '#abc577'], [600, '#e3d995'], [1000, '#dcb676'],
  [1500, '#c68f5a'], [2500, '#a46c47'], [3500, '#8a5b47'], [4500, '#9d938f'], [5500, '#d9d6d4'], [7000, '#ffffff'],
];
const OCEAN = [36, 84, 135];
const FLOODED = [96, 170, 220];

const SEA_LEVELS = [0, 10, 25, 50, 70, 100, 150, 200, 300, 500, 1000, 2000].map((v) => ({
  value: v,
  label: v === 0 ? 'dnešní' : `+${formatNumber(v)} m${v === 70 ? ' (roztátí všech ledovců)' : ''}`,
}));

export default {
  id: 'relief',
  name: 'Výšková mapa',
  category: 'Současnost',
  description: 'Barevný reliéf pevniny – a co by se stalo, kdyby stoupla hladina moří.',
  options: [
    { id: 'sea', label: 'Hladina moře', type: 'steps', values: SEA_LEVELS, default: 0, live: true },
  ],

  async build(ctx, opts) {
    ctx.progress('Načítám výškový model…');
    const [topoImg, waterImg] = await Promise.all([loadImage(URLS.topology), loadImage(URLS.water)]);
    const w = topoImg.width;
    const h = topoImg.height;
    const topo = imagePixels(topoImg).data;
    const water = imagePixels(waterImg, w, h).data;

    const elev = new Float32Array(w * h);
    const isSea = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      elev[i] = toMetres(topo[i * 4]);
      isSea[i] = water[i * 4] > 128 ? 1 : 0;
    }

    // hill shading (light from north-west), computed once
    const shade = new Float32Array(w * h);
    const L = [-0.55, -0.55, 0.63];
    for (let y = 0; y < h; y++) {
      const cosLat = Math.max(0.1, Math.cos(((y + 0.5) / h - 0.5) * Math.PI));
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = (elev[y * w + ((x + 1) % w)] - elev[y * w + ((x - 1 + w) % w)]) / cosLat;
        const dy = elev[Math.min(h - 1, y + 1) * w + x] - elev[Math.max(0, y - 1) * w + x];
        const nx = -dx / 900;
        const ny = -dy / 900;
        const len = Math.hypot(nx, ny, 1);
        const d = (nx * L[0] + ny * L[1] + L[2]) / len;
        shade[i] = 0.72 + 0.5 * (d - L[2]);
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const g = canvas.getContext('2d');
    const img = g.createImageData(w, h);
    const px = img.data;
    const lut = Array.from({ length: 256 }, (_, v) => rampColor(RAMP, toMetres(v)));

    let rise = opts.sea;
    const draw = () => {
      for (let i = 0; i < w * h; i++) {
        let c;
        let s = 1;
        if (isSea[i]) c = OCEAN;
        else if (rise > 0 && elev[i] < rise) c = FLOODED;
        else { c = lut[topo[i * 4]]; s = shade[i]; }
        px[i * 4] = Math.min(255, c[0] * s);
        px[i * 4 + 1] = Math.min(255, c[1] * s);
        px[i * 4 + 2] = Math.min(255, c[2] * s);
        px[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
    };
    draw();
    const texture = new ctx.THREE.CanvasTexture(canvas);

    return {
      map: texture,
      lighting: 'soft',
      legend: {
        title: 'Nadmořská výška (přibližně)',
        items: [
          ...[0, 300, 1000, 2500, 4500, 7000].map((m) => ({ color: `rgb(${rampColor(RAMP, m).join(',')})`, label: `${formatNumber(m)} m` })),
          { color: `rgb(${FLOODED.join(',')})`, label: 'zaplavená pevnina' },
        ],
      },
      info: 'Výšky pocházejí z 8bitového modelu, jsou proto jen přibližné (krok ~25 m v nížinách). Roztátí všech ledovců by zvedlo hladinu asi o 70 m.',
      attribution: 'Výškový model: NASA / three-globe',
      setOption(id, value) {
        if (id !== 'sea') return false;
        rise = value;
        draw();
        texture.needsUpdate = true;
        return true;
      },
      describe(lat, lon) {
        const x = Math.min(w - 1, Math.floor(((lon + 180) / 360) * w));
        const y = Math.min(h - 1, Math.floor(((90 - lat) / 180) * h));
        const i = y * w + x;
        if (isSea[i]) return { title: 'Oceán' };
        const lines = [`Nadmořská výška ≈ ${formatNumber(elev[i])} m`];
        if (rise > 0 && elev[i] < rise) lines.push(`Zaplaveno při hladině +${rise} m`);
        return { title: 'Pevnina', lines };
      },
    };
  },
};
