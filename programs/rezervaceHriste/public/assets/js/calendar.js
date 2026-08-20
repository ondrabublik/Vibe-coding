/* Calendar interaction: drag-to-select, click to view/create */
const Calendar = (() => {
  let dragStart = null;
  let selecting = [];

  function page() { return document.getElementById('calendarPage'); }
  function grid() { return document.getElementById('calGrid'); }

  function fieldData() {
    const p = page();
    if (!p) return {};
    return {
      fieldId:       p.dataset.field,
      week:          p.dataset.week,
      slotMin:       parseInt(p.dataset.slotMin, 10) || 30,
      maxSlots:      parseInt(p.dataset.maxSlots, 10) || 8,
      halvesEnabled: p.dataset.halves === '1',
      isLogged:      p.dataset.logged === '1',
      isAdmin:       p.dataset.admin === '1',
      halfA:         p.dataset.halfA || 'Polovina A',
      halfB:         p.dataset.halfB || 'Polovina B',
      autumnFrom:    p.dataset.autumnFrom || '',
      autumnTo:      p.dataset.autumnTo || '',
      springFrom:    p.dataset.springFrom || '',
      springTo:      p.dataset.springTo || '',
      fieldName:     (document.querySelector('.field-tab.active')?.textContent || '').trim(),
    };
  }

  function timeToMin(hhmm) {
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
  }

  function minToTime(min) {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }

  function isSelectable(cell) {
    return cell
      && cell.dataset.open === '1'
      && cell.dataset.occupied !== '1'
      && !cell.classList.contains('closed');
  }

  function clearSelection() {
    document.querySelectorAll('.cal-cell.selecting').forEach(c => c.classList.remove('selecting'));
    selecting = [];
  }

  function cellsInRange(startCell, endCell) {
    if (!startCell || !endCell) return [];
    const date = startCell.dataset.date;
    const part = startCell.dataset.part;
    if (endCell.dataset.date !== date || endCell.dataset.part !== part) {
      endCell = startCell;
    }
    const t1 = timeToMin(startCell.dataset.start);
    const t2 = timeToMin(endCell.dataset.start);
    const fd = fieldData();
    const slotMin = fd.slotMin || 30;
    const maxSlots = Math.max(1, fd.maxSlots || 8);
    const maxDelta = (maxSlots - 1) * slotMin;
    let from;
    let to;
    if (t2 >= t1) {
      from = t1;
      to = Math.min(t2, t1 + maxDelta);
    } else {
      to = t1;
      from = Math.max(t2, t1 - maxDelta);
    }
    return [...document.querySelectorAll('.cal-cell')].filter(c =>
      c.dataset.date === date
      && c.dataset.part === part
      && timeToMin(c.dataset.start) >= from
      && timeToMin(c.dataset.start) <= to
      && isSelectable(c)
    ).sort((a, b) => timeToMin(a.dataset.start) - timeToMin(b.dataset.start));
  }

  function handleMouseDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('.res-block')) return;

    const cell = e.target.closest('.cal-cell');
    if (!isSelectable(cell)) return;

    const fd = fieldData();
    if (!fd.isLogged) return;

    e.preventDefault();
    dragStart = cell;
    clearSelection();
    cell.classList.add('selecting');
    selecting = [cell];
  }

  function handleMouseOver(e) {
    if (!dragStart) return;
    const cell = e.target.closest('.cal-cell');
    if (!cell) return;
    clearSelection();
    selecting = cellsInRange(dragStart, cell);
    selecting.forEach(c => c.classList.add('selecting'));
  }

  function handleMouseUp() {
    if (!dragStart) return;
    const fd = fieldData();

    if (selecting.length > 0 && fd.isLogged) {
      const first = selecting[0];
      const last  = selecting[selecting.length - 1];
      const endMin = timeToMin(last.dataset.start) + fd.slotMin;

      Modal.openNew({
        fieldId: fd.fieldId,
        fieldName: fd.fieldName,
        halvesEnabled: fd.halvesEnabled,
        halfA: fd.halfA,
        halfB: fd.halfB,
        date: first.dataset.date,
        start: first.dataset.start,
        end: minToTime(endMin),
        slotMin: fd.slotMin,
        maxSlots: fd.maxSlots,
        initialPart: first.dataset.part,
        autumnFrom: fd.autumnFrom,
        autumnTo: fd.autumnTo,
        springFrom: fd.springFrom,
        springTo: fd.springTo,
      });
    }

    clearSelection();
    dragStart = null;
  }

  function handleResClick(e) {
    const block = e.target.closest('.res-block');
    if (!block) return;
    e.stopPropagation();

    const fd = fieldData();
    const cell = block.closest('.cal-cell');
    const timeText = block.querySelector('.res-time')?.textContent || '';
    const [start, end] = timeText.split('–');

    Modal.openView({
      resId:    block.dataset.resId,
      seriesId: block.dataset.seriesId || null,
      isMine:   block.dataset.mine === '1',
      canEdit:  block.dataset.canEdit === '1',
      note:     block.dataset.note || '',
      color:    block.dataset.color || '#1a6b3a',
      date:     cell?.dataset.date || '',
      start:    (start || '').trim(),
      end:      (end || '').trim(),
      fieldName: fd.fieldName,
      part:     cell?.dataset.part || 'full',
      halfA: fd.halfA,
      halfB: fd.halfB,
    });
  }

  function reload() {
    window.location.reload();
  }

  function init() {
    const g = grid();
    if (!g) return;

    g.addEventListener('mousedown', handleMouseDown);
    g.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mouseup', handleMouseUp);
    g.addEventListener('click', handleResClick);

    g.addEventListener('touchstart', e => {
      const cell = e.target.closest('.cal-cell');
      if (isSelectable(cell) && !e.target.closest('.res-block') && fieldData().isLogged) {
        dragStart = cell;
        selecting = [cell];
        cell.classList.add('selecting');
      }
    }, { passive: true });

    g.addEventListener('touchend', () => {
      handleMouseUp();
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return { reload };
})();
