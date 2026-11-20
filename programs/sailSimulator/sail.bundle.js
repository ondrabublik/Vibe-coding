// VYGENEROVÁNO souborem build.mjs ze zdrojů v js/ – needitovat ručně.
'use strict';
(async () => {
const __three = await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');

// ===== js/physics.js =====
const __m_physics = (() => {
// Fyzika plachetnice – čistý JS bez závislosti na three.js
// Souřadnice lodi: u = vpřed, v = vlevo (levobok), r = úhlová rychlost (+ = otáčení doleva),
// phi = náklon (+ = stěžeň padá na levobok). Svět: x/z vodorovně, kurz psi: vpřed = (sin psi, cos psi).

const RHO_A = 1.225, RHO_W = 1025, G = 9.81;
const DEG = Math.PI / 180;
const KN = 1.943844; // m/s -> uzly

const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---------- aerodynamické / hydrodynamické koeficienty ----------
function sailCoef(clMax, aPeak, cd0) {
  const ap = aPeak * DEG;
  return (a, rev, o) => {
    let cl;
    if (a < ap) cl = clMax * Math.sin((a / ap) * Math.PI / 2);
    else cl = Math.max(1.05 * Math.sin(2 * a), clMax - (a - ap) * 1.4);
    cl = Math.max(0, cl);
    if (a < 6 * DEG) cl *= a / (6 * DEG);          // třepetající plachta netáhne
    if (rev) cl *= 0.35;                           // proudění od zadního lemu
    o.cl = cl;
    o.cd = cd0 + 1.2 * Math.sin(a) ** 2 + 0.06 * cl * cl;
  };
}

function foilCoef(AR) {
  const slope = 2 * Math.PI * AR / (AR + 2);
  const st = 14 * DEG;
  return (a, rev, o) => {
    let cl = a < st ? slope * a : Math.max(0.9 * Math.sin(2 * a), slope * st - (a - st) * 2.2);
    cl = Math.max(0, cl);
    if (rev) cl *= 0.8;
    o.cl = cl;
    o.cd = 0.012 + 1.15 * Math.sin(a) ** 2 + (cl * cl) / (Math.PI * AR * 0.9);
  };
}

// Obecný profil: (fx,fy) = rychlost tekutiny vůči profilu, (cx,cy) = směr tětivy (přímka)
function foil(fx, fy, cx, cy, q, A, coef, out) {
  const U = Math.hypot(fx, fy);
  if (U < 1e-4 || A <= 0) { out.fx = 0; out.fy = 0; out.a = 0; out.cl = 0; out.rev = false; return out; }
  const ex = fx / U, ey = fy / U;
  const d = ex * cx + ey * cy;
  const rev = d < 0;
  const a = Math.acos(Math.min(1, Math.abs(d)));
  let nx = -cy, ny = cx; if (nx * ex + ny * ey < 0) { nx = -nx; ny = -ny; }
  let lx = -ey, ly = ex; if (lx * nx + ly * ny < 0) { lx = -lx; ly = -ly; }
  coef(a, rev, out);
  const k = q * A;
  out.fx = k * (out.cl * lx + out.cd * ex);
  out.fy = k * (out.cl * ly + out.cd * ey);
  out.a = a; out.rev = rev;
  return out;
}

// odpor vln – výtlačný trup naráží na "trupovou rychlost", kluzák má hrb a pak odpor klesá
const cwDisp = (F) => 0.02 * Math.pow(F / 0.4, 6);
const cwPlane = (F) => 0.058 + 0.065 * Math.exp(-(((F - 0.6) / 0.2) ** 2));

function GZ(spec, phi) {
  const s = Math.sin(phi);
  if (spec.gzType === 'dinghy') return spec.GM * s * Math.cos(1.8 * phi);
  return spec.GM * s * Math.cos(0.7 * phi);
}

// ---------- stav lodi ----------
function createBoatState(spec) {
  const ang = {};
  for (const s of spec.sails) ang[s.key] = 0.05;
  return {
    x: 0, z: 0, psi: 0, u: 0, v: 0, r: 0, phi: 0, phiDot: 0,
    rudder: 0,                          // -1..1 (+ = doleva)
    sheets: { main: 0.45, head: 0.45 }, // 0 = přitaženo, 1 = povoleno
    ang,                                // úhly ráhna / plachet (rad, + = na levobok)
    sailInfo: {},
    spinUp: false, board: 1, reef: 0, trapeze: false, crewY: 0,
    motor: false, throttle: 1,
    capsized: false, capsizeSide: 1, righting: 0,
    planing: 0, Fn: 0, aws: 0, awa: 0, tws: 0, twd: 0, twa: 0,
    heelMoment: 0, driveForce: 0, sideForce: 0,
  };
}

function activeSails(spec, b) {
  return spec.sails.filter((s) => (s.kind === 'spin' ? b.spinUp : s.kind === 'jib' ? !b.spinUp || !spec.spinReplacesJib : true));
}

const tmp = { fx: 0, fy: 0, a: 0, cl: 0, cd: 0, rev: false };

// automatický trim: nastaví otěž tak, aby úhel náběhu byl optimální
function autoTrim(spec, b, dt = 1 / 60) {
  const fu = b._fu, fv = b._fv;
  if (fu === undefined) return;
  const dFree = Math.abs(wrap(Math.PI - Math.atan2(fv, fu)));
  // při velkém náklonu povolit (depower)
  const lim = spec.gzType === "dinghy" ? 20 : 25;
  const over = Math.max(0, Math.abs(b.phi) / DEG - lim);
  for (const s of activeSails(spec, b)) {
    const want = (dFree - s.aOpt * DEG) / DEG + over * (s.kind === 'main' ? 2.5 : 1.2);
    const sheet = clamp((want - s.min) / (s.max - s.min), 0, 1);
    const ctrl = s.ctrl;
    b.sheets[ctrl] += (sheet - b.sheets[ctrl]) * (1 - Math.exp(-2.5 * dt));
  }
}

function reefFactor(spec, b) { return [1, 0.72, 0.5][b.reef] ?? 1; }

// ---------- jeden krok simulace ----------
function stepBoat(b, spec, env, dt) {
  const t = env.t;
  const sp = Math.sin(b.psi), cp = Math.cos(b.psi);
  const vx = b.u * sp + b.v * cp, vz = b.u * cp - b.v * sp;
  const w = env.windAt(b.x, b.z, t);
  const twx = -w.spd * Math.sin(w.from), twz = -w.spd * Math.cos(w.from);
  const ax = twx - vx, az = twz - vz;
  const fu = ax * sp + az * cp, fv = ax * cp - az * sp;
  const aws = Math.hypot(fu, fv);
  b._fu = fu; b._fv = fv;
  b.aws = aws; b.awa = Math.atan2(-fv, -fu);
  b.tws = w.spd; b.twd = w.from; b.twa = wrap(w.from - b.psi);
  b.vmg = vx * Math.sin(w.from) + vz * Math.cos(w.from);

  const cphi = Math.cos(b.phi), sphi = Math.sin(b.phi);
  const u = b.u, v = b.v, r = b.r;
  const W = spec.mass * G;
  let Fu = 0, Fv = 0, N = 0, Mx = 0;

  // ---- plachty ----
  const qa = 0.5 * RHO_A * aws * aws * cphi * cphi * (b.capsized ? 0 : 1);
  const phiF = Math.atan2(fv, fu);
  const dFree = wrap(Math.PI - phiF);
  const rf = reefFactor(spec, b);
  let MxSail = 0, sailFu = 0, sailFv = 0;
  for (const s of spec.sails) {
    const active = activeSails(spec, b).includes(s);
    const cur = b.ang[s.key];
    if (!active) { b.ang[s.key] += (0 - cur) * (1 - Math.exp(-3 * dt)); b.sailInfo[s.key] = { a: 0, flap: 0, load: 0 }; continue; }
    const sheet = b.sheets[s.ctrl];
    const dmax = (s.min + sheet * (s.max - s.min)) * DEG;
    let target = Math.abs(dFree) <= dmax ? dFree : Math.sign(dFree) * dmax;
    // plavba "po lee" – ráhno chvíli drží na své straně, pak přeletí (kosení / jibe)
    if (Math.sign(dFree) !== Math.sign(cur) && Math.abs(cur) > 0.12 && Math.abs(dFree) > Math.PI - s.byLee * DEG) target = Math.sign(cur) * dmax;
    const k = 1.2 + aws * 0.45;
    b.ang[s.key] += (target - cur) * (1 - Math.exp(-k * dt));
    const d = b.ang[s.key];
    const ca = Math.PI - d;
    const area = s.area * (s.kind === 'main' ? rf : s.kind === 'jib' ? Math.min(1, rf + 0.15) : 1);
    foil(fu, fv, Math.cos(ca), Math.sin(ca), qa, area, s.coef, tmp);
    const hce = s.hce * (s.kind === 'main' ? 0.75 + 0.25 * rf : 1);
    const ceX = s.ceX - s.ceChord * Math.cos(d);
    const ceY = 0.55 * s.ceChord * Math.sin(d) + 0.4 * hce * sphi; // zmenšeno kvůli hratelnosti
    Fu += tmp.fx; Fv += tmp.fy; sailFu += tmp.fx; sailFv += tmp.fy;
    N += ceX * tmp.fy - ceY * tmp.fx;
    const m = tmp.fy * hce * cphi;
    Mx += m; MxSail += m;
    b.sailInfo[s.key] = { a: tmp.a / DEG, rev: tmp.rev, flap: clamp(1 - tmp.a / (7 * DEG), 0, 1) * Math.min(1, aws / 3), load: Math.hypot(tmp.fx, tmp.fy) };
  }
  b.driveForce = sailFu; b.sideForce = sailFv; b.heelMoment = MxSail;

  // ---- návětrnost trupu a stěžně ----
  const qh = 0.5 * RHO_A * aws;
  Fu += qh * spec.windage * fu; Fv += qh * spec.windage * fv;
  N += spec.windX * qh * spec.windage * fv;

  // ---- odpor trupu ----
  const Fn = u / Math.sqrt(G * spec.LWL);
  b.Fn = Fn;
  let cw = cwDisp(Math.abs(Fn));
  if (spec.planing && Fn > 0) cw = Math.min(cw, cwPlane(Fn));
  b.planing = spec.planing ? smooth(0.62, 0.88, Fn) : 0;
  const Seff = spec.S * (1 - 0.42 * b.planing) * (1 + 0.5 * sphi * sphi);
  Fu -= 0.5 * RHO_W * Seff * spec.Cf * u * Math.abs(u) + W * cw * Math.sign(u) * (u < 0 ? 1.6 : 1);

  // ---- kýl / meč ----
  const K = spec.keel;
  const kA = K.area * (K.retract ? 0.15 + 0.85 * b.board : 1) * cphi * (b.capsized ? 0.3 : 1);
  const vk = v + r * K.x;
  foil(-u, -vk, 1, 0, 0.5 * RHO_W * (u * u + vk * vk), kA, K.coef, tmp);
  Fu += tmp.fx; Fv += tmp.fy; N += K.x * tmp.fy; Mx -= tmp.fy * K.depth * cphi;
  b.leeway = Math.atan2(v, Math.max(0.3, Math.abs(u)));

  // ---- kormidlo ----
  const R = spec.rudder;
  const vr = v + r * R.x;
  const ur = u + (b.motor && spec.motor ? spec.motor.wash * b.throttle : 0);
  const rho = b.rudder * R.max * DEG;
  const rA = R.area * Math.max(0, cphi) ** 2 * (b.capsized ? 0.2 : 1);
  foil(-ur, -vr, Math.cos(rho), -Math.sin(rho), 0.5 * RHO_W * (ur * ur + vr * vr), rA, R.coef, tmp);
  Fu += tmp.fx; Fv += tmp.fy; N += R.x * tmp.fy;
  b.rudderStall = tmp.a > 15 * DEG && Math.hypot(ur, vr) > 1;

  // ---- motor ----
  if (b.motor && spec.motor && !b.capsized) Fu += spec.motor.thrust * b.throttle;

  // ---- příčný odpor trupu a tlumení stáčení ----
  Fv -= 0.5 * RHO_W * spec.latArea * v * Math.abs(v);
  const U = Math.hypot(u, v);
  N -= spec.yawDamp * (r * Math.abs(r) + (0.4 + U) * r * 0.25);

  // ---- vlny: surfování ----
  if (env.waveSlope) {
    const sl = env.waveSlope(b.x, b.z, t);
    const sAlong = sl.sx * sp + sl.sz * cp;
    const sSide = sl.sx * cp - sl.sz * sp;
    Fu -= W * sAlong * 0.45;
    Fv -= W * sSide * 0.25;
    b.surf = -sAlong;
  }

  // ---- posádka: vyvažování (automaticky, trapéz zvětší rameno) ----
  const arm = b.trapeze ? spec.trapArm : spec.sitArm;
  if (!b.capsized) {
    const need = -MxSail / (spec.crewMass * G) - b.phi * 2.0 - b.phiDot * 0.4;
    const tgt = clamp(need, -arm, arm);
    b.crewY += (tgt - b.crewY) * (1 - Math.exp(-dt * spec.crewRate));
  } else b.crewY += (0 - b.crewY) * (1 - Math.exp(-dt * 2));
  const Mcrew = spec.crewMass * G * b.crewY * cphi;

  // ---- náklon ----
  if (!b.capsized) {
    const RM = W * GZ(spec, b.phi);
    const phiAcc = (Mx + Mcrew - RM - spec.rollDamp * b.phiDot + (env.rollForce || 0) * spec.Ix) / spec.Ix;
    b.phiDot += phiAcc * dt;
    b.phi += b.phiDot * dt;
    if (spec.capsize && Math.abs(b.phi) > spec.capsize * DEG) { b.capsized = true; b.capsizeSide = Math.sign(b.phi); b.righting = 0; }
    if (!spec.capsize) b.phi = clamp(b.phi, -1.35, 1.35);
  } else {
    if (b.righting > 0) {
      b.righting += dt;
      const k = smooth(0, 3.0, b.righting);
      b.phi = b.capsizeSide * 1.5 * (1 - k);
      b.phiDot = 0;
      if (b.righting >= 3.0) { b.capsized = false; b.righting = 0; b.phi = 0; b.phiDot = 0; b.sheets.main = 1; b.sheets.head = 1; b.spinUp = false; }
    } else {
      b.phi += (b.capsizeSide * 1.5 - b.phi) * (1 - Math.exp(-dt * 2.5));
      b.phiDot = 0;
    }
    Fu -= 0.5 * RHO_W * 2.5 * u * Math.abs(u);
    Fv -= 0.5 * RHO_W * 2.5 * v * Math.abs(v);
    N -= spec.yawDamp * 6 * r;
  }

  // ---- integrace (pohyb v rotující soustavě lodi) ----
  const mu = spec.mass * 1.05, mv = spec.mass * 1.45;
  b.u += ((Fu + mv * v * r) / mu) * dt;
  b.v += ((Fv - mu * u * r) / mv) * dt;
  b.r += (N / spec.Iz) * dt;
  b.psi = wrap(b.psi + b.r * dt);
  const sp2 = Math.sin(b.psi), cp2 = Math.cos(b.psi);
  b.x += (b.u * sp2 + b.v * cp2) * dt;
  b.z += (b.u * cp2 - b.v * sp2) * dt;
}

// Kurz vůči větru (TWA) -> český název
function pointOfSail(twaDeg) {
  const a = Math.abs(twaDeg);
  if (a < 32) return 'Proti větru (v ochraně)';
  if (a < 55) return 'Na ostro';
  if (a < 78) return 'Ostrý bočák';
  if (a < 110) return 'Bočák';
  if (a < 155) return 'Zadobočák';
  return 'Na zadní vítr (zadoňák)';
}

return { RHO_A, RHO_W, G, DEG, KN, wrap, clamp, smooth, sailCoef, foilCoef, createBoatState, activeSails, autoTrim, reefFactor, stepBoat, pointOfSail };
})();

// ===== js/config.js =====
const __m_config = (() => {
const { sailCoef, foilCoef } = __m_physics;

// ---------------- LODĚ ----------------
// Geometrie: x = podélně (+ příď), výšky nad hladinou. Plachty: tack = dolní přední roh,
// head = vrchol, foot = délka spodního lemu (otáčí se kolem tack podle úhlu otěže).
const BOATS = {
  skiff: {
    id: 'skiff', name: 'Sportovní skif', length: '4,5 m', crewText: '2 jachtaři na trapézu',
    desc: 'Lehký závodní skif s gennakerem. Při čerstvém větru se dostane do skluzu (planing) a jede 15–20 uzlů. Pozor – snadno se převrhne!',
    stats: { speed: 5, stability: 1, handling: 5 },
    L: 4.5, LWL: 4.3, B: 1.75, deck: 0.38, draftHull: 0.15, color: 0xf2f2f2, stripe: 0xff4d2e, deckColor: 0xcfd6dc,
    mass: 240, crewMass: 150, crewN: 2, sitArm: 0.8, trapArm: 2.1, crewRate: 2.5, hikeLabel: 'Trapéz',
    Ix: 450, rollDamp: 1500, Iz: 520, S: 3.4, Cf: 0.0045, GM: 0.3, gzType: 'dinghy', capsize: 62, planing: true,
    keel: { area: 0.3, x: 0.85, depth: 0.55, coef: foilCoef(4), retract: true, type: 'board', chord: 0.32, span: 1.0 },
    rudder: { area: 0.13, x: -2.3, max: 35, coef: foilCoef(3), chord: 0.24, span: 0.75 },
    windage: 0.8, windX: 0.3, latArea: 0.35, yawDamp: 120,
    steering: 'tiller', motor: null, spinReplacesJib: true, spinName: 'Gennaker',
    mast: { x: 0.55, top: 7.9, r: 0.045 }, bowsprit: 1.35,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 10.5, tack: [0.55, 1.15], head: [0.55, 7.75], foot: 2.6, roach: 0.35,
        hce: 3.6, ceX: 0.55, ceChord: 0.85, min: 2, max: 85, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xf6f3ea },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 4.8, tack: [2.05, 0.55], head: [0.62, 5.6], foot: 1.7,
        hce: 2.3, ceX: 1.54, ceChord: 0.6, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.4, 21, 0.05), color: 0xf6f3ea },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 17, tack: [3.6, 0.6], head: [0.66, 7.1], foot: 3.6,
        hce: 3.0, ceX: 2.42, ceChord: 1.4, min: 18, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0xff3b5c },
    ],
  },
  cruiser: {
    id: 'cruiser', name: 'Kajutová plachetnice', length: '9 m', crewText: '4 členové posádky',
    desc: 'Univerzální kýlová jachta pro závody i výlety. Stabilní, s janovkou (genoou) a asymetrickým spinakrem. Rychlost omezuje trupová rychlost ~7–8 uzlů.',
    stats: { speed: 3, stability: 4, handling: 4 },
    L: 9.0, LWL: 8.0, B: 3.0, deck: 0.95, draftHull: 0.5, color: 0x1d3557, stripe: 0xe9c46a, deckColor: 0xb08d63,
    mass: 3600, crewMass: 320, crewN: 4, sitArm: 0.5, trapArm: 1.4, crewRate: 1.0, hikeLabel: 'Posádka na hranu',
    Ix: 9200, rollDamp: 11000, Iz: 27600, S: 17, Cf: 0.004, GM: 1.0, gzType: 'keel', capsize: 0, planing: false,
    keel: { area: 1.15, x: 1.65, depth: 1.1, coef: foilCoef(2.4), retract: false, type: 'fin', chord: 0.95, span: 1.35 },
    rudder: { area: 0.42, x: -3.7, max: 35, coef: foilCoef(2.5), chord: 0.42, span: 1.05 },
    windage: 3.5, windX: 0.6, latArea: 2.0, yawDamp: 5000,
    steering: 'tiller', motor: { thrust: 950, wash: 1.6 }, spinReplacesJib: true, spinName: 'Spinakr',
    mast: { x: 1.0, top: 14.0, r: 0.08 }, bowsprit: 0.9,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 23, tack: [1.0, 2.2], head: [1.0, 13.6], foot: 3.6, roach: 0.3,
        hce: 6.5, ceX: 1.0, ceChord: 1.15, min: 2, max: 80, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xf4f1e8 },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 25, tack: [4.3, 1.05], head: [1.05, 12.8], foot: 4.6,
        hce: 5.25, ceX: 3.13, ceChord: 1.6, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.45, 21, 0.05), color: 0xf4f1e8 },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 62, tack: [5.4, 1.15], head: [1.1, 13.4], foot: 6.5,
        hce: 5.6, ceX: 3.77, ceChord: 2.6, min: 20, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0x2a9df4 },
    ],
  },
  ocean: {
    id: 'ocean', name: 'Zaoceánská jachta', length: '16 m', crewText: '8 členů posádky, kormidelní kolo',
    desc: 'Velká a těžká jachta pro dálkovou plavbu. Velmi stabilní, reaguje pomalu, vyniká v silném větru a vlnách. Kormidluje se kolem, má motor.',
    stats: { speed: 4, stability: 5, handling: 2 },
    L: 16, LWL: 14.5, B: 4.6, deck: 1.45, draftHull: 0.8, color: 0xfafafa, stripe: 0x0b6e4f, deckColor: 0xc19a6b,
    mass: 18000, crewMass: 640, crewN: 6, sitArm: 0.6, trapArm: 2.0, crewRate: 0.6, hikeLabel: 'Posádka na hranu',
    Ix: 136000, rollDamp: 115000, Iz: 437000, S: 48, Cf: 0.0037, GM: 1.5, gzType: 'keel', capsize: 0, planing: false,
    keel: { area: 3.2, x: 2.9, depth: 2.0, coef: foilCoef(2.8), retract: false, type: 'bulb', chord: 1.6, span: 2.6 },
    rudder: { area: 1.2, x: -6.5, max: 35, coef: foilCoef(2.5), chord: 0.75, span: 1.7 },
    windage: 12, windX: 1.0, latArea: 6, yawDamp: 60000,
    steering: 'wheel', motor: { thrust: 4800, wash: 2.0 }, spinReplacesJib: true, spinName: 'Spinakr',
    mast: { x: 1.6, top: 25, r: 0.14 }, bowsprit: 1.5,
    sails: [
      { key: 'main', kind: 'main', ctrl: 'main', area: 74, tack: [1.6, 3.2], head: [1.6, 24.2], foot: 6.2, roach: 0.3,
        hce: 11.1, ceX: 1.6, ceChord: 2.0, min: 2, max: 80, byLee: 12, aOpt: 17, coef: sailCoef(1.45, 22, 0.05), color: 0xefe9da },
      { key: 'jib', kind: 'jib', ctrl: 'head', area: 74, tack: [7.7, 1.55], head: [1.7, 22.5], foot: 7.8,
        hce: 9.1, ceX: 5.54, ceChord: 2.8, min: 8, max: 60, byLee: 45, aOpt: 16, coef: sailCoef(1.45, 21, 0.05), color: 0xefe9da },
      { key: 'spin', kind: 'spin', ctrl: 'head', area: 200, tack: [9.4, 1.6], head: [1.7, 24.2], foot: 11,
        hce: 9.7, ceX: 6.35, ceChord: 4.4, min: 20, max: 105, byLee: 25, aOpt: 24, coef: sailCoef(1.75, 30, 0.08), color: 0xe63946 },
    ],
  },
};

