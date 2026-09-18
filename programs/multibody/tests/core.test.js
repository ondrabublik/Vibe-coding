/*
 * Numerické testy výpočetního jádra (spuštění: node tests/core.test.js).
 * Ověřuje se proti analytickým řešením a proti zákonu zachování energie.
 */
require('../js/core/linalg.js');
require('../js/core/model.js');
require('../js/core/constraints.js');
require('../js/core/system.js');
require('../js/core/dynamics.js');
require('../js/core/analysis.js');
require('../js/core/simulation.js');
require('../js/examples/examples.js');

var M = globalThis.MBD;
var pass = 0, fail = 0;

function check(name, got, expected, tol) {
  var ok = Math.abs(got - expected) <= tol;
  if (ok) { pass++; console.log('  OK   ' + name + '  = ' + fmt(got)); }
  else { fail++; console.log('  FAIL ' + name + '  = ' + fmt(got) + ' (očekáváno ' + fmt(expected) + ' ± ' + tol + ')'); }
}
function assert(name, cond, info) {
  if (cond) { pass++; console.log('  OK   ' + name + (info ? '  ' + info : '')); }
  else { fail++; console.log('  FAIL ' + name + (info ? '  ' + info : '')); }
}
function fmt(v) { return (Math.abs(v) < 1e-4 && v !== 0) ? v.toExponential(3) : v.toFixed(6); }
function sig(run, key) {
  var s = run.result.signals.filter(function (x) { return x.key === key; });
  if (!s.length) s = run.result.signals.filter(function (x) { return x.key.slice(-key.length) === key; });
  if (!s.length) throw new Error('signál nenalezen: ' + key);
  return s[0].data;
}

// --------------------------------------------------------------------- 1. kyvadlo
console.log('\n[1] Tyč otočně uložená v rámu (vodorovná, z klidu)');
{
  var L = 0.6, rho = 2, g = 9.81;
  var m = M.Model.create();
  var rod = M.Model.addRod(m, [0, 0], [L, 0], { lineDensity: rho });
  M.Model.addRevolute(m, 'ground', rod.id, [0, 0]);
  m.sim.tEnd = 0.5; m.sim.h = 0.0005; m.sim.recordEvery = 1;

  var run = M.Simulation.prepare(m);
  assert('sestavení proběhlo', run.assembly.converged);
  check('stupně volnosti', run.dof.dof, 1, 0);

  var sys = run.sys;
  var res = M.Dynamics.solve(sys, run.q, run.qd, 0, run.opts);
  var reac = M.Dynamics.reactions(sys, res.lambda);
  var mass = rho * L;

  check('α(0) = -3g/(2L)', res.qdd[2], -3 * g / (2 * L), 1e-8);
  check('a_y těžiště = -3g/4', res.qdd[1], -0.75 * g, 1e-8);
  check('reakce R_y = m*g/4', reac[0].onB[1], mass * g / 4, 1e-8);
  check('reakce R_x = 0', reac[0].onB[0], 0, 1e-10);
  check('moment k čepu = 0', reac[0].Mpoint, 0, 1e-10);
}

// ------------------------------------------------------- 2. zachování energie
console.log('\n[2] Dvojité kyvadlo – zachování energie');
{
  var m2 = M.Examples.build('double-pendulum');
  m2.sim.tEnd = 3; m2.sim.h = 0.0005; m2.sim.recordEvery = 20;
  var run2 = M.Simulation.runSync(m2);
  assert('běh bez chyby', !run2.error, run2.error || '');
  var E = sig(run2, 'system/E');
  var e0 = E[0], emax = 0;
  for (var i = 0; i < E.length; i++) emax = Math.max(emax, Math.abs(E[i] - e0));
  var span = Math.max.apply(null, sig(run2, 'system/Ep').map(Math.abs)) + 1e-9;
  assert('relativní drift energie < 0.1 %', emax / span < 1e-3,
    '(' + (100 * emax / span).toFixed(4) + ' %)');
  var viol = sig(run2, 'system/viol');
  assert('porušení vazeb < 1e-9', Math.max.apply(null, viol.map(Math.abs)) < 1e-9,
    '(' + Math.max.apply(null, viol.map(Math.abs)).toExponential(2) + ')');
}

