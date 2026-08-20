/*
 * tree.js - přehledový strom modelu (tělesa / vazby / zatížení).
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var D = MBD.Dom;
  var Model = MBD.Model;
  var T = {};

  T.render = function (container, app) {
    D.clear(container);
    var model = app.model;

    section('Tělesa', model.bodies.map(function (b) {
      return item(b.id, Model.typeLabel(b), b.name, b.type === 'ground' ? null : info(b));
    }));

    section('Vazby', model.joints.map(function (j) {
      var drv = j.driver && j.driver.enabled
        ? (j.type === 'revolute' ? '↻' : '⇢') : null;
      return item(j.id, j.type === 'revolute' ? 'R' : 'P', j.name, null, drv);
    }));

    section('Zatížení', model.loads.map(function (l) {
      return item(l.id, l.type === 'torque' ? 'M' : 'F', l.name, null);
    }));

    function info(b) {
      if (b.type === 'rod') return 'L=' + D.fmt(b.L, 3) + ' m';
      return D.fmt(Model.massOf(b), 3) + ' kg';
    }

    function section(title, items) {
      container.appendChild(D.el('div', { class: 'tree-group', text: title + ' (' + items.length + ')' }));
      if (!items.length) {
        container.appendChild(D.el('div', { class: 'tree-empty', text: '– prázdné –' }));
        return;
      }
      items.forEach(function (n) { container.appendChild(n); });
    }

    function item(id, badge, name, extra, drv) {
      var sel = app.selection.indexOf(id) >= 0;
      var node = D.el('div', { class: 'tree-item' + (sel ? ' sel' : '') }, [
        D.el('span', { class: 'badge', text: badge }),
        D.el('span', { class: 'nm', text: name }),
        drv ? D.el('span', { class: 'drv', text: drv }) : null,
        extra ? D.el('span', { class: 'badge', text: extra }) : null
      ]);
      node.addEventListener('click', function (ev) {
        if (ev.ctrlKey || ev.shiftKey) {
          var next = app.selection.slice();
          var i = next.indexOf(id);
          if (i >= 0) next.splice(i, 1); else next.push(id);
          app.setSelection(next);
        } else {
          app.setSelection([id]);
        }
      });
      return node;
    }
  };

  MBD.Tree = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
