import { DEG, KN, clamp, wrap } from './physics.js';

let ctx = null;
const $ = (id) => document.getElementById(id);

// ---------- menu ----------
function boatSVG(id) {
  const sails = {
    skiff: '<path d="M52 12 L52 78 L84 78 Z" fill="#f6f3ea"/><path d="M50 22 L50 76 L26 80 Z" fill="#f6f3ea" opacity=".9"/><path d="M50 18 Q18 50 8 80 L48 80 Z" fill="#ff3b5c" opacity=".85"/>',
    cruiser: '<path d="M54 8 L54 76 L88 76 Z" fill="#f4f1e8"/><path d="M52 14 L52 74 L22 80 Z" fill="#f4f1e8" opacity=".9"/>',
    ocean: '<path d="M56 4 L56 74 L94 74 Z" fill="#efe9da"/><path d="M54 8 L54 72 L16 80 Z" fill="#efe9da" opacity=".9"/>',
  }[id];
  const hull = {
    skiff: '<path d="M10 82 L96 82 L90 88 L18 88 Z" fill="#fff"/><rect x="18" y="86" width="72" height="2" fill="#ff4d2e"/>',
    cruiser: '<path d="M8 80 L100 80 L92 92 L22 92 Z" fill="#1d3557"/><rect x="44" y="76" width="26" height="4" fill="#eee"/><path d="M58 92 L60 104 L66 104 L64 92Z" fill="#333"/>',
    ocean: '<path d="M4 78 L104 78 L94 92 L16 92 Z" fill="#fafafa"/><rect x="40" y="73" width="34" height="5" fill="#eee"/><rect x="16" y="86" width="80" height="2" fill="#0b6e4f"/><path d="M56 92 L58 106 L68 108 L66 92Z" fill="#333"/>',
  }[id];
  return `<svg viewBox="0 0 110 110" class="boat-svg">${sails}${hull}<rect x="0" y="94" width="110" height="16" fill="url(#wv)" opacity=".5"/></svg>`;
}

function stars(n) { return Array.from({ length: 5 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join(''); }

function buildMenu() {
  const { S, BOATS, WEATHER, store, fmtTime } = ctx;
  const bc = $('boatCards');
  bc.innerHTML = Object.values(BOATS).map((b) => `
    <button class="card boat ${S.boatId === b.id ? 'sel' : ''}" data-boat="${b.id}">
      ${boatSVG(b.id)}
      <div class="card-title">${b.name}</div>
      <div class="card-sub">${b.length} · ${b.crewText}</div>
      <p>${b.desc}</p>
      <div class="statrow"><span>Rychlost</span><span class="stars">${stars(b.stats.speed)}</span></div>
      <div class="statrow"><span>Stabilita</span><span class="stars">${stars(b.stats.stability)}</span></div>
      <div class="statrow"><span>Obratnost</span><span class="stars">${stars(b.stats.handling)}</span></div>
    </button>`).join('');
  const wc = $('weatherCards');
  wc.innerHTML = Object.values(WEATHER).map((w) => `
    <button class="card wx ${S.weatherId === w.id ? 'sel' : ''}" data-wx="${w.id}">
      <div class="wx-icon">${w.icon}</div>
      <div class="card-title">${w.name}</div>
      <div class="wx-data"><span>💨 ${w.tws} kn</span><span>🌊 ${w.waveH} m</span><span>↯ ±${Math.round(w.gust * 100)} %</span></div>
      <p>${w.desc}</p>
    </button>`).join('');
  document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === S.mode));
  const best = store.get(`best_${S.boatId}_${S.weatherId}`, null);
  $('bestTime').textContent = best ? `Rekord regaty (${BOATS[S.boatId].name}, ${WEATHER[S.weatherId].name}): ${fmtTime(best)}` : 'Zatím žádný rekord pro tuto kombinaci lodi a počasí.';
}

