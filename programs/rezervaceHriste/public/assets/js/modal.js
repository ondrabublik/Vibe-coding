/* Reservation modal controller */
const Modal = (() => {
  const overlay  = document.getElementById('resModalOverlay');
  const modal    = document.getElementById('resModal');
  const title    = document.getElementById('resModalTitle');
  const body     = document.getElementById('resModalBody');
  const closeBtn = document.getElementById('resModalClose');

  if (!overlay) return {};

  function open(titleText, html) {
    title.textContent = titleText;
    body.innerHTML = html;
    overlay.classList.add('open');
    body.querySelector('[autofocus]')?.focus();
  }

  function close() {
    overlay.classList.remove('open');
    body.innerHTML = '';
  }

  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  const COLORS = ['#1a6b3a','#0f766e','#1d4ed8','#7c3aed','#db2777','#ea580c','#dc2626','#64748b','#92400e','#0891b2'];

  function colorPickerHtml(selected) {
    const current = COLORS.includes(selected) ? selected : COLORS[0];
    const swatches = COLORS.map(c =>
      `<button type="button" class="color-swatch${c === current ? ' selected' : ''}" data-color="${c}" style="background:${c}" aria-label="${c}"></button>`
    ).join('');
    return `
      <div class="form-group">
        <label>Barva v kalendáři</label>
        <div class="color-swatches" id="colorSwatches">${swatches}</div>
        <input type="hidden" name="color" id="resColor" value="${current}">
      </div>`;
  }

  function bindColorPicker() {
    const hidden = document.getElementById('resColor');
    document.querySelectorAll('#colorSwatches .color-swatch').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#colorSwatches .color-swatch').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        hidden.value = btn.dataset.color;
      });
    });
  }

  function formatCs(iso) {
    if (!iso) return '';
    return new Date(iso + 'T00:00:00').toLocaleDateString('cs-CZ');
  }

  function inRange(date, from, to) {
    return !!(from && to && date >= from && date <= to);
  }

  /* ─── New reservation modal ──────────────────────────────────────── */
  function openNew({ fieldId, fieldName, halvesEnabled, halfA, halfB, date, start, end, slotMin, maxSlots, initialPart, autumnFrom, autumnTo, springFrom, springTo }) {
    const dateLabel  = new Date(date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday:'long', day:'numeric', month:'long' });
    const ip = halvesEnabled && (initialPart === 'A' || initialPart === 'B') ? initialPart : 'full';
    const sel = v => v === ip ? 'selected' : '';
    const aLabel = escHtml(halfA || 'Polovina A');
    const bLabel = escHtml(halfB || 'Polovina B');
    const partOpts = halvesEnabled
      ? `<option value="full" ${sel('full')}>Celé hřiště</option>
         <option value="A" ${sel('A')}>${aLabel}</option>
         <option value="B" ${sel('B')}>${bLabel}</option>`
      : `<option value="full" selected>Celé hřiště</option>`;

    const maxSlotCount = Math.max(1, parseInt(maxSlots, 10) || 8);
    const maxDurationMin = maxSlotCount * slotMin;

    // Build end-time options based on slot grid, capped by maxSlots
    function buildEndOpts(startHHMM, currentEnd) {
      const [sh, sm] = startHHMM.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const maxEnd = Math.min(24 * 60, startMin + maxDurationMin);
      let opts = '';
      for (let m = startMin + slotMin; m <= maxEnd; m += slotMin) {
        const hh = String(Math.floor(m / 60)).padStart(2, '0');
        const mm = String(m % 60).padStart(2, '0');
        const val = `${hh}:${mm}`;
        opts += `<option value="${val}" ${val === currentEnd ? 'selected' : ''}>${val}</option>`;
      }
      return opts;
    }

    const maxDateObj = new Date(); maxDateObj.setDate(maxDateObj.getDate() + 60);
    const maxDate = maxDateObj.toISOString().slice(0,10);
    const todayStr = new Date().toISOString().slice(0,10);
    const hasAutumn = inRange(autumnTo, autumnFrom, autumnTo);
    const hasSpring = inRange(springTo, springFrom, springTo);
    const hasSeason = hasAutumn || hasSpring;
    const lastSeasonDate = [hasAutumn ? autumnTo : '', hasSpring ? springTo : ''].filter(Boolean).sort().pop() || '';
    const untilMax = lastSeasonDate || maxDate;

    function seasonAvailability(forDate) {
      const autumnOk = hasAutumn && forDate <= autumnTo;
      const springOk = hasSpring && forDate <= springTo;
      const bothOk = autumnOk && springOk && hasAutumn && hasSpring;
      return { autumnOk, springOk, bothOk };
    }

    const avail = seasonAvailability(date);
    const seasonHint = hasSeason
      ? [hasAutumn ? `Podzim: ${formatCs(autumnFrom)} – ${formatCs(autumnTo)}` : '', hasSpring ? `Jaro: ${formatCs(springFrom)} – ${formatCs(springTo)}` : ''].filter(Boolean).join(' · ')
      : 'Sezóna hřiště není nastavena. V administraci zadejte podzimní a jarní interval.';

    function radioItem(value, enabled, label, checked = false) {
      return `<label class="radio-item ${enabled ? '' : 'is-disabled'}">
              <input type="radio" name="recurrence_mode" value="${value}" ${enabled ? '' : 'disabled'} ${checked ? 'checked' : ''}>
              ${label}
            </label>`;
    }

    const html = `
      <div id="collisionBox" class="collision-list" style="display:none"></div>
      <form id="newResForm">
        <div class="form-group">
          <label>Hřiště</label>
          <input type="text" value="${escHtml(fieldName)}" readonly style="background:var(--color-bg)">
          <input type="hidden" name="fieldId" value="${escHtml(fieldId)}">
        </div>
        <div class="form-group">
          <label for="resPart">Část hřiště</label>
          <select id="resPart" name="part">${partOpts}</select>
        </div>
        <div class="form-group">
          <label for="resDate">Datum</label>
          <input type="date" id="resDate" name="date" value="${date}" min="${todayStr}" max="${hasSeason ? untilMax : maxDate}" required>
        </div>
        <div style="display:flex;gap:.75rem">
          <div class="form-group" style="flex:1">
            <label for="resStart">Od</label>
            <input type="time" id="resStart" name="start" value="${start}" step="${slotMin * 60}" required>
          </div>
          <div class="form-group" style="flex:1">
            <label for="resEnd">Do</label>
            <select id="resEnd" name="end">${buildEndOpts(start, end)}</select>
          </div>
        </div>
        <p class="text-muted" style="margin-top:-.5rem;margin-bottom:.75rem">Nejvýše ${maxDurationMin} minut na jeden termín.</p>
        <div class="form-group">
          <label for="resNote">Popisek</label>
          <input type="text" id="resNote" name="note" maxlength="80" placeholder="Např. trénink U12">
        </div>
        ${colorPickerHtml('#1a6b3a')}
        <div class="form-group">
          <label>Opakování</label>
          <div class="radio-list" id="recurrenceList">
            ${radioItem('', true, 'Jednorázově', true)}
            ${radioItem('until_date', true, 'Týdně do zvoleného data')}
            ${radioItem('autumn_season', avail.autumnOk, `Týdně po podzimní sezónu${hasAutumn ? ` – ${formatCs(autumnFrom)} až ${formatCs(autumnTo)}` : ''}`)}
            ${radioItem('spring_season', avail.springOk, `Týdně po jarní sezónu${hasSpring ? ` – ${formatCs(springFrom)} až ${formatCs(springTo)}` : ''}`)}
            ${radioItem('both_seasons', avail.bothOk, 'Týdně po obě sezóny (podzim i jaro)')}
          </div>
          <p class="text-muted mt-1">${escHtml(seasonHint)}</p>
        </div>
        <div id="untilDateBox" class="form-group" style="display:none">
          <label for="resUntil">Opakovat do data</label>
          <input type="date" id="resUntil" name="recurrence_until" min="${date}" max="${untilMax}">
        </div>
        <input type="hidden" name="skipCollisions" id="skipCollisions" value="0">
        <div class="modal-actions">
          <button type="submit" class="btn btn--primary" id="resSubmitBtn">Rezervovat</button>
          <button type="button" class="btn btn--ghost" onclick="Modal.close()">Zrušit</button>
        </div>
        <p id="resError" class="form-error mt-1" style="display:none"></p>
      </form>`;

    open('Nová rezervace', html);
    bindColorPicker();

    document.querySelectorAll('input[name="recurrence_mode"]').forEach(r => {
      r.addEventListener('change', () => {
        document.getElementById('untilDateBox').style.display =
          document.querySelector('input[name="recurrence_mode"]:checked')?.value === 'until_date' ? '' : 'none';
      });
    });

    function refreshSeasonRadios(forDate) {
      const a = seasonAvailability(forDate);
      const map = {
        autumn_season: a.autumnOk,
        spring_season: a.springOk,
        both_seasons: a.bothOk,
      };
      document.querySelectorAll('#recurrenceList input[name="recurrence_mode"]').forEach(input => {
        if (!(input.value in map)) return;
        const ok = map[input.value];
        input.disabled = !ok;
        input.closest('.radio-item')?.classList.toggle('is-disabled', !ok);
        if (!ok && input.checked) {
          document.querySelector('#recurrenceList input[name="recurrence_mode"][value=""]')?.click();
        }
      });
    }

    document.getElementById('resDate').addEventListener('change', function() {
      const until = document.getElementById('resUntil');
      if (until) until.min = this.value;
      refreshSeasonRadios(this.value);
    });

    // Update end options when start changes
    document.getElementById('resStart').addEventListener('change', function() {
      document.getElementById('resEnd').innerHTML = buildEndOpts(this.value, '');
    });

    document.getElementById('newResForm').addEventListener('submit', async function(e) {
      e.preventDefault();
      const fd  = new FormData(this);
      const data = Object.fromEntries(fd.entries());
      const errEl = document.getElementById('resError');
      const colBox = document.getElementById('collisionBox');
      errEl.style.display = 'none';
      colBox.style.display = 'none';

      if (data.recurrence_mode === 'until_date' && !data.recurrence_until) {
        errEl.textContent = 'Vyberte datum, do kterého se má rezervace opakovat.';
        errEl.style.display = '';
        return;
      }

      const btn = document.getElementById('resSubmitBtn');
      btn.disabled = true;
      btn.textContent = 'Ukládám…';

      try {
        const res = await API.post('/reservation', data);
        if (res.ok) {
          close();
          Calendar.reload();
        } else if (res.collisions) {
          const dates = res.collision_dates.map(d => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ')).join(', ');
          colBox.innerHTML = `<strong>Kolize!</strong> Následující termíny jsou obsazeny: ${escHtml(dates)}.<br>
            <button class="btn btn--sm btn--ghost mt-1" id="skipColBtn">Přeskočit kolidující a rezervovat ostatní</button>`;
          colBox.style.display = '';
          document.getElementById('skipColBtn').addEventListener('click', async () => {
            document.getElementById('skipCollisions').value = '1';
            colBox.innerHTML = '<em>Ukládám zbývající termíny…</em>';
            const res2 = await API.post('/reservation', Object.fromEntries(new FormData(document.getElementById('newResForm')).entries()));
            if (res2.ok) { close(); Calendar.reload(); }
            else { colBox.innerHTML = `<strong>Chyba:</strong> ${escHtml(res2.error || 'Neznámá chyba.')}`; }
          });
        } else {
          errEl.textContent = res.error || 'Neznámá chyba.';
          errEl.style.display = '';
        }
      } catch (err) {
        errEl.textContent = 'Chyba připojení.';
        errEl.style.display = '';
      }
      btn.disabled = false;
      btn.textContent = 'Rezervovat';
    });
  }

  /* ─── View reservation modal ──────────────────────────────────────── */
  function openView({ resId, seriesId, isMine, canEdit, note, color, date, start, end, fieldName, part, halfA, halfB }) {
    const dateLabel = new Date(date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const partLabel = part === 'full' ? 'Celé hřiště' : (part === 'A' ? halfA : halfB);
    const cancelBtns = (isMine || canEdit) ? `
      <button type="button" class="btn btn--danger btn--sm" data-cancel-scope="one" data-res-id="${escHtml(resId)}">Zrušit tento termín</button>
      ${seriesId ? `<button type="button" class="btn btn--ghost btn--sm" data-cancel-scope="series" data-series-id="${escHtml(seriesId)}">Zrušit celou sérii</button>` : ''}
    ` : '';

    const editForm = canEdit ? `
      <form id="editResForm">
        <div class="form-group">
          <label for="resNote">Popisek</label>
          <input type="text" id="resNote" name="note" maxlength="80" value="${escHtml(note)}" placeholder="Např. trénink U12" autofocus>
        </div>
        ${colorPickerHtml(color || '#1a6b3a')}
        ${seriesId ? `
        <div class="form-group">
          <label class="check">
            <input type="checkbox" id="applySeries" name="scope" value="series">
            Použít popisek a barvu na celou sérii
          </label>
        </div>` : ''}
        <input type="hidden" name="id" value="${escHtml(resId)}">
        <div class="modal-actions">
          <button type="submit" class="btn btn--primary" id="resSaveBtn">Uložit</button>
          ${cancelBtns}
        </div>
        <p id="resError" class="form-error mt-1" style="display:none"></p>
      </form>` : `
      ${note ? `<p style="margin-bottom:1rem"><strong>Popisek:</strong> ${escHtml(note)}</p>` : ''}
      <div class="modal-actions" id="cancelActions">${cancelBtns}</div>
      <p id="cancelMsg" class="form-error mt-1" style="display:none"></p>`;

    const html = `
      <dl style="display:grid;grid-template-columns:max-content 1fr;gap:.35rem .75rem;font-size:.9rem;margin-bottom:1rem">
        <dt class="text-muted">Hřiště</dt><dd>${escHtml(fieldName)}</dd>
        <dt class="text-muted">Část</dt><dd>${escHtml(partLabel)}</dd>
        <dt class="text-muted">Datum</dt><dd>${escHtml(dateLabel)}</dd>
        <dt class="text-muted">Čas</dt><dd>${escHtml(start)}–${escHtml(end)}</dd>
        ${seriesId ? `<dt class="text-muted">Opakování</dt><dd>Opakující se rezervace <span class="text-muted">(↻)</span></dd>` : ''}
      </dl>
      ${editForm}`;

    open(canEdit ? 'Upravit rezervaci' : 'Detail rezervace', html);
    if (canEdit) bindColorPicker();

    document.getElementById('editResForm')?.addEventListener('submit', async function(e) {
      e.preventDefault();
      const errEl = document.getElementById('resError');
      errEl.style.display = 'none';
      const btn = document.getElementById('resSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Ukládám…';
      const payload = {
        id: resId,
        note: document.getElementById('resNote').value,
        color: document.getElementById('resColor').value,
        scope: document.getElementById('applySeries')?.checked ? 'series' : 'one',
      };
      try {
        const res = await API.post('/reservation/update', payload);
        if (res.ok) { close(); Calendar.reload(); }
        else {
          errEl.textContent = res.error || 'Chyba.';
          errEl.style.display = '';
          btn.disabled = false;
          btn.textContent = 'Uložit';
        }
      } catch (err) {
        errEl.textContent = 'Chyba připojení.';
        errEl.style.display = '';
        btn.disabled = false;
        btn.textContent = 'Uložit';
      }
    });

    document.querySelectorAll('[data-cancel-scope]').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        const scope = btn.dataset.cancelScope;
        const payload = scope === 'series'
          ? { scope: 'series', seriesId: btn.dataset.seriesId }
          : { scope: 'one',    id:       btn.dataset.resId };
        const res = await API.post('/reservation/cancel', payload);
        if (res.ok) { close(); Calendar.reload(); }
        else {
          const msg = document.getElementById('resError') || document.getElementById('cancelMsg');
          if (msg) { msg.textContent = res.error || 'Chyba.'; msg.style.display = ''; }
          btn.disabled = false;
        }
      });
    });
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  return { open, close, openNew, openView, escHtml };
})();