// ---------------- POČASÍ ----------------
// tws v uzlech, gust = relativní síla poryvů, shift = stáčení větru (°), waveH = výška vln (m)
const WEATHER = {
  breeze: {
    id: 'breeze', name: 'Slunečný vánek', icon: '☀️', desc: 'Mírný stálý vítr, klidné moře. Ideální na učení.',
    tws: 8, gust: 0.15, shift: 5, waveH: 0.35, chop: 0.4,
    sky: { zenith: 0x2f6fbf, horizon: 0xbcd8f0, sun: 0xfff3d6, sunElev: 52, sunAz: 140, clouds: 0.22, cloudColor: 0xffffff, light: 1.25, ambient: 0.75 },
    fog: 0.00018, water: 0x0b4f7a, rain: 0, lightning: false,
  },
  fresh: {
    id: 'fresh', name: 'Svěží vítr', icon: '🌤️', desc: 'Čerstvý vítr 14 uzlů, první bílé hřebínky. Skif se dostane do skluzu.',
    tws: 14, gust: 0.2, shift: 8, waveH: 0.8, chop: 0.7,
    sky: { zenith: 0x2a63b0, horizon: 0xc6dcef, sun: 0xfff1d0, sunElev: 40, sunAz: 200, clouds: 0.45, cloudColor: 0xffffff, light: 1.15, ambient: 0.7 },
    fog: 0.0002, water: 0x0a4a73, rain: 0, lightning: false,
  },
  strong: {
    id: 'strong', name: 'Silný vítr', icon: '💨', desc: 'Vítr 22 uzlů, vysoké vlny a pěna. Zvažte refování.',
    tws: 22, gust: 0.25, shift: 10, waveH: 1.7, chop: 1.0,
    sky: { zenith: 0x4c6f93, horizon: 0xb4c4d2, sun: 0xf3f0e6, sunElev: 30, sunAz: 230, clouds: 0.65, cloudColor: 0xe8ecef, light: 0.95, ambient: 0.7 },
    fog: 0.00035, water: 0x0b3d5c, rain: 0, lightning: false,
  },
  storm: {
    id: 'storm', name: 'Bouře', icon: '⛈️', desc: 'Vichřice přes 30 uzlů, déšť, blesky a velké vlny. Jen pro odvážné.',
    tws: 32, gust: 0.3, shift: 14, waveH: 3.2, chop: 1.3,
    sky: { zenith: 0x1b2229, horizon: 0x4a5560, sun: 0x9aa4ad, sunElev: 25, sunAz: 250, clouds: 0.98, cloudColor: 0x3b434b, light: 0.45, ambient: 0.55 },
    fog: 0.0011, water: 0x0c2a35, rain: 1, lightning: true,
  },
  gusty: {
    id: 'gusty', name: 'Nárazovitý vítr', icon: '🌬️', desc: 'Průměrně 12 uzlů, ale prudké poryvy a stáčení až o 20°. Sledujte tmavé skvrny na vodě.',
    tws: 12, gust: 0.6, shift: 20, waveH: 0.6, chop: 0.8,
    sky: { zenith: 0x3569a8, horizon: 0xc4d4e2, sun: 0xfff2da, sunElev: 45, sunAz: 160, clouds: 0.55, cloudColor: 0xf7f7f7, light: 1.1, ambient: 0.72 },
    fog: 0.00022, water: 0x0b4970, rain: 0, lightning: false,
  },
  sunset: {
    id: 'sunset', name: 'Západ slunce', icon: '🌅', desc: 'Večerní vánek 10 uzlů, zlaté světlo a dlouhé stíny.',
    tws: 10, gust: 0.15, shift: 6, waveH: 0.5, chop: 0.5,
    sky: { zenith: 0x2b3a6b, horizon: 0xff9a5a, sun: 0xffb36b, sunElev: 5, sunAz: 270, clouds: 0.35, cloudColor: 0xffb98a, light: 1.0, ambient: 0.55 },
    fog: 0.00025, water: 0x123d5c, rain: 0, lightning: false,
  },
  fog: {
    id: 'fog', name: 'Mlha a slabý vítr', icon: '🌫️', desc: 'Jen 5 uzlů, hustá mlha. Plujte podle přístrojů a minimapy.',
    tws: 5, gust: 0.25, shift: 12, waveH: 0.25, chop: 0.3,
    sky: { zenith: 0x9aa6ae, horizon: 0xc9cfd2, sun: 0xf0eee8, sunElev: 35, sunAz: 180, clouds: 0.9, cloudColor: 0xd7dbde, light: 0.7, ambient: 0.85 },
    fog: 0.006, water: 0x2d4c58, rain: 0, lightning: false,
  },
};

