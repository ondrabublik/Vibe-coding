// "Inverted Earth" – oceans become continents and continents become seas.

import { createMapCanvas } from '../core/canvasMap.js';
import { loadJSON, URLS } from '../core/data.js';
import { feature } from 'topojson-client';

// [name, lon, lat, rank, kind]
const NEW_NAMES = [
  ['Pacifická pevnina', -150, 5, 0, 'land'], ['Atlantida', -35, 20, 0, 'land'], ['Jižní Atlantida', -15, -30, 1, 'land'],
  ['Indický kontinent', 78, -25, 0, 'land'], ['Arktický ostrov', 0, 86, 2, 'land'], ['Jižní prstenec', 60, -58, 1, 'land'],
  ['Asijské moře', 90, 50, 1, 'sea'], ['Africký oceán', 20, 5, 1, 'sea'], ['Americký oceán', -100, 45, 1, 'sea'],
  ['Jihoamerické moře', -60, -12, 2, 'sea'], ['Australská zátoka', 134, -25, 2, 'sea'], ['Antarktický oceán', 30, -80, 2, 'sea'],
  ['Evropský záliv', 15, 50, 3, 'sea'], ['Grónské jezero', -41, 73, 3, 'sea'],
];

export default {
  id: 'inverted',
  name: 'Obrácená Země',
  category: 'Fantazie',
  description: 'Co kdyby oceány byly pevninou a kontinenty mořem? Vypadá to jako cizí planeta.',
  options: [
    { id: 'labels', label: 'Vymyšlené názvy', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    const topo = await loadJSON(URLS.land);
    const land = feature(topo, topo.objects.land);

    const m = createMapCanvas(ctx.textureWidth);
    const g = m.ctx;
    // the former oceans: vegetation by latitude
    const grad = g.createLinearGradient(0, 0, 0, m.height);
    const stops = [[90, '#f4f7f8'], [70, '#c9d3c4'], [55, '#5f7d4c'], [35, '#8ca05f'], [22, '#d2bb82'], [10, '#6d9a4f'], [0, '#3f7a3c']];
    for (const [lat, c] of stops) grad.addColorStop((90 - lat) / 180, c);
    for (const [lat, c] of [...stops].reverse()) grad.addColorStop((90 + lat) / 180, c);
    g.fillStyle = grad;
    g.fillRect(0, 0, m.width, m.height);

    // the former continents: seas, with a lighter coastal band
    g.save();
    g.beginPath(); m.path(land); g.clip();
    g.fillStyle = '#1f4f80';
    g.fillRect(0, 0, m.width, m.height);
    g.beginPath(); m.path(land);
    g.lineJoin = 'round';
    for (const [w, c] of [[40, 'rgba(60,130,180,0.35)'], [20, 'rgba(80,160,200,0.45)'], [8, 'rgba(120,190,215,0.6)']]) {
      g.strokeStyle = c;
      g.lineWidth = w * m.px;
      g.stroke();
    }
    g.restore();
    m.stroke(land, 'rgba(230,220,180,0.9)', 1.2);

    return {
      map: m.canvas,
      bumpMap: null,
      specular: 0x000000,
      lighting: 'natural',
      labels: opts.labels
        ? NEW_NAMES.map(([text, lon, lat, rank, kind]) => ({ lat, lon, text, rank, className: kind === 'land' ? 'country' : 'sea' }))
        : [],
      info: 'Pevnina by pokrývala 71 % povrchu a mořím by vévodilo „Asijské moře“. Vegetace je jen odhad podle zeměpisné šířky.',
      attribution: 'Obrysy pevnin: Natural Earth',
    };
  },
};
