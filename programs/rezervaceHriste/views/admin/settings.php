<?php use App\Core\{View, Csrf};
$days = [
  'mon' => 'Pondělí',
  'tue' => 'Úterý',
  'wed' => 'Středa',
  'thu' => 'Čtvrtek',
  'fri' => 'Pátek',
  'sat' => 'Sobota',
  'sun' => 'Neděle',
];
$oh = $settings['openingHours'] ?? [];
?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Nastavení</h1>
    <form method="post" action="/admin/settings">
      <?= Csrf::field() ?>
      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Obecné parametry</h2>
        <div class="settings-grid">
          <div class="form-group">
            <label for="slotMinutes">Délka slotu (minuty)</label>
            <select id="slotMinutes" name="slotMinutes">
              <option value="30" <?= ($settings['slotMinutes'] ?? 30) == 30 ? 'selected' : '' ?>>30 minut</option>
              <option value="60" <?= ($settings['slotMinutes'] ?? 30) == 60 ? 'selected' : '' ?>>60 minut</option>
            </select>
          </div>
          <div class="form-group">
            <label for="maxAdvanceDays">Max. dnů dopředu</label>
            <input type="number" id="maxAdvanceDays" name="maxAdvanceDays" min="1" max="365" value="<?= (int)($settings['maxAdvanceDays'] ?? 60) ?>">
          </div>
          <div class="form-group">
            <label for="minSlots">Min. slotů na rezervaci</label>
            <input type="number" id="minSlots" name="minSlots" min="1" max="24" value="<?= (int)($settings['minSlots'] ?? 1) ?>">
          </div>
          <div class="form-group">
            <label for="maxSlots">Max. slotů na rezervaci</label>
            <input type="number" id="maxSlots" name="maxSlots" min="1" max="48" value="<?= (int)($settings['maxSlots'] ?? 8) ?>">
            <p class="text-muted" style="margin-top:.35rem">Délka jednoho termínu, ne počet týdnů sezóny. Při 30min slotech je 8 slotů = 4 hodiny.</p>
          </div>
          <div class="form-group">
            <label for="maxRecurrenceWeeks">Max. týdnů opakování</label>
            <input type="number" id="maxRecurrenceWeeks" name="maxRecurrenceWeeks" min="1" max="104" value="<?= (int)($settings['maxRecurrenceWeeks'] ?? 26) ?>">
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Provozní doba</h2>
        <div style="font-size:.82rem;color:var(--color-text-muted);margin-bottom:.75rem">
          Nastavte otvírací a zavírací čas pro každý den. Zaškrtnutí „Zavřeno" daný den vyřadí.
        </div>
        <div style="display:grid;grid-template-columns:110px 1fr 1fr 100px;gap:.5rem .75rem;align-items:center;font-size:.875rem">
          <strong>Den</strong><strong>Od</strong><strong>Do</strong><strong>Zavřeno</strong>
          <?php foreach ($days as $key => $name): ?>
            <?php $d = $oh[$key] ?? ['from'=>'08:00','to'=>'22:00','closed'=>false]; ?>
            <span><?= View::e($name) ?></span>
            <input type="time" name="oh_<?= $key ?>_from" value="<?= View::e($d['from'] ?? '08:00') ?>" step="1800">
            <input type="time" name="oh_<?= $key ?>_to"   value="<?= View::e($d['to']   ?? '22:00') ?>" step="1800">
            <label class="check" style="justify-self:center">
              <input type="checkbox" name="oh_<?= $key ?>_closed" value="1" <?= ($d['closed'] ?? false) ? 'checked' : '' ?>>
            </label>
          <?php endforeach; ?>
        </div>
      </div>

      <button type="submit" class="btn btn--primary">Uložit nastavení</button>
    </form>
  </div>
</div>
