// City lights at night (NASA Black Marble).

import { loadImage, URLS } from '../core/data.js';

export default {
  id: 'night',
  name: 'Noční světla',
  category: 'Současnost',
  description: 'Umělé osvětlení měst viděné z oběžné dráhy – mapa lidského osídlení.',
  options: [],

  async build() {
    return {
      map: await loadImage(URLS.earthNight),
      lighting: 'flat',
      info: 'Nejjasnější oblasti prozrazují hustotu osídlení a ekonomickou aktivitu: Evropa, východ USA, Japonsko, údolí Nilu nebo Indie. Tmavé zůstávají pouště, tajga, Amazonie i Severní Korea.',
      attribution: 'NASA Black Marble',
    };
  },
};
