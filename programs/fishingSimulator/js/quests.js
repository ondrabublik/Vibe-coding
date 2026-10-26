'use strict';
// Úkoly od pana Vávry, rybí automat na žetony a barvy prutu.
(function (FS) {
  const U = FS.U;
  const Q = {};
  FS.Quests = Q;

  const STORY = [
    { title: 'První úlovek', desc: 'Chyť jakoukoli rybu.', type: 'any', n: 1, reward: 80, say: 'Tak ukaž, co umíš. Chyť cokoli, co má ploutve.' },
    { title: 'Plotičky', desc: 'Chyť 3 plotice.', type: 'species', sp: ['plotice'], n: 3, reward: 150, say: 'Plotice berou na červy a chleba. Potřebuju jich pár na nástrahu.' },
    { title: 'Ze dna', desc: 'Chyť cejna nebo lína.', type: 'species', sp: ['cejn', 'lin'], n: 1, reward: 250, say: 'Nastav hloubku tak, aby nástraha ležela na dně. Splávek se pak položí.' },
    { title: 'Přívlač', desc: 'Chyť rybu na třpytku, wobler nebo gumu.', type: 'lure', n: 1, reward: 300, say: 'Zkus přívlač – okouni jdou po malé stříbrné rotačce.' },
    { title: 'Akrobat', desc: 'Udrž rybu na háčku, když vyskočí nad hladinu.', type: 'style', key: 'jump', n: 1, reward: 400, say: 'Když ryba vyskočí, nesmíš povolit vlasec, jinak setřese háček.' },
    { title: 'Kaprař', desc: 'Chyť kapra nebo lysce nad 3 kg.', type: 'species', sp: ['kapr', 'lysec'], minW: 3, n: 1, reward: 700, say: 'Kukuřice, boilies a pořádný podběrák. Kapr nad tři kila je základ.' },
    { title: 'Zubatá Máňa', desc: 'Chyť legendární štiku Zubatou Máňu.', type: 'legend', legend: 'mana', n: 1, reward: 4000, say: 'Dobře ty! Teď něco pro opravdové chlapy: v levém rákosí žije Zubatá Máňa.' },
    { title: 'Vzácnost', desc: 'Chyť vzácnou barevnou variantu ryby.', type: 'variant', n: 1, reward: 1200, tokens: 2, say: 'Občas tu plave zlatá ryba nebo albín. Za takovou dostaneš žeton do automatu.' },
    { title: 'Starý Bohouš', desc: 'Chyť legendárního lysce Starého Bohouše.', type: 'legend', legend: 'bohous', n: 1, reward: 7000, say: 'Uprostřed v hloubce krouží Starý Bohouš. Můj děda na něj chytal už v šedesátých letech.' },
    { title: 'Velký kšeft', desc: 'Chyť rybu v hodnotě aspoň 1 500 Kč.', type: 'value', min: 1500, n: 1, reward: 1500, say: 'Chci vidět pořádný úlovek. Styl se cení – skoky, série, dlouhé hody.' },
    { title: 'Kapitán Vousáč', desc: 'Chyť legendárního sumce Kapitána Vousáče.', type: 'legend', legend: 'vousac', n: 1, reward: 15000, say: 'A teď to nejtěžší. Kapitán Vousáč. Bez sumcové výbavy ani nechoď.' },
  ];
  Q.STORY = STORY;

  function sideQuest() {
    const r = Math.random();
    const pool = FS.Species.filter((s) => s.abundance >= 2);
    const sp = pool[Math.floor(Math.random() * pool.length)];
    if (r < 0.45) {
      const n = sp.wRef < 0.5 ? U.ri(2, 4) : 1;
      const reward = Math.round((sp.base + sp.perKg * sp.wRef) * n * 1.6 / 10) * 10 + 40;
      return { title: `${sp.name.split(' ')[0]} ×${n}`, desc: `Ulov: ${sp.name} (${n}×).`, type: 'species', sp: [sp.id], n, reward };
    }
    if (r < 0.7) {
      const minW = Math.round(sp.wMin + (sp.wMax - sp.wMin) * 0.3 * 10) / 10;
      const reward = Math.round((sp.base + sp.perKg * minW) * 2.2 / 10) * 10 + 60;
      return { title: `Trofej: ${sp.name.split(' ')[0]}`, desc: `Ulov: ${sp.name}, aspoň ${U.fmtKg(minW)}.`, type: 'species', sp: [sp.id], minW, n: 1, reward };
    }
    if (r < 0.82) return { title: 'Z hlubiny', desc: 'Chyť rybu s nástrahou hlouběji než 2 m.', type: 'depth', min: 2, n: 1, reward: 220 };
    const st = [
      { key: 'far', t: 'Dálkař', d: 'Chyť rybu zaseknutou dál než 22 m.' },
      { key: 'edge', t: 'Na hraně', d: 'Zdolej rybu s napětím přes 85 % pevnosti vlasce.' },
      { key: 'steady', t: 'Pevná ruka', d: 'Zdolej rybu nad 1 kg, aniž by brzda pustila vlasec.' },
      { key: 'streak', t: 'Série', d: 'Chyť 2 ryby za sebou bez ztráty.' },
    ][Math.floor(Math.random() * 4)];
    return { title: st.t, desc: st.d, type: 'style', key: st.key, n: 1, reward: 300 };
  }

  const S = () => FS.Game.state.quests;
  Q.init = function () {
    const q = S();
    q.active = q.active || [];
    if (!q.active.some((a) => a.kind === 'story') && q.story < STORY.length) Q.addStory(true);
    while (q.active.filter((a) => a.kind === 'side').length < 2) q.active.push(Object.assign({ kind: 'side', progress: 0 }, sideQuest()));
    // aktivní legenda musí plavat v rybníce
    for (const a of q.active) if (a.type === 'legend') activateLegend(a.legend);
    FS.Game.save();
  };
  function activateLegend(id) {
    const L = FS.Game.state.legends;
    if (L[id] === 'caught') return;
    L[id] = 'active';
    if (FS.FishAI.scene) FS.FishAI.spawnLegend(id);
  }
  Q.addStory = function (silent) {
    const q = S();
    const def = STORY[q.story];
    if (!def) return;
    q.active.unshift(Object.assign({ kind: 'story', progress: 0 }, def));
    if (def.type === 'legend') {
      activateLegend(def.legend);
      if (!silent) FS.UI.toast('Pan Vávra: „' + def.say + '"', 6000);
    } else if (!silent) FS.UI.toast('Nový úkol: ' + def.title + ' – ' + def.desc, 4000);
  };

  function matches(a, d) {
    switch (a.type) {
      case 'any': return true;
      case 'species': return a.sp.includes(d.sp.id) && d.weight >= (a.minW || 0);
      case 'lure': return !!d.lure;
      case 'style': return (d.bonuses || []).some((b) => b.key === a.key);
      case 'variant': return !!d.variant;
      case 'legend': return d.legend && d.legend.id === a.legend;
      case 'value': return d.value >= a.min;
      case 'depth': return !d.lure && d.depth >= a.min;
    }
    return false;
  }

  Q.onCatch = function (d) {
    const q = S();
    const done = [];
    for (const a of q.active) {
      if (matches(a, d)) { a.progress = (a.progress || 0) + 1; if (a.progress >= a.n) done.push(a); }
    }
    let delay = 0;
    for (const a of done) {
      q.active = q.active.filter((x) => x !== a);
      q.done = (q.done || 0) + 1;
      setTimeout(() => {
        FS.Game.addMoney(a.reward);
        if (a.tokens) FS.Game.state.tokens += a.tokens;
        FS.Audio.coin();
        FS.UI.stylePop('Úkol splněn: ' + a.title + ' +' + U.fmtMoney(a.reward), '#9cf08a');
      }, 400 + delay);
      delay += 1400;
      if (a.kind === 'story') { q.story++; setTimeout(() => { Q.addStory(false); Q.refresh(); }, 2500 + delay); }
      else q.active.push(Object.assign({ kind: 'side', progress: 0 }, sideQuest()));
    }
    FS.Game.save();
    Q.refresh();
  };
  Q.refresh = () => FS.UI.refreshQuests && FS.UI.refreshQuests();
  Q.storyLine = function () {
    const a = S().active.find((x) => x.kind === 'story');
    return a ? a.say : 'Všechny moje úkoly máš splněné. Klobouk dolů!';
  };

  // ---------- barvy prutu ----------
  const rainbow = () => {
    const { c, g } = U.canvas(64, 256);
    const grd = g.createLinearGradient(0, 0, 0, 256);
    ['#ff3b3b', '#ff9a2e', '#ffe53b', '#4cd964', '#3bb4ff', '#7a5cff', '#ff3bd1'].forEach((col, i) => grd.addColorStop(i / 6, col));
    g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
    return U.tex(c);
  };
  const camo = () => {
    const { c, g } = U.canvas(128, 256);
    g.fillStyle = '#4a5a32'; g.fillRect(0, 0, 128, 256);
    const r = U.mulberry32(4);
    ['#2f3a20', '#7a7348', '#1f2416', '#5f7040'].forEach((col) => { g.fillStyle = col; for (let k = 0; k < 30; k++) { g.beginPath(); g.ellipse(r() * 128, r() * 256, 8 + r() * 18, 12 + r() * 30, r() * 3, 0, 7); g.fill(); } });
    return U.tex(c);
  };
  FS.Skins = {
    zakladni: { name: 'Původní barva' },
    zlaty: { name: 'Zlatý prut', color: '#d4af37', metal: 0.85, rough: 0.2 },
    duhovy: { name: 'Duhový prut', map: rainbow },
    kamuflaz: { name: 'Maskáčový prut', map: camo },
    neon: { name: 'Neonový prut', color: '#39ff6a', emissive: 0.7 },
    ruzovy: { name: 'Růžový prut', color: '#ff6fae' },
    ledovy: { name: 'Ledový prut', color: '#bfefff', metal: 0.5, rough: 0.1 },
  };

  // ---------- rybí automat ----------
  const SYMBOLS = [
    { id: 'plotice', w: 24 }, { id: 'okoun', w: 20 }, { id: 'kapr', w: 18 }, { id: 'stika', w: 14 }, { id: 'sumec', w: 10 }, { id: 'zlata', w: 6 },
  ];
  Q.SYMBOLS = SYMBOLS;
  const roll = () => {
    const tot = SYMBOLS.reduce((a, s) => a + s.w, 0);
    let r = Math.random() * tot;
    for (const s of SYMBOLS) { r -= s.w; if (r <= 0) return s.id; }
    return SYMBOLS[0].id;
  };
  Q.spin = function () {
    const st = FS.Game.state;
    if ((st.tokens || 0) < 1) return null;
    st.tokens--;
    const res = [roll(), roll(), roll()];
    const missing = Object.keys(FS.Skins).filter((k) => !st.skins.includes(k));
    const skin = () => missing.length ? missing[Math.floor(Math.random() * missing.length)] : null;
    let prize;
    if (res[0] === res[1] && res[1] === res[2]) {
      if (res[0] === 'zlata' || Math.random() < 0.45) {
        const s = skin();
        if (s) { st.skins.push(s); prize = { text: `JACKPOT! Vyhráváš ${FS.Skins[s].name}!`, big: true }; }
        else { FS.Game.addMoney(3000); prize = { text: 'JACKPOT! 3 000 Kč!', big: true }; }
      } else { FS.Game.addMoney(700); prize = { text: 'Tři stejné! 700 Kč', big: true }; }
    } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
      const cons = FS.Gear.items.filter((i) => i.cat === 'bait' || i.cat === 'groundbait');
      if (Math.random() < 0.5) {
        const it = cons[Math.floor(Math.random() * cons.length)];
        st.counts[it.id] = (st.counts[it.id] || 0) + it.pack;
        prize = { text: `Dvě stejné: ${it.name} (+${it.pack})` };
      } else { FS.Game.addMoney(150); prize = { text: 'Dvě stejné: 150 Kč' }; }
    } else { FS.Game.addMoney(30); prize = { text: 'Nic moc… útěcha 30 Kč' }; }
    FS.Game.save();
    return { res, prize };
  };
})(window.FS);
