// Tectonic plate boundaries (Bird 2003, PB2002 model).

import * as THREE from 'three';
import { loadJSON, URLS } from '../core/data.js';
import { geometryToSegments } from '../core/geo.js';
import { rewind, labelAnchor, createFeatureIndex } from '../core/canvasMap.js';

const PLATES_CS = {
  Africa: 'Africká', Antarctica: 'Antarktická', Arabia: 'Arabská', Australia: 'Australská', Caribbean: 'Karibská',
  Cocos: 'Kokosová', Eurasia: 'Euroasijská', India: 'Indická', 'Juan de Fuca': 'Juan de Fuca', Nazca: 'Nazca',
  'North America': 'Severoamerická', Pacific: 'Pacifická', 'Philippine Sea': 'Filipínská', Scotia: 'Scotia',
  'South America': 'Jihoamerická', Somalia: 'Somálská', Sunda: 'Sundská', Yangtze: 'Jang-c’-ťiangská',
  Okhotsk: 'Ochotská', Amur: 'Amurská', Anatolia: 'Anatolská', Aegean: 'Egejská',
};
const plateName = (n) => (PLATES_CS[n] ? `${PLATES_CS[n]} deska` : `Deska ${n}`);

function lines(features, color, opacity) {
  const pos = [];
  for (const f of features) geometryToSegments(f.geometry, 1.0018, 1, pos);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
}

export default {
  id: 'tectonics',
  name: 'Tektonické desky',
  description: 'Hranice litosférických desek – místa zemětřesení, sopek a vrásnění.',
  options: [
    { id: 'names', label: 'Názvy desek', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    const [boundaries, plates] = await Promise.all([loadJSON(URLS.plateBoundaries), loadJSON(URLS.plates)]);
    rewind(plates);
    const group = new THREE.Group();
    const subduction = boundaries.features.filter((f) => f.properties.Type === 'subduction');
    const other = boundaries.features.filter((f) => f.properties.Type !== 'subduction');
    group.add(lines(other, 0xff7a3d, 0.9));
    group.add(lines(subduction, 0xff2d55, 1));

    const labels = [];
    if (opts.names) {
      for (const f of plates.features) {
        const a = labelAnchor(f);
        if (!a || a.area < 0.01) continue;
        labels.push({ lat: a.lat, lon: a.lon, text: plateName(f.properties.PlateName), rank: a.area > 0.3 ? 0 : a.area > 0.08 ? 2 : 4, className: 'plate' });
      }
    }
    const find = createFeatureIndex(plates.features);

    return {
      object: group,
      labels,
      attribution: 'Desky: P. Bird (2003), PB2002',
      describe(lat, lon) {
        const f = find(lon, lat);
        return f ? { title: plateName(f.properties.PlateName), lines: ['Červeně: subdukční zóny, oranžově: ostatní rozhraní'] } : null;
      },
    };
  },
};