// --------------------------------------------- 3. předepsaná úhlová rychlost
console.log('\n[3] Předepsaná úhlová rychlost – hnací moment');
{
  var L3 = 0.6, rho3 = 2, g3 = 9.81, w = 4;
  var m3 = M.Model.create();
  var rod3 = M.Model.addRod(m3, [0, 0], [L3, 0], { lineDensity: rho3 });
  var j3 = M.Model.addRevolute(m3, 'ground', rod3.id, [0, 0]);
  M.Model.setDriver(j3, { enabled: true, kind: 'rate', rate: w });
  m3.sim.tEnd = 1; m3.sim.h = 0.001; m3.sim.recordEvery = 1;

  var run3 = M.Simulation.prepare(m3);
  check('stupně volnosti (plně poháněno)', run3.dof.dof, 0, 0);
  M.Simulation.advance(run3, run3.totalSteps + 1);
  assert('běh bez chyby', !run3.error, run3.error || '');

  var mass3 = rho3 * L3;
  var Md = sig(run3, '/Md');
  var phi = sig(run3, '/phi');
  var om = sig(run3, '/omega');
  check('ω je konstantní', om[Math.floor(om.length / 2)], w, 1e-9);
  check('hnací moment M(0) = m*g*L/2', Md[0], mass3 * g3 * L3 / 2, 1e-6);
  // analyticky M = m*g*(L/2)*cos(phi) pro konstantní ω
  var worst = 0;
  for (i = 0; i < Md.length; i++) {
    var an = mass3 * g3 * (L3 / 2) * Math.cos(phi[i] * Math.PI / 180);
    worst = Math.max(worst, Math.abs(Md[i] - an));
  }
  assert('M(t) = m*g*(L/2)*cos(φ) v celém průběhu', worst < 1e-5, '(max odchylka ' + worst.toExponential(2) + ')');
  check('φ(1 s) = ω*t [°]', phi[phi.length - 1], w * 180 / Math.PI, 1e-6);
}

// ------------------------------------------------------ 4. kloubový čtyřúhelník
console.log('\n[4] Kloubový čtyřúhelník – uzavřenost smyčky a rychlosti');
{
  var m4 = M.Examples.build('fourbar');
  m4.sim.h = 0.0005; m4.sim.recordEvery = 10;
  var run4 = M.Simulation.runSync(m4);
  assert('běh bez chyby', !run4.error, run4.error || '');
  check('stupně volnosti', run4.dof.dof, 0, 0);
  check('pohyblivost bez pohonu', run4.dof.mobility, 1, 0);
  var viol4 = sig(run4, 'system/viol');
  assert('smyčka uzavřená (< 1e-9)', Math.max.apply(null, viol4.map(Math.abs)) < 1e-9);

  // rychlost vs. numerická derivace polohy
  var b = run4.sys.bodies[2];               // spojovací tyč
  var x = sig(run4, b.id + '/x'), vx = sig(run4, b.id + '/vx');
  var t = run4.result.times;
  var worst4 = 0, scale4 = 0;
  for (i = 1; i < x.length - 1; i++) {
    var num = (x[i + 1] - x[i - 1]) / (t[i + 1] - t[i - 1]);
    worst4 = Math.max(worst4, Math.abs(num - vx[i]));
    scale4 = Math.max(scale4, Math.abs(vx[i]));
  }
  assert('v_x odpovídá derivaci x', worst4 / scale4 < 1e-3,
    '(rel. odchylka ' + (worst4 / scale4).toExponential(2) + ')');
}

