'use strict';
// Rybářský stánek s prodavačem a vystaveným zbožím; výběr položek myší ve 3D.
(function (FS) {
  const U = FS.U, W = FS.World, G = FS.Gear;
  const Shop = { pickables: [], open: false };
  FS.Shop = Shop;
  const V3 = THREE.Vector3;

  const LINES = {
    quests: ['Mám pro tebe práci.', 'Za splněné úkoly dobře zaplatím.'],
    automat: ['Automat bere jen žetony za vzácné ryby. Hodně štěstí!', 'Minulý týden tu někdo vytočil zlatý prut.'],
    greet: ['Dobrý den! Copak to bude?', 'Vítejte u Vávrů! Ryby dneska berou.', 'Zdravím, pane rybáři. Co vám můžu nabídnout?', 'Ahoj! Přišel sis pro něco na kapry?'],
    rod: ['Na kapra potřebuješ pořádný prut, ten bambus nevydrží.', 'Sumcový Titan – to je železo. Na obry jako stvořený.', 'Match je citlivý, dá ti víc času na zásek.'],
    reel: ['Silná brzda je základ. Když je slabá, kapr ti vymotá celou cívku.', 'Rychlejší naviják – rychlejší přívlač.'],
    line: ['Tenký vlasec víc záběrů, ale velkou rybu neudrží.', 'Na sumce jen šňůru, nic jiného.'],
    hook: ['Malý háček na malé ryby, velký na velké. Jednoduché.', 'Velký háček plotice nevezme, malý zase kapr vyrve.'],
    float: ['Lehký splávek ukáže i ťuknutí plotice.', 'Když splávek lehne, je to cejn nebo lín – zvedá ho.'],
    bait: ['Žížala bere skoro na všechno.', 'Kukuřice a boilies – to je kaprařina.', 'Na štiku nejlíp rybička. Akvárko mám tady.', 'Chléb se rychle rozmočí, nenechávej ho dlouho ve vodě.'],
    lure: ['Okouni jdou po malé stříbrné rotačce.', 'Candát chodí u dna – twister skákej po dně.', 'Štika stojí u rákosí, tam to zkus.'],
    groundbait: ['Zakrm a ryby se stáhnou k tobě.', 'Krmítková směs na bílou rybu, jahodová na kapry.'],
    acc: ['Bez podběráku velkého kapra nevytáhneš.', 'Polarizační brýle – uvidíš, co se děje pod hladinou.'],
    buy: ['Děkuji, ať to bere!', 'Petrův zdar!', 'Výborná volba.', 'Ať se daří!'],
    poor: ['Na to ještě nemáš. Chyť pár ryb a vrať se.', 'Hmm, to bude chtít víc peněz.'],
  };
  Shop.AUTOMAT = { id: 'automat', cat: 'automat', name: 'Rybí automat', price: 0, desc: 'Za žeton ze vzácné ryby zatočíš – barvy prutu, peníze, návnady.' };
  Shop.say = (key) => { const l = LINES[key] || LINES.greet; Shop.line = l[Math.floor(Math.random() * l.length)]; FS.UI.vendorSay(Shop.line); };

  function tag(item) {
    const { c, g } = U.canvas(256, 96);
    g.fillStyle = '#fbf6e4'; g.fillRect(0, 0, 256, 96);
    g.strokeStyle = '#b8352a'; g.lineWidth = 6; g.strokeRect(3, 3, 250, 90);
    g.fillStyle = '#b8352a'; g.font = 'bold 44px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(item.price ? item.price + ' Kč' : 'zdarma', 128, 50);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05), new THREE.MeshStandardMaterial({ map: U.tex(c, { repeat: false }), roughness: 0.8 }));
    return m;
  }

  function reg(obj, item, parent, tagPos) {
    obj.userData.itemId = item.id;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.itemId = item.id; } });
    parent.add(obj);
    Shop.pickables.push(obj);
    if (tagPos) { const t = tag(item); t.position.copy(tagPos); t.userData.itemId = item.id; parent.add(t); Shop.pickables.push(t); }
  }

  Shop.build = function (scene) {
    const root = new THREE.Group();
    const pos = W.shopPos.clone();
    pos.y = W.heightAt(pos.x, pos.z) - 0.05;
    root.position.copy(pos);
    const dir = new V3(3 - pos.x, 0, -1 - pos.z).normalize();
    root.rotation.y = Math.atan2(dir.x, dir.z);
    scene.add(root);
    Shop.root = root;
    const wood = new THREE.MeshStandardMaterial({ map: FS.Tex.planks([0.58, 0.42, 0.28]), roughness: 0.85 });
    const woodDark = new THREE.MeshStandardMaterial({ map: FS.Tex.planks([0.4, 0.28, 0.18]), roughness: 0.9 });
    const box = (w, h, d, x, y, z, mat, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z); m.rotation.x = rx;
      m.castShadow = m.receiveShadow = true;
      root.add(m); return m;
    };
    box(4.7, 0.16, 2.7, 0, 0.08, -0.1, woodDark);
    box(4.4, 2.6, 0.08, 0, 1.45, -1.3, wood);
    box(0.08, 2.6, 2.3, -2.2, 1.45, -0.15, wood);
    box(0.08, 2.6, 2.3, 2.2, 1.45, -0.15, wood);
    box(4.1, 1.0, 0.5, 0, 0.66, 0.78, wood);
    box(4.3, 0.05, 0.66, 0, 1.18, 0.78, woodDark);
    for (const x of [-2.18, 2.18]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 2.75, 10), woodDark);
      p.position.set(x, 1.45, 1.05); p.castShadow = true; root.add(p);
    }
    box(4.9, 0.08, 3.0, 0, 2.82, -0.1, woodDark, 0.06);
    // markýza
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.0), new THREE.MeshStandardMaterial({ map: FS.Tex.awning(), side: THREE.DoubleSide, roughness: 0.9 }));
    aw.position.set(0, 2.62, 1.75); aw.rotation.x = -Math.PI / 2 + 0.55; aw.castShadow = true; root.add(aw);
    const val = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 0.28), new THREE.MeshStandardMaterial({ map: FS.Tex.valance(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.4, roughness: 0.9 }));
    val.position.set(0, 2.25, 2.17); root.add(val);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshStandardMaterial({ map: FS.Tex.sign('RYBÁŘSKÉ POTŘEBY', 'u Vávrů · od roku 1987'), roughness: 0.7 }));
    sign.position.set(0, 3.3, 1.0); root.add(sign);
    const signBack = box(3.5, 0.95, 0.06, 0, 3.3, 0.96, woodDark);
    void signBack;
    for (const x of [-1.5, 1.5]) box(0.08, 0.6, 0.08, x, 2.95, 0.98, woodDark);
    // police a perfovaná deska
    box(4.2, 0.04, 0.36, 0, 1.26, -1.08, woodDark);
    box(4.2, 0.04, 0.3, 0, 0.6, -1.1, woodDark);
    const peg = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 1.1), new THREE.MeshStandardMaterial({ color: '#d9cdb0', roughness: 0.95 }));
    peg.position.set(0, 1.95, -1.255); root.add(peg);

    // ---- zboží ----
    const items = G.items;
    // pruty vlevo zvenku
    items.filter((i) => i.cat === 'rod').forEach((it, k) => {
      const r = G.rodStatic(it);
      r.position.set(-2.42 - (k % 2) * 0.1, 0.16, -0.95 + k * 0.33);
      r.rotation.z = -0.1; r.rotation.x = 0.02 * (k - 2);
      reg(r, it, root, new V3(-2.62, 1.0 + (k % 2) * 0.12, -0.95 + k * 0.33));
    });
    // navijáky na pultu
    items.filter((i) => i.cat === 'reel').forEach((it, k) => {
      const r = G.reelModel(it);
      r.rotation.z = Math.PI; r.rotation.y = 0.5;
      r.scale.multiplyScalar(1.6);
      r.position.set(-1.85 + k * 0.32, 1.2 + 0.0, 0.72);
      reg(r, it, root, new V3(-1.85 + k * 0.32, 1.235, 1.02));
    });
    // splávky v pěnovém bloku
    const foam = box(0.6, 0.06, 0.12, 0.05, 1.235, 0.72, G.plastic('#3a6fb0', 0.9));
    void foam;
    items.filter((i) => i.cat === 'float').forEach((it, k) => {
      const f = G.floatModel(it.look);
      f.scale.setScalar(1.6);
      f.position.set(-0.15 + k * 0.14, 1.36, 0.72);
      reg(f, it, root, new V3(-0.15 + k * 0.14, 1.235, 1.02));
    });
    // brýle
    const br = G.packModel(G.byId.bryle); br.position.set(0.75, 1.21, 0.75); br.rotation.y = 0.3; br.scale.setScalar(1.3);
    reg(br, G.byId.bryle, root, new V3(0.75, 1.235, 1.02));
    // akvárium s rybkami
    const aq = G.packModel(G.byId.rybicka); aq.position.set(1.55, 1.2, 0.72);
    reg(aq, G.byId.rybicka, root, new V3(1.55, 1.235, 1.02));
    Shop.tank = aq;
    // háčky – levá část perfodesky
    items.filter((i) => i.cat === 'hook').forEach((it, k) => {
      const p = G.packModel(it); p.position.set(-1.85 + k * 0.28, 1.62, -1.24);
      reg(p, it, root, new V3(-1.85 + k * 0.28, 1.56, -1.23));
    });
    // vlasce – cívky vpravo
    const lineCols = { vlasec_016: '#bfe3f0', vlasec_020: '#e8eef0', vlasec_025: '#a6d38a', vlasec_030: '#f0d070', snura_035: '#3f7d3a', snura_050: '#202020' };
    items.filter((i) => i.cat === 'line').forEach((it, k) => {
      const grp = new THREE.Group();
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.035, 20), G.plastic('#222', 0.5)); sp.rotation.x = Math.PI / 2;
      const ln = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.037, 20), G.plastic(lineCols[it.id], 0.35)); ln.rotation.x = Math.PI / 2;
      grp.add(sp, ln);
      grp.position.set(0.45 + k * 0.27, 1.68, -1.22);
      reg(grp, it, root, new V3(0.45 + k * 0.27, 1.56, -1.23));
    });
    // třpytky na kolíčcích
    items.filter((i) => i.cat === 'lure').forEach((it, k) => {
      const l = G.lureModel(it.id);
      l.scale.setScalar(2.2);
      const x = -1.65 + k * 0.55;
      l.position.set(x, 2.38, -1.18);
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.08, 6), G.metal('#999', 0.4)); pin.rotation.x = Math.PI / 2; pin.position.set(x, 2.39, -1.21); root.add(pin);
      reg(l, it, root, new V3(x, 2.0, -1.23));
      if (l.userData.spin) Shop.spinners = (Shop.spinners || []).concat([l.userData.spin]);
    });
    // návnady na polici
    const baits = items.filter((i) => i.cat === 'bait' && i.id !== 'rybicka');
    baits.forEach((it, k) => {
      const p = G.packModel(it);
      const x = -1.9 + k * (3.8 / (baits.length - 1));
      p.position.set(x, 1.28, -1.05);
      reg(p, it, root, new V3(x, 1.235, -0.89));
    });
    // krmení – pytle venku vpravo
    items.filter((i) => i.cat === 'groundbait').forEach((it, k) => {
      const p = G.packModel(it);
      p.position.set(2.6 + (k % 2) * 0.35, 0.02, 0.3 + k * 0.32);
      p.rotation.y = -1.2 + k * 0.2;
      p.scale.setScalar(1.15);
      reg(p, it, root, new V3(2.6 + (k % 2) * 0.35 - 0.18, 0.45, 0.3 + k * 0.32 + 0.1));
    });
    // podběrák opřený o sloup
    const pb = G.packModel(G.byId.podberak); pb.position.set(2.35, 0.15, 1.05); pb.rotation.z = 0.12; pb.rotation.y = -0.6;
    reg(pb, G.byId.podberak, root, new V3(2.4, 1.2, 1.2));
    // rybí automat (jednoruký bandita) v rohu stánku
    {
      const am = new THREE.Group();
      const red = new THREE.MeshStandardMaterial({ color: '#b3241c', roughness: 0.35, metalness: 0.3 });
      const chrome = G.metal('#d8dce0', 0.15);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.45, 0.5), red); cab.position.y = 0.72; am.add(cab);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.5, 20, 1, false, 0, Math.PI), red); top.rotation.set(Math.PI / 2, 0, Math.PI / 2); top.position.y = 1.45; am.add(top);
      const { c, g } = U.canvas(256, 128);
      g.fillStyle = '#10161a'; g.fillRect(0, 0, 256, 128);
      g.font = 'bold 26px Arial'; g.fillStyle = '#ffd24a'; g.textAlign = 'center'; g.fillText('RYBÍ AUTOMAT', 128, 30);
      ['#ff7a3a', '#9fe06a', '#ffd24a'].forEach((col, i) => { g.fillStyle = '#f4f0e0'; g.fillRect(22 + i * 74, 46, 64, 66); g.fillStyle = col; g.beginPath(); g.ellipse(54 + i * 74, 79, 22, 11, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(34 + i * 74, 79); g.lineTo(24 + i * 74, 69); g.lineTo(24 + i * 74, 89); g.fill(); });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.25), new THREE.MeshStandardMaterial({ map: U.tex(c, { repeat: false }), emissive: '#ffffff', emissiveMap: U.tex(c, { repeat: false }), emissiveIntensity: 0.55 }));
      screen.position.set(0, 1.12, 0.251); am.add(screen);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.08, 0.12), chrome); tray.position.set(0, 0.32, 0.29); am.add(tray);
      const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.45, 8), chrome); lever.position.set(0.36, 1.05, 0); am.add(lever);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), new THREE.MeshStandardMaterial({ color: '#e02020', roughness: 0.2 })); knob.position.set(0.36, 1.3, 0); am.add(knob);
      Shop.lever = lever; Shop.knob = knob;
      am.position.set(1.72, 0.16, -0.62);
      am.rotation.y = -0.35;
      am.userData.itemId = 'automat';
      am.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.itemId = 'automat'; } });
      root.add(am);
      Shop.pickables.push(am);
    }
    // stoličky a bedna
    box(0.5, 0.45, 0.4, -1.4, 0.38, -0.5, woodDark);

    Shop.vendor = buildVendor();
    Shop.vendor.position.set(0.45, 0.16, -0.25);
    root.add(Shop.vendor);

    root.updateMatrixWorld(true);
    Shop.counterFront = root.localToWorld(new V3(0, 0, 1.6));
    Shop.viewPos = root.localToWorld(new V3(-0.2, 1.85, 3.9));
    Shop.viewLook = root.localToWorld(new V3(-0.2, 1.4, -0.6));
    W.colliders.push({ x: pos.x, z: pos.z, r: 2.2 });
    const side = root.localToWorld(new V3(-2.5, 0, 0));
    W.colliders.push({ x: side.x, z: side.z, r: 0.6 });
    Shop.highlight = new THREE.BoxHelper(undefined, 0xffd24a);
    Shop.highlight.visible = false;
    scene.add(Shop.highlight);
    Shop.raycaster = new THREE.Raycaster();
  };

  function buildVendor() {
    const v = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: U.col(0.86, 0.66, 0.53), roughness: 0.65 });
    const shirt = new THREE.MeshStandardMaterial({ map: FS.Tex.plaid(), roughness: 0.9 });
    const vest = new THREE.MeshStandardMaterial({ map: FS.Tex.fabric('#6b6a45'), roughness: 0.95 });
    const jeans = new THREE.MeshStandardMaterial({ map: FS.Tex.fabric('#2c3a55'), roughness: 0.95 });
    const hair = new THREE.MeshStandardMaterial({ color: '#8b8580', roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.4 });
    const add = (geo, mat, x, y, z, parent = v) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    // nohy
    for (const s of [-1, 1]) { add(new THREE.CapsuleGeometry(0.075, 0.7, 4, 10), jeans, s * 0.1, 0.45, 0); add(new THREE.BoxGeometry(0.11, 0.08, 0.26), dark, s * 0.1, 0.04, 0.05); }
    // trup
    const torso = new THREE.Group(); torso.position.y = 0.95; v.add(torso);
    const tb = add(new THREE.CapsuleGeometry(0.19, 0.42, 6, 16), shirt, 0, 0.32, 0, torso); tb.scale.set(1.05, 1, 0.7);
    const belly = add(new THREE.SphereGeometry(0.2, 16, 12), shirt, 0, 0.18, 0.04, torso); belly.scale.set(1, 0.9, 0.8);
    // vesta
    const vb = add(new THREE.CapsuleGeometry(0.2, 0.36, 6, 16, ), vest, 0, 0.3, -0.005, torso); vb.scale.set(1.08, 1.0, 0.74);
    for (const s of [-1, 1]) for (const y of [0.22, 0.4]) {
      const pk = add(new THREE.BoxGeometry(0.1, 0.09, 0.03), vest, s * 0.1, y, 0.15, torso); pk.rotation.y = s * 0.25;
      add(new THREE.BoxGeometry(0.1, 0.02, 0.032), new THREE.MeshStandardMaterial({ color: '#4d4c30' }), s * 0.1, y + 0.045, 0.152, torso).rotation.y = s * 0.25;
    }
    add(new THREE.BoxGeometry(0.07, 0.42, 0.02), shirt, 0, 0.32, 0.155, torso);
    // krk a hlava
    add(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 12), skin, 0, 0.62, 0, torso);
    const head = new THREE.Group(); head.position.y = 0.78; torso.add(head);
    Shop.head = head;
    const hd = add(new THREE.SphereGeometry(0.12, 24, 18), skin, 0, 0, 0, head); hd.scale.set(0.92, 1.08, 0.98);
    const jaw = add(new THREE.SphereGeometry(0.1, 18, 12), skin, 0, -0.06, 0.02, head); jaw.scale.set(0.95, 0.75, 0.95);
    add(new THREE.CapsuleGeometry(0.018, 0.035, 4, 8), skin, 0, -0.005, 0.118, head).rotation.x = -0.3;
    for (const s of [-1, 1]) {
      const ear = add(new THREE.SphereGeometry(0.03, 10, 8), skin, s * 0.112, 0, -0.005, head); ear.scale.set(0.4, 1, 0.7);
      add(new THREE.SphereGeometry(0.017, 12, 10), new THREE.MeshStandardMaterial({ color: '#f4f0ea', roughness: 0.2 }), s * 0.04, 0.03, 0.098, head);
      add(new THREE.SphereGeometry(0.009, 10, 8), new THREE.MeshStandardMaterial({ color: '#3a5a6a', roughness: 0.15 }), s * 0.04, 0.03, 0.112, head);
      const brow = add(new THREE.BoxGeometry(0.045, 0.01, 0.015), hair, s * 0.042, 0.06, 0.11, head); brow.rotation.z = s * -0.15;
      const cheek = add(new THREE.SphereGeometry(0.03, 10, 8), new THREE.MeshStandardMaterial({ color: U.col(0.9, 0.6, 0.52), roughness: 0.7 }), s * 0.06, -0.03, 0.085, head); cheek.scale.z = 0.5;
    }
    const mus = add(new THREE.CapsuleGeometry(0.014, 0.07, 4, 8), hair, 0, -0.04, 0.112, head); mus.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) { const m2 = add(new THREE.CapsuleGeometry(0.011, 0.025, 4, 8), hair, s * 0.045, -0.055, 0.105, head); m2.rotation.z = s * 0.6; }
    add(new THREE.BoxGeometry(0.035, 0.006, 0.01), new THREE.MeshStandardMaterial({ color: '#7a3a30' }), 0, -0.065, 0.11, head);
    // klobouk
    add(new THREE.CylinderGeometry(0.115, 0.125, 0.09, 20), new THREE.MeshStandardMaterial({ map: FS.Tex.fabric('#5d6b3a'), roughness: 0.95 }), 0, 0.11, -0.005, head);
    const brim = add(new THREE.CylinderGeometry(0.19, 0.2, 0.012, 24), new THREE.MeshStandardMaterial({ map: FS.Tex.fabric('#5d6b3a'), roughness: 0.95 }), 0, 0.07, 0, head); brim.rotation.x = 0.05;
    add(new THREE.CylinderGeometry(0.127, 0.127, 0.02, 20), new THREE.MeshStandardMaterial({ color: '#3a2a1a' }), 0, 0.085, -0.005, head);
    // paže
    Shop.arms = [];
    for (const s of [-1, 1]) {
      const sh = new THREE.Group(); sh.position.set(s * 0.24, 0.5, 0); torso.add(sh);
      add(new THREE.CapsuleGeometry(0.055, 0.22, 4, 10), shirt, 0, -0.14, 0, sh);
      const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
      add(new THREE.CapsuleGeometry(0.045, 0.2, 4, 10), skin, 0, -0.12, 0, el);
      add(new THREE.SphereGeometry(0.05, 12, 10), skin, 0, -0.27, 0, el).scale.set(0.8, 1.1, 0.6);
      sh.rotation.x = -0.5; el.rotation.x = -0.9; sh.rotation.z = s * 0.15;
      Shop.arms.push({ sh, el, s });
    }
    Shop.torso = torso;
    return v;
  }

  // ---- interakce ----
  Shop.nearPlayer = function () {
    if (!Shop.counterFront) return false;
    const P = FS.Player.pos;
    return Math.hypot(P.x - Shop.counterFront.x, P.z - Shop.counterFront.z) < 3.2;
  };

  Shop.enter = function () {
    if (FS.Fishing.state !== 'idle') { FS.UI.toast('Nejdřív navij montáž.'); return; }
    Shop.open = true;
    Shop.camFrom = { pos: FS.Player.camera.position.clone(), quat: FS.Player.camera.quaternion.clone() };
    Shop.camT = 0;
    FS.Rod.setVisible(false);
    FS.Player.unlock();
    FS.UI.openShop();
    Shop.say('greet');
    Shop.wave = 1.6;
  };
  Shop.leave = function () {
    Shop.open = false;
    Shop.highlight.visible = false;
    FS.Rod.setVisible(true);
    FS.UI.closeShop();
    FS.Player.lock();
  };

  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion();
  const _hw = new V3(), _rel = new V3(), _hl = new V3(), _up = new V3(0, 1, 0);
  Shop.update = function (dt) {
    const t = FS.uniforms.uTime.value;
    if (!Shop.root) return;
    // animace prodavače
    Shop.torso.scale.y = 1 + Math.sin(t * 1.6) * 0.008;
    const cam = FS.Player.camera.position;
    const hw = Shop.head.getWorldPosition(_hw);
    const rel = Shop.root.worldToLocal(_rel.copy(cam));
    const hl = Shop.root.worldToLocal(_hl.copy(hw));
    const yaw = Math.atan2(rel.x - hl.x, rel.z - hl.z);
    const dist = Math.hypot(cam.x - hw.x, cam.z - hw.z);
    const look = dist < 14 ? U.clamp(yaw, -0.9, 0.9) : Math.sin(t * 0.3) * 0.4;
    Shop.head.rotation.y += (look - Shop.head.rotation.y) * Math.min(1, dt * 3);
    Shop.head.rotation.x = Math.sin(t * 0.7) * 0.03 + (dist < 14 ? -0.08 : 0);
    if (Shop.wave > 0) {
      Shop.wave -= dt;
      const a = Shop.arms[1];
      a.sh.rotation.x = -2.6; a.sh.rotation.z = 0.3; a.el.rotation.x = -0.3; a.el.rotation.z = Math.sin(t * 12) * 0.4;
    } else {
      for (const a of Shop.arms) { a.sh.rotation.x += (-0.55 - a.sh.rotation.x) * Math.min(1, dt * 4); a.sh.rotation.z = a.s * 0.15; a.el.rotation.x += (-0.95 - a.el.rotation.x) * Math.min(1, dt * 4); a.el.rotation.z = 0; }
    }
    if (!Shop.greeted && dist < 7) { Shop.greeted = true; Shop.wave = 1.6; }
    if (dist > 20) Shop.greeted = false;
    if (Shop.spinners) Shop.spinners.forEach((s, i) => (s.rotation.y += dt * (1 + i)));
    if (Shop.tank && Shop.tank.userData.tankFish) Shop.tank.userData.tankFish.forEach((f, i) => {
      const ph = t * 0.6 + i * 2;
      f.group.position.x = Math.sin(ph) * 0.09; f.group.position.z = Math.cos(ph * 1.3) * 0.035;
      f.group.rotation.y = -Math.atan2(Math.cos(ph * 1.3) * -0.035 * 1.3, Math.cos(ph) * 0.09);
      f.u.uPhase.value += dt * 7;
    });
    if (Shop.open) {
      Shop.camT = Math.min(1, Shop.camT + dt * 1.6);
      const k = U.smoothstep(0, 1, Shop.camT);
      const camObj = FS.Player.camera;
      camObj.position.lerpVectors(Shop.camFrom.pos, Shop.viewPos, k);
      _m.lookAt(Shop.viewPos, Shop.viewLook, _up);
      _q.setFromRotationMatrix(_m);
      camObj.quaternion.copy(Shop.camFrom.quat).slerp(_q, k);
    }
    // posun obrazu doleva, aby stánek nebyl schovaný za panelem
    const pc = FS.Player.camera;
    const panelFrac = Shop.open ? Math.min(0.48, 440 / Math.max(1, window.innerWidth)) : 0;
    Shop.shift = (Shop.shift || 0) + ((panelFrac / 2) - (Shop.shift || 0)) * Math.min(1, dt * 5);
    const want = Shop.shift * pc.getFilmWidth() * 2 * Math.tan(THREE.MathUtils.degToRad(pc.fov / 2)) * Math.max(1, pc.aspect);
    if (Math.abs(pc.filmOffset - want) > 1e-3) { pc.filmOffset = want; pc.updateProjectionMatrix(); }
  };

  Shop.pick = function (nx, ny) {
    if (!Shop.open) return null;
    Shop.raycaster.setFromCamera({ x: nx, y: ny }, FS.Player.camera);
    const hits = Shop.raycaster.intersectObjects(Shop.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.itemId) o = o.parent;
      if (o) {
        const id = o.userData.itemId;
        const root = Shop.pickables.find((p) => p.userData.itemId === id && p.type === 'Group') || o;
        Shop.highlight.setFromObject(root);
        Shop.highlight.visible = true;
        return id === 'automat' ? Shop.AUTOMAT : G.byId[id];
      }
    }
    Shop.highlight.visible = false;
    return null;
  };
})(window.FS);
