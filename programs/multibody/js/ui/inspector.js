/*
 * inspector.js - panely vlastností, nastavení analýzy a stavu soustavy.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var D = MBD.Dom;
  var Model = MBD.Model;
  var I = {};

  var DEG = 180 / Math.PI;

  // ------------------------------------------------------------- vlastnosti

  I.renderProperties = function (container, app) {
    D.clear(container);
    var sel = app.selection;

    if (sel.length === 0) {
      container.appendChild(D.el('div', { class: 'empty', text: 'Nic není vybráno. Klikněte na těleso, vazbu nebo zatížení.' }));
      container.appendChild(modelForm(app));
      return;
    }
    if (sel.length > 1) {
      container.appendChild(D.el('div', { class: 'hint', text: 'Vybráno prvků: ' + sel.length }));
      container.appendChild(D.el('div', { class: 'btnrow' }, [
        btn('Smazat vybrané', function () { app.deleteSelection(); })
      ]));
      return;
    }

    var item = Model.byId(app.model, sel[0]);
    if (!item) {
      container.appendChild(D.el('div', { class: 'empty', text: 'Prvek neexistuje.' }));
      return;
    }
    var kind = Model.kindOf(app.model, item.id);
    if (kind === 'body') bodyForm(container, app, item);
    else if (kind === 'joint') jointForm(container, app, item);
    else loadForm(container, app, item);
  };

  function btn(text, fn, cls) {
    return D.el('button', { class: 'tbtn small' + (cls ? ' ' + cls : ''), text: text, onclick: fn });
  }

  function modelForm(app) {
    var box = D.el('div');
    box.appendChild(D.section('Model'));
    box.appendChild(D.textRow('Název', app.model.name, function (v) {
      app.model.name = v; app.modelChanged();
    }));
    box.appendChild(D.roRow('Tělesa / vazby', app.model.bodies.length - 1 + ' / ' + app.model.joints.length));
    return box;
  }

  // -------------------------------------------------------------------- těleso

  function bodyForm(c, app, b) {
    c.appendChild(D.section(Model.typeLabel(b)));
    c.appendChild(D.textRow('Název', b.name, function (v) { b.name = v; app.modelChanged(); }));

    if (b.type === 'ground') {
      c.appendChild(D.el('div', { class: 'hint', text: 'Rám je nepohyblivé těleso. Vazby na rám určují jeho vazbové body.' }));
      return;
    }

    c.appendChild(D.section('Geometrie'));
    if (b.type === 'rod') {
      c.appendChild(D.numberRow('Délka L [m]', b.L, function (v) {
        if (v > 1e-4) { b.L = v; Model.refreshMass(b); app.modelChanged(); }
      }, { step: 0.01 }));
      c.appendChild(D.numberRow('Šířka (kresba) [m]', b.width, function (v) {
        b.width = Math.max(0.001, v); app.modelChanged();
      }, { step: 0.005 }));
    } else {
      c.appendChild(D.numberRow('Šířka [m]', b.width, function (v) {
        b.width = Math.max(0.005, v); Model.refreshMass(b); app.modelChanged();
      }, { step: 0.01 }));
      c.appendChild(D.numberRow('Výška [m]', b.height, function (v) {
        b.height = Math.max(0.005, v); Model.refreshMass(b); app.modelChanged();
      }, { step: 0.01 }));
    }

    c.appendChild(D.section('Poloha těžiště'));
    c.appendChild(D.numberRow('x [m]', b.x, function (v) { b.x = v; app.modelChanged(); }, { step: 0.01 }));
    c.appendChild(D.numberRow('y [m]', b.y, function (v) { b.y = v; app.modelChanged(); }, { step: 0.01 }));
    c.appendChild(D.numberRow('φ [°]', b.phi * DEG, function (v) { b.phi = v / DEG; app.modelChanged(); }, { step: 1 }));

    c.appendChild(D.section('Počáteční rychlost'));
    c.appendChild(D.numberRow('v_x [m/s]', b.vx || 0, function (v) { b.vx = v; app.modelChanged(); }, { step: 0.1 }));
    c.appendChild(D.numberRow('v_y [m/s]', b.vy || 0, function (v) { b.vy = v; app.modelChanged(); }, { step: 0.1 }));
    c.appendChild(D.numberRow('ω [rad/s]', b.omega || 0, function (v) { b.omega = v; app.modelChanged(); }, { step: 0.1 }));
    c.appendChild(D.el('div', { class: 'hint', text: 'Rychlosti se před výpočtem promítnou do přípustného podprostoru vazeb.' }));

    c.appendChild(D.section('Hmotové vlastnosti'));
    if (b.type === 'rod') {
      c.appendChild(D.checkRow('Hmotnost z délky', b.autoMass !== false, function (v) {
        b.autoMass = v; Model.refreshMass(b); app.modelChanged();
      }));
      if (b.autoMass !== false) {
        c.appendChild(D.numberRow('Měrná hmotnost [kg/m]', b.lineDensity, function (v) {
          b.lineDensity = Math.max(1e-6, v); Model.refreshMass(b); app.modelChanged();
        }, { step: 0.1 }));
        c.appendChild(D.roRow('m [kg]', D.fmt(Model.massOf(b), 4)));
      } else {
        c.appendChild(D.numberRow('m [kg]', b.mass, function (v) {
          b.mass = Math.max(1e-9, v); Model.refreshMass(b); app.modelChanged();
        }, { step: 0.1 }));
      }
    } else {
      c.appendChild(D.numberRow('m [kg]', b.mass, function (v) {
        b.mass = Math.max(1e-9, v); Model.refreshMass(b); app.modelChanged();
      }, { step: 0.1 }));
    }
    c.appendChild(D.checkRow('Moment inercie automaticky', b.autoInertia !== false, function (v) {
      b.autoInertia = v; Model.refreshMass(b); app.modelChanged();
    }));
    if (b.autoInertia !== false) {
      c.appendChild(D.roRow('J_T [kg·m²]', D.fmt(Model.inertiaOf(b), 6)));
    } else {
      c.appendChild(D.numberRow('J_T [kg·m²]', b.inertia, function (v) {
        b.inertia = Math.max(1e-12, v); app.modelChanged();
      }, { step: 0.001 }));
    }

    c.appendChild(resultBox(app, b.id));
    c.appendChild(D.el('div', { class: 'btnrow' }, [
      btn('Moment na těleso', function () {
        var l = Model.addTorque(app.model, b.id, 5);
        app.modelChanged(); app.setSelection([l.id]);
      }),
      btn('Síla na těleso', function () {
        var l = Model.addForce(app.model, b.id, [0, 0], [0, -100]);
        app.modelChanged(); app.setSelection([l.id]);
      }),
      btn('Smazat', function () { app.deleteSelection(); })
    ]));
  }

  // --------------------------------------------------------------------- vazba

  function jointForm(c, app, j) {
    var model = app.model;
    var A = Model.bodyById(model, j.bodyA), B = Model.bodyById(model, j.bodyB);
    c.appendChild(D.section(Model.typeLabel(j)));
    c.appendChild(D.textRow('Název', j.name, function (v) { j.name = v; app.modelChanged(); }));
    c.appendChild(D.roRow('Těleso A', A ? A.name : '?'));
    c.appendChild(D.roRow('Těleso B', B ? B.name : '?'));
    c.appendChild(D.el('div', { class: 'btnrow' }, [
      btn('Zaměnit A ↔ B', function () {
        var a = j.bodyA, sa = j.sA;
        j.bodyA = j.bodyB; j.sA = j.sB;
        j.bodyB = a; j.sB = sa;
        if (j.type === 'prismatic') {
          var na = Model.bodyById(model, j.bodyA);
          var ob = Model.bodyById(model, j.bodyB);
          j.axisA = Model.dirToLocal(na, Model.dirToGlobal(ob, j.axisA));
          j.angleOffset = na.phi - ob.phi;
        }
        app.modelChanged();
      })
    ]));

    var p = Model.jointPoint(model, j);
    c.appendChild(D.section(j.type === 'revolute' ? 'Poloha čepu' : 'Bod na ose'));
    c.appendChild(D.numberRow('x [m]', p[0], function (v) { setPoint(app, j, [v, p[1]]); }, { step: 0.01 }));
    c.appendChild(D.numberRow('y [m]', p[1], function (v) { setPoint(app, j, [p[0], v]); }, { step: 0.01 }));

    if (j.type === 'prismatic') {
      var ax = Model.jointAxis(model, j);
      c.appendChild(D.numberRow('Směr osy [°]', Math.atan2(ax[1], ax[0]) * DEG, function (v) {
        var g = [Math.cos(v / DEG), Math.sin(v / DEG)];
        j.axisA = Model.dirToLocal(A, g);
        app.modelChanged();
      }, { step: 1 }));
      c.appendChild(D.numberRow('Rozdíl úhlů A−B [°]', j.angleOffset * DEG, function (v) {
        j.angleOffset = v / DEG; app.modelChanged();
      }, { step: 1 }));
      c.appendChild(D.el('div', { class: 'hint', text: 'Osa je pevně spojena s tělesem A a prochází vazbovým bodem.' }));
    }

    // ------------------------------------------------------------- pohon
    c.appendChild(D.section('Pohon'));
    var has = !!(j.driver && j.driver.enabled);
    c.appendChild(D.checkRow('Předepsaný pohyb', has, function (v) {
      if (v) {
        j.driver = j.driver || Model.defaultDriver(j);
        j.driver.enabled = true;
      } else if (j.driver) j.driver.enabled = false;
      app.modelChanged();
    }));
    if (has) {
      var d = j.driver;
      c.appendChild(D.selectRow('Typ', d.kind, [
        { value: 'rate', label: j.type === 'revolute' ? 'konstantní ω' : 'konstantní v' },
        { value: 'expr', label: 'funkce času' }
      ], function (v) { d.kind = v; app.modelChanged(); }));
      if (d.kind === 'rate') {
        c.appendChild(D.numberRow(j.type === 'revolute' ? 'ω [rad/s]' : 'v [m/s]', d.rate, function (v) {
          d.rate = v; app.modelChanged();
        }, { step: 0.5 }));
        if (j.type === 'revolute') {
          c.appendChild(D.roRow('n [1/min]', D.fmt(d.rate * 30 / Math.PI, 1)));
        }
      } else {
        var lbl = j.type === 'revolute' ? 'Δφ(t) [rad]' : 'Δs(t) [m]';
        var ta = D.el('textarea', { rows: 2 });
        ta.value = d.expr;
        ta.addEventListener('change', function () { d.expr = ta.value; app.modelChanged(); });
        c.appendChild(D.el('div', { class: 'row wide' }, [D.el('label', { text: lbl }), ta]));
        c.appendChild(D.el('div', {
          class: 'hint',
          text: 'Přírůstek od počáteční polohy jako funkce t. Dostupné jsou funkce Math ' +
            '(sin, cos, PI, …), např. 2*PI*t nebo 0.5*t*t.'
        }));
      }
      c.appendChild(D.el('div', {
        class: 'hint',
        text: 'Kladný smysl = pohyb tělesa B vůči tělesu A (proti směru hodinových ručiček, ' +
          'resp. ve směru osy).'
      }));
    }

    c.appendChild(resultBox(app, j.id));
    c.appendChild(D.el('div', { class: 'btnrow' }, [btn('Smazat', function () { app.deleteSelection(); })]));
  }

  function setPoint(app, j, p) {
    var A = Model.bodyById(app.model, j.bodyA), B = Model.bodyById(app.model, j.bodyB);
    j.sA = Model.toLocal(A, p);
    if (j.type === 'revolute') j.sB = Model.toLocal(B, p);
    app.modelChanged();
  }

  // ------------------------------------------------------------------ zatížení

  function loadForm(c, app, l) {
    var b = Model.bodyById(app.model, l.body);
    c.appendChild(D.section(Model.typeLabel(l)));
    c.appendChild(D.textRow('Název', l.name, function (v) { l.name = v; app.modelChanged(); }));
    c.appendChild(D.roRow('Těleso', b ? b.name : '?'));
    c.appendChild(D.selectRow('Zadání', l.mode, [
      { value: 'const', label: 'konstantní' },
      { value: 'expr', label: 'funkce času' }
    ], function (v) { l.mode = v; app.modelChanged(); }));

    if (l.type === 'torque') {
      if (l.mode === 'const') {
        c.appendChild(D.numberRow('M [N·m]', l.value, function (v) { l.value = v; app.modelChanged(); }, { step: 1 }));
      } else {
        c.appendChild(exprRow('M(t) [N·m]', l.expr, function (v) { l.expr = v; app.modelChanged(); }));
      }
      c.appendChild(D.el('div', { class: 'hint', text: 'Kladný moment působí proti směru hodinových ručiček.' }));
    } else {
      c.appendChild(D.section('Působiště (lokálně v tělese)'));
      c.appendChild(D.numberRow('x\' [m]', l.point[0], function (v) { l.point[0] = v; app.modelChanged(); }, { step: 0.01 }));
      c.appendChild(D.numberRow('y\' [m]', l.point[1], function (v) { l.point[1] = v; app.modelChanged(); }, { step: 0.01 }));
      c.appendChild(D.selectRow('Směr', l.frame, [
        { value: 'global', label: 'pevný ve prostoru' },
        { value: 'body', label: 'spojený s tělesem' }
      ], function (v) { l.frame = v; app.modelChanged(); }));
      c.appendChild(D.section('Složky síly'));
      if (l.mode === 'const') {
        c.appendChild(D.numberRow('F_x [N]', l.fx, function (v) { l.fx = v; app.modelChanged(); }, { step: 10 }));
        c.appendChild(D.numberRow('F_y [N]', l.fy, function (v) { l.fy = v; app.modelChanged(); }, { step: 10 }));
        c.appendChild(D.roRow('|F| [N]', D.fmt(Math.hypot(l.fx, l.fy), 2)));
      } else {
        c.appendChild(exprRow('F_x(t) [N]', l.exprX, function (v) { l.exprX = v; app.modelChanged(); }));
        c.appendChild(exprRow('F_y(t) [N]', l.exprY, function (v) { l.exprY = v; app.modelChanged(); }));
      }
    }
    c.appendChild(D.el('div', { class: 'btnrow' }, [btn('Smazat', function () { app.deleteSelection(); })]));
  }

  function exprRow(label, value, onChange) {
    var ta = D.el('textarea', { rows: 2 });
    ta.value = value;
    ta.addEventListener('change', function () { onChange(ta.value); });
    return D.el('div', { class: 'row wide' }, [D.el('label', { text: label }), ta]);
  }

  // ------------------------------------------- okamžité výsledky vybraného prvku

  function resultBox(app, id) {
    var box = D.el('div');
    var f = app.currentFrame();
    if (!f || !app.result) return box;
    var res = app.result;
    var bi = res.bodyIds.indexOf(id);
    if (bi >= 0) {
      box.appendChild(D.section('Výsledky v čase t = ' + D.fmt(f.t, 3) + ' s'));
      box.appendChild(D.roRow('x, y [m]', D.fmt(f.pose[3 * bi], 4) + ' , ' + D.fmt(f.pose[3 * bi + 1], 4)));
      box.appendChild(D.roRow('φ [°]', D.fmt(f.pose[3 * bi + 2] * DEG, 2)));
      box.appendChild(D.roRow('|v| [m/s]', D.fmt(Math.hypot(f.vel[3 * bi], f.vel[3 * bi + 1]), 4)));
      box.appendChild(D.roRow('ω [rad/s]', D.fmt(f.vel[3 * bi + 2], 4)));
      box.appendChild(D.roRow('|a| [m/s²]', D.fmt(Math.hypot(f.acc[3 * bi], f.acc[3 * bi + 1]), 3)));
      box.appendChild(D.roRow('α [rad/s²]', D.fmt(f.acc[3 * bi + 2], 3)));
      return box;
    }
    var ji = res.jointOrder.indexOf(id);
    if (ji >= 0) {
      box.appendChild(D.section('Reakce v čase t = ' + D.fmt(f.t, 3) + ' s'));
      box.appendChild(D.roRow('F_x [N]', D.fmt(f.reac[3 * ji], 3)));
      box.appendChild(D.roRow('F_y [N]', D.fmt(f.reac[3 * ji + 1], 3)));
      box.appendChild(D.roRow('|F| [N]', D.fmt(Math.hypot(f.reac[3 * ji], f.reac[3 * ji + 1]), 3)));
      box.appendChild(D.roRow('M [N·m]', D.fmt(f.reac[3 * ji + 2], 4)));
      box.appendChild(D.el('div', { class: 'hint', text: 'Účinek tělesa A na těleso B, moment k bodu vazby.' }));
    }
    var di = res.driverOrder.indexOf(id);
    if (di >= 0) {
      var joint = Model.byId(app.model, id);
      box.appendChild(D.roRow(joint && joint.type === 'revolute' ? 'Hnací moment [N·m]' : 'Hnací síla [N]',
        D.fmt(f.drv[di], 3)));
    }
    return box;
  }

  // ---------------------------------------------------------- nastavení analýzy

  I.renderSim = function (container, app) {
    D.clear(container);
    var s = app.model.sim, g = app.model.gravity;

    container.appendChild(D.numberRow('Doba analýzy [s]', s.tEnd, function (v) {
      s.tEnd = Math.max(0.001, v); app.modelChanged();
    }, { step: 0.1 }));
    container.appendChild(D.numberRow('Krok integrace [s]', s.h, function (v) {
      s.h = Math.max(1e-6, v); app.modelChanged();
    }, { step: 0.0005 }));
    container.appendChild(D.numberRow('Zaznamenat každý n-tý krok', s.recordEvery, function (v) {
      s.recordEvery = Math.max(1, Math.round(v)); app.modelChanged();
    }, { step: 1 }));
    container.appendChild(D.roRow('Kroků / snímků',
      Math.ceil(s.tEnd / s.h) + ' / ' + (Math.floor(Math.ceil(s.tEnd / s.h) / s.recordEvery) + 1)));

    container.appendChild(D.section('Tíhové zrychlení'));
    container.appendChild(D.checkRow('Uvažovat tíhu', g.enabled, function (v) { g.enabled = v; app.modelChanged(); }));
    container.appendChild(D.numberRow('g_x [m/s²]', g.gx, function (v) { g.gx = v; app.modelChanged(); }, { step: 0.1 }));
    container.appendChild(D.numberRow('g_y [m/s²]', g.gy, function (v) { g.gy = v; app.modelChanged(); }, { step: 0.1 }));

    container.appendChild(D.section('Numerika'));
    container.appendChild(D.numberRow('Stabilizace α', s.alpha, function (v) { s.alpha = Math.max(0, v); app.modelChanged(); }, { step: 1 }));
    container.appendChild(D.numberRow('Stabilizace β', s.beta, function (v) { s.beta = Math.max(0, v); app.modelChanged(); }, { step: 1 }));
    container.appendChild(D.checkRow('Korekce vazeb v každém kroku', s.project !== false, function (v) {
      s.project = v; app.modelChanged();
    }));
    container.appendChild(D.el('div', {
      class: 'hint',
      text: 'Baumgarteho stabilizace potlačuje drift vazeb (α, β ≈ 10–50). ' +
        'Integrace: Runge–Kutta 4. řádu s pevným krokem.'
    }));
  };

  // ------------------------------------------------------------------ stav

  I.renderStatus = function (container, app) {
    D.clear(container);
    var d = app.diag;
    if (!d) {
      container.appendChild(D.el('div', { class: 'empty', text: 'Model je prázdný.' }));
      return;
    }
    var rows = [
      ['Souřadnice (3 × těles)', d.nq],
      ['Vazbové rovnice', d.nc],
      ['Hodnost Φ_q', d.rank],
      ['Pohyblivost (bez pohonů)', d.mobility],
      ['Počet pohonů', d.nDrivers],
      ['Stupně volnosti', d.dof]
    ];
    var table = D.el('table', {}, rows.map(function (r) {
      return D.el('tr', {}, [D.el('td', { text: r[0] }), D.el('td', { text: String(r[1]) })]);
    }));
    container.appendChild(table);

    if (d.residual != null) {
      container.appendChild(D.el('div', {
        class: 'msg ' + (d.residual < 1e-8 ? 'ok' : 'warn'),
        text: 'Zbytek vazeb po sestavení: ' + d.residual.toExponential(2)
      }));
    }
    if (d.dof === 0 && d.nDrivers > 0) {
      container.appendChild(D.el('div', { class: 'msg ok', text: 'Kinematicky určená soustava – pohyb je dán pohony.' }));
    } else if (d.dof > 0) {
      container.appendChild(D.el('div', {
        class: 'msg ok',
        text: 'Volná dynamika: ' + d.dof + ' stupňů volnosti se řeší z pohybových rovnic.'
      }));
    }
    if (d.redundant > 0) {
      container.appendChild(D.el('div', {
        class: 'msg warn',
        text: 'Redundantních rovnic: ' + d.redundant + '. Reakce nejsou určeny jednoznačně ' +
          '(staticky neurčitá vazba).'
      }));
    }
    (app.messages || []).forEach(function (m) {
      container.appendChild(D.el('div', { class: 'msg ' + (m.level || 'warn'), text: m.text }));
    });
  };

  MBD.Inspector = I;
})(typeof globalThis !== 'undefined' ? globalThis : this);