// ----------------------------------------------------- 5. klikový mechanismus
console.log('\n[5] Klikový mechanismus – poloha pístu analyticky, výkonová rovnováha');
{
  var m5 = M.Examples.build('slider-crank');
  m5.sim.h = 0.0005; m5.sim.recordEvery = 4;
  var run5 = M.Simulation.runSync(m5);
  assert('běh bez chyby', !run5.error, run5.error || '');
  check('stupně volnosti', run5.dof.dof, 0, 0);

  var piston = run5.sys.bodies[3];
  var xp = sig(run5, piston.id + '/x');
  var t5 = run5.result.times;
  var r = 0.15, Lc = 0.4, th0 = Math.PI / 3, w5 = 20;
  var worst5 = 0;
  for (i = 0; i < xp.length; i++) {
    var th = th0 + w5 * t5[i];
    var an5 = r * Math.cos(th) + Math.sqrt(Lc * Lc - Math.pow(r * Math.sin(th), 2));
    worst5 = Math.max(worst5, Math.abs(xp[i] - an5));
  }
  assert('poloha pístu = analytické řešení', worst5 < 1e-8, '(max odchylka ' + worst5.toExponential(2) + ')');

  // výkonová rovnováha: P_pohon + P_tíže + P_síla = dE_kin/dt
  var Md5 = sig(run5, '/Md');
  var Ek = sig(run5, 'system/Ek'), Ep = sig(run5, 'system/Ep');
  var vxp = sig(run5, piston.id + '/vx');
  var worstP = 0, scaleP = 0;
  for (i = 1; i < Md5.length - 1; i++) {
    var dt = t5[i + 1] - t5[i - 1];
    var dE = (Ek[i + 1] + Ep[i + 1] - Ek[i - 1] - Ep[i - 1]) / dt;
    var P = Md5[i] * w5 + (-300) * vxp[i];
    worstP = Math.max(worstP, Math.abs(P - dE));
    scaleP = Math.max(scaleP, Math.abs(P));
  }
  assert('výkonová rovnováha', worstP / scaleP < 2e-3,
    '(rel. odchylka ' + (worstP / scaleP).toExponential(2) + ')');
}

// --------------------------------------------------- 6. kulisový mechanismus
console.log('\n[6] Kulisový mechanismus – posuvná vazba mezi dvěma tělesy');
{
  var m6 = M.Examples.build('yoke');
  m6.sim.h = 0.0005; m6.sim.recordEvery = 10;
  var run6 = M.Simulation.runSync(m6);
  assert('běh bez chyby', !run6.error, run6.error || '');
  check('stupně volnosti', run6.dof.dof, 0, 0);
  var viol6 = sig(run6, 'system/viol');
  assert('vazby splněny (< 1e-9)', Math.max.apply(null, viol6.map(Math.abs)) < 1e-9);

  // úhel kulisy analyticky: tan(theta) = r*sin(th)/(r*cos(th)+0.25)
  var rocker = run6.sys.bodies[2];
  var phi6 = sig(run6, rocker.id + '/phi');
  var t6 = run6.result.times;
  var worst6 = 0;
  for (i = 0; i < phi6.length; i++) {
    var th6 = Math.PI / 2 + 8 * t6[i];
    var an6 = Math.atan2(0.12 * Math.sin(th6) + 0.25, 0.12 * Math.cos(th6)) * 180 / Math.PI;
    var d6 = ((phi6[i] - an6 + 540) % 360) - 180;
    worst6 = Math.max(worst6, Math.abs(d6));
  }
  assert('úhel kulisy = analytické řešení', worst6 < 1e-6, '(max odchylka ' + worst6.toExponential(2) + ' °)');
}

