/*
 * dom.js - minimalistické pomůcky pro tvorbu DOM a formulářů.
 */
(function (root) {
  'use strict';

  var MBD = root.MBD || (root.MBD = {});
  var D = {};

  D.el = function (tag, props, children) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k === 'html') e.innerHTML = v;
        else if (k === 'style') Object.assign(e.style, v);
        else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
        else if (v === true) e.setAttribute(k, '');
        else if (v !== false && v != null) e.setAttribute(k, v);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return e;
  };

  D.clear = function (node) { while (node.firstChild) node.removeChild(node.firstChild); };
  D.$ = function (sel) { return document.querySelector(sel); };

  D.fmt = function (v, dec) {
    if (v == null || !isFinite(v)) return '–';
    var d = dec == null ? 4 : dec;
    return (Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-4 && v !== 0))
      ? v.toExponential(3) : v.toFixed(d);
  };

  /** Řádek formuláře s číselným vstupem. */
  D.numberRow = function (label, value, onChange, opts) {
    opts = opts || {};
    var inp = D.el('input', {
      type: 'number',
      step: opts.step != null ? opts.step : 'any',
      value: (value == null || !isFinite(value)) ? '' : roundStr(value)
    });
    if (opts.disabled) inp.disabled = true;
    function commit() {
      var v = parseFloat(inp.value.replace(',', '.'));
      if (isFinite(v)) onChange(v);
      else inp.value = roundStr(value);
    }
    inp.addEventListener('change', commit);
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') commit(); });
    return D.el('div', { class: 'row' }, [D.el('label', { text: label }), inp]);
  };

  function roundStr(v) {
    var r = Math.abs(v) < 1e-12 ? 0 : v;
    return String(parseFloat(r.toPrecision(10)));
  }
  D.roundStr = roundStr;

  D.textRow = function (label, value, onChange) {
    var inp = D.el('input', { type: 'text', value: value == null ? '' : value });
    inp.addEventListener('change', function () { onChange(inp.value); });
    return D.el('div', { class: 'row' }, [D.el('label', { text: label }), inp]);
  };

  D.checkRow = function (label, value, onChange) {
    var inp = D.el('input', { type: 'checkbox' });
    inp.checked = !!value;
    inp.addEventListener('change', function () { onChange(inp.checked); });
    return D.el('div', { class: 'row' }, [D.el('label', { text: label }), inp]);
  };

  D.selectRow = function (label, value, options, onChange) {
    var sel = D.el('select', {}, options.map(function (o) {
      var op = D.el('option', { value: o.value, text: o.label });
      if (o.value === value) op.selected = true;
      return op;
    }));
    sel.addEventListener('change', function () { onChange(sel.value); });
    return D.el('div', { class: 'row' }, [D.el('label', { text: label }), sel]);
  };

  D.roRow = function (label, text) {
    return D.el('div', { class: 'row' }, [
      D.el('label', { text: label }),
      D.el('span', { class: 'ro', text: text })
    ]);
  };

  D.section = function (title) { return D.el('h3', { text: title }); };

  D.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = D.el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  };

  MBD.Dom = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