export function showMenu(show) {
  $('menu').classList.toggle('hidden', !show);
  $('hud').classList.toggle('hidden', show);
  if (show) buildMenu();
}

// ---------- tlačítka ----------
export function setButtons(S, spec, boat) {
  if (!spec || !boat) return;
  const set = (act, on, label, disabled) => {
    const el = document.querySelector(`[data-act="${act}"]`);
    if (!el) return;
    el.classList.toggle('on', !!on);
    el.classList.toggle('disabled', !!disabled);
    if (label) el.querySelector('span').textContent = label;
  };
  set('spin', boat.spinUp, spec.spinName);
  set('hike', boat.trapeze, spec.hikeLabel);
  set('board', spec.keel.retract && boat.board > 0.5, boat.board > 0.5 ? 'Meč dole' : 'Meč nahoře', !spec.keel.retract);
  set('reef', boat.reef > 0, boat.reef ? `Ref ${boat.reef}` : 'Refování', spec.id === 'skiff');
  set('auto', S.autoTrim, 'Auto-trim');
  set('motor', boat.motor, 'Motor', !spec.motor);
  $('headLabel').firstChild.textContent = boat.spinUp ? `Otěž ${spec.spinName.toLowerCase()}u ` : (spec.id === 'skiff' ? 'Otěž kosatky ' : 'Otěž janovky ');
  $('helmLabel').firstChild.textContent = spec.steering === 'wheel' ? 'Kormidelní kolo ' : 'Kormidlo (pinna) ';
}

// ---------- toast ----------
let toastTimer = 0;
export function toast(text, ms = 1500) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- ovládací prvky ----------
function vslider(el, get, setv) {
  let active = false;
  const apply = (e) => {
    const r = el.getBoundingClientRect();
    setv(clamp((e.clientY - r.top) / r.height, 0, 1));
  };
  el.addEventListener('pointerdown', (e) => { active = true; el.setPointerCapture(e.pointerId); apply(e); e.preventDefault(); });
  el.addEventListener('pointermove', (e) => { if (active) apply(e); });
  el.addEventListener('pointerup', () => { active = false; });
  el.addEventListener('pointercancel', () => { active = false; });
}

export function initUI(o) {
  ctx = o;
  const { S } = o;
  $('boatCards').addEventListener('click', (e) => {
    const c = e.target.closest('[data-boat]'); if (!c) return;
    S.boatId = c.dataset.boat; buildMenu(); o.onPreview(); o.onPrefs();
  });
  $('weatherCards').addEventListener('click', (e) => {
    const c = e.target.closest('[data-wx]'); if (!c) return;
    S.weatherId = c.dataset.wx; buildMenu(); o.onPreview(); o.onPrefs();
  });
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { S.mode = b.dataset.mode; buildMenu(); o.onPrefs(); }));
  $('startBtn').addEventListener('click', o.onStart);
  $('resumeBtn').addEventListener('click', o.onResume);
  $('menuBtn').addEventListener('click', o.onMenu);
  $('helpClose').addEventListener('click', () => { $('help').classList.add('hidden'); S.paused = !$('pause').classList.contains('hidden'); });
  $('menuHelp').addEventListener('click', () => $('help').classList.remove('hidden'));

  const prefToggle = (id, key, after) => {
    const el = $(id);
    el.checked = !!S[key];
    el.addEventListener('change', () => { S[key] = el.checked; after && after(); o.onPrefs(); });
  };
  prefToggle('optCenter', 'autoCenter');
  prefToggle('optSound', 'sound', () => o.actions.mute && (S.sound = !S.sound, o.actions.mute()));
  prefToggle('optShadows', 'shadows');

  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault();
    if (!S.running) return;
    o.actions[b.dataset.act]();
    setButtons(S, o.getSpec(), o.getBoat());
    b.blur();
  }));

  // otěže
  vslider($('mainSheet'), null, (v) => { const b = o.getBoat(); if (!b) return; if (S.autoTrim) { S.autoTrim = false; setButtons(S, o.getSpec(), b); } b.sheets.main = v; });
  vslider($('headSheet'), null, (v) => { const b = o.getBoat(); if (!b) return; if (S.autoTrim) { S.autoTrim = false; setButtons(S, o.getSpec(), b); } b.sheets.head = v; });

  // kormidlo – tažení
  const helm = $('helm');
  let hd = false;
  const applyHelm = (e) => {
    const r = helm.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const b = o.getBoat(); if (b) b.rudder = clamp(-x * 2.4, -1, 1);
  };
  helm.addEventListener('pointerdown', (e) => { hd = true; S.helmDrag = true; helm.setPointerCapture(e.pointerId); applyHelm(e); });
  helm.addEventListener('pointermove', (e) => { if (hd) applyHelm(e); });
  const up = () => { hd = false; S.helmDrag = false; };
  helm.addEventListener('pointerup', up); helm.addEventListener('pointercancel', up);
  $('deckToggle').addEventListener('click', () => $('deck').classList.toggle('collapsed'));
}