return { BOATS, WEATHER };
})();

// ===== js/waves.js =====
const __m_waves = (() => {
// Vlny (Gerstner) a pole větru s poryvy – stejné vzorce na CPU i v GLSL
const { G, DEG, wrap } = __m_physics;

const NWAVES = 8;

class WaveField {
  constructor() {
    this.waves = [];
    this.uA = new Float32Array(NWAVES * 4); // dirx, dirz, amp, k
    this.uB = new Float32Array(NWAVES * 4); // omega, phase, qa, 0
  }

  setup(Hs, windFrom, chop) {
    const theta0 = windFrom + Math.PI; // vlny postupují po větru
    const lp = Math.max(7, Hs * 22);
    const lens = [1.0, 0.72, 1.35, 0.52, 0.4, 0.29, 0.21, 0.62];
    const offs = [0, 17, -13, -29, 34, -41, 52, 7];
    const wts = [0.55, 0.42, 0.33, 0.28, 0.22, 0.16, 0.12, 0.3];
    const sw = wts.reduce((a, b) => a + b, 0);
    this.waves = [];
    for (let i = 0; i < NWAVES; i++) {
      const L = lp * lens[i];
      const k = (2 * Math.PI) / L;
      const th = theta0 + offs[i] * DEG;
      const amp = (Hs * 0.62 * wts[i]) / sw;
      const qa = Math.min(amp * (0.6 + 0.5 * chop), 0.75 / (k * NWAVES));
      const w = { dx: Math.sin(th), dz: Math.cos(th), amp, k, omega: Math.sqrt(G * k), phase: i * 1.7 + 0.3, qa };
      this.waves.push(w);
      this.uA.set([w.dx, w.dz, w.amp, w.k], i * 4);
      this.uB.set([w.omega, w.phase, w.qa, 0], i * 4);
    }
  }

  // posun bodu p0 (nedeformovaná mřížka)
  _disp(x, z, t, out) {
    let dx = 0, dy = 0, dz = 0;
    for (const w of this.waves) {
      const th = w.k * (w.dx * x + w.dz * z) - w.omega * t + w.phase;
      const c = Math.cos(th);
      dx += w.qa * w.dx * c; dz += w.qa * w.dz * c; dy += w.amp * Math.sin(th);
    }
    out.x = dx; out.y = dy; out.z = dz;
    return out;
  }

  // výška hladiny ve světovém bodě (x,z)
  height(x, z, t) {
    const o = { x: 0, y: 0, z: 0 };
    let px = x, pz = z;
    for (let i = 0; i < 3; i++) { this._disp(px, pz, t, o); px = x - o.x; pz = z - o.z; }
    this._disp(px, pz, t, o);
    return o.y;
  }

  slope(x, z, t) {
    const e = 1.2;
    const h0 = this.height(x, z, t);
    return { sx: (this.height(x + e, z, t) - h0) / e, sz: (this.height(x, z + e, t) - h0) / e, h: h0 };
  }
}

// ---------- vítr ----------
class WindField {
  constructor() { this.base = 10; this.from = 0; this.gust = 0.2; this.shift = 5; this.driftX = 0; this.driftZ = 0; }
  setup(twsMs, from, gust, shiftDeg) {
    this.base = twsMs; this.from = from; this.gust = gust; this.shift = shiftDeg * DEG;
    // poryvy se posouvají po větru
    this.driftX = -Math.sin(from) * twsMs * 0.8;
    this.driftZ = -Math.cos(from) * twsMs * 0.8;
  }
  gustValue(x, z, t) {
    const X = x - this.driftX * t, Z = z - this.driftZ * t;
    return 0.55 * Math.sin(0.0105 * X + 1.3) * Math.sin(0.0127 * Z + 0.7)
      + 0.3 * Math.sin(0.021 * X - 0.016 * Z + 2.1 + 0.05 * t)
      + 0.25 * Math.sin(0.017 * Z + 0.029 * X + 4.0);
  }
  dirAt(x, z, t) {
    const g = this.gustValue(x, z, t);
    return wrap(this.from + this.shift * (0.6 * Math.sin(t * 2 * Math.PI / 90) + 0.4 * Math.sin(t * 2 * Math.PI / 37 + 1)) + this.shift * 0.3 * g);
  }
  at(x, z, t) {
    const g = this.gustValue(x, z, t);
    return { spd: Math.max(0.15 * this.base, this.base * (1 + this.gust * g * 0.9)), from: this.dirAt(x, z, t), g };
  }
}

const GLSL_WAVES = /* glsl */`
uniform vec4 uWA[${NWAVES}];
uniform vec4 uWB[${NWAVES}];
vec3 gerstnerDisp(vec2 p, float t){
  vec3 d = vec3(0.0);
  for(int i=0;i<${NWAVES};i++){
    vec4 a=uWA[i]; vec4 b=uWB[i];
    float th = a.w*dot(a.xy,p) - b.x*t + b.y;
    float c = cos(th);
    d.x += b.z*a.x*c; d.z += b.z*a.y*c; d.y += a.z*sin(th);
  }
  return d;
}
vec3 gerstnerNormal(vec2 p, float t, float fade, out float crest){
  vec3 n = vec3(0.0,1.0,0.0);
  crest = 0.0;
  for(int i=0;i<${NWAVES};i++){
    vec4 a=uWA[i]; vec4 b=uWB[i];
    float th = a.w*dot(a.xy,p) - b.x*t + b.y;
    float c = cos(th), s = sin(th);
    n.x -= a.x*a.w*a.z*c*fade;
    n.z -= a.y*a.w*a.z*c*fade;
    n.y -= a.w*b.z*s*fade;
    crest += a.w*b.z*s;
  }
  return normalize(n);
}
`;

const GLSL_GUST = /* glsl */`
uniform vec2 uGustDrift;
float gustValue(vec2 p, float t){
  vec2 q = p - uGustDrift*t;
  return 0.55*sin(0.0105*q.x+1.3)*sin(0.0127*q.y+0.7)
       + 0.3*sin(0.021*q.x-0.016*q.y+2.1+0.05*t)
       + 0.25*sin(0.017*q.y+0.029*q.x+4.0);
}
`;

return { NWAVES, WaveField, WindField, GLSL_WAVES, GLSL_GUST };
})();