// --------------------------------------- 7. interaktivní kinematika (tažení)
console.log('\n[7] Kinematika – tažení bodu při zachování vazeb');
{
  var L7 = 0.6;
  var m7 = M.Model.create();
  var rod7 = M.Model.addRod(m7, [0, 0], [L7, 0]);
  M.Model.addRevolute(m7, 'ground', rod7.id, [0, 0]);
  var sys7 = M.System.build(m7, { skipDrivers: true });
  var st7 = M.System.stateFromModel(sys7);
  var ia7 = sys7.index[rod7.id];
  var r7 = M.Analysis.followPoint(sys7, st7.q, ia7, [L7 / 2, 0], [0, L7]);
  M.System.stateToModel(sys7, st7.q);
  assert('kyvadlo: sestavení konvergovalo', r7.converged, 'zbytek ' + r7.residual);
  check('kyvadlo: |COM| = L/2', Math.hypot(rod7.x, rod7.y), L7 / 2, 1e-8);
  var pEnd7 = M.Model.toGlobal(rod7, [L7 / 2, 0]);
  check('kyvadlo: volný konec na svislici x', pEnd7[0], 0, 1e-7);
  check('kyvadlo: volný konec na svislici y', pEnd7[1], L7, 1e-7);
  var pA7 = M.Model.toGlobal(rod7, [-L7 / 2, 0]);
  check('kyvadlo: čep zůstává v počátku', Math.hypot(pA7[0], pA7[1]), 0, 1e-9);

  var m7b = M.Examples.build('fourbar');
  var sys7b = M.System.build(m7b, { skipDrivers: true });
  var st7b = M.System.stateFromModel(sys7b);
  var dof7 = M.Analysis.dofAnalysis(sys7b, st7b.q, 0);
  check('čtyřúhelník bez pohonů: 1 DOF', dof7.dof, 1, 0);
  var crank7 = m7b.bodies[1];
  var coupler7 = m7b.bodies[2];
  var rocker7 = m7b.bodies[3];
  var phiC0 = crank7.phi, coup0 = [coupler7.x, coupler7.y], rock0 = [rocker7.x, rocker7.y];
  var sB = [crank7.L / 2, 0];
  var pB0 = M.Model.toGlobal(crank7, sB);
  var r7b = M.Analysis.followPoint(sys7b, st7b.q, sys7b.index[crank7.id], sB,
    [pB0[0] + 0.12, pB0[1] - 0.08]);
  M.System.stateToModel(sys7b, st7b.q);
  assert('čtyřúhelník: konvergovalo', r7b.converged && r7b.residual < 1e-9,
    'zbytek ' + r7b.residual);
  assert('klika se pootočila', Math.abs(crank7.phi - phiC0) > 0.15,
    'Δφ=' + (crank7.phi - phiC0).toFixed(4));
  assert('spojovací tyč se pohnula', Math.hypot(coupler7.x - coup0[0], coupler7.y - coup0[1]) > 0.02);
  assert('vahadlo se pohnulo', Math.hypot(rocker7.x - rock0[0], rocker7.y - rock0[1]) > 0.02);
  var maxJ = 0;
  m7b.joints.forEach(function (j) {
    var A = M.Model.bodyById(m7b, j.bodyA), B = M.Model.bodyById(m7b, j.bodyB);
    var pa = M.Model.toGlobal(A, j.sA), pb = M.Model.toGlobal(B, j.sB);
    maxJ = Math.max(maxJ, Math.hypot(pa[0] - pb[0], pa[1] - pb[1]));
  });
  assert('čepy zůstávají splynuté', maxJ < 1e-8, 'max ' + maxJ.toExponential(2));
}

