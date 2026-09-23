// Generic UI: renders the list of surfaces and overlays from the registry and
// builds option controls from the declarative `options` of each layer.

/**
 * Option definition (in a layer's `options` array):
 *   { id, label, type: 'checkbox', default: true }
 *   { id, label, type: 'select', choices: [{ value, label }], default }
 *   { id, label, type: 'range', min, max, step, default, format?: v => string }
 *   { id, label, type: 'steps', values: [{ value, label }], default }   // slider over discrete values
 */
export function renderOptions(container, defs = [], values, onChange) {
  container.innerHTML = '';
  if (!defs.length) return;
  container.classList.add('options');
  for (const def of defs) {
    const value = values[def.id];
    if (def.type === 'checkbox') {
      const label = el('label', 'opt checkbox');
      const input = el('input');
      input.type = 'checkbox';
      input.checked = !!value;
      input.addEventListener('change', () => onChange(def.id, input.checked));
      label.append(input, document.createTextNode(def.label));
      container.append(label);
      continue;
    }

    const wrap = el('div', 'opt');
    const head = el('div', 'opt-head');
    const valueEl = el('span', 'value');
    head.append(el('span', '', def.label), valueEl);
    wrap.append(head);

    if (def.type === 'select') {
      const select = el('select');
      for (const c of def.choices) {
        const o = el('option', '', c.label);
        o.value = String(c.value);
        select.append(o);
      }
      select.value = String(value);
      select.addEventListener('change', () => {
        const c = def.choices.find((c) => String(c.value) === select.value);
        onChange(def.id, c.value);
      });
      wrap.append(select);
    } else if (def.type === 'range' || def.type === 'steps') {
      const input = el('input');
      input.type = 'range';
      const discrete = def.type === 'steps';
      input.min = discrete ? 0 : def.min;
      input.max = discrete ? def.values.length - 1 : def.max;
      input.step = discrete ? 1 : (def.step ?? 'any');
      const toValue = () => (discrete ? def.values[+input.value].value : +input.value);
      const show = () => {
        valueEl.textContent = discrete
          ? def.values[+input.value].label
          : (def.format ? def.format(+input.value) : input.value);
      };
      input.value = discrete ? Math.max(0, def.values.findIndex((v) => v.value === value)) : value;
      show();
      input.addEventListener('input', () => {
        show();
        if (def.live) onChange(def.id, toValue(), { live: true });
      });
      input.addEventListener('change', () => onChange(def.id, toValue()));
      wrap.append(input);
    }
    container.append(wrap);
  }
}

export function renderSurfaceList(container, surfaces, activeId, onSelect) {
  container.innerHTML = '';
  let category = null;
  for (const s of surfaces) {
    if (s.category !== category) {
      category = s.category;
      container.append(el('div', 'category', category));
    }
    const btn = el('button', `choice${s.id === activeId ? ' active' : ''}`);
    btn.dataset.id = s.id;
    btn.append(el('div', 'name', s.name), el('div', 'desc', s.description));
    btn.addEventListener('click', () => onSelect(s.id));
    container.append(btn);
  }
}

export function setActiveChoice(container, id) {
  container.querySelectorAll('.choice').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
}

/** One checkbox per overlay; options appear under an enabled overlay. */
export function renderOverlayList(container, overlays, state, { onToggle, onOption }) {
  container.innerHTML = '';
  const items = new Map();
  for (const o of overlays) {
    const item = el('div', 'overlay-item');
    const label = el('label');
    const input = el('input');
    input.type = 'checkbox';
    input.checked = !!state[o.id]?.enabled;
    const text = el('div');
    text.append(el('div', '', o.name), el('div', 'desc', o.description));
    label.append(input, text);
    const opts = el('div', 'options');
    item.append(label, opts);
    const refreshOptions = () => {
      if (input.checked) renderOptions(opts, o.options, state[o.id].options, (id, v, meta) => onOption(o.id, id, v, meta));
      else opts.innerHTML = '';
    };
    input.addEventListener('change', () => {
      onToggle(o.id, input.checked);
      refreshOptions();
    });
    refreshOptions();
    container.append(item);
    items.set(o.id, item);
  }
  return items;
}

export function renderLegend(container, legend) {
  container.innerHTML = '';
  if (!legend) return;
  container.append(el('div', 'title', legend.title));
  for (const it of legend.items) {
    const row = el('div', 'row');
    const sw = el('span', 'swatch');
    sw.style.background = it.color;
    row.append(sw, el('span', '', it.label));
    container.append(row);
  }
}

/** Renders describe() results: [{ title, lines: [] }]. Text is escaped. */
export function renderDescribe(container, blocks) {
  container.innerHTML = '';
  for (const b of blocks) {
    const block = el('div', 'd-block');
    if (b.title) block.append(el('div', 'd-title', b.title));
    for (const line of b.lines || []) block.append(el('div', 'd-line', line));
    container.append(block);
  }
}

export function el(tag, className = '', text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}