// ===== js/ocean.js =====
const __m_ocean = (() => {
const THREE = __three;
const { GLSL_WAVES, GLSL_GUST } = __m_waves;

// ---------- dlaždicová normálová mapa drobného čeření ----------
function makeDetailNormalMap(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const comps = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 48; i++) {
    let fx = Math.round((rnd() * 2 - 1) * 14), fy = Math.round((rnd() * 2 - 1) * 14);
    if (fx === 0 && fy === 0) fx = 1;
    const f = Math.hypot(fx, fy);
    comps.push({ fx, fy, a: 1 / Math.pow(f, 1.25), ph: rnd() * 6.283 });
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size;
    let h = 0, dx = 0, dy = 0;
    for (const c of comps) {
      const th = 2 * Math.PI * (c.fx * u + c.fy * v) + c.ph;
      h += c.a * Math.sin(th);
      const cc = c.a * Math.cos(th) * 2 * Math.PI;
      dx += cc * c.fx; dy += cc * c.fy;
    }
    const s = 0.012;
    const nx = -dx * s, ny = -dy * s;
    const i = (y * size + x) * 4;
    data[i] = Math.max(0, Math.min(255, 128 + nx * 127));
    data[i + 1] = Math.max(0, Math.min(255, 128 + ny * 127));
    data[i + 2] = 255;
    data[i + 3] = Math.max(0, Math.min(255, 128 + h * 60));
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// mřížka: jemná uprostřed, k okrajům se zvětšuje
function makeOceanGeometry() {
  const coords = [0];
  let step = 1.0, x = 0, i = 0;
  while (x < 6000) { if (i > 60) step *= 1.045; x += step; coords.push(x); i++; }
  const axis = [...coords.slice(1).reverse().map((c) => -c), ...coords];
  const n = axis.length;
  const pos = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) {
    const p = (j * n + k) * 3;
    pos[p] = axis[k]; pos[p + 1] = 0; pos[p + 2] = axis[j];
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let j = 0; j < n - 1; j++) for (let k = 0; k < n - 1; k++) {
    const a = j * n + k, b = a + 1, c = a + n, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b;
    idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  return g;
}

const SKY_FN = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
uniform float uFlash;
vec3 skyGradient(vec3 d){
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h,0.0,1.0), 0.55));
  if(h < 0.0) col = uHorizon * 0.8;
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * pow(sd, 10.0) * 0.25;
  return col * (1.0 + uFlash*2.5);
}
`;

function createOcean(waves) {
  const uniforms = {
    uTime: { value: 0 },
    uWA: { value: waves.uA }, uWB: { value: waves.uB },
    uCamPos: { value: new THREE.Vector3() },
    uDetail: { value: makeDetailNormalMap() },
    uWater: { value: new THREE.Color(0x0b4f7a) },
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uFogColor: { value: new THREE.Color() }, uFogDensity: { value: 0.0002 },
    uChop: { value: 0.5 }, uFoam: { value: 0.3 }, uLight: { value: 1 }, uFlash: { value: 0 },
    uGustDrift: { value: new THREE.Vector2() }, uGustAmp: { value: 0.2 },
    uWindDir: { value: new THREE.Vector2(0, -1) },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      uniform float uTime; uniform vec3 uCamPos;
      ${GLSL_WAVES}
      varying vec3 vWorld; varying vec2 vP0; varying float vFade;
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec2 p = wp.xz;
        float dist = length(p - uCamPos.xz);
        float fade = 1.0 - smoothstep(500.0, 2400.0, dist);
        vec3 d = gerstnerDisp(p, uTime) * fade;
        wp.xyz += d;
        vP0 = p; vFade = fade; vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uCamPos; uniform sampler2D uDetail;
      uniform vec3 uWater; uniform vec3 uFogColor; uniform float uFogDensity;
      uniform float uChop; uniform float uFoam; uniform float uLight; uniform float uGustAmp;
      uniform vec2 uWindDir;
      ${GLSL_WAVES}
      ${GLSL_GUST}
      ${SKY_FN}
      varying vec3 vWorld; varying vec2 vP0; varying float vFade;
      void main(){
        float crest;
        vec3 N = gerstnerNormal(vP0, uTime, vFade, crest);
        float dist = length(vWorld - uCamPos);
        float g = gustValue(vWorld.xz, uTime);
        float gust = clamp(g * uGustAmp * 2.0, -0.6, 1.0);
        // drobné čeření
        vec2 drift = uWindDir * uTime;
        vec4 d1 = texture2D(uDetail, vWorld.xz / 23.0 + drift * 0.035);
        vec4 d2 = texture2D(uDetail, vWorld.xz / 7.3 - drift.yx * 0.06 + 0.37);
        vec4 d3 = texture2D(uDetail, vWorld.xz / 61.0 + drift * 0.012);
        vec2 dn = (d1.xy - 0.5) * 1.0 + (d2.xy - 0.5) * 0.7 + (d3.xy - 0.5) * 0.8;
        float rough = (0.35 + 0.65 * uChop) * (1.0 + 0.8 * max(gust, 0.0)) * mix(0.25, 1.0, exp(-dist * 0.004));
        N = normalize(N + vec3(dn.x, 0.0, dn.y) * rough * 1.2);
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(N, V), 0.0);
        float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.02;
        vec3 sky = skyGradient(normalize(R));
        float sunD = max(dot(normalize(R), uSunDir), 0.0);
        vec3 spec = uSunColor * (pow(sunD, 900.0) * 18.0 + pow(sunD, 90.0) * 0.6) * uLight;
        float diff = max(dot(N, uSunDir), 0.0) * 0.5 + 0.5;
        vec3 water = uWater * (0.55 + 0.6 * diff) * uLight;
        // prosvítání hřebenů
        float h = vWorld.y;
        water += vec3(0.0, 0.09, 0.08) * clamp(h * 0.6 + 0.3, 0.0, 1.0) * pow(1.0 - ndv, 2.0) * uLight;
        water *= 1.0 - 0.18 * max(gust, 0.0);
        vec3 col = mix(water, sky * 0.92, fres) + spec * (1.0 - 0.6 * uFoam * 0.0);
        // pěna na hřebenech
        float n = (d1.a + d2.a * 0.6 + d3.a) / 2.6;
        float foam = smoothstep(0.55, 0.95, crest * 0.9 + n * 0.6 + gust * 0.15) * uFoam * vFade;
        foam += smoothstep(0.72, 0.8, n + max(gust,0.0)*0.15) * uFoam * 0.25 * vFade;
        col = mix(col, vec3(0.92, 0.95, 0.97) * (0.6 + 0.4 * diff) * uLight, clamp(foam, 0.0, 0.9));
        // mlha
        float f = 1.0 - exp(-pow(uFogDensity * dist, 2.0));
        col = mix(col, uFogColor * (1.0 + uFlash * 1.5), clamp(f, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(makeOceanGeometry(), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms };
}

function createSky() {
  const uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunColor: { value: new THREE.Color() },
    uCloudColor: { value: new THREE.Color() }, uClouds: { value: 0.3 }, uTime: { value: 0 },
    uDrift: { value: new THREE.Vector2() }, uFlash: { value: 0 }, uFogColor: { value: new THREE.Color() }, uHaze: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCloudColor; uniform float uClouds; uniform float uTime; uniform vec2 uDrift;
      uniform vec3 uFogColor; uniform float uHaze;
      ${SKY_FN}
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<6;i++){ s+=a*noise(p); p=p*2.03+vec2(1.7,9.2); a*=0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = skyGradient(d);
        float sd = max(dot(d, uSunDir), 0.0);
        float sunDisk = smoothstep(0.9993, 0.9997, sd);
        col += uSunColor * sunDisk * 6.0 * (1.0 - uClouds * 0.9);
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.12) * 1.6 + uDrift * uTime;
          float n = fbm(uv);
          float cov = smoothstep(1.0 - uClouds * 0.95 - 0.1, 1.15 - uClouds * 0.75, n + 0.25);
          float shade = fbm(uv * 1.7 + 3.1);
          vec3 cc = uCloudColor * (0.72 + 0.4 * shade) + uSunColor * pow(sd, 6.0) * 0.35;
          cc *= (1.0 + uFlash * 3.0);
          col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y));
        }
        col = mix(col, uFogColor * (1.0 + uFlash * 1.5), uHaze * (1.0 - smoothstep(0.0, 0.35, d.y)));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return { mesh, uniforms };
}

return { createOcean, createSky };
})();

// ===== js/models.js =====
const __m_models = (() => {
const THREE = __three;
const { DEG, clamp } = __m_physics;

// Lokální souřadnice modelu: x = levobok (+), y = výška nad hladinou, z = vpřed.

// ---------- trup ----------
function hullParams(spec) {
  if (spec.id === 'skiff') return { transom: 0.82, n: 3.4, sheer: 0.15, stern: 0.25 };
  if (spec.id === 'cruiser') return { transom: 0.72, n: 2.4, sheer: 0.22, stern: 0.15 };
  return { transom: 0.7, n: 2.3, sheer: 0.2, stern: 0.12 };
}

function hullSection(spec, s, P) {
  const B2 = spec.B / 2;
  let hb;
  if (s < 0.55) hb = B2 * (P.transom + (1 - P.transom) * Math.pow(Math.sin((s / 0.55) * Math.PI / 2), 0.6));
  else { const q = (s - 0.55) / 0.45; hb = B2 * Math.pow(Math.max(0, 1 - q * q), 0.72); }
  let d = spec.draftHull * (s < 0.55 ? P.stern + (1 - P.stern) * Math.sin((s / 0.55) * Math.PI / 2) : 1 - 0.35 * ((s - 0.55) / 0.45));
  if (s > 0.8) d -= Math.pow((s - 0.8) / 0.2, 2) * (spec.draftHull * 0.65 + spec.deck * 0.25);
  const sheer = spec.deck * (1 + P.sheer * Math.pow(Math.max(0, s - 0.35) / 0.65, 2) * 1.6);
  return { hb, d, sheer };
}

function buildHull(spec) {
  const P = hullParams(spec);
  const NS = 44, K = 10;
  const cTop = new THREE.Color(spec.color), cStripe = new THREE.Color(spec.stripe);
  const cBottom = spec.id === 'skiff' ? new THREE.Color(0xe8e8e8) : new THREE.Color(0x7a1d1d);
  const cBoot = new THREE.Color(spec.stripe);
  const hasBoot = spec.id !== 'skiff';
  const stripeH = spec.deck * 0.12;
  // půlprofil pravoboku (x > 0) od palubní hrany dolů ke kýlu: [x, y, barva];
  // barevné přechody mají dvojice blízkých bodů, aby pruhy byly ostré
  const halfPts = (sec) => {
    const flare = (y) => sec.hb * (1 + 0.02 * clamp(y / sec.sheer, 0, 1));
    const P2 = (y, c) => [flare(y), y, c];
    const lift = Math.max(0, -sec.d); // u přídě se kýlová linie zvedá nad hladinu
    const pts = [P2(sec.sheer, cStripe), P2(sec.sheer - stripeH, cStripe), P2(sec.sheer - stripeH - 0.01, cTop), P2(sec.sheer * 0.5, cTop)];
    if (hasBoot) pts.push(P2(lift + 0.08, cTop), P2(lift + 0.07, cBoot), P2(lift + 0.005, cBoot));
    else pts.push(P2(lift + 0.01, cTop));
    for (let j = 0; j <= K; j++) {
      const a = (j / K) * Math.PI / 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pts.push([sec.hb * Math.pow(c, 2 / P.n), Math.min(lift - 0.005 - 0.0001 * j, -sec.d * Math.pow(sn, 2 / P.n)), cBottom]);
    }
    return pts;
  };
  const NP = halfPts(hullSection(spec, 0.5, P)).length;
  const M = NP * 2 - 1;
  const pos = [], col = [], idx = [];
  const sections = [];
  let sternProfile = null;
  for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    const sec = hullSection(spec, s, P);
    sections.push(sec);
    const z = -spec.L / 2 + s * spec.L;
    const hp = halfPts(sec);
    const full = [...hp, ...hp.slice(0, -1).reverse().map(([x, y, c]) => [-x, y, c])];
    if (i === 0) sternProfile = full;
    for (const [x, y, c] of full) { pos.push(x, y, z); col.push(c.r, c.g, c.b); }
  }
  // pořadí vrcholů tak, aby normály mířily ven z trupu
  for (let i = 0; i < NS; i++) for (let j = 0; j < M - 1; j++) {
    const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  // záď (zrcadlo) – vlastní vrcholy, aby se nesdílely normály s boky
  const base = pos.length / 3;
  const s0 = sections[0];
  pos.push(0, s0.sheer * 0.6, -spec.L / 2); col.push(cTop.r, cTop.g, cTop.b);
  for (const [x, y] of sternProfile) { pos.push(x, y, -spec.L / 2); col.push(cTop.r, cTop.g, cTop.b); }
  for (let j = 0; j < M - 1; j++) idx.push(base, base + 1 + j, base + 2 + j);
  idx.push(base, base + M, base + 1); // uzavření horní hrany mezi rohy u paluby
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const hull = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 }));
  hull.castShadow = true; hull.receiveShadow = true;

  // paluba
  const dp = [], di = [];
  for (let i = 0; i <= NS; i++) {
    const s = i / NS, sec = sections[i], z = -spec.L / 2 + s * spec.L;
    dp.push(sec.hb * 1.02, sec.sheer, z, -sec.hb * 1.02, sec.sheer, z);
    if (i < NS) { const a = i * 2; di.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } // normála nahoru
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
  dg.setIndex(di); dg.computeVertexNormals();
  const deck = new THREE.Mesh(dg, new THREE.MeshStandardMaterial({ color: spec.deckColor, roughness: 0.85 }));
  deck.receiveShadow = true; deck.castShadow = false;
  return { hull, deck, sections, P };
}

function sheerAt(spec, z) {
  const P = hullParams(spec);
  const s = clamp((z + spec.L / 2) / spec.L, 0, 1);
  return hullSection(spec, s, P);
}

// ---------- textury plachet ----------
function sailTexture(kind, color, number) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  const col = new THREE.Color(color);
  g.fillStyle = '#' + col.getHexString();
  g.fillRect(0, 0, 256, 512);
  if (kind === 'spin') {
    const cols = ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0)', 'rgba(20,30,60,0.55)'];
    for (let i = 0; i < 9; i++) { g.fillStyle = cols[i % 3]; g.fillRect(0, i * 57, 256, 28); }
  } else {
    g.strokeStyle = 'rgba(120,110,90,0.35)'; g.lineWidth = 2;
    for (let i = 1; i < 12; i++) { g.beginPath(); g.moveTo(0, i * 42); g.lineTo(256, i * 42 + (kind === 'jib' ? -30 : 0)); g.stroke(); }
    if (kind === 'main') {
      g.strokeStyle = 'rgba(80,80,80,0.5)'; g.lineWidth = 5;
      for (let i = 1; i < 5; i++) { const y = i * 100; g.beginPath(); g.moveTo(256, y); g.lineTo(150, y); g.stroke(); }
      g.fillStyle = 'rgba(200,30,40,0.85)';
      g.font = 'bold 54px Arial'; g.textAlign = 'center';
      g.fillText('CZE', 128, 180); g.fillText(number, 128, 240);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, 0, 6, 512); // lem
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------- plachta jako deformovatelná síť ----------
class SailMesh {
  constructor(rows, cols, mat) {
    this.rows = rows; this.cols = cols;
    const n = (rows + 1) * (cols + 1);
    const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) {
      const k = i * (cols + 1) + j;
      uv[k * 2] = j / cols; uv[k * 2 + 1] = i / rows;
      if (i < rows && j < cols) { const a = k, b = k + 1, c = k + cols + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
  }
  // rowFn(f) -> {L:[x,y,z], E:[x,y,z]} ; camber kladný = vyboulení ve směru `side` (+x = levobok)
  update(rowFn, camber, side, flap, t, shoulder = 0) {
    const pos = this.mesh.geometry.attributes.position.array;
    const { rows, cols } = this;
    for (let i = 0; i <= rows; i++) {
      const f = i / rows;
      const { L, E } = rowFn(f);
      const cx = E[0] - L[0], cz = E[2] - L[2];
      const chord = Math.hypot(cx, cz) || 1e-3;
      // horizontální kolmice k tětivě
      let nx = -cz / chord, nz = cx / chord;
      if (nx * side < 0) { nx = -nx; nz = -nz; }
      for (let j = 0; j <= cols; j++) {
        const tt = j / cols;
        const k = (i * (cols + 1) + j) * 3;
        const prof = 4.6 * tt * Math.pow(1 - tt, 1.25);
        let off = camber * chord * prof * (1 - 0.3 * f * f) * (1 + shoulder * Math.sin(Math.PI * f));
        if (flap > 0) off += flap * chord * 0.08 * Math.sin(tt * 9 - t * 22 + f * 4) * tt * (0.4 + f);
        pos[k] = L[0] + cx * tt + nx * off;
        pos[k + 1] = L[1] + (E[1] - L[1]) * tt;
        pos[k + 2] = L[2] + cz * tt + nz * off;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }
}

// ---------- posádka ----------
function makePerson(jacket) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe0b48c, roughness: 0.7 });
  const jm = new THREE.MeshStandardMaterial({ color: jacket, roughness: 0.6 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness: 0.8 });
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.62, 4, 8), pants);
  legs.position.y = 0.45;
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.45, 4, 10), jm);
  torso.position.y = 1.1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), skin);
  head.position.y = 1.55;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  cap.position.y = 1.57;
  for (const m of [legs, torso, head, cap]) { m.castShadow = true; g.add(m); }
  return g;
}

// ---------- kompletní model ----------
function createBoatModel(spec) {
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.order = 'YXZ';
  root.add(tilt);

  const { hull, deck } = buildHull(spec);
  tilt.add(hull, deck);

  const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.5, metalness: 0.4 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
  const carbon = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.4, metalness: 0.3 });
  const mastMat = spec.id === 'skiff' ? carbon : alu;

  // kabina a kokpit pro kýlové lodě
  if (spec.id !== 'skiff') {
    const cabinL = spec.L * 0.32, cabinW = spec.B * 0.55, cabinH = spec.id === 'ocean' ? 0.6 : 0.45;
    const cz = spec.mast.x - cabinL * 0.35;
    const sec = sheerAt(spec, cz);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(cabinW, cabinH, cabinL), new THREE.MeshStandardMaterial({ color: spec.color === 0x1d3557 ? 0xf2f2f2 : 0xf7f7f7, roughness: 0.4 }));
    cabin.position.set(0, sec.sheer + cabinH / 2, cz);
    cabin.castShadow = true; cabin.receiveShadow = true;
    tilt.add(cabin);
    const win = new THREE.Mesh(new THREE.BoxGeometry(cabinW + 0.02, cabinH * 0.3, cabinL * 0.6), new THREE.MeshStandardMaterial({ color: 0x10161d, roughness: 0.1, metalness: 0.6 }));
    win.position.copy(cabin.position); win.position.y += 0.02;
    tilt.add(win);
    const cockpitL = spec.L * 0.26;
    const cz2 = cz - cabinL / 2 - cockpitL / 2;
    const sec2 = sheerAt(spec, cz2);
    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(spec.B * 0.55, 0.02, cockpitL), new THREE.MeshStandardMaterial({ color: 0x8a6c4a, roughness: 0.9 }));
    cockpit.position.set(0, sec2.sheer + 0.01, cz2);
    cockpit.receiveShadow = true;
    tilt.add(cockpit);
    // zábradlí (relingy)
    const railPts = [];
    for (let i = 0; i <= 20; i++) {
      const z = -spec.L * 0.46 + (i / 20) * spec.L * 0.88;
      const s = sheerAt(spec, z);
      railPts.push(new THREE.Vector3(s.hb * 0.97, s.sheer + 0.6, z));
    }
    const railMat = new THREE.LineBasicMaterial({ color: 0xbfc5cc });
    for (const sgn of [1, -1]) {
      const pts = railPts.map((p) => new THREE.Vector3(p.x * sgn, p.y, p.z));
      tilt.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), railMat));
    }
  }

  // stěžeň
  const sx = sheerAt(spec, spec.mast.x);
  const mastLen = spec.mast.top - sx.sheer;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.7, spec.mast.r, mastLen, 10), mastMat);
  mast.position.set(0, sx.sheer + mastLen / 2, spec.mast.x);
  mast.castShadow = true;
  tilt.add(mast);

  // čeleň (bowsprit)
  const bowSec = sheerAt(spec, spec.L / 2 - 0.05);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.45, spec.mast.r * 0.5, spec.bowsprit + 0.6, 8), carbon);
  bs.rotation.x = Math.PI / 2;
  bs.position.set(0, bowSec.sheer + 0.02, spec.L / 2 + spec.bowsprit / 2 - 0.3);
  tilt.add(bs);

  // ráhno
  const main = spec.sails.find((s) => s.kind === 'main');
  const boomPivot = new THREE.Group();
  boomPivot.position.set(0, main.tack[1] - 0.05, main.tack[0]);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(spec.mast.r * 0.7, spec.mast.r * 0.7, main.foot, 8), mastMat);
  boom.rotation.x = Math.PI / 2;
  boom.position.z = -main.foot / 2;
  boom.castShadow = true;
  boomPivot.add(boom);
  tilt.add(boomPivot);

  // kýl / meč
  const K = spec.keel;
  const keelMat = new THREE.MeshStandardMaterial({ color: spec.id === 'skiff' ? 0x30343a : 0x2a2a2a, roughness: 0.6 });
  const keelGroup = new THREE.Group();
  const hullAtKeel = sheerAt(spec, K.x);
  const shp = new THREE.Shape();
  const sweep = spec.id === 'skiff' ? 0 : K.chord * 0.35;
  shp.moveTo(K.chord / 2, 0); shp.lineTo(-K.chord / 2, 0); shp.lineTo(-K.chord / 2 * 0.7 - sweep, -K.span); shp.lineTo(K.chord / 2 * 0.6 - sweep, -K.span); shp.closePath();
  const kg = new THREE.ExtrudeGeometry(shp, { depth: K.chord * 0.12, bevelEnabled: false });
  kg.translate(0, 0, -K.chord * 0.06);
  const keel = new THREE.Mesh(kg, keelMat);
  keel.rotation.y = Math.PI / 2;
  keelGroup.add(keel);
  if (K.type === 'bulb') {
    const bulb = new THREE.Mesh(new THREE.CapsuleGeometry(K.chord * 0.22, K.chord * 1.4, 6, 12), keelMat);
    bulb.rotation.x = Math.PI / 2;
    bulb.position.set(0, -K.span, -sweep * 0.8);
    keelGroup.add(bulb);
  }
  keelGroup.position.set(0, -hullAtKeel.d + 0.05, K.x);
  tilt.add(keelGroup);

  // kormidlo
  const R = spec.rudder;
  const rudderPivot = new THREE.Group();
  const rs = new THREE.Shape();
  rs.moveTo(0.05, 0.2); rs.lineTo(-R.chord, 0.2); rs.lineTo(-R.chord * 0.85, -R.span); rs.lineTo(0.02, -R.span * 0.95); rs.closePath();
  const rg = new THREE.ExtrudeGeometry(rs, { depth: 0.04, bevelEnabled: false }); rg.translate(0, 0, -0.02);
  const rudderBlade = new THREE.Mesh(rg, keelMat);
  rudderBlade.rotation.y = Math.PI / 2;
  rudderPivot.add(rudderBlade);
  const rSec = sheerAt(spec, R.x);
  const rudderBaseY = spec.id === 'skiff' ? 0.1 : -rSec.d * 0.6;
  rudderPivot.position.set(0, rudderBaseY, R.x + (spec.id === 'skiff' ? -0.05 : 0));
  tilt.add(rudderPivot);
  let tiller = null, wheel = null;
  if (spec.steering === 'tiller') {
    const tl = spec.id === 'skiff' ? 1.2 : 1.5;
    tiller = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, tl), new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.6 }));
    stick.position.z = tl / 2;
    stick.castShadow = true;
    tiller.add(stick);
    tiller.position.set(0, rSec.sheer + 0.18, R.x + 0.02);
    tiller.rotation.x = -0.12;
    tilt.add(tiller);
  } else {
    wheel = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 32), alu);
    wheel.add(ring);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), alu);
      sp.rotation.z = (i * Math.PI) / 6;
      wheel.add(sp);
    }
    const wz = R.x + 1.3;
    const ws = sheerAt(spec, wz);
    wheel.position.set(0, ws.sheer + 0.75, wz);
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 8), dark);
    ped.position.set(0, ws.sheer + 0.35, wz + 0.15);
    tilt.add(wheel, ped);
  }

  // lanoví
  const rig = [];
  const jib = spec.sails.find((s) => s.kind === 'jib');
  const add = (a, b) => rig.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  add([0, jib.tack[1], jib.tack[0]], [0, jib.head[1], jib.head[0]]); // předstěh
  const hounds = jib.head[1];
  const chain = sheerAt(spec, spec.mast.x - 0.25);
  for (const sg of [1, -1]) {
    add([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, hounds, spec.mast.x]);
    if (spec.id !== 'skiff') add([sg * chain.hb * 0.95, chain.sheer, spec.mast.x - 0.25], [0, spec.mast.top - 0.3, spec.mast.x]);
    // salingy
    add([0, hounds * 0.55, spec.mast.x], [sg * chain.hb * 0.7, hounds * 0.55, spec.mast.x - 0.15]);
  }
  if (spec.id !== 'skiff') { const st = sheerAt(spec, -spec.L / 2 + 0.2); add([0, st.sheer, -spec.L / 2 + 0.2], [0, spec.mast.top, spec.mast.x]); }
  const rigLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rig), new THREE.LineBasicMaterial({ color: 0x2a2d33 }));
  tilt.add(rigLines);

  // otěže (dynamické)
  const sheetGeo = new THREE.BufferGeometry();
  sheetGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
  const sheetLines = new THREE.LineSegments(sheetGeo, new THREE.LineBasicMaterial({ color: 0x334455 }));
  sheetLines.frustumCulled = false;
  tilt.add(sheetLines);

  // plachty
  const number = { skiff: '47', cruiser: '212', ocean: '7' }[spec.id];
  const sails = {};
  for (const s of spec.sails) {
    const tex = sailTexture(s.kind, s.color, number);
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.16, side: THREE.DoubleSide, roughness: 0.75, metalness: 0 });
    const sm = new SailMesh(s.kind === 'spin' ? 14 : 12, s.kind === 'spin' ? 12 : 9, mat);
    tilt.add(sm.mesh);
    sails[s.key] = sm;
  }

  // posádka
  const jackets = [0xff5a1f, 0xffd000, 0xff2b5e, 0x1fa2ff, 0xff7b00, 0xe8f000, 0xff5a1f, 0x00c2a8];
  const crew = [];
  for (let i = 0; i < spec.crewN; i++) {
    const p = makePerson(jackets[i]);
    tilt.add(p);
    crew.push(p);
  }
  const trapGeo = new THREE.BufferGeometry();
  trapGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(4 * 3), 3));
  const trapLines = new THREE.LineSegments(trapGeo, new THREE.LineBasicMaterial({ color: 0x111111 }));
  trapLines.frustumCulled = false;
  tilt.add(trapLines);

  root.traverse((o) => { if (o.isMesh) o.castShadow = o.castShadow || false; });

  // ---------- aktualizace ----------
  const mastX = spec.mast.x;
  function update(b, t) {
    // ráhno
    const dMain = b.ang.main;
    boomPivot.rotation.y = -dMain;
    rudderPivot.rotation.y = -b.rudder * spec.rudder.max * DEG;
    if (tiller) tiller.rotation.y = -b.rudder * spec.rudder.max * DEG;
    if (wheel) wheel.rotation.z = b.rudder * 4.5;
    keelGroup.visible = true;
    if (K.retract) keelGroup.position.y = -hullAtKeel.d + 0.05 + (1 - b.board) * K.span * 0.8;

    const twistBase = 6 * DEG;
    const sheetPts = sheetGeo.attributes.position.array;
    let sp = 0;
    const pushLine = (a, c) => { sheetPts.set(a, sp); sheetPts.set(c, sp + 3); sp += 6; };

    for (const s of spec.sails) {
      const sm = sails[s.key];
      const info = b.sailInfo[s.key] || { a: 0, flap: 0 };
      const active = s.kind === 'spin' ? b.spinUp : s.kind === 'jib' ? !(b.spinUp && spec.spinReplacesJib) : true;
      sm.mesh.visible = active && !(s.kind === 'main' && false);
      if (!active) continue;
      const d = b.ang[s.key];
      const side = Math.sign(d) || 1;
      const sheet = b.sheets[s.ctrl];
      const twist = twistBase + sheet * 14 * DEG;
      const flap = info.flap || 0;
      const camberBase = s.kind === 'spin' ? 0.2 : s.kind === 'jib' ? 0.11 : 0.1;
      const camber = camberBase * (1 - flap * 0.85) * (info.rev ? -0.6 : 1);
      if (s.kind === 'main') {
        const rf = [1, 0.72, 0.5][b.reef] ?? 1;
        const h0 = s.tack[1], h1 = h0 + (s.head[1] - h0) * (0.62 + 0.38 * rf);
        sm.update((f) => {
          const h = h0 + (h1 - h0) * f;
          const ch = s.foot * ((1 - f) + s.roach * Math.sin(Math.PI * f) * 0.9) + 0.05 * s.foot * f;
          const a = d + side * twist * f * f;
          return { L: [0, h, mastX - spec.mast.r * 1.2], E: [Math.sin(a) * ch, h - 0.05 * f, mastX - spec.mast.r - Math.cos(a) * ch] };
        }, camber, side, flap, t);
        const bx = Math.sin(d) * s.foot, bz = mastX - Math.cos(d) * s.foot;
        const sheetBase = sheerAt(spec, mastX - s.foot * 0.95);
        pushLine([bx * 0.95, h0 - 0.05, bz * 0.98 + 0.02 * mastX], [0, sheetBase.sheer + 0.05, mastX - s.foot * 0.95]);
      } else {
        const tack = [0, s.tack[1], s.tack[0]];
        const head = [0, s.head[1], s.head[0]];
        const footLen = s.foot;
        const clew = [Math.sin(d) * footLen, s.tack[1] + (s.kind === 'spin' ? 1.2 : 0.35) * (spec.L / 9), s.tack[0] - Math.cos(d) * footLen];
        const shoulder = s.kind === 'spin' ? 0.45 : 0;
        sm.update((f) => {
          const L = [tack[0] + (head[0] - tack[0]) * f, tack[1] + (head[1] - tack[1]) * f, tack[2] + (head[2] - tack[2]) * f];
          let E = [clew[0] + (head[0] - clew[0]) * f, clew[1] + (head[1] - clew[1]) * f, clew[2] + (head[2] - clew[2]) * f];
          // twist + rameno spinakru
          const ex = E[0] - L[0], ez = E[2] - L[2];
          const a = side * twist * f * 0.8;
          const ca = Math.cos(a), sa = Math.sin(a);
          let rx = ex * ca + ez * sa, rz = -ex * sa + ez * ca;
          const grow = 1 + (s.kind === 'spin' ? 0.35 * Math.sin(Math.PI * Math.min(1, f * 1.1)) : 0);
          E = [L[0] + rx * grow, E[1], L[2] + rz * grow];
          return { L, E };
        }, camber, side, flap, t, shoulder);
        const sb = sheerAt(spec, clew[2] - footLen * 0.25);
        pushLine(clew, [side * sb.hb * 0.95, sb.sheer + 0.05, clew[2] - footLen * 0.25]);
      }
    }
    while (sp < sheetPts.length) sheetPts[sp++] = 0;
    sheetGeo.attributes.position.needsUpdate = true;

    // posádka
    const tp = trapGeo.attributes.position.array; tp.fill(0);
    const side = Math.sign(b.crewY) || 1;
    const arm = Math.abs(b.crewY);
    crew.forEach((p, i) => {
      if (spec.id === 'skiff') {
        const z = i === 0 ? -1.05 : 0.05;
        const sec = sheerAt(spec, z);
        const half = sec.hb;
        p.position.set(0, sec.sheer, z);
        p.rotation.set(0, 0, 0);
        if (b.capsized) { p.position.set(0, 0.1, z); p.rotation.z = 0; p.visible = true; return; }
        if (arm > half * 0.95) {
          const ang = Math.asin(clamp((arm - half * 0.7) / 1.0, 0, 1));
          p.position.x = side * half;
          p.rotation.z = -side * ang;
          if (i === 1) { // trapézové lanko
            const hipY = sec.sheer + Math.cos(ang) * 1.0, hipX = side * (half + Math.sin(ang) * 1.0);
            tp.set([hipX, hipY, z, 0, 5.5 * spec.L / 4.5, mastX], 0);
          }
          if (i === 0) {
            const hipY = sec.sheer + Math.cos(ang) * 1.0, hipX = side * (half + Math.sin(ang) * 1.0);
            tp.set([hipX, hipY, z, 0, 5.4 * spec.L / 4.5, mastX], 6);
          }
        } else {
          p.position.x = side * Math.min(arm * 1.1, half - 0.05);
          p.position.y = sec.sheer - 0.35;
          p.rotation.z = -side * clamp(arm / half, 0, 1) * 0.5;
        }
      } else {
        const n = crew.length;
        const zHelm = spec.rudder.x + (spec.steering === 'wheel' ? 0.75 : 1.4);
        if (i === 0) {
          const sec = sheerAt(spec, zHelm);
          p.position.set(spec.steering === 'wheel' ? 0 : side * sec.hb * 0.6, sec.sheer + (spec.steering === 'wheel' ? 0 : -0.3), zHelm - (spec.steering === 'wheel' ? 0.6 : 0));
          p.rotation.set(0, spec.steering === 'wheel' ? 0 : -side * 0.6, 0);
          return;
        }
        const hiking = arm > spec.sitArm * 0.9;
        const z = hiking ? spec.mast.x - 0.6 - (i - 1) * (spec.L * 0.45 / n) : zHelm + 1.0 + (i - 1) * 0.8;
        const sec = sheerAt(spec, z);
        p.rotation.set(0, 0, 0);
        if (hiking) { p.position.set(side * (sec.hb + 0.12), sec.sheer - 0.62, z); p.rotation.z = -side * 0.5; }
        else { p.position.set(((i % 2) ? 1 : -1) * sec.hb * 0.45, sec.sheer - 0.35, z); }
      }
    });
    trapGeo.attributes.position.needsUpdate = true;
  }

  return { root, tilt, update, sails };
}

// ---------- bóje ----------
function createBuoy(color = 0xff7a00, label = '') {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.5, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.2, 16), m);
  body.position.y = 0.6;
  const top = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.3, 16), m);
  top.position.y = 2.35;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  pole.position.y = 4.2;
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, emissive: 0xffffff, emissiveIntensity: 0.2 }));
  flag.position.set(0.6, 5.2, 0);
  for (const o of [body, top, pole, flag]) { o.castShadow = true; g.add(o); }
  g.userData.flag = flag;
  return g;
}

// ---------- ostrovy v dálce ----------
function createIsland(radius, height, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const geo = new THREE.ConeGeometry(radius, height, 48, 8, true);
  const pos = geo.attributes.position;
  const cols = [];
  const sand = new THREE.Color(0xd8c38f), green = new THREE.Color(0x3f6b35), rock = new THREE.Color(0x6b6b63);
  const offs = Array.from({ length: 6 }, () => rnd() * 6.28);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const n = 1 + 0.18 * Math.sin(a * 3 + offs[0]) + 0.1 * Math.sin(a * 7 + offs[1]) + 0.05 * Math.sin(a * 13 + offs[2]);
    const hf = (y + height / 2) / height;
    const yy = y + height / 2;
    pos.setXYZ(i, x * n, yy * (0.85 + 0.25 * Math.sin(a * 2 + offs[3])) - 3, z * n);
    const c = hf < 0.08 ? sand : hf > 0.75 ? rock : green;
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }));
}

return { createBoatModel, createBuoy, createIsland };
})();

// ===== js/effects.js =====
const __m_effects = (() => {
const THREE = __three;

// ---------- brázda za lodí ----------
class Wake {
  constructor(scene, maxPts = 140) {
    this.max = maxPts;
    this.pts = []; // {x,z,dx,dz,age,w,str}
    const n = maxPts * 2;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.attr = new Float32Array(n * 3); // side, age01, strength
    const idx = [];
    for (let i = 0; i < maxPts - 1; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aInfo', new THREE.BufferAttribute(this.attr, 3));
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uLight: { value: 1 } },
      vertexShader: `attribute vec3 aInfo; varying vec3 vI; varying vec2 vW;
        void main(){ vI=aInfo; vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
      fragmentShader: `uniform float uTime; uniform float uLight; varying vec3 vI; varying vec2 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),u.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x), u.y); }
        void main(){
          float side = abs(vI.x); float age = vI.y; float str = vI.z;
          float edge = smoothstep(0.55, 0.95, side) * (1.0 - smoothstep(0.95, 1.0, side));
          float center = (1.0 - smoothstep(0.0, 0.5, side)) * (1.0 - smoothstep(0.0, 0.35, age));
          float n = noise(vW * 1.3) * 0.6 + noise(vW * 4.1) * 0.4;
          float a = (edge * 0.9 + center * 0.7) * smoothstep(0.25, 0.75, n + 0.25 - age * 0.3);
          a *= (1.0 - age) * str;
          gl_FragColor = vec4(vec3(0.93,0.96,0.98) * uLight, clamp(a, 0.0, 0.85));
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.acc = 0;
  }
  reset() { this.pts = []; }
  update(dt, stern, heading, speed, beam, waves, t, life = 16) {
    this.acc += dt;
    for (const p of this.pts) p.age += dt / life;
    this.pts = this.pts.filter((p) => p.age < 1);
    if (this.acc > 0.12 && speed > 0.4) {
      this.acc = 0;
      this.pts.unshift({ x: stern.x, z: stern.z, dx: Math.cos(heading), dz: -Math.sin(heading), age: 0, w0: beam * 0.45, v: speed, str: Math.min(1, speed / 4) });
      if (this.pts.length > this.max) this.pts.length = this.max;
    }
    const n = this.pts.length;
    for (let i = 0; i < this.max; i++) {
      const k = i * 2;
      if (i >= n) { for (let j = 0; j < 2; j++) { this.pos.set([0, -50, 0], (k + j) * 3); this.attr.set([0, 1, 0], (k + j) * 3); } continue; }
      const p = this.pts[i];
      const tSec = p.age * life;
      const w = p.w0 + tSec * p.v * 0.36 * 0.4 + tSec * 0.25;
      for (let j = 0; j < 2; j++) {
        const s = j === 0 ? 1 : -1;
        const x = p.x + p.dx * w * s, z = p.z + p.dz * w * s;
        const y = waves.height(x, z, t) + 0.06;
        this.pos.set([x, y, z], (k + j) * 3);
        this.attr.set([s, p.age, p.str], (k + j) * 3);
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aInfo.needsUpdate = true;
  }
}

// ---------- spršky od přídě ----------
class Spray {
  constructor(scene, n = 500) {
    this.n = n;
    this.p = Array.from({ length: n }, () => ({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, life: 0 }));
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.alpha = new Float32Array(n);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uSize: { value: 60 }, uLight: { value: 1 } },
      vertexShader: `attribute float aA; varying float vA; uniform float uSize;
        void main(){ vA=aA; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = uSize * (0.3 + aA) / -mv.z; gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `varying float vA; uniform float uLight;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if(d>0.5) discard;
          gl_FragColor = vec4(vec3(0.95,0.97,1.0)*uLight, vA * (1.0 - d*2.0) * 0.7); }`,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.i = 0;
  }
  emit(x, y, z, vx, vy, vz, spread) {
    const q = this.p[this.i]; this.i = (this.i + 1) % this.n;
    q.x = x; q.y = y; q.z = z;
    q.vx = vx + (Math.random() - 0.5) * spread; q.vy = vy + Math.random() * spread * 0.8; q.vz = vz + (Math.random() - 0.5) * spread;
    q.life = 1;
  }
  update(dt, windX, windZ) {
    for (let i = 0; i < this.n; i++) {
      const q = this.p[i];
      if (q.life > 0) {
        q.life -= dt * 0.9;
        q.vy -= 9.81 * dt;
        q.vx += (windX - q.vx) * dt * 0.8; q.vz += (windZ - q.vz) * dt * 0.8;
        q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      }
      this.pos[i * 3] = q.x; this.pos[i * 3 + 1] = q.life > 0 ? q.y : -100; this.pos[i * 3 + 2] = q.z;
      this.alpha[i] = Math.max(0, q.life);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aA.needsUpdate = true;
  }
}

// ---------- déšť ----------
class Rain {
  constructor(scene, n = 4000) {
    const pos = new Float32Array(n * 2 * 3), info = new Float32Array(n * 2 * 2);
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * 80, y = Math.random() * 40, z = (Math.random() - 0.5) * 80, r = Math.random();
      for (let j = 0; j < 2; j++) { pos.set([x, y, z], (i * 2 + j) * 3); info.set([j, r], (i * 2 + j) * 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aInfo', new THREE.BufferAttribute(info, 2));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() }, uAlpha: { value: 0.28 } },
      vertexShader: `attribute vec2 aInfo; uniform float uTime; uniform vec3 uCenter; uniform vec2 uWind; varying float vT;
        void main(){
          vec3 p = position;
          float fall = 14.0;
          float y = mod(p.y - uTime * fall + aInfo.y * 40.0, 40.0);
          vec3 w = vec3(uWind.x, 0.0, uWind.y) * (40.0 - y) / fall * 0.5;
          vec3 base = vec3(mod(p.x - uCenter.x + w.x + 40.0, 80.0) - 40.0, y - 6.0, mod(p.z - uCenter.z + w.z + 40.0, 80.0) - 40.0) + uCenter;
          vec3 streak = normalize(vec3(uWind.x, -fall, uWind.y)) * 0.9 * aInfo.x;
          vT = aInfo.x;
          gl_Position = projectionMatrix * viewMatrix * vec4(base + streak, 1.0);
        }`,
      fragmentShader: `uniform float uAlpha; varying float vT; void main(){ gl_FragColor = vec4(0.75,0.8,0.85, uAlpha * (1.0 - vT*0.6)); }`,
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
}

return { Wake, Spray, Rain };
})();

// ===== js/audio.js =====
const __m_audio = (() => {
// Jednoduchý zvuk: vítr, šumění vody, třepetání plachet, déšť a hrom (WebAudio, bez souborů)
class SailAudio {
  constructor() { this.ctx = null; this.muted = false; }

  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    let ctx;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
    this.ctx = ctx;
    const len = ctx.sampleRate * 3;
    const white = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = white.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = last * 3.5; }
    this.master = ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(ctx.destination);
    const src = (buf) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; };

    // vítr
    this.windF = ctx.createBiquadFilter(); this.windF.type = 'bandpass'; this.windF.Q.value = 0.8;
    this.windG = ctx.createGain(); this.windG.gain.value = 0;
    src(white).connect(this.windF); this.windF.connect(this.windG); this.windG.connect(this.master);
    // voda
    this.waterF = ctx.createBiquadFilter(); this.waterF.type = 'lowpass'; this.waterF.frequency.value = 600;
    this.waterG = ctx.createGain(); this.waterG.gain.value = 0;
    src(brown).connect(this.waterF); this.waterF.connect(this.waterG); this.waterG.connect(this.master);
    // třepetání plachty – modulovaný šum
    this.flapF = ctx.createBiquadFilter(); this.flapF.type = 'bandpass'; this.flapF.frequency.value = 900; this.flapF.Q.value = 0.6;
    this.flapG = ctx.createGain(); this.flapG.gain.value = 0;
    this.flapMod = ctx.createGain(); this.flapMod.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 7; lfo.connect(this.flapMod.gain); lfo.start();
    src(white).connect(this.flapF); this.flapF.connect(this.flapMod); this.flapMod.connect(this.flapG); this.flapG.connect(this.master);
    this.lfo = lfo;
    // déšť
    this.rainF = ctx.createBiquadFilter(); this.rainF.type = 'highpass'; this.rainF.frequency.value = 2500;
    this.rainG = ctx.createGain(); this.rainG.gain.value = 0;
    src(white).connect(this.rainF); this.rainF.connect(this.rainG); this.rainG.connect(this.master);
    this.brown = brown;
  }

  setMuted(m) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }

  update(aws, speed, flap, rain) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windG.gain.setTargetAtTime(Math.min(0.5, 0.02 + aws * aws * 0.0012), t, 0.3);
    this.windF.frequency.setTargetAtTime(300 + aws * 45, t, 0.3);
    this.waterG.gain.setTargetAtTime(Math.min(0.9, speed * 0.09), t, 0.3);
    this.waterF.frequency.setTargetAtTime(300 + speed * 90, t, 0.3);
    this.flapG.gain.setTargetAtTime(Math.min(0.5, flap * aws * 0.05), t, 0.1);
    this.lfo.frequency.setTargetAtTime(4 + aws * 0.6, t, 0.3);
    this.rainG.gain.setTargetAtTime(rain * 0.12, t, 0.5);
  }

  thunder(delay = 1) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource(); s.buffer = this.brown;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 180;
    const g = ctx.createGain();
    const t = ctx.currentTime + delay;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.2, t + 0.15); g.gain.exponentialRampToValueAtTime(0.01, t + 4);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t, Math.random()); s.stop(t + 4.5);
  }
}