// ---------- HUD ----------
function tellText(info, kind, awaDeg, aws) {
  if (!info) return ['', ''];
  if (aws < 0.6) return ['Bezvětří', 'grey'];
  if (Math.abs(awaDeg) < 22 || info.rev) return ['Proti větru', 'grey'];
  if (info.a < 7) return ['Třepetá – přitáhni', 'warn'];
  if (info.a > (kind === 'spin' ? 42 : 28)) return ['Přetaženo – povol', 'bad'];
  return ['Optimální trim', 'ok'];
}

export function updateHUD(b, spec, x) {
  const kn = b.u * KN;
  $('spd').textContent = Math.max(0, kn).toFixed(1);
  $('spdMax').textContent = x.maxSpd.toFixed(1) + ' kn';
  $('vmg').textContent = (b.vmg * KN).toFixed(1) + ' kn';
  let hdg = (b.psi / DEG) % 360; if (hdg < 0) hdg += 360;
  // kompas: sever = +z, kurz po směru hodinových ručiček
  const comp = ((360 - hdg) % 360);
  $('hdg').textContent = Math.round(comp).toString().padStart(3, '0') + '°';
  $('leeway').textContent = Math.abs(b.leeway / DEG).toFixed(1) + '°';
  $('heelVal').textContent = Math.abs(b.phi / DEG).toFixed(0) + '°';
  $('planing').classList.toggle('show', b.planing > 0.5 && !b.capsized);
  $('surfing').classList.toggle('show', (b.surf || 0) > 0.04 && b.u > 2 && b.planing < 0.5);
  $('capsizeMsg').classList.toggle('hidden', !b.capsized);
  $('capsizeMsg').textContent = b.righting > 0 ? 'Vztyčuji loď…' : 'PŘEVRÁCENO! Stiskni Enter (nebo klepni sem) pro vztyčení';
  $('pos').textContent = x.pos;
  $('tws').textContent = (b.tws * KN).toFixed(1) + ' kn';
  $('aws').textContent = (b.aws * KN).toFixed(1) + ' kn';
  $('twaVal').textContent = Math.abs(b.twa / DEG).toFixed(0) + '°';
  $('awaVal').textContent = Math.abs(b.awa / DEG).toFixed(0) + '°';
  $('tackSide').textContent = b.twa > 0 ? 'levoboční halzou (vítr zleva)' : 'pravoboční halzou (vítr zprava)';
  $('autoBadge').classList.toggle('show', x.autoTrim);
  $('motorBadge').classList.toggle('show', b.motor);
  $('stallBadge').classList.toggle('show', !!b.rudderStall);

  // otěže
  const setSheet = (id, v, info, kind, angle) => {
    const el = $(id);
    el.querySelector('.fill').style.height = (v * 100) + '%';
    el.querySelector('.knob').style.top = (v * 100) + '%';
    const [t, c] = tellText(info, kind, b.awa / DEG, b.aws);
    const tl = $(id + 'Tell');
    tl.textContent = t; tl.className = 'tell ' + c;
    $(id + 'Val').textContent = `${Math.round((1 - v) * 100)} % · ${Math.abs(angle / DEG).toFixed(0)}°`;
  };
  setSheet('mainSheet', b.sheets.main, b.sailInfo.main, 'main', b.ang.main);
  const headKey = b.spinUp ? 'spin' : 'jib';
  setSheet('headSheet', b.sheets.head, b.sailInfo[headKey], headKey, b.ang[headKey]);

  drawHelm(b, spec);
  drawHeel(b, spec);
  drawWind(b);

  // závod
  const rb = $('raceBox');
  rb.classList.toggle('hidden', !x.race.active);
  if (x.race.active) {
    const r = x.race;
    $('raceTime').textContent = ctx.fmtTime(r.time);
    if (r.finished) { $('raceNext').textContent = 'Dokončeno 🏁'; $('raceDist').textContent = ''; $('raceArrow').style.opacity = 0; }
    else {
      const leg = r.legs[r.leg];
      $('raceNext').textContent = leg.name;
      const tx = leg.type === 'line' ? clamp(b.x, -r.lineHalf * 0.7, r.lineHalf * 0.7) : leg.x;
      const tz = leg.type === 'line' ? 0 : leg.z;
      const d = Math.hypot(tx - b.x, tz - b.z);
      $('raceDist').textContent = d > 1000 ? (d / 1852).toFixed(2) + ' NM' : Math.round(d) + ' m';
      const brg = Math.atan2(tx - b.x, tz - b.z);
      const rel = wrap(brg - b.psi);
      const arrow = $('raceArrow');
      arrow.style.opacity = 1;
      arrow.style.transform = `rotate(${-rel / DEG}deg)`;
    }
  }
}

