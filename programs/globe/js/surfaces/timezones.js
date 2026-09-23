// Nautical time zones – 24 stripes 15° wide, each with a live clock.

import { createMapCanvas } from '../core/canvasMap.js';
import { loadJSON, URLS } from '../core/data.js';
import { feature } from 'topojson-client';

const pad = (n) => String(n).padStart(2, '0');
const offsetLabel = (o) => (o === 0 ? 'UTC' : `UTC${o > 0 ? '+' : '−'}${Math.abs(o)}`);

function clock(offset, now = Date.now()) {
  const d = new Date(now + offset * 3600000);
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export default {
  id: 'timezones',
  name: 'Časová pásma',
  category: 'Současnost',
  description: 'Námořní časová pásma po 15° délky s aktuálním časem v každém z nich.',
  options: [
    { id: 'daylight', label: 'Zvýraznit, kde je právě den', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    ctx.progress('Načítám pevninu…');
    const topo = await loadJSON(URLS.land);
    const land = feature(topo, topo.objects.land);

    const m = createMapCanvas(ctx.textureWidth);
    const g = m.ctx;
    const zoneColor = (i, sea) => `hsl(${(i * 360) / 24}, ${sea ? 35 : 55}%, ${sea ? (i % 2 ? 30 : 36) : (i % 2 ? 62 : 70)}%)`;

    for (let i = 0; i < 24; i++) {
      const offset = i - 12;
      const x0 = ((offset * 15 - 7.5 + 180) / 360) * m.width;
      const wdt = m.width / 24;
      g.save();
      g.beginPath();
      g.rect(x0, 0, wdt, m.height);
      g.clip();
      g.fillStyle = zoneColor(i, true);
      g.fillRect(x0, 0, wdt, m.height);
      m.fill(land, zoneColor(i, false));
      g.restore();
    }
    // UTC−12 and UTC+12 are half-zones; the stripe loop above covers −187.5° … +172.5°
    // so the last half-stripe (+172.5° … +180°) is drawn separately.
    g.save();
    g.beginPath();
    g.rect(((172.5 + 180) / 360) * m.width, 0, m.width, m.height);
    g.clip();
    g.fillStyle = zoneColor(24, true);
    g.fillRect(0, 0, m.width, m.height);
    m.fill(land, zoneColor(24, false));
    g.restore();

    m.stroke(land, 'rgba(0,0,0,0.45)', 1);
    for (let i = -12; i <= 12; i++) {
      const [x] = m.xy(i * 15 + 7.5, 0);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x - m.px, 0, 2 * m.px, m.height);
    }

    const zones = [];
    for (let o = -12; o <= 12; o++) zones.push(o);
    const makeHtml = (o) => `<b>${offsetLabel(o)}</b>${clock(o)}`;
    const labels = [];
    for (const o of zones) {
      const lon = o === 12 ? 176 : o === -12 ? -176 : o * 15;
      for (const lat of [52, 0, -40]) labels.push({ lat, lon, html: makeHtml(o), rank: lat === 0 ? 0 : 3, className: 'tz', offset: o });
    }

    // semi-transparent "night" shading of the stripes, refreshed every minute
    let lastMinute = -1;
    return {
      map: m.canvas,
      lighting: 'soft',
      labels,
      info: 'Námořní (teoretická) pásma: každých 15° zeměpisné délky se čas posune o 1 hodinu. Skutečná civilní pásma kopírují hranice států a mohou se od nich lišit.',
      attribution: 'Pevnina: Natural Earth',
      update(dt, now) {
        const minute = Math.floor(now / 60000);
        if (minute === lastMinute) return;
        lastMinute = minute;
        ctx.globe.labels.updateText('surface', (it) => {
          const hour = new Date(now + it.offset * 3600000).getUTCHours();
          it.el.style.opacity = opts.daylight && (hour < 6 || hour >= 18) ? '0.55' : '1';
          return makeHtml(it.offset);
        });
      },
      describe(lat, lon) {
        const o = Math.round(lon / 15);
        return { title: `${offsetLabel(o)} – ${clock(o)}`, lines: [`Pásmo ${o * 15 - 7.5}° až ${o * 15 + 7.5}° délky`] };
      },
    };
  },
};
