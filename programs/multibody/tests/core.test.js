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

console.log('\n=== ' + pass + ' OK, ' + fail + ' FAIL ===');
process.exit(fail ? 1 : 0);
