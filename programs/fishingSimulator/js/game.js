'use strict';
// Stav hráče: peníze, vlastněné vybavení, zásoby, nasazená výbava, rekordy. Ukládání do localStorage.
(function (FS) {
  const Game = {};
  FS.Game = Game;
  const KEY = 'rybnik-simulator-save-v1';

  Game.defaults = () => ({
    money: 150,
    owned: { prut_bambus: 1, navijak_basic: 1, vlasec_020: 1 },
    counts: { hacek_12: 10, splavek_kulaty: 3, zizala: 20, chleb: 15 },
    eq: { rod: 'prut_bambus', reel: 'navijak_basic', line: 'vlasec_020', hook: 'hacek_12', float: 'splavek_kulaty', bait: 'zizala', lure: null, gb: null, method: 'bait' },
    records: {},
    stats: { earned: 0, caught: 0, released: 0 },
    settings: { sens: 1, vol: 0.8 },
    tut: 0,
    tokens: 0, skins: ['zakladni'], skin: 'zakladni', streak: 0,
    legends: {}, variants: {},
    quests: { story: 0, active: [], done: 0 },
  });

  Game.load = function () {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    const d = Game.defaults();
    Game.state = s ? Object.assign(d, s, { eq: Object.assign(d.eq, s.eq || {}), settings: Object.assign(d.settings, s.settings || {}) }) : d;
  };
  let saveT = null;
  Game.save = function () {
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(Game.state)); } catch (e) { /* bez ukládání */ } }, 300);
  };
  Game.reset = function () {
    try { localStorage.removeItem(KEY); } catch (e) { /* nic */ }
    location.reload();
  };

  Game.has = (id) => !!Game.state.owned[id] || (Game.state.counts[id] || 0) > 0;
  Game.count = (id) => Game.state.counts[id] || 0;
  Game.consume = function (id, n) {
    Game.state.counts[id] = Math.max(0, (Game.state.counts[id] || 0) - n);
    Game.save();
    FS.UI && FS.UI.refreshHud();
  };
  Game.removeItem = function (id) {
    delete Game.state.owned[id];
    if (Game.state.eq.lure === id) {
      const other = Object.keys(Game.state.owned).find((k) => FS.Gear.byId[k] && FS.Gear.byId[k].cat === 'lure');
      Game.state.eq.lure = other || null;
      if (!other) Game.state.eq.method = 'bait';
    }
    Game.save();
    FS.Fishing.refreshRig();
  };

  Game.gear = function () {
    const e = Game.state.eq, B = FS.Gear.byId;
    return {
      rod: B[e.rod], reel: B[e.reel], line: B[e.line], hook: B[e.hook], float: B[e.float], bait: e.bait ? B[e.bait] : null,
      lure: e.lure ? B[e.lure] : null, gb: e.gb ? B[e.gb] : null, method: e.method === 'lure' && e.lure ? 'lure' : 'bait',
    };
  };

  Game.addMoney = function (v) {
    Game.state.money += v;
    if (v > 0) Game.state.stats.earned += v;
    Game.save();
    FS.UI.refreshHud();
    FS.UI.moneyPop(v);
  };

  Game.buy = function (item) {
    if (!item.consumable && Game.state.owned[item.id]) return false;
    if (Game.state.money < item.price) { FS.UI.toast('Na to nemáš dost peněz.'); return false; }
    Game.state.money -= item.price;
    if (item.consumable) {
      Game.state.counts[item.id] = (Game.state.counts[item.id] || 0) + (item.pack || 1);
      if (item.cat === 'groundbait' && !Game.state.eq.gb) Game.state.eq.gb = item.id;
    } else {
      Game.state.owned[item.id] = 1;
      Game.equip(item, true);
    }
    FS.Audio.coin();
    Game.save();
    FS.UI.refreshHud();
    FS.UI.moneyPop(-item.price);
    return true;
  };

  const SLOT = { rod: 'rod', reel: 'reel', line: 'line', hook: 'hook', float: 'float', bait: 'bait', lure: 'lure', groundbait: 'gb' };
  Game.equip = function (item, silent) {
    const slot = SLOT[item.cat];
    if (!slot) return;
    const F = FS.Fishing;
    if (F.state === 'fight') { FS.UI.toast('Během zdolávání nelze měnit výbavu.'); return; }
    const e = Game.state.eq;
    const prevBait = e.bait, prevMethod = e.method;
    e[slot] = item.id;
    if (item.cat === 'bait') e.method = 'bait';
    if (item.cat === 'lure') e.method = 'lure';
    Game.save();
    if (F.state !== 'idle') F.toIdle();
    if (item.cat === 'bait' && prevBait !== item.id && F.hasBait) {
      // vrátit nasazenou návnadu do krabičky
      if (prevBait) Game.state.counts[prevBait] = (Game.state.counts[prevBait] || 0) + 1;
      F.hasBait = false;
    }
    if (item.cat === 'hook' && F.hasBait) {
      const b = FS.Gear.byId[e.bait];
      if (b && b.s.minHook && item.s.size < b.s.minHook) { Game.state.counts[b.id] = (Game.state.counts[b.id] || 0) + 1; F.hasBait = false; }
    }
    if (['rod', 'reel', 'line'].includes(item.cat)) F.equipChanged();
    else { if ((e.method === 'bait') && !F.hasBait) F.toIdle(); F.refreshRig(); }
    void prevMethod;
    if (!silent) FS.UI.toast(`Nasazeno: ${item.name}`, 1400);
    FS.UI.refreshHud();
  };

  Game.record = function (sp, weight, length, value, sold) {
    const r = Game.state.records[sp.id] || (Game.state.records[sp.id] = { count: 0, best: 0, bestLen: 0, sold: 0 });
    r.count++;
    const isRecord = weight > r.best;
    if (isRecord) { r.best = weight; r.bestLen = length; }
    if (sold) { r.sold++; Game.state.stats.caught++; } else Game.state.stats.released++;
    Game.save();
    return isRecord && r.count > 1;
  };
})(window.FS);
