// Continental drift – reconstructed coastlines from the GPlates Web Service
// (plate model of Merdith et al. 2021, 0–1000 million years).

import { createMapCanvas, rewind } from '../core/canvasMap.js';
import { loadJSON, URLS } from '../core/data.js';

const MODEL = 'MERDITH2021';

const TIMES = [
  [0, 'Dnešní rozložení kontinentů.'],
  [20, 'Miocén – Indie už narazila do Asie a vyzdvihuje Himálaj, Austrálie se blíží k Asii.'],
  [50, 'Eocén – Indie těsně před srážkou s Asií, Austrálie se odděluje od Antarktidy.'],
  [66, 'Konec křídy – dopad planetky Chicxulub a vymírání dinosaurů. Atlantik se rozšiřuje.'],
  [100, 'Křída – Jižní Amerika se odtrhla od Afriky, vzniká jižní Atlantik.'],
  [150, 'Jura – rozpad Pangey: Laurasie na severu, Gondwana na jihu, mezi nimi oceán Tethys.'],
  [200, 'Hranice triasu a jury – Pangea se začíná trhat, otevírá se centrální Atlantik.'],
  [250, 'Konec permu – Pangea pohromadě; největší vymírání v dějinách Země (~90 % druhů).'],
  [300, 'Karbon – vrcholí skládání Pangey, rozsáhlé uhlotvorné pralesy.'],
  [400, 'Devon – „věk ryb“; Laurussie a Gondwana se k sobě přibližují.'],
  [500, 'Kambrium – exploze mnohobuněčného života v mořích, pevnina je ještě pustá.'],
  [600, 'Ediakara – po rozpadu Rodinie; Země se vzpamatovává ze zalednění.'],
  [750, 'Rozpad superkontinentu Rodinie.'],
  [900, 'Superkontinent Rodinie.'],
  [1000, 'Rodinie se právě zformovala (před miliardou let).'],
];

const label = (t) => (t === 0 ? 'dnes' : `před ${t} mil. let`);

export default {
  id: 'paleo',
  name: 'Pohyb kontinentů',
  category: 'Historie',
  description: 'Rozložení pevnin za posledních miliardu let – Pangea, Gondwana, Rodinie.',
  options: [
    { id: 'time', label: 'Doba', type: 'steps', values: TIMES.map(([t]) => ({ value: t, label: label(t) })), default: 250 },
    { id: 'climate', label: 'Pásma podle zeměpisné šířky', type: 'checkbox', default: true },
  ],

  async build(ctx, opts) {
    ctx.progress(`Rekonstruuji kontinenty ${label(opts.time)}… (server GPlates odpovídá i 10–20 s)`);
    const [coast, shelf] = await Promise.all([
      loadJSON(URLS.paleo('coastlines', opts.time, MODEL)),
      loadJSON(URLS.paleo('static_polygons', opts.time, MODEL)),
    ]);
    rewind(coast);
    rewind(shelf);

    const m = createMapCanvas(ctx.textureWidth);
    const g = m.ctx;
    const ocean = g.createLinearGradient(0, 0, 0, m.height);
    ocean.addColorStop(0, '#1b3f66');
    ocean.addColorStop(0.5, '#1f5486');
    ocean.addColorStop(1, '#1b3f66');
    g.fillStyle = ocean;
    g.fillRect(0, 0, m.width, m.height);
    m.graticule(30, 'rgba(255,255,255,0.12)');

    // continental crust (shelves and shallow seas)
    m.fill(shelf, 'rgba(70,140,185,0.85)');

    // land – optionally tinted by today's climate belts at the palaeo-latitude
    let landFill = '#8a9a5b';
    if (opts.climate) {
      const grad = g.createLinearGradient(0, 0, 0, m.height);
      const stops = [
        [90, '#eef3f5'], [66, '#dfe6e3'], [58, '#7d9463'], [40, '#8fa565'], [30, '#cdb57d'],
        [15, '#d6be85'], [8, '#5f8f4a'], [0, '#4f8a45'],
      ];
      for (const [lat, c] of stops) grad.addColorStop((90 - lat) / 180, c);
      for (const [lat, c] of [...stops].reverse()) grad.addColorStop((90 + lat) / 180, c);
      landFill = grad;
    }
    m.fill(coast, landFill);
    m.stroke(coast, 'rgba(30,40,20,0.3)', 0.6);

    const info = TIMES.find(([t]) => t === opts.time)?.[1] || '';
    return {
      map: m.canvas,
      lighting: 'soft',
      view: { lat: 5, lon: 20 },
      info: `${info} Dnešní obrysy pevnin jsou posunuty podle modelu deskové tektoniky; světlejší modrá je kontinentální kůra zalitá mělkým mořem.`,
      legend: opts.climate
        ? {
          title: 'Podnebí (odhad podle zeměpisné šířky)',
          items: [
            { color: '#4f8a45', label: 'tropický deštný les' },
            { color: '#d6be85', label: 'suché subtropy, pouště' },
            { color: '#8fa565', label: 'mírné pásmo' },
            { color: '#eef3f5', label: 'polární oblasti' },
            { color: 'rgba(70,140,185,1)', label: 'mělké moře na kontinentech' },
          ],
        }
        : null,
      attribution: 'Rekonstrukce: GPlates Web Service, model Merdith et al. (2021)',
    };
  },
};
