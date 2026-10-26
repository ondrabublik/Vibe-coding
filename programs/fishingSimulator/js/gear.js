'use strict';
// Vybavení: data položek obchodu a 3D modely (splávky, háčky, návnady, třpytky, navijáky, balení…).
(function (FS) {
  const U = FS.U;
  const G = { items: [], byId: {} };
  FS.Gear = G;
  const V3 = THREE.Vector3;

  G.cats = [
    { id: 'rod', name: 'Pruty' }, { id: 'reel', name: 'Navijáky' }, { id: 'line', name: 'Vlasce' },
    { id: 'hook', name: 'Háčky' }, { id: 'float', name: 'Splávky' }, { id: 'bait', name: 'Návnady' },
    { id: 'lure', name: 'Třpytky a nástrahy' }, { id: 'groundbait', name: 'Příkrm' }, { id: 'acc', name: 'Doplňky' },
  ];
  const add = (it) => { G.items.push(it); G.byId[it.id] = it; };

  // ---- pruty ----
  add({ id: 'prut_bambus', cat: 'rod', name: 'Bambusový prut 2,7 m', price: 0, desc: 'Dědečkův starý bambus. Měkký, nahodí kousek, ale ryby chytá.', s: { len: 2.7, cast: 0.78, load: 3.2 }, look: { blank: '#c8a868', handle: 'cork', bamboo: true } });
  add({ id: 'prut_tele', cat: 'rod', name: 'Teleskop Classic 3,6 m', price: 450, desc: 'Univerzální teleskopický prut na plavanou.', s: { len: 3.6, cast: 0.92, load: 4.6 }, look: { blank: '#1d1d22', handle: 'eva' } });
  add({ id: 'prut_match', cat: 'rod', name: 'Match Pro 3,9 m', price: 1150, desc: 'Citlivý dlouhý prut, daleký hod lehkým splávkem a delší čas na zásek.', s: { len: 3.9, cast: 1.06, load: 5.2, sens: 1.3 }, look: { blank: '#1f3a2a', handle: 'cork' } });
  add({ id: 'prut_spin', cat: 'rod', name: 'Přívlačový Spin 2,4 m', price: 950, desc: 'Rychlá akce pro třpytky a woblery. Nástrahy s ním lákají dravce víc.', s: { len: 2.4, cast: 1.02, load: 6.5, lure: 1.35 }, look: { blank: '#2b3a52', handle: 'cork' } });
  add({ id: 'prut_carp', cat: 'rod', name: 'Kaprař 3,6 m (3 lb)', price: 1950, desc: 'Silný kaprový prut – zvládne i velké kapry a amury.', s: { len: 3.6, cast: 1.15, load: 11 }, look: { blank: '#121214', handle: 'eva' } });
  add({ id: 'prut_sumec', cat: 'rod', name: 'Sumcový Titan 3,0 m', price: 3600, desc: 'Neohnutelný prut na obry. Pro sumce nezbytnost.', s: { len: 3.0, cast: 1.0, load: 30 }, look: { blank: '#c9a200', handle: 'eva', thick: 1.6 } });
  // ---- navijáky ----
  add({ id: 'navijak_basic', cat: 'reel', name: 'Naviják Classic 2000', price: 0, desc: 'Jednoduchý naviják, pomalé navíjení, slabá brzda.', s: { speed: 0.9, drag: 3 }, look: { body: '#505560', spool: '#9aa0a8' } });
  add({ id: 'navijak_3000', cat: 'reel', name: 'Naviják Feeder 3000', price: 650, desc: 'Plynulá brzda a rychlejší převod.', s: { speed: 1.2, drag: 6 }, look: { body: '#1d1f24', spool: '#c0392b' } });
  add({ id: 'navijak_5000', cat: 'reel', name: 'Naviják Big Pit 5000', price: 1700, desc: 'Velká cívka, silná brzda – na kapry.', s: { speed: 1.45, drag: 13 }, look: { body: '#202a20', spool: '#7f8c6a' } });
  add({ id: 'navijak_8000', cat: 'reel', name: 'Naviják Titan 8000', price: 3300, desc: 'Kovové tělo, brzda až 30 kg.', s: { speed: 1.35, drag: 30 }, look: { body: '#1a1a1a', spool: '#d4af37' } });
  // ---- vlasce ----
  add({ id: 'vlasec_016', cat: 'line', name: 'Vlasec 0,16 mm (2,4 kg)', price: 90, desc: 'Tenký a nenápadný – plaché ryby berou ochotněji.', s: { d: 0.16, str: 2.4 } });
  add({ id: 'vlasec_020', cat: 'line', name: 'Vlasec 0,20 mm (3,5 kg)', price: 0, desc: 'Běžný univerzální vlasec.', s: { d: 0.2, str: 3.5 } });
  add({ id: 'vlasec_025', cat: 'line', name: 'Vlasec 0,25 mm (5,5 kg)', price: 160, desc: 'Pevnější vlasec na lína, cejna a menší kapry.', s: { d: 0.25, str: 5.5 } });
  add({ id: 'vlasec_030', cat: 'line', name: 'Vlasec 0,30 mm (8 kg)', price: 240, desc: 'Kaprový vlasec.', s: { d: 0.3, str: 8 } });
  add({ id: 'snura_035', cat: 'line', name: 'Pletená šňůra 0,14 mm (14 kg)', price: 520, desc: 'Nepružná, velmi pevná šňůra.', s: { d: 0.26, str: 14 } });
  add({ id: 'snura_050', cat: 'line', name: 'Sumcová šňůra 0,50 mm (36 kg)', price: 950, desc: 'Na sumce. Ryby ji ale vidí.', s: { d: 0.5, str: 36 } });
  // ---- háčky (balení) ----
  const hook = (id, label, size, price, desc) => add({ id, cat: 'hook', name: `Háčky č. ${label}`, price, pack: 10, consumable: true, desc, s: { size } });
  hook('hacek_16', '16', 1, 35, 'Drobné háčky na ouklej a plotice.');
  hook('hacek_12', '12', 2, 40, 'Na plotice, perlíny, karasy.');
  hook('hacek_8', '8', 3, 45, 'Univerzální – lín, cejn, okoun, menší kapr.');
  hook('hacek_4', '4', 4, 55, 'Na kapry, amury a dravce.');
  hook('hacek_10', '1/0', 5, 80, 'Velké háčky na sumce a štiky.');
  // ---- splávky ----
  add({ id: 'splavek_pero', cat: 'float', name: 'Splávek Pero 1 g', price: 35, consumable: true, pack: 1, desc: 'Velmi citlivý, ukáže i jemný záběr. Nedohodí daleko.', s: { g: 1, sens: 1.45 }, look: 'pero' });
  add({ id: 'splavek_waggler', cat: 'float', name: 'Splávek Waggler 3 g', price: 45, consumable: true, pack: 1, desc: 'Štíhlý, dobře viditelný, daleký hod.', s: { g: 3, sens: 1.15 }, look: 'waggler' });
  add({ id: 'splavek_kulaty', cat: 'float', name: 'Splávek Kulatý 5 g', price: 30, consumable: true, pack: 1, desc: 'Klasický červenobílý splávek.', s: { g: 5, sens: 1.0 }, look: 'kulaty' });
  add({ id: 'splavek_sumec', cat: 'float', name: 'Splávek Sumcový 20 g', price: 90, consumable: true, pack: 1, desc: 'Unese velkou nástrahu, velké ryby se ho nelekají.', s: { g: 20, sens: 0.7 }, look: 'sumec' });
  // ---- návnady ----
  const bait = (id, name, pack, price, desc, extra = {}) => add(Object.assign({ id, cat: 'bait', name, price, pack, consumable: true, desc, s: {} }, extra));
  bait('zizala', 'Žížaly', 20, 30, 'Univerzální návnada – bere na ni skoro všechno.');
  bait('cervi', 'Bílí červi', 30, 40, 'Plotice, perlíni, ouklej, cejni.');
  bait('kukurice', 'Kukuřice sladká', 30, 25, 'Kapr, amur, lín, karas.');
  bait('testo', 'Těsto vanilkové', 25, 35, 'Karas, kapr, plotice. Ve vodě se po čase rozpustí.', { s: { soft: 150 } });
  bait('chleb', 'Chléb', 30, 15, 'Perlín, plotice, amur. Rychle se rozmočí.', { s: { soft: 70 } });
  bait('rousnice', 'Rousnice', 15, 60, 'Velké žížaly – lín, úhoř, sumec, okoun.');
  bait('boilies_j', 'Boilies Jahoda 20 mm', 20, 130, 'Selektivně na kapry. Vyžaduje háček č. 8 a větší.', { s: { minHook: 3 } });
  bait('boilies_r', 'Boilies Rybí 24 mm', 20, 150, 'Velcí kapři, lysci, občas sumec. Háček č. 4+.', { s: { minHook: 4 } });
  bait('pelety', 'Pelety Halibut', 25, 95, 'Kapr, lín, sumec. Háček č. 8+.', { s: { minHook: 3 } });
  bait('rybicka', 'Nástražní rybka', 6, 90, 'Na dravce – štika, candát, sumec, okoun. Háček č. 8+.', { s: { minHook: 3 } });
  // ---- umělé nástrahy ----
  const lure = (id, name, price, desc, s) => add({ id, cat: 'lure', name, price, desc, s });
  lure('rotacni_s', 'Třpytka rotační č. 2 stříbrná', 120, 'Malá rotačka – okouni ji milují.', { g: 4, depth: 0.7, sink: 0.25 });
  lure('rotacni_g', 'Třpytka rotační č. 4 zlatá', 160, 'Větší rotačka na štiky i okouny.', { g: 8, depth: 1.1, sink: 0.35 });
  lure('plandavka', 'Plandavka červenobílá 12 g', 140, 'Klasika na štiku, daleký hod.', { g: 12, depth: 1.5, sink: 0.6 });
  lure('wobler_s', 'Wobler Plotička 7 cm', 290, 'Mělký wobler, věrná imitace plotice.', { g: 8, dive: 1.1, sink: 0 });
  lure('wobler_d', 'Wobler Deep 12 cm', 430, 'Potápí se do 2,8 m – candát, štika, sumec.', { g: 18, dive: 2.8, sink: 0 });
  lure('twister', 'Twister 8 cm na jigu', 70, 'Gumová nástraha, vede se skoky u dna.', { g: 10, depth: 9, sink: 0.7, jig: true });
  lure('ripper', 'Ripper 10 cm na jigu', 95, 'Gumová rybka s ploutvičkou – candáti a štiky.', { g: 14, depth: 9, sink: 0.8, jig: true });
  // ---- příkrm ----
  const gb = (id, name, price, desc, col) => add({ id, cat: 'groundbait', name, price, pack: 5, consumable: true, desc, s: {}, col });
  gb('gb_univ', 'Krmítková směs Univerzál', 60, 'Přiláká plotice, cejny, karasy a perlíny.', [0.55, 0.42, 0.28]);
  gb('gb_kapr', 'Krmení Kapr – Jahoda', 120, 'Sladká směs na kapry, karasy a líny.', [0.6, 0.3, 0.3]);
  gb('gb_partikl', 'Vařená kukuřice – partikl', 80, 'Kapr, amur, lín.', [0.85, 0.7, 0.2]);
  gb('gb_pelety', 'Krmné pelety', 140, 'Kapr, lín, láká i sumce.', [0.35, 0.25, 0.18]);
  gb('gb_cervi', 'Zakrmovací červi', 95, 'Cejn, plotice, okoun, lín.', [0.85, 0.8, 0.65]);
  // ---- doplňky ----
  add({ id: 'podberak', cat: 'acc', name: 'Podběrák', price: 350, desc: 'Bez něj velkou rybu (nad 2,5 kg) u břehu snadno ztratíš.', s: {} });
  add({ id: 'bryle', cat: 'acc', name: 'Polarizační brýle', price: 420, desc: 'Odstraní odlesky – uvidíš hlouběji pod hladinu i ryby u nástrahy.', s: {} });

  G.hookLabel = (size) => ({ 1: '16', 2: '12', 3: '8', 4: '4', 5: '1/0' }[size]);

  // ---------- materiály ----------
  const mats = {};
  const M = (key, fn) => mats[key] || (mats[key] = fn());
  G.metal = (col = '#c8ccd0', rough = 0.22) => M('metal' + col + rough, () => new THREE.MeshStandardMaterial({ color: col, metalness: 1, roughness: rough }));
  G.plastic = (col, rough = 0.35) => M('pl' + col + rough, () => new THREE.MeshStandardMaterial({ color: col, roughness: rough, metalness: 0 }));
  G.emissive = (col) => M('em' + col, () => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.1, roughness: 0.4 }));
  G.murky = (mat) => { FS.applyMurk(mat, null, 'gear'); return mat; };

  // ---------- modely ----------
  G.hookModel = function (size = 2) {
    const s = 0.5 + size * 0.28;
    const g = new THREE.Group();
    const m = G.metal('#9a8f80', 0.3);
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.012, 5), m);
    shank.position.y = 0.006;
    const bend = new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0004, 5, 12, Math.PI * 1.25), m);
    bend.rotation.z = Math.PI;
    bend.position.x = 0.0035;
    const point = new THREE.Mesh(new THREE.ConeGeometry(0.0005, 0.004, 5), m);
    point.position.set(0.0072, 0.003, 0);
    const eye = new THREE.Mesh(new THREE.TorusGeometry(0.0012, 0.0003, 4, 8), m);
    eye.position.y = 0.0125;
    g.add(shank, bend, point, eye);
    g.scale.setScalar(s);
    return g;
  };

  G.trebleModel = function (scale = 1) {
    const g = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const h = G.hookModel(3);
      h.rotation.y = (k / 3) * Math.PI * 2;
      g.add(h);
    }
    g.scale.setScalar(scale);
    return g;
  };

  G.floatModel = function (look) {
    const g = new THREE.Group();
    const lathe = (pts, mat) => new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 16), mat);
    const white = G.plastic('#f2f0e8', 0.3), red = G.emissive('#ff3a12'), black = G.plastic('#151515', 0.3), green = G.plastic('#2c6b3a', 0.3), yel = G.emissive('#ffd200');
    if (look === 'pero') {
      g.add(lathe([[0.0005, -0.07], [0.003, -0.05], [0.0045, -0.01], [0.004, 0.02], [0.0015, 0.04], [0, 0.041]], white));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0016, 0.05, 8), red); ant.position.y = 0.06; g.add(ant);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.006, 12), black); band.position.y = 0.02; g.add(band);
    } else if (look === 'waggler') {
      g.add(lathe([[0.001, -0.09], [0.004, -0.085], [0.0048, -0.02], [0.004, 0.01], [0.0015, 0.02]], G.plastic('#d8c27a', 0.4)));
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.002, 0.06, 8), red); ant.position.y = 0.05; g.add(ant);
      const ant2 = new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.012, 8), yel); ant2.position.y = 0.026; g.add(ant2);
    } else if (look === 'sumec') {
      g.add(lathe([[0.002, -0.1], [0.012, -0.08], [0.016, -0.02], [0.014, 0.03], [0.004, 0.05]], G.plastic('#e5d200', 0.35)));
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0162, 0.0162, 0.012, 16), black); band.position.y = -0.005; g.add(band);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.004, 0.06, 8), red); ant.position.y = 0.075; g.add(ant);
    } else {
      // kulatý červenobílý
      const ball = new THREE.SphereGeometry(0.011, 18, 14);
      const top = new THREE.Mesh(ball, red), bot = new THREE.Mesh(ball, white);
      top.material = red; bot.material = white;
      const clipTop = new THREE.Mesh(new THREE.SphereGeometry(0.0111, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), red);
      const clipBot = new THREE.Mesh(new THREE.SphereGeometry(0.0111, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), white);
      g.add(clipTop, clipBot);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.035, 8), red); ant.position.y = 0.025; g.add(ant);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0006, 0.03, 6), green); stem.position.y = -0.024; g.add(stem);
    }
    return g;
  };

  function wormGeo(len, rad, seed) {
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const t = i / 15;
      pts.push(new V3(Math.sin(t * 5 + seed) * len * 0.18, -t * len * 0.7, Math.cos(t * 4 + seed) * len * 0.15));
    }
    return U.tube(pts, (s) => rad * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, s * 1.1 + 0.05))) * (1 + (Math.sin(s * 120) * 0.06)), 7, { capEnd: true });
  }

  G.baitModel = function (id) {
    const g = new THREE.Group();
    const mk = (geo, col, rough = 0.4, extra = {}) => { const m = new THREE.Mesh(geo, G.murky(new THREE.MeshStandardMaterial(Object.assign({ color: col, roughness: rough }, extra)))); g.add(m); return m; };
    switch (id) {
      case 'zizala': {
        mk(wormGeo(0.07, 0.0022, 1), '#b0505a', 0.3);
        const band = mk(new THREE.TorusGeometry(0.0024, 0.0012, 6, 10), '#d07070', 0.3);
        band.position.set(0.004, -0.012, 0.003); band.rotation.x = 1.2;
        break;
      }
      case 'rousnice': mk(wormGeo(0.11, 0.0032, 2), '#8a3040', 0.3); break;
      case 'cervi':
        for (let k = 0; k < 3; k++) { const m = mk(new THREE.CapsuleGeometry(0.0018, 0.008, 4, 8), '#efe6c8', 0.45); m.position.set((k - 1) * 0.004, -0.004 - k * 0.002, 0); m.rotation.z = (k - 1) * 0.6; }
        break;
      case 'kukurice':
        for (let k = 0; k < 2; k++) { const m = mk(new THREE.SphereGeometry(0.0045, 12, 10), '#f2c418', 0.3); m.scale.set(1, 0.75, 0.55); m.position.y = -0.004 - k * 0.007; }
        break;
      case 'testo': mk(new THREE.SphereGeometry(0.007, 14, 10), '#e8d29a', 0.85).position.y = -0.006; break;
      case 'chleb': { const m = mk(new THREE.DodecahedronGeometry(0.008, 1), '#f4efe2', 0.95); m.scale.set(1, 0.7, 0.8); m.position.y = -0.006; break; }
      case 'boilies_j': mk(new THREE.SphereGeometry(0.01, 16, 12), '#e0607a', 0.8).position.y = -0.016; break;
      case 'boilies_r': mk(new THREE.SphereGeometry(0.012, 16, 12), '#6b4a2a', 0.85).position.y = -0.018; break;
      case 'pelety': mk(new THREE.CylinderGeometry(0.006, 0.006, 0.008, 12), '#3e2a1a', 0.7).position.y = -0.012; break;
      case 'rybicka': {
        const f = FS.FishModel.create('ouklej', 0.08);
        f.u.uAmp.value = 0.02;
        f.group.rotation.z = -Math.PI / 2;
        f.group.position.y = -0.03;
        f.group.traverse((o) => o.layers.set(0));
        g.add(f.group);
        g.userData.fish = f;
        break;
      }
    }
    return g;
  };

  G.lureModel = function (id) {
    const g = new THREE.Group();
    const silver = G.metal('#d8dde2', 0.12), gold = G.metal('#d9a830', 0.18), wire = G.metal('#b0b4b8', 0.3);
    const red = G.plastic('#c0201a', 0.3);
    const hookAt = (y, sc = 0.9) => { const t = G.trebleModel(sc); t.position.y = y; t.rotation.x = Math.PI; g.add(t); };
    if (id === 'rotacni_s' || id === 'rotacni_g') {
      const big = id === 'rotacni_g';
      const sc = big ? 1.35 : 1;
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.05 * sc, 5), wire); shaft.position.y = -0.025 * sc; g.add(shaft);
      const blade = new THREE.Mesh(new THREE.SphereGeometry(0.011 * sc, 16, 10), big ? gold : silver);
      blade.scale.set(0.62, 1, 0.12);
      blade.position.set(0.006 * sc, -0.012 * sc, 0);
      const bladePivot = new THREE.Group(); bladePivot.add(blade); g.add(bladePivot);
      g.userData.spin = bladePivot;
      for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.0028 * sc, 10, 8), k === 1 ? red : (big ? gold : silver)); b.position.y = -(0.026 + k * 0.006) * sc; g.add(b); }
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0035 * sc, 0.0022 * sc, 0.012 * sc, 10), big ? gold : silver); body.position.y = -0.045 * sc; g.add(body);
      hookAt(-0.055 * sc, sc);
    } else if (id === 'plandavka') {
      const geo = new THREE.SphereGeometry(0.03, 20, 12, 0, Math.PI * 2, 0, 0.9);
      const { c, g: cg } = U.canvas(64, 64);
      for (let i = 0; i < 4; i++) { cg.fillStyle = i % 2 ? '#f4f0e6' : '#c41e1e'; cg.fillRect(0, i * 16, 64, 16); }
      const mat = new THREE.MeshStandardMaterial({ map: U.tex(c, { repeat: false }), roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide });
      const spoon = new THREE.Mesh(geo, mat);
      spoon.scale.set(0.45, 1, 0.25);
      spoon.rotation.x = Math.PI / 2;
      spoon.position.y = -0.028;
      g.add(spoon);
      const back = new THREE.Mesh(geo, silver); back.scale.set(0.448, 0.99, 0.248); back.rotation.x = Math.PI / 2; back.position.set(0, -0.028, -0.0006); g.add(back);
      hookAt(-0.06);
      g.userData.wobble = spoon;
    } else if (id === 'wobler_s' || id === 'wobler_d') {
      const deep = id === 'wobler_d';
      const L = deep ? 0.12 : 0.07;
      const pts = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(Math.sin(Math.PI * Math.pow(t, 0.8)) * L * 0.13 + 0.0005, -t * L)); }
      const { c, g: cg } = U.canvas(128, 64);
      const grd = cg.createLinearGradient(0, 0, 0, 64);
      if (deep) { grd.addColorStop(0, '#1f3d1a'); grd.addColorStop(0.5, '#d9c23a'); grd.addColorStop(1, '#f06a1a'); }
      else { grd.addColorStop(0, '#203a33'); grd.addColorStop(0.45, '#c8d0d0'); grd.addColorStop(1, '#ffffff'); }
      cg.fillStyle = grd; cg.fillRect(0, 0, 128, 64);
      cg.globalAlpha = 0.25; cg.strokeStyle = '#000';
      for (let x = 0; x < 128; x += 6) for (let y = 0; y < 64; y += 6) { cg.beginPath(); cg.arc(x + ((y / 6) % 2) * 3, y, 3, -1, 1); cg.stroke(); }
      cg.globalAlpha = 1;
      const tex = U.tex(c, { repeat: false });
      const lat = new THREE.LatheGeometry(pts, 16);
      // UV: u kolem, v podél – barva podle výšky => přemapovat na pozici y
      const P = lat.attributes.position, UVa = lat.attributes.uv;
      for (let i = 0; i < P.count; i++) UVa.setXY(i, -P.getY(i) / L, 0.5 + P.getX(i) / (L * 0.28));
      const body = new THREE.Mesh(lat, new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.2, clearcoat: 1, metalness: 0.2 }));
      body.rotation.y = Math.PI / 2;
      body.scale.set(1, 1, 0.65);
      g.add(body);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(L * 0.22, 0.0008, L * (deep ? 0.35 : 0.18)), new THREE.MeshPhysicalMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, roughness: 0.05 }));
      lip.position.set(0, 0.002, L * 0.06); lip.rotation.x = deep ? -0.35 : -0.9;
      g.add(lip);
      for (const s of [1, -1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(L * 0.028, 10, 8), G.plastic('#111', 0.1)); e.position.set(s * L * 0.07, -L * 0.15, L * 0.03); g.add(e); const r = new THREE.Mesh(new THREE.TorusGeometry(L * 0.03, L * 0.008, 6, 12), G.plastic('#ffcc00', 0.2)); r.position.copy(e.position); r.rotation.y = Math.PI / 2; g.add(r); }
      hookAt(-L * 0.45, deep ? 1.2 : 0.9); hookAt(-L * 1.02, deep ? 1.2 : 0.9);
      g.userData.wobble = body;
    } else if (id === 'twister' || id === 'ripper') {
      const rip = id === 'ripper';
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 14, 10), G.plastic(rip ? '#d8d8d8' : '#c41e1e', 0.25)); head.position.y = -0.004; g.add(head);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0025, 8, 6), G.plastic('#ffd000', 0.2)); eye.position.set(0.005, -0.004, 0.003); g.add(eye);
      const col = rip ? '#c9d6c0' : '#4fa83a';
      const bodyMat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.35, transmission: 0.0, clearcoat: 0.5, sheen: 0 });
      const L = rip ? 0.09 : 0.06;
      const pts = [];
      for (let i = 0; i < 10; i++) pts.push(new V3(0, -0.01 - (i / 9) * L, 0));
      const body = new THREE.Mesh(U.tube(pts, (s) => (rip ? 0.009 : 0.006) * (1 - s * 0.5) * (1 + Math.sin(s * 60) * 0.06), 10, { capEnd: true }), bodyMat);
      g.add(body);
      if (rip) {
        const paddle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.003, 14), bodyMat); paddle.position.y = -0.01 - L - 0.008; paddle.rotation.x = Math.PI / 2; g.add(paddle);
        g.userData.wobble = paddle;
      } else {
        const tail = [];
        for (let i = 0; i < 16; i++) { const t = i / 15; tail.push(new V3(Math.sin(t * Math.PI * 1.6) * 0.012, -0.01 - L - t * 0.03, Math.cos(t * Math.PI * 1.6) * 0.004 - 0.004)); }
        const tg = new THREE.Mesh(U.tube(tail, (s) => 0.004 * (1 - s * 0.8), 6, { capEnd: true }), bodyMat);
        tg.scale.z = 0.3;
        g.add(tg);
        g.userData.wobble = tg;
      }
      const hk = G.hookModel(4); hk.position.set(0, -0.03, 0); hk.rotation.z = Math.PI; g.add(hk);
    }
    g.traverse((o) => { if (o.isMesh && o.material && !o.material.userData.murked) { o.material = o.material.clone(); FS.applyMurk(o.material, null, 'gear'); o.material.userData.murked = true; } });
    return g;
  };

  G.reelModel = function (item) {
    const look = (item && item.look) || { body: '#505560', spool: '#9aa0a8' };
    const big = item && (item.id === 'navijak_5000' || item.id === 'navijak_8000') ? 1.35 : 1;
    const g = new THREE.Group();
    const bodyM = G.plastic(look.body, 0.3), spoolM = G.metal(look.spool, 0.25);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.05, 0.012), bodyM); foot.position.y = -0.025; g.add(foot);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.028, 18, 14), bodyM); body.scale.set(1, 1, 0.75); body.position.y = -0.065; g.add(body);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.03, 20), spoolM); spool.rotation.x = Math.PI / 2; spool.position.set(0, -0.065, 0.034); g.add(spool);
    const lineWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, 0.026, 20), G.plastic('#e8ecef', 0.5)); lineWrap.rotation.x = Math.PI / 2; lineWrap.position.copy(spool.position); g.add(lineWrap);
    const bail = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0015, 6, 20, Math.PI), G.metal('#d0d4d8', 0.15)); bail.position.set(0, -0.065, 0.045); bail.rotation.y = Math.PI / 2; g.add(bail);
    const crankPivot = new THREE.Group(); crankPivot.position.set(-0.026, -0.065, 0); g.add(crankPivot);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.04, 0.005), G.metal('#a0a4a8', 0.3)); arm.position.set(-0.004, -0.02, 0); crankPivot.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.018, 10), G.plastic('#222', 0.5)); knob.rotation.z = Math.PI / 2; knob.position.set(-0.014, -0.04, 0); crankPivot.add(knob);
    g.userData.crank = crankPivot; g.userData.bail = bail;
    g.scale.setScalar(big);
    return g;
  };

  // statický prut pro vitrínu
  G.rodStatic = function (item) {
    const g = new THREE.Group();
    const L = item.s.len, th = item.look.thick || 1;
    const blankM = item.look.bamboo ? new THREE.MeshStandardMaterial({ color: item.look.blank, roughness: 0.55 }) : new THREE.MeshPhysicalMaterial({ color: item.look.blank, roughness: 0.25, clearcoat: 0.8 });
    const blank = new THREE.Mesh(new THREE.CylinderGeometry(0.0015 * th, 0.007 * th, L, 8), blankM); blank.position.y = L / 2; g.add(blank);
    if (item.look.bamboo) for (let y = 0.4; y < L; y += 0.35) { const n = new THREE.Mesh(new THREE.TorusGeometry(0.007 * (1 - y / L * 0.7), 0.0015, 4, 10), blankM); n.rotation.x = Math.PI / 2; n.position.y = y; g.add(n); }
    const hm = item.look.handle === 'cork' ? new THREE.MeshStandardMaterial({ map: FS.Tex.cork(), roughness: 0.8 }) : G.plastic('#1a1a1a', 0.85);
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012 * th, 0.013 * th, 0.42, 12), hm); handle.position.y = 0.22; g.add(handle);
    for (let k = 0; k < 6; k++) {
      const y = 0.75 + k * (L - 0.85) / 5.4;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.006 * (1 - k * 0.12) * th, 0.0012, 5, 12), G.metal('#c0c4c8', 0.2));
      ring.position.set(0, y, 0.012 * (1 - k * 0.1)); g.add(ring);
    }
    return g;
  };

  // balení spotřebního zboží do vitríny
  G.packModel = function (item) {
    const g = new THREE.Group();
    const L = (lines, bg, fg = '#fff', w, h) => new THREE.MeshStandardMaterial({ map: FS.Tex.label(lines, bg, fg, w, h), roughness: 0.6 });
    const side = (col) => G.plastic(col, 0.6);
    const box = (w, h, d, labelMat, col) => {
      const m = [side(col), side(col), side(col), side(col), labelMat, side(col)];
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = h / 2; g.add(b); return b;
    };
    switch (item.cat) {
      case 'hook': box(0.07, 0.1, 0.006, L(['HÁČKY', 'č. ' + G.hookLabel(item.s.size)], '#1f4e8a', '#fff', 128, 180), '#1f4e8a'); break;
      case 'groundbait': {
        const sack = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.32, 0.12, 4, 4, 2), [side('#d8cfae'), side('#d8cfae'), side('#d8cfae'), side('#d8cfae'), L(item.name.split(' – ')[0].split(' ').slice(0, 2).concat(['5 dávek']), '#e8dfc0', '#4a3218', 256, 340), side('#d8cfae')]);
        const p = sack.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) { const y = p.getY(i); const k = 1 + 0.12 * Math.cos(y * 6); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * (k + 0.1)); }
        sack.geometry.computeVertexNormals();
        sack.position.y = 0.16; g.add(sack);
        const top = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.06, 8), side('#d8cfae')); top.position.y = 0.35; g.add(top);
        break;
      }
      case 'bait': {
        const id = item.id;
        if (id === 'zizala' || id === 'rousnice') {
          const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.07, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#f0f0ea', roughness: 0.9, side: THREE.DoubleSide })); cup.position.y = 0.035; g.add(cup);
          const dirt = new THREE.Mesh(new THREE.CircleGeometry(0.048, 18), G.plastic('#3a2a1c', 1)); dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.062; g.add(dirt);
          for (let k = 0; k < 5; k++) { const w = new THREE.Mesh(wormGeo(id === 'rousnice' ? 0.07 : 0.05, id === 'rousnice' ? 0.0028 : 0.002, k), G.plastic(id === 'rousnice' ? '#8a3040' : '#b0505a', 0.3)); w.rotation.set(Math.PI / 2 + U.grr(-0.3, 0.3), 0, U.grr(0, 6)); w.position.set(U.grr(-0.02, 0.02), 0.066, U.grr(-0.02, 0.02)); w.scale.y = 0.5; g.add(w); }
        } else if (id === 'cervi') {
          box(0.09, 0.05, 0.07, side('#ffffff'), '#ffffff').material.forEach((m) => { m.transparent = true; m.opacity = 0.5; });
          for (let k = 0; k < 25; k++) { const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.0018, 0.008, 3, 6), G.plastic('#efe6c8', 0.5)); m.position.set(U.grr(-0.04, 0.04), U.grr(0.005, 0.04), U.grr(-0.03, 0.03)); m.rotation.set(U.grr(0, 3), U.grr(0, 3), 0); g.add(m); }
        } else if (id === 'kukurice') {
          const can = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.11, 24), [new THREE.MeshStandardMaterial({ map: FS.Tex.label(['KUKUŘICE', 'sladká'], '#2a7a2a', '#ffd400', 256, 128), roughness: 0.4, metalness: 0.2 }), G.metal('#c8ccd0', 0.3), G.metal('#c8ccd0', 0.3)]);
          can.position.y = 0.055; g.add(can);
        } else if (id === 'chleb') {
          const loaf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 18, 12), G.plastic('#a8692e', 0.85)); loaf.scale.set(1.3, 0.6, 0.8); loaf.position.y = 0.045; g.add(loaf);
        } else {
          const cols = { testo: '#e8d29a', boilies_j: '#e0607a', boilies_r: '#6b4a2a', pelety: '#3e2a1a', rybicka: '#3a6a8a' };
          if (id === 'rybicka') {
            // malé akvárko s rybkami
            const glass = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.16), new THREE.MeshPhysicalMaterial({ color: '#cfe8e0', transparent: true, opacity: 0.25, roughness: 0.05 })); glass.position.y = 0.08; g.add(glass);
            const water = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.13, 0.15), new THREE.MeshStandardMaterial({ color: '#3d6a5a', transparent: true, opacity: 0.35, roughness: 0.1 })); water.position.y = 0.068; g.add(water);
            g.userData.tankFish = [];
            for (let k = 0; k < 3; k++) {
              const f = FS.FishModel.create('ouklej', 0.07);
              FS.FishModel.setLayer(f, 0);
              f.group.position.set(U.grr(-0.08, 0.08), 0.05 + k * 0.025, U.grr(-0.03, 0.03));
              f.group.userData.ph = k * 2;
              g.add(f.group); g.userData.tankFish.push(f);
            }
          } else {
            const bag = box(0.12, 0.16, 0.04, L([item.name.split(' ')[0].toUpperCase(), item.name.split(' ').slice(1).join(' ')], cols[id], '#fff', 180, 240), cols[id]);
            bag.position.y = 0.08;
            for (let k = 0; k < 3; k++) { const b = G.baitModel(id); b.position.set(-0.03 + k * 0.03, 0.02, 0.05); b.scale.setScalar(1.2); g.add(b); }
          }
        }
        break;
      }
      case 'acc':
        if (item.id === 'podberak') {
          const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 1.6, 10), G.plastic('#222', 0.6)); handle.position.y = 0.8; g.add(handle);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.008, 6, 28), G.metal('#7a7f84', 0.4)); ring.position.y = 1.85; g.add(ring);
          const net = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.4, 20, 4, true), new THREE.MeshStandardMaterial({ color: '#2a3a2a', wireframe: true }));
          net.position.y = 1.85; net.rotation.x = Math.PI / 2; net.position.z = -0.2; ring.rotation.x = Math.PI / 2;
          g.add(net);
        } else {
          const lens = new THREE.MeshPhysicalMaterial({ color: '#2a3a40', roughness: 0.05, metalness: 0.5, clearcoat: 1 });
          for (const s of [1, -1]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.027, 16, 10), lens); l.scale.set(1.2, 0.85, 0.2); l.position.set(s * 0.034, 0.03, 0); g.add(l); const arm = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.004, 0.13), G.plastic('#111', 0.3)); arm.position.set(s * 0.066, 0.034, -0.065); g.add(arm); }
          const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), G.plastic('#111', 0.3)); bridge.position.y = 0.04; g.add(bridge);
        }
        break;
    }
    return g;
  };
})(window.FS);
