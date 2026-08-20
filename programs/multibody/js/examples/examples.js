/*
 * examples.js - knihovna ukázkových mechanismů.
 * Každá položka má id, název, popis a funkci build() vracející model.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var Model = MBD.Model;
  var Ex = {};

  /** Průsečík kružnic (p1, r1) a (p2, r2); sign volí jedno z řešení. */
  function circleIntersect(p1, r1, p2, r2, sign) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1];
    var d = Math.hypot(dx, dy);
    var a = (d * d + r1 * r1 - r2 * r2) / (2 * d);
    var h2 = r1 * r1 - a * a;
    var h = h2 > 0 ? Math.sqrt(h2) : 0;
    var ex = dx / d, ey = dy / d;
    return [
      p1[0] + a * ex + sign * h * (-ey),
      p1[1] + a * ey + sign * h * ex
    ];
  }

  Ex.list = [
    {
      id: 'pendulum',
      name: 'Kyvadlo (1 tyč)',
      description: 'Nejjednodušší případ: tyč otočně uložená v rámu, volný pohyb v tíhovém poli.',
      build: function () {
        var m = Model.create('Kyvadlo');
        var rod = Model.addRod(m, [0, 0], [0.6, 0], { name: 'Tyč' });
        Model.addRevolute(m, 'ground', rod.id, [0, 0], { name: 'A – rám/tyč' });
        m.sim.tEnd = 3;
        return m;
      }
    },
    {
      id: 'double-pendulum',
      name: 'Dvojité kyvadlo',
      description: 'Dvě tyče v řadě, volná dynamika (chaotický pohyb). Vhodné pro kontrolu energie.',
      build: function () {
        var m = Model.create('Dvojité kyvadlo');
        var r1 = Model.addRod(m, [0, 0], [0.5, 0], { name: 'Tyč 1' });
        var r2 = Model.addRod(m, [0.5, 0], [0.9, 0], { name: 'Tyč 2' });
        Model.addRevolute(m, 'ground', r1.id, [0, 0], { name: 'A – rám/tyč 1' });
        Model.addRevolute(m, r1.id, r2.id, [0.5, 0], { name: 'B – tyč 1/tyč 2' });
        m.sim.tEnd = 4;
        return m;
      }
    },
    {
      id: 'fourbar',
      name: 'Kloubový čtyřúhelník',
      description: 'Klasický čtyřčlenný mechanismus s pohonem na kliku (ω = 10 rad/s).',
      build: function () {
        var A = [0, 0], D = [0.8, 0];
        var rCrank = 0.25, lCoupler = 0.7, lRocker = 0.4;
        var B = [A[0], A[1] + rCrank];
        var Cp = circleIntersect(B, lCoupler, D, lRocker, 1);

        var m = Model.create('Kloubový čtyřúhelník');
        var crank = Model.addRod(m, A, B, { name: 'Klika' });
        var coupler = Model.addRod(m, B, Cp, { name: 'Spojovací tyč' });
        var rocker = Model.addRod(m, Cp, D, { name: 'Vahadlo' });

        var j = Model.addRevolute(m, 'ground', crank.id, A, { name: 'A – rám/klika' });
        Model.setDriver(j, { enabled: true, kind: 'rate', rate: 10, expr: '0.5*t*t' });
        Model.addRevolute(m, crank.id, coupler.id, B, { name: 'B – klika/tyč' });
        Model.addRevolute(m, coupler.id, rocker.id, Cp, { name: 'C – tyč/vahadlo' });
        Model.addRevolute(m, 'ground', rocker.id, D, { name: 'D – rám/vahadlo' });
        m.sim.tEnd = 1.5;
        return m;
      }
    },
    {
      id: 'slider-crank',
      name: 'Klikový mechanismus',
      description: 'Klika + ojnice + objímka (píst) v posuvné vazbě s rámem, pohon ω = 20 rad/s ' +
        'a odporová síla na pístu.',
      build: function () {
        var r = 0.15, L = 0.4, ang = 60 * Math.PI / 180;
        var O = [0, 0];
        var A = [r * Math.cos(ang), r * Math.sin(ang)];
        var B = [A[0] + Math.sqrt(L * L - A[1] * A[1]), 0];

        var m = Model.create('Klikový mechanismus');
        var crank = Model.addRod(m, O, A, { name: 'Klika' });
        var conrod = Model.addRod(m, A, B, { name: 'Ojnice' });
        var piston = Model.addSlider(m, B, { name: 'Píst (objímka)', phi: 0, mass: 0.6 });

        var j = Model.addRevolute(m, 'ground', crank.id, O, { name: 'O – rám/klika' });
        Model.setDriver(j, { enabled: true, kind: 'rate', rate: 20, expr: '0.5*t*t' });
        Model.addRevolute(m, crank.id, conrod.id, A, { name: 'A – klika/ojnice' });
        Model.addRevolute(m, conrod.id, piston.id, B, { name: 'B – ojnice/píst' });
        Model.addPrismatic(m, 'ground', piston.id, [1, 0], { name: 'Vedení pístu' });
        Model.addForce(m, piston.id, [0, 0], [-300, 0], { name: 'Odporová síla' });
        m.sim.tEnd = 0.8;
        m.sim.h = 0.001;
        return m;
      }
    },
    {
      id: 'yoke',
      name: 'Kulisový mechanismus',
      description: 'Objímka na konci kliky klouže v kulise (vahadle) – ukázka posuvné vazby ' +
        'mezi dvěma pohyblivými tělesy.',
      build: function () {
        var O1 = [0, 0], O2 = [0, -0.25];
        var r = 0.12;
        var A = [0, r];
        var m = Model.create('Kulisový mechanismus');

        var crank = Model.addRod(m, O1, A, { name: 'Klika' });
        var rocker = Model.addRod(m, [0, -0.25], [0, 0.35], { name: 'Kulisa' });
        var collar = Model.addSlider(m, A, { name: 'Objímka', phi: Math.PI / 2, mass: 0.25 });

        var j = Model.addRevolute(m, 'ground', crank.id, O1, { name: 'O1 – rám/klika' });
        Model.setDriver(j, { enabled: true, kind: 'rate', rate: 8, expr: '0.5*t*t' });
        Model.addRevolute(m, crank.id, collar.id, A, { name: 'A – klika/objímka' });
        Model.addRevolute(m, 'ground', rocker.id, O2, { name: 'O2 – rám/kulisa' });
        Model.addPrismatic(m, rocker.id, collar.id, [0, 1], { name: 'Vedení v kulise' });
        m.sim.tEnd = 1.6;
        return m;
      }
    },
    {
      id: 'torque-arm',
      name: 'Rameno s momentem',
      description: 'Tyč v rámu poháněná zadaným momentem – ukázka dynamické (ne kinematické) úlohy.',
      build: function () {
        var m = Model.create('Rameno s momentem');
        var rod = Model.addRod(m, [0, 0], [0.5, 0], { name: 'Rameno', lineDensity: 3 });
        Model.addRevolute(m, 'ground', rod.id, [0, 0], { name: 'A – rám/rameno' });
        Model.addTorque(m, rod.id, 6, { name: 'Hnací moment', mode: 'expr', expr: '6*sin(3*t)' });
        m.sim.tEnd = 4;
        return m;
      }
    }
  ];

  Ex.byId = function (id) {
    for (var i = 0; i < Ex.list.length; i++) if (Ex.list[i].id === id) return Ex.list[i];
    return null;
  };

  Ex.build = function (id) {
    var e = Ex.byId(id);
    return e ? e.build() : null;
  };

  MBD.Examples = Ex;
})(typeof globalThis !== 'undefined' ? globalThis : this);