function drawHelm(b, spec) {
  const c = $('helm'); const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.88;
  const max = spec.rudder.max;
  // stupnice
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2;
  g.beginPath(); g.arc(cx, cy, H * 0.75, Math.PI + 0.35, -0.35); g.stroke();
  for (let a = -max; a <= max; a += 5) {
    const ang = -Math.PI / 2 + (a / max) * (Math.PI / 2 - 0.35);
    const r1 = H * 0.75, r2 = a % 15 === 0 ? H * 0.64 : H * 0.69;
    g.beginPath(); g.moveTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); g.lineTo(cx + Math.cos(ang) * r2, cy + Math.sin(ang) * r2); g.stroke();
  }
  const turn = b.rudder; // + = doleva
  const ang = -Math.PI / 2 - turn * (Math.PI / 2 - 0.35);
  if (spec.steering === 'wheel') {
    g.save(); g.translate(cx, cy - H * 0.38); g.rotate(-turn * 2.2);
    g.strokeStyle = '#d9dee6'; g.lineWidth = 5;
    g.beginPath(); g.arc(0, 0, H * 0.3, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * H * 0.36, Math.sin(a) * H * 0.36); g.stroke(); }
    g.fillStyle = '#ffcf4a'; g.beginPath(); g.arc(0, -H * 0.3, 5, 0, Math.PI * 2); g.fill();
    g.restore();
  } else {
    // pinna se vychyluje opačně než příď
    const ta = -Math.PI / 2 + turn * (Math.PI / 2 - 0.35);
    g.strokeStyle = '#c58a4a'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(ta) * H * 0.6, cy + Math.sin(ta) * H * 0.6); g.stroke();
  }
  // ukazatel kurzu (kam se otáčí příď)
  g.strokeStyle = '#ffcf4a'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(cx + Math.cos(ang) * H * 0.78, cy + Math.sin(ang) * H * 0.78); g.lineTo(cx + Math.cos(ang) * H * 0.9, cy + Math.sin(ang) * H * 0.9); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = '600 13px Outfit, sans-serif'; g.textAlign = 'center';
  const deg = Math.round(Math.abs(b.rudder * max));
  g.fillText(deg === 0 ? 'středem' : `${deg}° ${b.rudder > 0 ? '◄ vlevo' : 'vpravo ►'}`, cx, 16);
}