return { SailAudio };
})();

// ===== js/ui.js =====
const __m_ui = (() => {
const { DEG, KN, clamp, wrap } = __m_physics;

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

function showMenu(show) {
  $('menu').classList.toggle('hidden', !show);
  $('hud').classList.toggle('hidden', show);
  if (show) buildMenu();
}

// ---------- tlačítka ----------
function setButtons(S, spec, boat) {
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
function toast(text, ms = 1500) {
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

function initUI(o) {
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

function updateHUD(b, spec, x) {
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
function drawMinimap(b, spec, race, islands, trail, windFrom) {
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

return { showMenu, setButtons, toast, initUI, updateHUD, drawMinimap };
})();

// ===== js/main.js =====
const __m_main = (() => {
const THREE = __three;
const { createBoatState, stepBoat, autoTrim, pointOfSail, wrap, clamp, DEG, KN } = __m_physics;
const { BOATS, WEATHER } = __m_config;
const { WaveField, WindField } = __m_waves;
const { createOcean, createSky } = __m_ocean;
const { createBoatModel, createBuoy, createIsland } = __m_models;
const { Wake, Spray, Rain } = __m_effects;
const { SailAudio } = __m_audio;
const { initUI, updateHUD, toast, drawMinimap, showMenu, setButtons } = __m_ui;

// ---------------- stav hry ----------------
const S = {
  boatId: 'skiff', weatherId: 'fresh', mode: 'free',
  running: false, paused: false, autoTrim: false, autoCenter: true, camMode: 0, sound: true, shadows: true,
  helmDrag: false,
};
const store = {
  get(k, d) { try { const v = localStorage.getItem('sail3d_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('sail3d_' + k, JSON.stringify(v)); } catch { /* ignore */ } },
};
Object.assign(S, store.get('prefs', {}));
S.running = false; S.paused = false; S.helmDrag = false;

// ---------------- renderer a scéna ----------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 12000);

const waves = new WaveField();
const wind = new WindField();
const ocean = createOcean(waves);
scene.add(ocean.mesh);
const sky = createSky();
scene.add(sky.mesh);

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x0b3550, 1.0);
scene.add(hemi);
scene.fog = new THREE.FogExp2(0xbcd8f0, 0.0002);

// ostrovy a maják
const islands = [];
[[2600, 1900, 420, 120, 3], [-3100, 900, 600, 180, 11], [-1500, -3400, 380, 90, 19], [3600, -2400, 700, 220, 29], [400, 4200, 520, 150, 37], [-4200, 3800, 900, 260, 41]]
  .forEach(([x, z, r, h, seed]) => {
    const m = createIsland(r, h, seed);
    m.position.set(x, 0, z);
    scene.add(m);
    islands.push({ x, z, r: r * 0.95 });
  });
{
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(4, 6, 34, 16), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  tower.position.y = 17;
  const band = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 5.2, 8, 16), new THREE.MeshStandardMaterial({ color: 0xc0262b }));
  band.position.y = 20;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xffe28a, emissiveIntensity: 2 }));
  lamp.position.y = 36;
  lh.add(tower, band, lamp);
  lh.position.set(2600 - 300, 30, 1900 - 260);
  scene.add(lh);
}

const wake = new Wake(scene);
const spray = new Spray(scene);
const rain = new Rain(scene);
const audio = new SailAudio();

// ---------------- loď ----------------
let spec = null, boat = null, model = null, windex = null;
let weather = WEATHER[S.weatherId];
const vis = { heave: 0, pitch: 0, roll: 0, lastTwaSign: 0, maxSpd: 0, trail: [], trailAcc: 0, flash: 0, nextBolt: 8, spraySlam: 0 };
const env = { t: 0, windAt: (x, z, t) => wind.at(x, z, t), waveSlope: null, slopeCache: { sx: 0, sz: 0 }, rollForce: 0 };
env.waveSlope = () => env.slopeCache;

// ---------------- závod ----------------
const race = { active: false, legs: [], leg: 0, started: false, t0: 0, time: 0, finished: false, buoys: [], lineHalf: 40, D: 500, prevZ: 0 };

function clearBuoys() { for (const b of race.buoys) scene.remove(b.mesh); race.buoys = []; }
function setupRace() {
  clearBuoys();
  race.active = S.mode === 'race';
  if (!race.active) return;
  const D = { skiff: 450, cruiser: 650, ocean: 900 }[spec.id];
  const half = { skiff: 40, cruiser: 60, ocean: 85 }[spec.id];
  race.D = D; race.lineHalf = half;
  const W = { x: 0, z: D }, Lm = { x: 0, z: -D * 0.25 };
  race.legs = [
    { type: 'line', dir: 1, name: 'Start – proplujte čarou proti větru' },
    { type: 'mark', ...W, name: 'Návětrná bója (1)' },
    { type: 'mark', ...Lm, name: 'Závětrná bója' },
    { type: 'mark', ...W, name: 'Návětrná bója (2)' },
    { type: 'line', dir: -1, name: 'Cíl – proplujte čarou po větru' },
  ];
  const mk = (x, z, c, kind) => { const m = createBuoy(c); m.position.set(x, 0, z); scene.add(m); race.buoys.push({ mesh: m, x, z, kind }); };
  mk(W.x, W.z, 0xff7a00, 'mark');
  mk(Lm.x, Lm.z, 0xff7a00, 'mark');
  mk(-half, 0, 0xffd400, 'line');
  mk(half, 0, 0xffd400, 'line');
  race.leg = 0; race.started = false; race.finished = false; race.time = 0;
}
function markRadius() { return Math.max(18, spec.L * 2.4); }

function updateRace(dt) {
  if (!race.active || race.finished) return;
  if (race.started) race.time += dt;
  const leg = race.legs[race.leg];
  const bx = boat.x, bz = boat.z;
  if (leg.type === 'line') {
    const crossed = leg.dir > 0 ? race.prevZ < 0 && bz >= 0 : race.prevZ > 0 && bz <= 0;
    if (crossed && Math.abs(bx) < race.lineHalf) {
      if (race.leg === 0) { race.started = true; race.time = 0; toast('Start! Pluj k návětrné bóji', 2500); race.leg++; }
      else {
        race.finished = true;
        const key = `best_${spec.id}_${weather.id}`;
        const best = store.get(key, null);
        const t = race.time;
        if (best === null || t < best) { store.set(key, t); toast(`🏁 CÍL! ${fmtTime(t)} – nový rekord!`, 6000); }
        else toast(`🏁 CÍL! ${fmtTime(t)} (rekord ${fmtTime(best)})`, 6000);
      }
    }
  } else if (Math.hypot(bx - leg.x, bz - leg.z) < markRadius()) {
    toast(`✔ ${leg.name} obeplutá`, 1800);
    race.leg++;
  }
  race.prevZ = bz;
}
function fmtTime(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; }

// ---------------- počasí ----------------
function applyWeather(w) {
  weather = w;
  const windFrom = 0;
  wind.setup(w.tws / KN, windFrom, w.gust, w.shift);
  waves.setup(w.waveH, windFrom, w.chop);
  const k = w.sky;
  const zen = new THREE.Color(k.zenith), hor = new THREE.Color(k.horizon), sunC = new THREE.Color(k.sun);
  const e = k.sunElev * DEG, a = k.sunAz * DEG;
  const sd = new THREE.Vector3(Math.cos(e) * Math.sin(a), Math.sin(e), Math.cos(e) * Math.cos(a));
  for (const u of [ocean.uniforms, sky.uniforms]) {
    u.uZenith.value.copy(zen); u.uHorizon.value.copy(hor); u.uSunColor.value.copy(sunC); u.uSunDir.value.copy(sd);
  }
  sky.uniforms.uCloudColor.value.set(k.cloudColor);
  sky.uniforms.uClouds.value = k.clouds;
  sky.uniforms.uDrift.value.set(-Math.sin(windFrom), -Math.cos(windFrom)).multiplyScalar(0.004 * (0.5 + w.tws / 20));
  sky.uniforms.uFogColor.value.copy(hor);
  sky.uniforms.uHaze.value = clamp(w.fog * 1200, 0, 1);
  ocean.uniforms.uWater.value.set(w.water);
  ocean.uniforms.uFogColor.value.copy(hor);
  ocean.uniforms.uFogDensity.value = w.fog;
  ocean.uniforms.uChop.value = w.chop;
  ocean.uniforms.uFoam.value = clamp((w.tws - 9) / 18, 0.05, 1);
  ocean.uniforms.uLight.value = k.light;
  ocean.uniforms.uGustAmp.value = w.gust;
  ocean.uniforms.uGustDrift.value.set(wind.driftX, wind.driftZ);
  ocean.uniforms.uWindDir.value.set(-Math.sin(windFrom), -Math.cos(windFrom)).multiplyScalar(0.15 + w.tws * 0.012);
  scene.fog.color.copy(hor);
  scene.fog.density = w.fog;
  scene.background = hor;
  sun.color.copy(sunC);
  sun.intensity = 2.6 * k.light;
  sun.userData.dir = sd;
  hemi.color.copy(zen).lerp(new THREE.Color(0xffffff), 0.45);
  hemi.groundColor.set(w.water);
  hemi.intensity = k.ambient * 1.3;
  rain.mesh.visible = w.rain > 0;
  wake.mat.uniforms.uLight.value = k.light;
  spray.mat.uniforms.uLight.value = k.light;
}

// ---------------- start hry ----------------
function startGame() {
  spec = BOATS[S.boatId];
  if (model) tiltRemove();
  boat = createBoatState(spec);
  model = createBoatModel(spec);
  scene.add(model.root);
  windex = new THREE.Group();
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.05 * spec.L / 4.5, 0.4 * spec.L / 4.5, 6), new THREE.MeshStandardMaterial({ color: 0xff3030 }));
  arrow.rotation.x = Math.PI / 2; arrow.position.z = 0.15 * spec.L / 4.5;
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12 * spec.L / 4.5, 0.25 * spec.L / 4.5), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  tail.position.z = -0.15 * spec.L / 4.5;
  windex.add(arrow, tail);
  windex.position.set(0, spec.mast.top + 0.05, spec.mast.x);
  model.tilt.add(windex);

  applyWeather(WEATHER[S.weatherId]);
  setupRace();
  if (race.active) { boat.x = 0; boat.z = -Math.max(60, spec.L * 8); boat.psi = -50 * DEG; }
  else { boat.x = 0; boat.z = 0; boat.psi = -100 * DEG; }
  race.prevZ = boat.z;
  boat.u = 2.0;
  env.t = 0;
  stepBoat(boat, spec, env, 0.001);
  for (let i = 0; i < 40; i++) autoTrim(spec, boat, 0.2);
  vis.maxSpd = 0; vis.trail = []; vis.lastTwaSign = Math.sign(boat.twa);
  vis.heave = waves.height(boat.x, boat.z, 0);
  wake.reset();
  cam.yaw = 0; cam.pitch = 0.22; cam.dist = camDistDefault(); cam.init = true;
  S.running = true; S.paused = false;
  setShadowBounds();
  audio.start(); audio.setMuted(!S.sound);
  showMenu(false);
  setButtons(S, spec, boat);
  toast(`${spec.name} · ${weather.name} – vítr ${weather.tws} kn`, 3000);
  if (!store.get('helpSeen', false)) { document.getElementById('help').classList.remove('hidden'); store.set('helpSeen', true); S.paused = true; }
}
function tiltRemove() { scene.remove(model.root); model.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }

function setShadowBounds() {
  const s = spec.mast.top * 0.9 + spec.L * 0.6;
  const c = sun.shadow.camera;
  c.left = -s; c.right = s; c.top = s; c.bottom = -s; c.near = 1; c.far = s * 6;
  c.updateProjectionMatrix();
  renderer.shadowMap.enabled = S.shadows;
}

function resetBoat() {
  const keep = { x: boat.x, z: boat.z, psi: boat.psi };
  const b = createBoatState(spec);
  Object.assign(boat, b, keep);
  boat.u = 1;
  toast('Loď vrácena do výchozího stavu', 1500);
}

// ---------------- vstup ----------------
const keys = {};
const actions = {
  spin() { if (boat.capsized) return; boat.spinUp = !boat.spinUp; toast(boat.spinUp ? `${spec.spinName} vytažen` : `${spec.spinName} stažen`, 1400); },
  hike() { boat.trapeze = !boat.trapeze; toast(boat.trapeze ? (spec.id === 'skiff' ? 'Posádka na trapézu' : 'Posádka vyvěšená na hraně') : 'Posádka uvnitř lodi', 1400); },
  board() { if (!spec.keel.retract) return; boat.board = boat.board > 0.5 ? 0.25 : 1; toast(boat.board > 0.5 ? 'Meč spuštěn' : 'Meč vytažen (méně odporu, víc snosu)', 1600); },
  reef() { if (spec.id === 'skiff') { toast('Skif nemá refování – povol otěže nebo jdi na trapéz', 1800); return; } boat.reef = (boat.reef + 1) % 3; toast(['Plné plachty', 'Zarefováno – 1. ref', 'Zarefováno – 2. ref'][boat.reef], 1600); },
  auto() { S.autoTrim = !S.autoTrim; toast(S.autoTrim ? 'Automatický trim plachet ZAP' : 'Automatický trim VYP', 1400); },
  motor() { if (!spec.motor) { toast('Skif nemá motor', 1200); return; } boat.motor = !boat.motor; toast(boat.motor ? 'Motor nastartován' : 'Motor vypnut', 1400); },
  cam() { S.camMode = (S.camMode + 1) % 5; cam.init = true; toast(['Kamera: za lodí', 'Kamera: volná (orbit)', 'Kamera: kormidelník', 'Kamera: shora', 'Kamera: filmová'][S.camMode], 1200); },
  pause() { setPause(!S.paused); },
  help() { const h = document.getElementById('help'); h.classList.toggle('hidden'); S.paused = !h.classList.contains('hidden') || !document.getElementById('pause').classList.contains('hidden'); },
  right() { if (boat.capsized && boat.righting === 0) { boat.righting = 0.0001; toast('Vztyčuji loď…', 2000); } },
  reset() { resetBoat(); },
  mute() { S.sound = !S.sound; audio.setMuted(!S.sound); savePrefs(); toast(S.sound ? 'Zvuk zapnut' : 'Zvuk vypnut', 1000); },
};
function setPause(p) {
  S.paused = p;
  document.getElementById('pause').classList.toggle('hidden', !p);
  if (!p) document.getElementById('help').classList.add('hidden');
}
function savePrefs() { store.set('prefs', { boatId: S.boatId, weatherId: S.weatherId, mode: S.mode, autoCenter: S.autoCenter, sound: S.sound, shadows: S.shadows, autoTrim: S.autoTrim }); }

const keyMap = { KeyG: 'spin', Space: 'hike', KeyC: 'board', KeyR: 'reef', KeyT: 'auto', KeyM: 'motor', KeyV: 'cam', KeyP: 'pause', Escape: 'pause', KeyH: 'help', Enter: 'right', KeyB: 'reset', KeyN: 'mute' };
window.addEventListener('keydown', (e) => {
  if (!S.running) return;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  keys[e.code] = true;
  if (!e.repeat && keyMap[e.code]) {
    if (S.paused && !['pause', 'help'].includes(keyMap[e.code])) return;
    actions[keyMap[e.code]]();
    setButtons(S, spec, boat);
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// kamera myší
const cam = { yaw: 0, pitch: 0.22, dist: 14, pos: new THREE.Vector3(), look: new THREE.Vector3(), init: true, cine: new THREE.Vector3() };
function camDistDefault() { return { skiff: 13, cruiser: 24, ocean: 40 }[spec.id]; }
let drag = null;
canvas.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = clamp(cam.pitch + (e.clientY - drag.y) * 0.004, -0.15, 1.35);
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => { drag = null; });
canvas.addEventListener('pointercancel', () => { drag = null; });
canvas.addEventListener('dblclick', () => { cam.yaw = 0; cam.pitch = 0.22; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (spec) cam.dist = clamp(cam.dist * (e.deltaY > 0 ? 1.1 : 0.9), spec.L * 1.2, spec.L * 25); }, { passive: false });

// ---------------- UI ----------------
initUI({
  S, BOATS, WEATHER, actions, store, fmtTime,
  onStart: () => { savePrefs(); startGame(); },
  onResume: () => setPause(false),
  onMenu: () => { setPause(false); S.running = false; showMenu(true); },
  onPrefs: () => { savePrefs(); if (spec) setShadowBounds(); },
  onPreview: () => { if (S.running) return; if (model) tiltRemove(); model = null; spec = null; },
  getBoat: () => boat, getSpec: () => spec,
});
showMenu(true);

// ---------------- smyčka ----------------
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();
let last = performance.now(), acc = 0, menuT = 0;
const FIX = 1 / 120;

function controls(dt) {
  const rRate = spec.steering === 'wheel' ? 0.85 : spec.id === 'skiff' ? 1.8 : 1.3;
  const steer = (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0);
  if (steer) boat.rudder = clamp(boat.rudder + steer * rRate * dt, -1, 1);
  else if (S.autoCenter && !S.helmDrag) {
    const d = Math.min(Math.abs(boat.rudder), 1.4 * dt);
    boat.rudder -= Math.sign(boat.rudder) * d;
  }
  const sRate = spec.id === 'skiff' ? 0.5 : spec.id === 'cruiser' ? 0.35 : 0.25;
  const m = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  const h = (keys.KeyQ ? 1 : 0) - (keys.KeyE ? 1 : 0);
  if ((m || h) && S.autoTrim) { S.autoTrim = false; toast('Ruční trim – automatika vypnuta', 1400); setButtons(S, spec, boat); }
  if (m) boat.sheets.main = clamp(boat.sheets.main + m * sRate * dt, 0, 1);
  if (h) boat.sheets.head = clamp(boat.sheets.head + h * sRate * dt, 0, 1);
  if (S.autoTrim && !boat.capsized) autoTrim(spec, boat, dt);
}

function physics(dt) {
  acc += dt;
  let n = 0;
  const sl = waves.slope(boat.x, boat.z, env.t);
  env.slopeCache.sx = sl.sx; env.slopeCache.sz = sl.sz;
  while (acc >= FIX && n < 12) {
    env.t += FIX;
    stepBoat(boat, spec, env, FIX);
    acc -= FIX; n++;
  }
  if (n >= 12) acc = 0;
  // ostrovy – mělčina
  for (const is of islands) {
    const dx = boat.x - is.x, dz = boat.z - is.z, d = Math.hypot(dx, dz);
    if (d < is.r) {
      boat.x = is.x + (dx / d) * is.r; boat.z = is.z + (dz / d) * is.r;
      boat.u *= -0.2; boat.v = 0; boat.r = 0;
      toast('Najel jsi na mělčinu!', 1500);
    }
  }
  // obrat / kosení
  const sg = Math.sign(boat.twa);
  if (sg !== 0 && sg !== vis.lastTwaSign && boat.aws > 0.5) {
    if (vis.lastTwaSign !== 0) toast(Math.abs(boat.twa) < Math.PI / 2 ? 'Obrat proti větru' : 'Obrat po větru (kosení)!', 1300);
    vis.lastTwaSign = sg;
  }
}

function updateVisuals(dt, t) {
  const sp = Math.sin(boat.psi), cp = Math.cos(boat.psi);
  const hl = spec.LWL * 0.42, hb = spec.B * 0.42;
  const fx = sp, fz = cp, px = cp, pz = -sp;
  const hB = waves.height(boat.x + fx * hl, boat.z + fz * hl, t);
  const hS = waves.height(boat.x - fx * hl, boat.z - fz * hl, t);
  const hP = waves.height(boat.x + px * hb, boat.z + pz * hb, t);
  const hR = waves.height(boat.x - px * hb, boat.z - pz * hb, t);
  const k = 1 - Math.exp(-dt * ({ skiff: 7, cruiser: 3.5, ocean: 2.2 }[spec.id]));
  const hump = Math.exp(-(((boat.Fn - 0.55) / 0.14) ** 2));
  const plane = boat.planing;
  const targetHeave = (hB + hS + hP + hR) / 4 + plane * 0.07 * spec.L / 4.5 - (boat.capsized ? 0.3 : 0) - hump * 0.03;
  const targetPitch = Math.atan2(hB - hS, 2 * hl) + hump * (spec.planing ? 5.5 : 2.5) * DEG + plane * 1.2 * DEG - clamp(boat.driveForce / (spec.mass * 9.81), 0, 0.2) * 0.1;
  const targetRoll = Math.atan2(hP - hR, 2 * hb);
  vis.heave += (targetHeave - vis.heave) * k;
  const prevPitch = vis.pitch;
  vis.pitch += (targetPitch - vis.pitch) * k;
  vis.roll += (targetRoll - vis.roll) * k;
  env.rollForce = 0;
  model.root.position.set(boat.x, vis.heave, boat.z);
  model.root.rotation.y = boat.psi;
  model.tilt.rotation.x = -vis.pitch;
  model.tilt.rotation.z = -(boat.phi - vis.roll * 0.8);
  model.update(boat, t);
  windex.rotation.y = boat.awa;

  // brázda
  const stern = { x: boat.x - fx * spec.L * 0.5, z: boat.z - fz * spec.L * 0.5 };
  wake.update(dt, stern, boat.psi, Math.hypot(boat.u, boat.v), spec.B, waves, t, spec.id === 'ocean' ? 22 : 16);
  wake.mat.uniforms.uTime.value = t;

  // spršky
  const spd = Math.hypot(boat.u, boat.v);
  const slam = Math.max(0, (prevPitch - vis.pitch) / Math.max(dt, 1e-3)) * spd;
  let rate = (plane * spd * 6 + slam * 8 + (spd > 3 ? (spd - 3) * 2 : 0)) * (spec.id === 'skiff' ? 1 : 1.6);
  if (boat.capsized) rate = 0;
  const bowX = boat.x + fx * spec.L * 0.32, bowZ = boat.z + fz * spec.L * 0.32;
  let nEmit = Math.min(30, Math.floor(rate * dt * 10 + Math.random()));
  const w = wind.at(boat.x, boat.z, t);
  const wX = -Math.sin(w.from) * w.spd, wZ = -Math.cos(w.from) * w.spd;
  while (nEmit-- > 0) {
    const side = Math.random() < 0.5 ? 1 : -1;
    const out = 1.2 + spd * 0.25;
    spray.emit(bowX + px * side * spec.B * 0.3, vis.heave + 0.2, bowZ + pz * side * spec.B * 0.3,
      px * side * out + fx * spd * 0.6, 1.2 + spd * 0.25, pz * side * out + fz * spd * 0.6, 1.2);
  }
  spray.mat.uniforms.uSize.value = 60 * window.innerHeight / 900 * (spec.id === 'skiff' ? 1 : 1.8);
  spray.update(dt, wX, wZ);

  // trail na minimapě
  vis.trailAcc += dt;
  if (vis.trailAcc > 1) { vis.trailAcc = 0; vis.trail.push([boat.x, boat.z]); if (vis.trail.length > 400) vis.trail.shift(); }

  // bóje se houpou
  for (const b of race.buoys) {
    b.mesh.position.y = waves.height(b.x, b.z, t) - 0.3;
    b.mesh.userData.flag.rotation.y = w.from + Math.PI / 2 + Math.sin(t * 6) * 0.15;
  }
}

function updateCamera(dt) {
  const top = spec.mast.top;
  const lookH = top * 0.3;
  const k = cam.init ? 1 : 1 - Math.exp(-dt * 4);
  const bx = boat.x, bz = boat.z, by = vis.heave;
  const mode = S.camMode;
  let px, py, pz, lx = bx, ly = by + lookH, lz = bz;
  if (mode === 0 || mode === 1) {
    const base = mode === 0 ? boat.psi + Math.PI : 0;
    const a = base + cam.yaw;
    const dist = cam.dist * (camera.aspect < 1 ? 1.25 / Math.max(0.45, camera.aspect) : 1);
    const horiz = dist * Math.cos(cam.pitch);
    px = bx + Math.sin(a) * horiz; pz = bz + Math.cos(a) * horiz;
    py = by + lookH * 0.6 + dist * Math.sin(cam.pitch);
  } else if (mode === 2) {
    // pohled kormidelníka
    const helmLocal = new THREE.Vector3(spec.id === 'ocean' ? 0 : -0.25 * spec.B, spec.deck + 1.25, spec.rudder.x + (spec.id === 'ocean' ? 0.2 : 1.0));
    model.tilt.updateWorldMatrix(true, false);
    helmLocal.applyMatrix4(model.tilt.matrixWorld);
    px = helmLocal.x; py = helmLocal.y; pz = helmLocal.z;
    const a = boat.psi + cam.yaw * 1.2;
    lx = px + Math.sin(a) * 20; lz = pz + Math.cos(a) * 20; ly = py + 1.5 - (cam.pitch - 0.22) * 20;
    camera.position.set(px, py, pz);
    camera.up.set(0, 1, 0);
    camera.lookAt(lx, ly, lz);
    cam.init = false;
    return;
  } else if (mode === 3) {
    const h = cam.dist * 2.8;
    px = bx + Math.sin(boat.psi + Math.PI) * h * 0.08; pz = bz + Math.cos(boat.psi + Math.PI) * h * 0.08; py = by + h;
    ly = by;
  } else {
    // filmová kamera – statická pozice, kterou loď míjí
    if (cam.init || Math.hypot(cam.cine.x - bx, cam.cine.z - bz) > spec.L * 22) {
      const a = boat.psi + (Math.random() < 0.5 ? 0.5 : -0.5);
      const d = spec.L * 12;
      cam.cine.set(bx + Math.sin(a) * d, 0, bz + Math.cos(a) * d);
    }
    px = cam.cine.x; pz = cam.cine.z;
    py = Math.max(waves.height(px, pz, env.t) + 1.5, 1.5) + spec.L * 0.15;
    cam.pos.set(px, py, pz);
    cam.look.lerp(tmpV.set(lx, ly, lz), cam.init ? 1 : 1 - Math.exp(-dt * 6));
    camera.position.copy(cam.pos);
    camera.lookAt(cam.look);
    cam.init = false;
    return;
  }
  // nepodlézt pod hladinu
  const wh = waves.height(px, pz, env.t);
  py = Math.max(py, wh + 0.8);
  tmpV.set(px, py, pz);
  if (cam.init) cam.pos.copy(tmpV); else cam.pos.lerp(tmpV, k);
  tmpV2.set(lx, ly, lz);
  if (cam.init) cam.look.copy(tmpV2); else cam.look.lerp(tmpV2, 1 - Math.exp(-dt * 8));
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
  cam.init = false;
}

function updateEnvironment(dt, t) {
  ocean.uniforms.uTime.value = t;
  ocean.uniforms.uCamPos.value.copy(camera.position);
  const step = 1.0;
  ocean.mesh.position.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
  sky.mesh.position.copy(camera.position);
  sky.uniforms.uTime.value = t;
  // slunce a stíny sledují loď
  const center = boat ? tmpV.set(boat.x, 0, boat.z) : tmpV.set(0, 0, 0);
  const d = sun.userData.dir || new THREE.Vector3(0, 1, 0);
  const dist = spec ? spec.mast.top * 3 : 50;
  sun.position.copy(center).addScaledVector(d, dist);
  sun.target.position.copy(center);
  // blesky
  if (weather.lightning) {
    vis.nextBolt -= dt;
    if (vis.nextBolt <= 0) { vis.flash = 1; vis.nextBolt = 6 + Math.random() * 14; audio.thunder(0.6 + Math.random() * 2.5); }
  }
  vis.flash = Math.max(0, vis.flash - dt * 2.2);
  const fl = vis.flash > 0 ? vis.flash * (0.6 + 0.4 * Math.sin(t * 60)) : 0;
  sky.uniforms.uFlash.value = fl * 0.8;
  ocean.uniforms.uFlash.value = fl * 0.5;
  hemi.intensity = weather.sky.ambient * 1.3 + fl * 3;
  // déšť
  if (rain.mesh.visible) {
    rain.mat.uniforms.uTime.value = t;
    rain.mat.uniforms.uCenter.value.copy(camera.position);
    const w = boat ? wind.at(boat.x, boat.z, t) : { spd: 10, from: 0 };
    rain.mat.uniforms.uWind.value.set(-Math.sin(w.from) * w.spd, -Math.cos(w.from) * w.spd);
  }
}

// pozadí menu – loď kotví a kamera krouží
function menuScene(dt) {
  menuT += dt;
  if (!spec) {
    spec = BOATS[S.boatId];
    boat = createBoatState(spec);
    model = createBoatModel(spec); scene.add(model.root);
    windex = new THREE.Group(); model.tilt.add(windex);
    applyWeather(WEATHER[S.weatherId]);
    boat.psi = -100 * DEG; boat.u = 0;
    stepBoat(boat, spec, env, 0.001);
    for (let i = 0; i < 40; i++) autoTrim(spec, boat, 0.2);
    setShadowBounds();
  }
  env.t += dt;
  updateVisuals(dt, env.t);
  const a = menuT * 0.08;
  const d = spec.L * 3.2;
  camera.position.set(boat.x + Math.sin(a) * d, spec.mast.top * 0.45, boat.z + Math.cos(a) * d);
  camera.lookAt(boat.x, spec.mast.top * 0.35, boat.z);
  cam.init = true;
}

function hud() {
  const spd = Math.hypot(boat.u, boat.v);
  vis.maxSpd = Math.max(vis.maxSpd, boat.u * KN);
  const flap = Math.max(...Object.values(boat.sailInfo).map((s) => s.flap || 0), 0);
  audio.update(boat.aws, spd, flap, weather.rain);
  updateHUD(boat, spec, { maxSpd: vis.maxSpd, pos: pointOfSail(boat.twa / DEG), race, markRadius: race.active ? markRadius() : 0, autoTrim: S.autoTrim });
  drawMinimap(boat, spec, race, islands, vis.trail, wind.dirAt(boat.x, boat.z, env.t));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!S.running) {
    menuScene(dt);
  } else if (!S.paused) {
    controls(dt);
    physics(dt);
    updateRace(dt);
    updateVisuals(dt, env.t);
    updateCamera(dt);
    hud();
  } else {
    updateCamera(0);
    audio.update(0, 0, 0, 0);
  }
  updateEnvironment(dt, env.t);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ladicí rozhraní (konzole): __sail.advance(10) posune simulaci o 10 s
window.__sail = {
  S, get boat() { return boat; }, get spec() { return spec; }, startGame, wind, waves, renderer, scene, camera,
  advance(sec, dt = 1 / 60) {
    for (let t = 0; t < sec; t += dt) { controls(dt); physics(dt); updateRace(dt); updateVisuals(dt, env.t); }
    updateCamera(1); hud(); updateEnvironment(0, env.t); renderer.render(scene, camera);
  },
  timeRender() { const t0 = performance.now(); renderer.render(scene, camera); renderer.getContext().finish(); return performance.now() - t0; },
};

return { fmtTime };
})();
})().catch((e) => { console.error(e); alert('Nepodařilo se spustit simulátor: ' + e.message); });
