// Cities from Natural Earth; more appear as you zoom in.

import { loadJSON, URLS } from '../core/data.js';
import { formatNumber, angularDistance } from '../core/geo.js';

export default {
  id: 'cities',
  name: 'Města',
  description: 'Hlavní a velká města, při přiblížení přibývají menší.',
  options: [
    { id: 'capitals', label: 'Jen hlavní města', type: 'checkbox', default: false },
  ],

  async build(ctx, opts) {
    const data = await loadJSON(URLS.places);
    const places = data.features
      .map((f) => f.properties)
      .filter((p) => !opts.capitals || p.adm0cap === 1)
      .sort((a, b) => b.pop_max - a.pop_max);

    const labels = places.map((p) => {
      // importance: megacities first, then by Natural Earth scalerank
      const rank = Math.max(1, Math.min(10, p.scalerank + 1 - (p.adm0cap ? 1 : 0) - (p.megacity ? 1 : 0)));
      return {
        lat: p.latitude, lon: p.longitude, text: p.name, rank,
        className: `city${p.adm0cap ? ' capital' : ''}`,
      };
    });

    return {
      labels,
      attribution: 'Města: Natural Earth',
      describe(lat, lon) {
        const tol = Math.max(0.15, (ctx.globe.cameraDistance - 1) * 1.2);
        const p = places.find((c) => angularDistance(lat, lon, c.latitude, c.longitude) < tol);
        if (!p) return null;
        const lines = [`${p.adm0name}${p.adm0cap ? ' – hlavní město' : ''}`];
        if (p.pop_max > 0) lines.push(`Aglomerace: ${formatNumber(p.pop_max)} obyv.`);
        return { title: p.name, lines };
      },
    };
  },
};