function drawHeel(b, spec) {
  const c = $('heelCanvas'); const g = c.getContext('2d');
  const W = c.width, H = c.height;
  g.clearRect(0, 0, W, H);
  const cx = W / 2, cy = 8, R = H - 18;
  const lim = spec.capsize ? spec.capsize : 45;
  const toA = (deg) => Math.PI / 2 - deg * DEG;
  g.lineWidth = 8;
  const arc = (a0, a1, col) => { g.strokeStyle = col; g.beginPath(); g.arc(cx, cy, R, toA(a1), toA(a0)); g.stroke(); };
  arc(-60, 60, 'rgba(255,255,255,0.12)');
  arc(-25, 25, 'rgba(70,210,140,0.55)');
  arc(25, lim * 0.8, 'rgba(255,200,60,0.6)'); arc(-lim * 0.8, -25, 'rgba(255,200,60,0.6)');
  arc(lim * 0.8, 60, 'rgba(255,70,70,0.7)'); arc(-60, -lim * 0.8, 'rgba(255,70,70,0.7)');
  // loď (záď) – náklon
  const phi = clamp(b.phi / DEG, -90, 90);
  g.save(); g.translate(cx, cy + R * 0.55); g.rotate(-phi * DEG);
  g.fillStyle = '#e8edf3';
  g.beginPath(); g.moveTo(-18, -4); g.lineTo(18, -4); g.lineTo(10, 6); g.lineTo(-10, 6); g.closePath(); g.fill();
  g.fillStyle = '#9fb3c8'; g.fillRect(-1.5, -4, 3, 14);
  g.restore();
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  const a = toA(-phi);
  g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4)); g.stroke();
}

function drawWind(b) {
  const c = $('windCanvas'); const g = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2, R = W * 0.42;
  g.clearRect(0, 0, W, H);
  g.lineWidth = 6;
  // levobok červeně, pravobok zeleně (jako na skutečném přístroji)
  g.strokeStyle = 'rgba(255,80,80,0.5)'; g.beginPath(); g.arc(cx, cy, R, Math.PI + 0.35, Math.PI * 1.5 - 0.0); g.stroke();
  g.strokeStyle = 'rgba(80,220,120,0.5)'; g.beginPath(); g.arc(cx, cy, R, Math.PI * 1.5, -0.35); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
  for (let a = 0; a < 360; a += 30) {
    const r = a * DEG;
    g.beginPath(); g.moveTo(cx + Math.sin(r) * R * 0.88, cy - Math.cos(r) * R * 0.88); g.lineTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R); g.stroke();
  }
  // loď
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.moveTo(cx, cy - R * 0.45); g.quadraticCurveTo(cx + R * 0.2, cy, cx + R * 0.13, cy + R * 0.4); g.lineTo(cx - R * 0.13, cy + R * 0.4); g.quadraticCurveTo(cx - R * 0.2, cy, cx, cy - R * 0.45); g.fill();
  const arrow = (ang, col, len, w) => {
    // ang = odkud fouká, + = zleva (levobok)
    const sx = cx - Math.sin(ang) * R, sy = cy - Math.cos(ang) * R;
    const ex = cx - Math.sin(ang) * R * (1 - len), ey = cy - Math.cos(ang) * R * (1 - len);
    g.strokeStyle = col; g.fillStyle = col; g.lineWidth = w;
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
    const dx = ex - sx, dy = ey - sy, l = Math.hypot(dx, dy), ux = dx / l, uy = dy / l;
    g.beginPath(); g.moveTo(ex + ux * 8, ey + uy * 8); g.lineTo(ex - uy * 7, ey + ux * 7); g.lineTo(ex + uy * 7, ey - ux * 7); g.closePath(); g.fill();
  };
  arrow(b.twa, '#5ab4ff', 0.42, 4);
  arrow(b.awa, '#ffcf4a', 0.32, 4);
  g.fillStyle = 'rgba(255,255,255,0.6)'; g.font = '600 11px Outfit, sans-serif'; g.textAlign = 'center';
  g.fillText('PŘÍĎ', cx, cy - R - 4 + 14);
}