// --------------------------------------------- 8. valivá vazba dvou kotoučů
console.log('\n[8] Valivá vazba (1 DOF) – převod úhlů a připojení tyče mimo střed');
{
  var m8 = M.Model.create();
  m8.gravity.enabled = false;
  var r1 = 0.15, r2 = 0.1;
  var d1 = M.Model.addDisk(m8, [0, 0], { radius: r1, mass: 2 });
  var d2 = M.Model.addDisk(m8, [r1 + r2, 0], { radius: r2, mass: 1 });
  var pin8 = M.Model.addRevolute(m8, 'ground', d1.id, [0, 0]);
  M.Model.addRevolute(m8, 'ground', d2.id, [r1 + r2, 0]);
  M.Model.setDriver(pin8, { enabled: true, kind: 'rate', rate: 4 });
  M.Model.addRolling(m8, d1.id, d2.id, { side: 'external' });
  var attach8 = [0.08, 0.05];
  var rod8 = M.Model.addRod(m8, attach8, [0.4, 0.05], { lineDensity: 1 });
  M.Model.addRevolute(m8, d1.id, rod8.id, attach8);
  assert('čep tyče mimo střed', Math.hypot(attach8[0], attach8[1]) > 0.02);

  m8.sim.tEnd = 1.5; m8.sim.h = 0.0005; m8.sim.recordEvery = 10;
  var run8 = M.Simulation.runSync(m8);
  assert('běh bez chyby', !run8.error, run8.error || '');
  check('stupně volnosti', run8.dof.dof, 1, 0); // kyv volného konce tyče
  check('valivá vazba: 1 rovnice', run8.sys.groups.filter(function (g) {
    return g.type === 'rolling' && g.kind === 'joint';
  })[0].size, 1, 0);
  var viol8 = sig(run8, 'system/viol');
  assert('vazby splněny (< 1e-8)', Math.max.apply(null, viol8.map(Math.abs)) < 1e-8,
    '(' + Math.max.apply(null, viol8.map(Math.abs)).toExponential(2) + ')');

  var phi1 = sig(run8, d1.id + '/phi');
  var phi2 = sig(run8, d2.id + '/phi');
  // pevné středy ⇒ r1 Δφ1 + r2 Δφ2 ≈ 0
  var mid = Math.floor(phi1.length / 2);
  var dphi1 = (phi1[mid] - phi1[0]) * Math.PI / 180;
  var dphi2 = (phi2[mid] - phi2[0]) * Math.PI / 180;
  check('převod r1 Δφ1 + r2 Δφ2 ≈ 0', r1 * dphi1 + r2 * dphi2, 0, 1e-5);

  var jPin = m8.joints[m8.joints.length - 1];
  assert('lokální bod čepu uvnitř kotouče',
    Math.hypot(jPin.sA[0], jPin.sA[1]) <= r1 + 1e-9);
  var pa = M.Model.toGlobal(d1, jPin.sA);
  var pb = M.Model.toGlobal(rod8, jPin.sB);
  assert('čep tyče splynutý po běhu', Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) < 1e-7);
}

// ------------------------------------------------------- 9. pružina
console.log('\n[9] Pružina – kyvadlo a energie');
{
  var m9 = M.Examples.build('spring-pendulum');
  m9.sim.h = 0.0005; m9.sim.recordEvery = 10;
  var run9 = M.Simulation.runSync(m9);
  assert('běh bez chyby', !run9.error, run9.error || '');
  check('stupně volnosti', run9.dof.dof, 1, 0);
  var viol9 = sig(run9, 'system/viol');
  assert('vazby splněny', Math.max.apply(null, viol9.map(Math.abs)) < 1e-9);

  // bez tlumení by se energie téměř zachovala – zde je c>0, energie klesá
  var E9 = sig(run9, 'system/E');
  assert('tlumení snižuje energii', E9[E9.length - 1] < E9[0] - 0.01,
    'E0=' + E9[0].toFixed(3) + ' Eend=' + E9[E9.length - 1].toFixed(3));

  // konzervativní případ: c=0, kontrola driftu energie
  var m9b = M.Model.create();
  var rod9 = M.Model.addRod(m9b, [0, 0], [0.4, 0], { lineDensity: 2 });
  M.Model.addRevolute(m9b, 'ground', rod9.id, [0, 0]);
  var tip9 = M.Model.toGlobal(rod9, [rod9.L / 2, 0]);
  M.Model.addSpring(m9b, rod9.id, 'ground', tip9, [0.5, 0], { k: 50, c: 0, L0: 0.25 });
  m9b.sim.tEnd = 2; m9b.sim.h = 0.0005; m9b.sim.recordEvery = 10;
  var run9b = M.Simulation.runSync(m9b);
  assert('pružina c=0: běh OK', !run9b.error, run9b.error || '');
  var Eb = sig(run9b, 'system/E');
  var e0b = Eb[0], emaxb = 0, spanb = 0;
  for (i = 0; i < Eb.length; i++) {
    emaxb = Math.max(emaxb, Math.abs(Eb[i] - e0b));
    spanb = Math.max(spanb, Math.abs(Eb[i]));
  }
  assert('pružina c=0: drift energie < 0.5 %', emaxb / (spanb + 1e-9) < 5e-3,
    '(' + (100 * emaxb / (spanb + 1e-9)).toFixed(3) + ' %)');
}

