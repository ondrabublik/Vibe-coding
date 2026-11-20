// Fyzika plachetnice – čistý JS bez závislosti na three.js
// Souřadnice lodi: u = vpřed, v = vlevo (levobok), r = úhlová rychlost (+ = otáčení doleva),
// phi = náklon (+ = stěžeň padá na levobok). Svět: x/z vodorovně, kurz psi: vpřed = (sin psi, cos psi).

export const RHO_A = 1.225, RHO_W = 1025, G = 9.81;
export const DEG = Math.PI / 180;
export const KN = 1.943844; // m/s -> uzly

export const wrap = (a) => { a = (a + Math.PI) % (2 * Math.PI); if (a < 0) a += 2 * Math.PI; return a - Math.PI; };
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---------- aerodynamické / hydrodynamické koeficienty ----------
export function sailCoef(clMax, aPeak, cd0) {
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

export function foilCoef(AR) {
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
export function createBoatState(spec) {
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

export function activeSails(spec, b) {
  return spec.sails.filter((s) => (s.kind === 'spin' ? b.spinUp : s.kind === 'jib' ? !b.spinUp || !spec.spinReplacesJib : true));
}

const tmp = { fx: 0, fy: 0, a: 0, cl: 0, cd: 0, rev: false };

// automatický trim: nastaví otěž tak, aby úhel náběhu byl optimální
export function autoTrim(spec, b, dt = 1 / 60) {
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

export function reefFactor(spec, b) { return [1, 0.72, 0.5][b.reef] ?? 1; }

// ---------- jeden krok simulace ----------
export function stepBoat(b, spec, env, dt) {
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
export function pointOfSail(twaDeg) {
  const a = Math.abs(twaDeg);
  if (a < 32) return 'Proti větru (v ochraně)';
  if (a < 55) return 'Na ostro';
  if (a < 78) return 'Ostrý bočák';
  if (a < 110) return 'Bočák';
  if (a < 155) return 'Zadobočák';
  return 'Na zadní vítr (zadoňák)';
}