// ---------- minimapa ----------
export function drawMinimap(b, spec, race, islands, trail, windFrom) {
  const c = $('minimap'); const g = c.getContext('2d');
  const W = c.width, H = c.height, cx = W / 2, cy = H / 2;
  g.clearRect(0, 0, W, H);
  const range = race.active ? race.D * 0.75 : 500;
  const sc = (W * 0.45) / range;
  // střed mapy: závod -> střed trati, jinak loď
  const ox = race.active ? 0 : b.x, oz = race.active ? race.D * 0.35 : b.z;
  const P = (x, z) => [cx - (x - ox) * sc, cy - (z - oz) * sc];
  g.fillStyle = 'rgba(8,30,50,0.35)'; g.fillRect(0, 0, W, H);
  // mřížka
  g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
  const gs = 100 * Math.ceil(range / 400);
  for (let gx = Math.floor((ox - range * 1.2) / gs) * gs; gx < ox + range * 1.2; gx += gs) { const [x] = P(gx, 0); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let gz = Math.floor((oz - range * 1.2) / gs) * gs; gz < oz + range * 1.2; gz += gs) { const [, y] = P(0, gz); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // ostrovy
  g.fillStyle = 'rgba(120,160,90,0.8)';
  for (const is of islands) { const [x, y] = P(is.x, is.z); g.beginPath(); g.arc(x, y, Math.max(2, is.r * sc), 0, Math.PI * 2); g.fill(); }
  // trať
  if (race.active) {
    const [l1x, l1y] = P(-race.lineHalf, 0), [l2x, l2y] = P(race.lineHalf, 0);
    g.strokeStyle = '#ffd400'; g.setLineDash([4, 3]); g.lineWidth = 2;
    g.beginPath(); g.moveTo(l1x, l1y); g.lineTo(l2x, l2y); g.stroke(); g.setLineDash([]);
    race.legs.forEach((leg, i) => {
      if (leg.type !== 'mark') return;
      const [x, y] = P(leg.x, leg.z);
      g.fillStyle = i === race.leg ? '#ff7a00' : 'rgba(255,122,0,0.45)';
      g.beginPath(); g.arc(x, y, i === race.leg ? 5 : 4, 0, Math.PI * 2); g.fill();
    });
  }
  // stopa
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5;
  g.beginPath();
  trail.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? g.lineTo(px, py) : g.moveTo(px, py); });
  const [bx, by] = P(b.x, b.z);
  if (trail.length) g.lineTo(bx, by);
  g.stroke();
  // loď
  g.save(); g.translate(clamp(bx, 6, W - 6), clamp(by, 6, H - 6)); g.rotate(-b.psi + Math.PI);
  g.fillStyle = '#ffffff';
  g.beginPath(); g.moveTo(0, 7); g.lineTo(4, -5); g.lineTo(-4, -5); g.closePath(); g.fill();
  g.restore();
  // vítr
  g.save(); g.translate(W - 20, 20); g.rotate(-windFrom);
  g.strokeStyle = '#5ab4ff'; g.fillStyle = '#5ab4ff'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 10); g.stroke();
  g.beginPath(); g.moveTo(0, 13); g.lineTo(5, 4); g.lineTo(-5, 4); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.font = '600 10px Outfit, sans-serif'; g.textAlign = 'left';
  g.fillText('S', 6, 14);
  g.fillText(`${Math.round(range * 2 / 10) * 10} m`, 6, H - 6);
}
