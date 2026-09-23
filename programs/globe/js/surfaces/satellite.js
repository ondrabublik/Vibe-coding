// Photographic Earth – NASA Blue Marble mosaic with relief and ocean glint.

import { loadImage, URLS } from '../core/data.js';

export default {
  id: 'satellite',
  name: 'Satelitní snímek',
  category: 'Současnost',
  description: 'Mozaika NASA Blue Marble s plastickým reliéfem a odlesky oceánu.',
  options: [
    {
      id: 'variant', label: 'Snímek', type: 'select', default: 'marble',
      choices: [
        { value: 'marble', label: 'Blue Marble (přirozené barvy)' },
        { value: 'day', label: 'Den – kontrastní' },
      ],
    },
    { id: 'relief', label: 'Plastický reliéf', type: 'checkbox', default: true },
    { id: 'glint', label: 'Odlesky oceánu', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    const [map, topo, water] = await Promise.all([
      loadImage(opts.variant === 'day' ? URLS.earthDay : URLS.blueMarble),
      opts.relief ? loadImage(URLS.topology) : null,
      opts.glint ? loadImage(URLS.water) : null,
    ]);
    return {
      map,
      bumpMap: topo,
      bumpScale: 6,
      specularMap: water,
      specular: 0x4a5a6a,
      shininess: 14,
      lighting: 'natural',
      attribution: 'NASA Blue Marble / Visible Earth',
    };
  },
};
