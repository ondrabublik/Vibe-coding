'use strict';
// HUD, panely (obchod, výbava, deník, nápověda), karta úlovku s 3D náhledem ryby.
(function (FS) {
  const U = FS.U;
  const UI = { modal: null };
  FS.UI = UI;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  UI.init = function () {
    UI.el = {
      money: $('money'), gear: $('gearBox'), toasts: $('toasts'), prompt: $('prompt'), cast: $('castMeter'), castFill: $('castFill'),
      fight: $('fightBox'), tFill: $('tensionFill'), tDrag: $('dragMark'), sFill: $('staminaFill'), fInfo: $('fightInfo'),
      status: $('status'), hint: $('hint'), tooltip: $('tooltip'),
    };
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { FS.Audio.ui(); UI.closePanel(); }));
    $('shopClose').addEventListener('click', () => { FS.Audio.ui(); FS.Shop.leave(); });
    $('resetBtn').addEventListener('click', () => { if (confirm('Opravdu smazat uložený postup a začít znovu?')) FS.Game.reset(); });
    $('sensRange').value = FS.Game.state.settings.sens;
    $('volRange').value = FS.Game.state.settings.vol;
    $('sensRange').addEventListener('input', (e) => { FS.Game.state.settings.sens = +e.target.value; FS.Game.save(); });
    $('volRange').addEventListener('input', (e) => { FS.Game.state.settings.vol = +e.target.value; FS.Audio.setVolume(+e.target.value); FS.Game.save(); });
    UI.refreshHud();
  };

  // ---------- drobnosti ----------
  UI.toast = function (msg, ms = 2600) {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    UI.el.toasts.appendChild(d);
    while (UI.el.toasts.children.length > 4) UI.el.toasts.removeChild(UI.el.toasts.firstChild);
    setTimeout(() => d.classList.add('out'), ms);
    setTimeout(() => d.remove(), ms + 500);
  };
  UI.moneyPop = function (v) {
    const d = document.createElement('div');
    d.className = 'moneyPop ' + (v >= 0 ? 'plus' : 'minus');
    d.textContent = (v >= 0 ? '+' : '−') + U.fmtMoney(Math.abs(v));
    $('moneyWrap').appendChild(d);
    setTimeout(() => d.remove(), 1600);
  };
  UI.prompt = function (text) {
    UI.el.prompt.style.display = text ? 'block' : 'none';
    if (text && UI.el.prompt.innerHTML !== text) UI.el.prompt.innerHTML = text;
  };
  UI.castHint = function () {};
  UI.castMeter = function (power, dist, water) {
    if (!power) { UI.el.cast.style.display = 'none'; return; }
    UI.el.cast.style.display = 'block';
    UI.el.castFill.style.width = U.clamp(power * 100, 0, 100) + '%';
    $('castLbl').textContent = `Síla hodu ${Math.round(power * 100)} % · ${Math.round(dist)} m${water ? '' : ' · mimo vodu!'}`;
  };
  UI.fight = function (on) { UI.el.fight.style.display = on ? 'block' : 'none'; };
  UI.boss = function (name) {
    $('bossBar').style.display = name ? 'block' : 'none';
    if (name) $('bossName').textContent = name;
  };
  // velké nápisy za styl uprostřed obrazovky
  UI.stylePop = function (text, color) {
    const d = document.createElement('div');
    d.className = 'stylePop';
    d.textContent = text;
    if (color) d.style.color = color;
    $('stylePops').appendChild(d);
    while ($('stylePops').children.length > 3) $('stylePops').removeChild($('stylePops').firstChild);
    setTimeout(() => d.remove(), 2200);
  };
  UI.refreshQuests = function () {
    const q = FS.Game.state.quests;
    if (!q || !$('questBox')) return;
    $('questBox').innerHTML = '<div class="qh">Úkoly</div>' + q.active.map((a) => `<div class="q qk-${a.kind}">
      <b>${esc(a.title)}</b> <span class="qp">${a.progress || 0}/${a.n}</span><br><small>${esc(a.desc)} · ${U.fmtMoney(a.reward)}</small></div>`).join('');
  };
  UI.fightUpdate = function (d) {
    const r = d.tension / d.str;
    UI.el.tFill.style.width = U.clamp(r * 100, 0, 100) + '%';
    UI.el.tFill.className = r > 0.85 ? 'danger' : r > 0.6 ? 'warn' : '';
    UI.el.tDrag.style.left = U.clamp(d.drag / d.str * 100, 0, 100) + '%';
    UI.el.sFill.style.width = U.clamp(d.stamina * 100, 0, 100) + '%';
    $('bossFill').style.width = U.clamp(d.stamina * 100, 0, 100) + '%';
    UI.el.fInfo.innerHTML = `Tah <b>${U.fmt1(d.tension)} kg</b> / ${U.fmt1(d.str)} kg · brzda ${U.fmt1(d.drag)} kg · vlasec ${U.fmt1(d.lineLen)} m · ryba ${U.fmt1(d.dist)} m, hloubka ${U.fmt1(d.depth)} m${d.overload ? ' · <span class="warnTxt">prut je přetížený!</span>' : ''}`;
  };
  UI.vendorSay = function (text) {
    const el = $('vendorLine');
    if (el) { el.textContent = '„' + text + '"'; el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  };

  UI.refreshHud = function () {
    const S = FS.Game.state, Gr = FS.Game.gear(), F = FS.Fishing;
    UI.el.money.textContent = U.fmtMoney(S.money);
    $('tokenCount').textContent = S.tokens || 0;
    const c = (id) => FS.Game.count(id);
    let rig;
    if (Gr.method === 'lure') rig = `<div><span>Nástraha</span>${esc(Gr.lure.name)}</div>`;
    else rig = `<div><span>Háček</span>č. ${FS.Gear.hookLabel(Gr.hook.s.size)} (${c(Gr.hook.id)} ks) · ${esc(Gr.float.name.replace('Splávek ', ''))} (${c(Gr.float.id)})</div>
      <div><span>Návnada</span>${Gr.bait ? esc(Gr.bait.name) + ` (${c(Gr.bait.id)})` : '—'} ${F.hasBait ? '<i class="ok">nasazena</i>' : '<i class="no">nenasazena</i>'}</div>
      <div><span>Hloubka</span>${U.fmt1(F.depthSet)} m <small>${FS.dev('(kolečko)', '(− / +)', '(CH ▲▼)')}</small></div>`;
    UI.el.gear.innerHTML = `<div><span>Prut</span>${esc(Gr.rod.name)}</div>
      <div><span>Naviják</span>${esc(Gr.reel.name.replace('Naviják ', ''))} · ${esc(Gr.line.name)}</div>
      ${rig}
      <div><span>Navíjení</span><b class="lvl">${'●'.repeat(F.reelLevel)}${'○'.repeat(5 - F.reelLevel)}</b> ${U.fmt1(F.reelSpeed())} m/s <small>(1–5)</small></div>
      <div><span>Příkrm ${FS.dev('[F]', '', '')}</span>${Gr.gb ? esc(Gr.gb.name) + ` (${c(Gr.gb.id)})` : '—'}</div>`;
  };

  // ---------- průběžná aktualizace ----------
  let hudT = 0, lastStatus = null;
  UI.update = function (dt) {
    hudT -= dt;
    const F = FS.Fishing;
    if (hudT <= 0) { hudT = 0.25; UI.refreshHud(); }
    // stavový řádek
    let st = '';
    if (F.state === 'water') {
      if (F.mode() === 'bait') {
        const bottom = FS.World.waterDepth(F.rig.pos.x, F.rig.pos.z);
        st = `Hloubka nástrahy ${U.fmt1(F.baitDepth)} m / nastaveno ${U.fmt1(F.depthSet)} m · dno ${U.fmt1(bottom)} m${F.onBottom ? ' · <i>nástraha leží na dně</i>' : ''}`;
      } else st = `Rychlost vedení ${U.fmt1(F.lureSpeed)} m/s · hloubka ${U.fmt1(-F.rig.pos.y)} m · brzda ${U.fmt1(F.drag)} kg`;
    } else if (F.state === 'idle' && F.mode() === 'bait') st = `Nastavená hloubka ${U.fmt1(F.depthSet)} m ${FS.dev('(kolečko myši)', '(tlačítka − / +)', '(CH ▲▼)')}`;
    // do DOM jen při změně – zápis v každém snímku nutí prohlížeč přepočítat rozvržení
    if (st !== lastStatus) { lastStatus = st; UI.el.status.innerHTML = st; }
    const stDisp = st && !UI.modal ? 'block' : 'none';
    if (UI.el.status.style.display !== stDisp) UI.el.status.style.display = stDisp;
    // nápověda pro začátečníky
    const tut = FS.Game.state.tut;
    let h = '';
    if (!UI.modal) {
      if (F.state === 'casting') h = FS.dev('Drž – síla roste (švih myší nahoru ji zrychlí). Myší do stran míříš. <b>Pusť</b> = nahodit na kroužek.',
        'Drž – síla roste (švihem prstu nahoru rychleji), tažením do stran míříš. <b>Pusť</b> = nahodit na kroužek.',
        'Drž <b>OK</b> – síla roste, šipkami ←→ míříš. <b>Pusť OK</b> = nahodit na kroužek.');
      else if (tut < 2 && F.state === 'idle') h = FS.dev('<b>Nahazování:</b> podívej se na vodu, drž levé tlačítko a pusť, až bude kroužek tam, kam chceš. Myší se rozhlížíš, WASD chůze.',
        '<b>Nahazování:</b> tažením prstu se otoč k vodě, drž <b>Nahodit</b> a pusť, až bude kroužek tam, kam chceš. Levým palcem chodíš.',
        '<b>Nahazování:</b> šipkami ←→ se otoč k vodě, drž <b>OK</b> a pusť, až bude kroužek tam, kam chceš. Šipkami ↑↓ chodíš.');
      else if (tut < 3 && F.state === 'water') h = FS.dev('Sleduj splávek. Když se <b>ponoří nebo položí</b>, <b>klikni levým tlačítkem</b> = zásek. Pravým tlačítkem navíjíš.',
        'Sleduj splávek. Když se <b>ponoří nebo položí</b>, ťukni na <b>Zásek</b>. Tlačítkem <b>Navíjet</b> montáž přitáhneš.',
        'Sleduj splávek. Když se <b>ponoří nebo položí</b>, stiskni <b>OK</b> = zásek. <span class="kr"></span> červené tlačítko zapne / vypne navíjení.');
      else if (tut < 4 && F.state === 'fight') h = FS.dev('Drž <b>pravé</b> pro navíjení, když tah nepřesahuje brzdu. <b>Kolečkem</b> povol brzdu, když vlasec hrozí prasknout. Levé + myš vede prut do strany.',
        'Drž <b>Navíjet</b>, když tah nepřesahuje brzdu. Tlačítky <b>− / +</b> povolíš nebo utáhneš brzdu. Tažením po tlačítku <b>Vést prut</b> vedeš prut do strany.',
        'Drž <b>OK</b> pro navíjení, když tah nepřesahuje brzdu. <b>CH ▲▼</b> mění brzdu. Šipkami vedeš prut do strany.');
      else if (tut >= 3 && tut < 5 && F.state === 'idle' && FS.Game.state.stats.caught + FS.Game.state.stats.released > 0) h = 'Za utržené peníze nakoupíš lepší výbavu ve stánku (otoč se – je u cesty za tebou). ' +
        FS.dev('[Tab] výbava, [J] deník, [H] nápověda.', 'Výbava, deník a nápověda jsou v menu ☰.', '<span class="ky"></span> výbava, <span class="kb"></span> menu.');
    }
    UI.el.hint.style.display = h ? 'block' : 'none';
    if (h && UI.el.hint.innerHTML !== h) UI.el.hint.innerHTML = h;
    if (UI.catchData) renderCatch(dt);
  };

  // ---------- panely ----------
  UI.openPanel = function (name) {
    if (FS.Shop.open) return;
    if (UI.modal === name) { UI.closePanel(); return; }
    UI.closePanel(true);
    UI.modal = name;
    $(name + 'Panel').style.display = 'flex';
    FS.Player.unlock();
    if (name === 'gear') renderGear();
    if (name === 'journal') renderJournal();
    FS.Audio.ui();
  };
  UI.closePanel = function (keepUnlocked) {
    if (!UI.modal || UI.modal === 'shop' || UI.modal === 'catch') return;
    $(UI.modal + 'Panel').style.display = 'none';
    UI.modal = null;
    if (!keepUnlocked) FS.Player.lock();
  };

  function statLine(it) {
    const s = it.s || {};
    const likes = (map) => FS.Species.filter((sp) => (map(sp) || 0) >= 0.55).map((sp) => sp.name.split(' ')[0].toLowerCase());
    switch (it.cat) {
      case 'rod': return `Délka ${U.fmt1(s.len)} m · hod ${Math.round(s.cast * 100)} % · nosnost ${s.load} kg${s.sens ? ' · citlivý' : ''}${s.lure ? ' · na přívlač' : ''}`;
      case 'reel': return `Navíjení ${s.speed.toFixed(2).replace('.', ',')} m/s · brzda až ${s.drag} kg`;
      case 'line': return `Pevnost ${U.fmt1(s.str)} kg · ${String(it.name.match(/\d,\d+ mm/) || '')}`;
      case 'hook': return `Balení ${it.pack} ks`;
      case 'float': return `Zátěž ${s.g} g · citlivost ${Math.round(s.sens * 100)} %`;
      case 'bait': { const l = likes((sp) => sp.baits[it.id]); return `Balení ${it.pack} ks · bere: ${l.join(', ') || '—'}`; }
      case 'lure': { const l = likes((sp) => sp.lures[it.id]); return `${s.g} g · bere: ${l.join(', ')}`; }
      case 'groundbait': { const l = likes((sp) => sp.gb[it.id]); return `${it.pack} dávek · láká: ${l.join(', ')}`; }
      default: return '';
    }
  }
  UI.statLine = statLine;

  function isEquipped(it) {
    const e = FS.Game.state.eq;
    const slot = { rod: 'rod', reel: 'reel', line: 'line', hook: 'hook', float: 'float', bait: 'bait', lure: 'lure', groundbait: 'gb' }[it.cat];
    if (!slot) return false;
    if (it.cat === 'bait' && e.method !== 'bait') return false;
    if (it.cat === 'lure' && e.method !== 'lure') return false;
    return e[slot] === it.id;
  }

  // ---------- obchod ----------
  let shopCat = 'rod';
  UI.openShop = function () {
    UI.modal = 'shop';
    $('shopPanel').style.display = 'flex';
    renderShopTabs();
    renderShop();
    $('hud').classList.add('dim');
  };
  UI.closeShop = function () {
    $('shopPanel').style.display = 'none';
    UI.el.tooltip.style.display = 'none';
    UI.modal = null;
    $('hud').classList.remove('dim');
  };
  function renderShopTabs() {
    $('shopTabs').innerHTML = FS.Gear.cats.concat([{ id: 'quests', name: 'Úkoly' }, { id: 'automat', name: 'Automat' }]).map((c) => `<button data-cat="${c.id}" class="${c.id === shopCat ? 'on' : ''}">${c.name}</button>`).join('');
    $('shopTabs').querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { shopCat = b.dataset.cat; FS.Audio.ui(); renderShopTabs(); renderShop(); FS.Shop.say(shopCat); }));
  }
  function renderShop(flashId) {
    const S = FS.Game.state;
    if (shopCat === 'quests') { renderQuestsTab(); return; }
    if (shopCat === 'automat') { renderAutomat(); return; }
    const list = FS.Gear.items.filter((i) => i.cat === shopCat);
    $('shopMoney').textContent = U.fmtMoney(S.money);
    $('shopList').innerHTML = list.map((it) => {
      const owned = !it.consumable && S.owned[it.id];
      const cnt = it.consumable ? FS.Game.count(it.id) : 0;
      const eq = isEquipped(it);
      const canBuy = it.consumable || !owned;
      const afford = S.money >= it.price;
      return `<div class="card ${eq ? 'eq' : ''} ${flashId === it.id ? 'flash' : ''}" id="card-${it.id}">
        <div class="cardHead"><b>${esc(it.name)}</b><span class="price">${it.price ? U.fmtMoney(it.price) : 'zdarma'}</span></div>
        <div class="desc">${esc(it.desc)}</div>
        <div class="stats">${esc(statLine(it))}</div>
        <div class="row">
          ${it.consumable ? `<span class="have">Máš: ${cnt} ${it.cat === 'groundbait' ? 'dávek' : 'ks'}</span>` : owned ? '<span class="have">Vlastníš</span>' : '<span></span>'}
          <span class="btns">
            ${canBuy ? `<button class="buy" data-id="${it.id}" ${afford ? '' : 'disabled'}>Koupit${it.consumable && it.pack > 1 ? ` (+${it.pack})` : ''}</button>` : ''}
            ${(owned || cnt > 0) && it.cat !== 'acc' ? (eq ? '<button class="eqd" disabled>Nasazeno</button>' : `<button class="equip" data-id="${it.id}">Nasadit</button>`) : ''}
          </span>
        </div>
      </div>`;
    }).join('');
    $('shopList').querySelectorAll('.buy').forEach((b) => b.addEventListener('click', () => {
      const it = FS.Gear.byId[b.dataset.id];
      if (FS.Game.buy(it)) { FS.Shop.say('buy'); } else FS.Shop.say('poor');
      renderShop(it.id);
    }));
    $('shopList').querySelectorAll('.equip').forEach((b) => b.addEventListener('click', () => {
      FS.Audio.ui();
      FS.Game.equip(FS.Gear.byId[b.dataset.id]);
      renderShop(b.dataset.id);
    }));
    if (flashId) { const c = $('card-' + flashId); if (c) c.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  }
  function renderQuestsTab() {
    const S = FS.Game.state, q = S.quests;
    $('shopMoney').textContent = U.fmtMoney(S.money);
    const legends = FS.Legends.map((L) => {
      const st = S.legends[L.id];
      return `<div class="card ${st === 'caught' ? 'eq' : ''}"><div class="cardHead"><b>${esc(L.name)}</b><span class="price">${st === 'caught' ? 'Chycena' : st === 'active' ? 'V rybníce' : '???'}</span></div>
        <div class="desc">${st ? esc(L.desc) : 'O této legendě ti pan Vávra ještě nevyprávěl.'}</div>
        ${st === 'active' ? `<div class="stats">Tip: ${esc(L.hint)} Odměna ${U.fmtMoney(L.reward)} + ${L.tokens} žetony.</div>` : ''}</div>`;
    }).join('');
    $('shopList').innerHTML = `<div class="card"><div class="desc"><b>Pan Vávra:</b> „${esc(FS.Quests.storyLine())}"</div>
      <div class="stats">Splněno úkolů: ${q.done || 0} · příběh ${Math.min(q.story, FS.Quests.STORY.length)}/${FS.Quests.STORY.length}</div></div>` +
      q.active.map((a) => `<div class="card ${a.kind === 'story' ? 'eq' : ''}"><div class="cardHead"><b>${a.kind === 'story' ? 'Příběh: ' : ''}${esc(a.title)}</b><span class="price">${U.fmtMoney(a.reward)}</span></div>
        <div class="desc">${esc(a.desc)}</div><div class="stats">Postup ${a.progress || 0}/${a.n}${a.tokens ? ` · +${a.tokens} žetony` : ''}</div></div>`).join('') +
      '<h4 class="sep">Legendy rybníka</h4>' + legends;
  }
  let spinning = false;
  function renderAutomat(result) {
    const S = FS.Game.state;
    $('shopMoney').textContent = U.fmtMoney(S.money);
    const skins = Object.entries(FS.Skins).map(([k, v]) => `<span class="chip ${S.skins.includes(k) ? 'on' : 'off'}">${esc(v.name)}</span>`).join('');
    $('shopList').innerHTML = `<div class="card slot">
      <div class="cardHead"><b>Rybí automat</b><span class="price">1 žeton</span></div>
      <div class="desc">Žetony dostaneš za vzácné barevné ryby, legendy a některé úkoly. Máš <b>${S.tokens || 0}</b>.</div>
      <div class="reels"><div class="reel" id="reel0"></div><div class="reel" id="reel1"></div><div class="reel" id="reel2"></div></div>
      <div class="slotRes" id="slotRes">${result ? esc(result) : 'Tři stejné = jackpot (barva prutu), dvě stejné = návnady nebo peníze.'}</div>
      <div class="row"><span></span><span class="btns"><button class="buy" id="spinBtn" ${(S.tokens || 0) < 1 || spinning ? 'disabled' : ''}>Zatočit (1 žeton)</button></span></div>
    </div><div class="card"><div class="cardHead"><b>Barvy prutu</b></div><div class="chips">${skins}</div><div class="stats">Nasadíš je ve výbavě [Tab].</div></div>`;
    for (let i = 0; i < 3; i++) setReel(i, FS.Quests.SYMBOLS[i * 2].id);
    $('spinBtn').onclick = () => {
      if (spinning) return;
      const r = FS.Quests.spin();
      if (!r) return;
      spinning = true; $('spinBtn').disabled = true;
      FS.Audio.ui();
      const t0 = performance.now();
      const anim = () => {
        const t = performance.now() - t0;
        for (let i = 0; i < 3; i++) {
          const stop = 900 + i * 450;
          if (t < stop) { setReel(i, FS.Quests.SYMBOLS[Math.floor(Math.random() * FS.Quests.SYMBOLS.length)].id); }
          else if (!$('reel' + i).dataset.stopped) { $('reel' + i).dataset.stopped = 1; setReel(i, r.res[i]); FS.Audio.tick(); }
        }
        if (t < 900 + 2 * 450 + 50) requestAnimationFrame(anim);
        else {
          spinning = false;
          if (r.prize.big) { FS.Audio.coin(); FS.Shop.say('automat'); }
          renderAutomat(r.prize.text);
          for (let i = 0; i < 3; i++) setReel(i, r.res[i]);
          UI.refreshHud();
        }
      };
      anim();
    };
  }
  function setReel(i, id) {
    const el = $('reel' + i);
    if (!el) return;
    const key = id === 'zlata' ? 'karas:zlata' : id;
    if (!thumbs[key]) thumbs[key] = id === 'zlata' ? UI.thumb('karas', 'zlata') : UI.thumb(id);
    el.style.backgroundImage = `url(${thumbs[key]})`;
  }
  UI.shopHover = function (item, x, y) {
    const tt = UI.el.tooltip;
    if (!item) { tt.style.display = 'none'; return; }
    tt.style.display = 'block';
    tt.style.left = Math.min(window.innerWidth - 300, x + 16) + 'px';
    tt.style.top = (y + 16) + 'px';
    const price = item.cat === 'automat' ? '1 žeton' : item.price ? U.fmtMoney(item.price) : 'zdarma';
    tt.innerHTML = `<b>${esc(item.name)}</b><br><span class="price">${price}</span><br><small>${esc(item.cat === 'automat' ? item.desc : statLine(item))}</small><br><i>Klikni pro výběr</i>`;
  };
  UI.shopSelect = function (item) {
    if (!item) return;
    shopCat = item.cat;
    renderShopTabs();
    renderShop(item.id);
    FS.Shop.say(item.cat);
    FS.Audio.ui();
  };

  // ---------- výbava ----------
  function renderGear() {
    const S = FS.Game.state;
    const sections = [
      ['rod', 'Prut'], ['reel', 'Naviják'], ['line', 'Vlasec'], ['hook', 'Háček'], ['float', 'Splávek'], ['bait', 'Návnada (plavaná)'], ['lure', 'Umělá nástraha (přívlač)'], ['groundbait', 'Příkrm [F]'],
    ];
    $('gearList').innerHTML = sections.map(([cat, title]) => {
      const owned = FS.Gear.items.filter((i) => i.cat === cat && (i.consumable ? FS.Game.count(i.id) > 0 || isEquipped(i) : S.owned[i.id]));
      const chips = owned.length ? owned.map((i) => `<button class="chip ${isEquipped(i) ? 'on' : ''}" data-id="${i.id}">${esc(i.name)}${i.consumable ? ` <small>(${FS.Game.count(i.id)})</small>` : ''}</button>`).join('') : '<span class="none">nic – kup ve stánku</span>';
      return `<div class="gsec"><h4>${title}</h4><div class="chips">${chips}</div></div>`;
    }).join('') + `<div class="gsec"><h4>Doplňky</h4><div class="chips">${['podberak', 'bryle'].map((id) => `<span class="chip ${S.owned[id] ? 'on' : 'off'}">${FS.Gear.byId[id].name}${S.owned[id] ? '' : ' – nemáš'}</span>`).join('')}</div></div>`;
    $('gearList').innerHTML += `<div class="gsec"><h4>Barva prutu</h4><div class="chips">${S.skins.map((k) => `<button class="chip skin ${S.skin === k ? 'on' : ''}" data-skin="${k}">${esc(FS.Skins[k].name)}</button>`).join('')}</div></div>`;
    $('gearList').querySelectorAll('button.chip:not(.skin)').forEach((b) => b.addEventListener('click', () => { FS.Audio.ui(); FS.Game.equip(FS.Gear.byId[b.dataset.id]); renderGear(); }));
    $('gearList').querySelectorAll('button.skin').forEach((b) => b.addEventListener('click', () => { FS.Audio.ui(); S.skin = b.dataset.skin; FS.Rod.applySkin(S.skin); FS.Game.save(); renderGear(); }));
  }

  // ---------- deník ----------
  const thumbs = {};
  function renderJournal() {
    const S = FS.Game.state;
    const st = S.stats;
    const legs = FS.Legends.filter((L) => S.legends[L.id] === 'caught').map((L) => L.name);
    $('journalStats').innerHTML = `Prodáno ryb: <b>${st.caught}</b> · puštěno: <b>${st.released}</b> · vyděláno celkem: <b>${U.fmtMoney(st.earned)}</b> · trofeje legend: <b>${legs.length ? esc(legs.join(', ')) : 'žádné'}</b>`;
    $('journalList').innerHTML = FS.Species.map((sp) => {
      const r = S.records[sp.id];
      const short = (k) => FS.Gear.byId[k].name.replace(/\s(č\.|\d).*$/, '');
      const baits = [...new Set(Object.entries(sp.baits).filter(([, v]) => v >= 0.5).map(([k]) => short(k)).concat(Object.entries(sp.lures).filter(([, v]) => v >= 0.6).map(([k]) => short(k))))];
      return `<div class="jcard ${r ? '' : 'unk'}">
        <img id="th-${sp.id}" alt="${esc(sp.name)}" src="${thumbs[sp.id] || ''}">
        <div><b>${esc(sp.name)}</b> <i>${esc(sp.latin)}</i>
        <div class="desc">${esc(sp.desc)}</div>
        <div class="stats">Nástrahy: ${esc(baits.join(', '))} · výkup ${sp.perKg} Kč/kg + ${sp.base} Kč</div>
        <div class="rec">${r ? `Chyceno: <b>${r.count}×</b> · rekord <b>${U.fmtKg(r.best)}</b> (${Math.round(r.bestLen)} cm)` : 'Zatím nechyceno'}</div>
        <div class="vars">${Object.entries(FS.Variants).filter(([, v]) => (!v.only || v.only.includes(sp.id)) && (!v.not || !v.not.includes(sp.id))).map(([k, v]) => `<span class="vb ${(S.variants[sp.id] || {})[k] ? 'got' : ''}" style="--c:${v.color}">${v.label}</span>`).join('')}</div></div>
      </div>`;
    }).join('');
    // náhledy postupně
    let i = 0;
    const next = () => {
      if (UI.modal !== 'journal' || i >= FS.Species.length) return;
      const sp = FS.Species[i++];
      if (!thumbs[sp.id]) thumbs[sp.id] = renderThumb(sp);
      const img = $('th-' + sp.id); if (img) img.src = thumbs[sp.id];
      setTimeout(next, 10);
    };
    next();
  }

  // ---------- 3D náhled ----------
  function preview() {
    if (UI.pv) return UI.pv;
    const canvas = $('catchCanvas');
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio));
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    const scene = new THREE.Scene();
    scene.environment = FS.Sky.envMap(r);
    const key = new THREE.DirectionalLight(0xfff2e0, 1.7); key.position.set(1, 2, 2);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 0.9); rim.position.set(-2, 1, -2);
    scene.add(key, rim, new THREE.HemisphereLight(0xdfefff, 0x445533, 0.5));
    const cam = new THREE.PerspectiveCamera(30, 2, 0.01, 50);
    cam.layers.enable(2);
    UI.pv = { r, scene, cam, canvas };
    return UI.pv;
  }
  function frameFish(pv, fishObj, len) {
    // nad „hladinou" (y > 0), aby se neuplatnil podvodní zákal
    pv.cam.position.set(0, 5 + len * 0.1, len * 1.32);
    pv.cam.lookAt(0, 5, 0);
    fishObj.group.position.set(0, 5, 0);
    fishObj.inner.position.x = 0.07 * len;
  }
  UI.thumb = (spId, vid) => renderThumb(FS.SpeciesById[spId], vid);
  function renderThumb(sp, vid) {
    const pv = preview();
    const f = FS.FishModel.create(sp.id, 1, vid ? FS.variantSpecies(sp, vid) : null);
    f.u.uAmp.value = 0.02;
    pv.scene.add(f.group);
    f.group.rotation.set(0, 0.25, 0);
    frameFish(pv, f, 1);
    pv.cam.position.set(0, 5.1, 1.42); pv.cam.lookAt(0, 5, 0);
    pv.r.setSize(280, 130, false);
    pv.cam.aspect = 280 / 130; pv.cam.updateProjectionMatrix();
    pv.r.render(pv.scene, pv.cam);
    const url = pv.canvas.toDataURL('image/png');
    pv.scene.remove(f.group);
    f.mats.forEach((m) => m.dispose());
    return url;
  }

  // ---------- karta úlovku ----------
  UI.showCatch = function (d) {
    UI.modal = 'catch';
    FS.Player.unlock();
    UI.catchData = d;
    const pv = preview();
    const g = d.model.group;
    g.rotation.set(0, 0.3, 0);
    d.model.u.uAmp.value = 0.02;
    g.traverse((o) => o.layers && o.layers.enable(0));
    pv.scene.add(g);
    frameFish(pv, d.model, d.model.length);
    pv.r.setSize(620, 300, false);
    pv.cam.aspect = 620 / 300; pv.cam.updateProjectionMatrix();
    const rec = FS.Game.state.records[d.sp.id];
    const isRec = !rec || d.weight > rec.best;
    $('catchTitle').textContent = d.legend ? d.legend.name : d.sp.name + (d.variant ? ' – ' + FS.Variants[d.variant].label.toLowerCase() : '');
    $('catchLatin').textContent = d.sp.latin;
    $('catchStats').innerHTML = `
      <div><span>Hmotnost</span><b>${U.fmtKg(d.weight)}</b></div>
      <div><span>Délka</span><b>${Math.round(d.length)} cm</b></div>
      <div><span>Zdolávání</span><b>${Math.round(d.time)} s</b></div>
      <div><span>Obtížnost</span><b class="stars">${'★'.repeat(d.stars)}${'☆'.repeat(5 - d.stars)}</b></div>`;
    const f2 = (v) => v.toFixed(2).replace('.', ',');
    $('catchBonus').innerHTML = (d.bonuses || []).map((b) => `<span class="bonus">${esc(b.label)} <b>+${Math.round(b.v * 100)} %</b></span>`).join('') +
      (d.variant ? `<span class="bonus rare" style="--c:${FS.Variants[d.variant].color}">${esc(FS.Variants[d.variant].label)} <b>×${f2(d.vmult)}</b></span>` : '') +
      (d.tokens ? `<span class="bonus tokb">+${d.tokens} ${d.tokens === 1 ? 'žeton' : 'žetony'} do automatu</span>` : '');
    $('catchPrice').innerHTML = `Výkup ${U.fmtMoney(d.baseVal)} × obtížnost ${f2(d.mult)}${d.styleSum ? ` × styl ${f2(1 + d.styleSum)}` : ''}${d.vmult > 1 ? ` × vzácnost ${f2(d.vmult)}` : ''} = <b>${U.fmtMoney(d.value)}</b>`;
    $('catchRecord').style.display = isRec || d.legend ? 'block' : 'none';
    $('catchRecord').textContent = d.legend ? 'Legenda ulovena!' : rec ? 'Nový osobní rekord!' : 'První úlovek tohoto druhu!';
    $('catchDesc').textContent = d.legend ? d.legend.desc : d.sp.desc;
    $('catchCard').style.display = 'flex';
    $('sellBtn').textContent = `Prodat za ${U.fmtMoney(d.value)}`;
    const done = (sold) => {
      FS.Game.record(d.sp, d.weight, d.length, d.value, sold);
      if (sold) { FS.Game.addMoney(d.value); FS.Audio.coin(); }
      else { FS.UI.toast('Ryba odplavala zpět do rybníka.'); FS.Audio.splash(0.3); }
      $('catchCard').style.display = 'none';
      pv.scene.remove(g);
      d.model.mats.forEach((m) => m.dispose());
      UI.catchData = null;
      UI.modal = null;
      FS.Player.lock();
      d.onDone();
      if (FS.Game.state.tut < 4) FS.Game.state.tut = 4; else if (FS.Game.state.tut < 5 && FS.Game.state.stats.caught > 2) FS.Game.state.tut = 5;
      FS.Game.save();
    };
    $('sellBtn').onclick = () => done(true);
    $('releaseBtn').onclick = () => done(false);
    // otáčení myší
    let drag = null;
    // pointer události = myš i prst
    pv.canvas.onpointerdown = (e) => { drag = { x: e.clientX, r: g.rotation.y }; if (pv.canvas.setPointerCapture) pv.canvas.setPointerCapture(e.pointerId); };
    pv.canvas.onpointerup = pv.canvas.onpointercancel = () => { drag = null; };
    pv.canvas.onpointermove = (e) => { if (drag) { g.rotation.y = drag.r + (e.clientX - drag.x) * 0.012; UI.catchSpin = 0; } };
    UI.catchSpin = 0.35;
  };
  function renderCatch(dt) {
    const pv = UI.pv, d = UI.catchData;
    d.model.group.rotation.y += dt * (UI.catchSpin || 0);
    d.model.u.uPhase.value += dt * 3;
    pv.r.render(pv.scene, pv.cam);
  }
})(window.FS);