// ------------------------------------------ 10. tyč na kotouči + tlumič
console.log('\n[10] Tyč na kotouči (1 DOF) a tlumič');
{
  var m10 = M.Model.create();
  m10.gravity.enabled = true;
  var disk10 = M.Model.addDisk(m10, [0, 0], { radius: 0.12, mass: 1 });
  M.Model.addRevolute(m10, 'ground', disk10.id, [0, 0]);
  var attach10 = [0.06, 0.04];
  var rod10 = M.Model.addRod(m10, attach10, [0.35, 0.04], { lineDensity: 2 });
  M.Model.addRevolute(m10, disk10.id, rod10.id, attach10);
  // jediná rotační vazba disk–tyč ⇒ tyč se může otáčet (ne svar)
  var run10p = M.Simulation.prepare(m10);
  check('kotouč+tyč: pohyblivost', run10p.dof.mobility, 2, 0); // φ disku + φ tyče
  check('kotouč+tyč: DOF', run10p.dof.dof, 2, 0);

  var m10b = M.Model.create();
  var rodD = M.Model.addRod(m10b, [0, 0], [0.4, 0]);
  M.Model.addRevolute(m10b, 'ground', rodD.id, [0, 0]);
  var tipD = M.Model.toGlobal(rodD, [rodD.L / 2, 0]);
  M.Model.addDamper(m10b, rodD.id, 'ground', tipD, [0.5, 0], { c: 8 });
  rodD.omega = 2;
  m10b.sim.tEnd = 1.5; m10b.sim.h = 0.001; m10b.sim.recordEvery = 5;
  var run10d = M.Simulation.runSync(m10b);
  assert('tlumič: běh OK', !run10d.error, run10d.error || '');
  var om = sig(run10d, rodD.id + '/omega');
  assert('tlumič snižuje |ω|', Math.abs(om[om.length - 1]) < Math.abs(om[0]) * 0.9,
    'ω0=' + om[0].toFixed(3) + ' ωend=' + om[om.length - 1].toFixed(3));
}

// -------------------------- 11. čep uprostřed tyče + sdílený čep 3 tyčí
console.log('\n[11] Rotační vazba uprostřed tyče a sdílený čep');
{
  var m11 = M.Model.create();
  m11.gravity.enabled = false;
  var rA = M.Model.addRod(m11, [0, 0], [0.6, 0], { name: 'A' });
  var rB = M.Model.addRod(m11, [0.3, 0], [0.3, 0.4], { name: 'B' });
  // čep uprostřed A (x=0.3) a na konci B
  var mid = [0.3, 0];
  var jMid = M.Model.addRevolute(m11, rA.id, rB.id, mid);
  assert('lokální bod A není konec', Math.abs(jMid.sA[0]) < rA.L / 2 - 0.05);
  M.Model.addRevolute(m11, 'ground', rA.id, [0, 0]);
  var run11 = M.Simulation.prepare(m11);
  check('čep uprostřed: DOF', run11.dof.dof, 2, 0);
  assert('sestavení OK', run11.assembly.converged);

  var m11b = M.Model.create();
  var t1 = M.Model.addRod(m11b, [-0.3, 0], [0, 0]);
  var t2 = M.Model.addRod(m11b, [0, 0], [0.3, 0]);
  var t3 = M.Model.addRod(m11b, [0, 0], [0, 0.3]);
  var jShare = M.Model.addRevolute(m11b, t1.id, t2.id, [0, 0], {
    bodies: [t1.id, t2.id, t3.id], name: 'Sdílený'
  });
  check('sdílený čep: 3 členové', M.Model.revoluteMembers(jShare).length, 3, 0);
  M.Model.addRevolute(m11b, 'ground', t1.id, [-0.3, 0]);
  var run11b = M.Simulation.prepare(m11b);
  assert('sdílený čep: sestavení', run11b.assembly.converged);
  // 3 tyče, ground-t1 (2), shared (4 = 2+2) → nq=9, nc=6, mobility=3
  check('sdílený čep: počet vazbových rovnic', run11b.sys.nc, 6, 0);
  M.System.scatter(run11b.sys, run11b.q, null);
  M.System.evaluateConstraints(run11b.sys, 0);
  assert('sdílený čep: zbytek malý', M.Dynamics.violation(run11b.sys) < 1e-10);
}

console.log('\n=== ' + pass + ' OK, ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
