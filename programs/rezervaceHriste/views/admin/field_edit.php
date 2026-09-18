<?php
use App\Core\{View, Csrf};

$days = [
  'mon' => 'Pondělí',
  'tue' => 'Úterý',
  'wed' => 'Středa',
  'thu' => 'Čtvrtek',
  'fri' => 'Pátek',
  'sat' => 'Sobota',
  'sun' => 'Neděle',
];
$useOwnHours = is_array($field['openingHoursOverride'] ?? null);
$oh = $useOwnHours
    ? $field['openingHoursOverride']
    : ($settings['openingHours'] ?? []);
$halves = (bool)($field['halvesEnabled'] ?? false);
?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Upravit hřiště</h1>
    <p class="text-muted" style="margin-bottom:1rem">
      <a href="/admin/fields">← Zpět na seznam hřišť</a>
    </p>

    <form method="post" action="/admin/fields">
      <?= Csrf::field() ?>
      <input type="hidden" name="id" value="<?= View::e($field['id']) ?>">

      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Základní údaje</h2>
        <div class="form-group">
          <label for="fieldName">Název hřiště</label>
          <input type="text" id="fieldName" name="name" required maxlength="80"
                 value="<?= View::e($field['name'] ?? '') ?>">
        </div>
        <div class="form-group">
          <label class="check">
            <input type="checkbox" name="active" value="1" <?= ($field['active'] ?? true) ? 'checked' : '' ?>>
            Hřiště je aktivní (viditelné v kalendáři)
          </label>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Rezervace po polovinách</h2>
        <div class="form-group">
          <label class="check">
            <input type="checkbox" name="halvesEnabled" value="1" id="halvesEnabled" <?= $halves ? 'checked' : '' ?>>
            Povolit rezervaci levé / pravé poloviny
          </label>
          <p class="text-muted mt-1">Když je zapnuto, uživatel může rezervovat celé hřiště, nebo jen jednu polovinu.</p>
        </div>
        <div id="halvesBox" style="<?= $halves ? '' : 'display:none' ?>">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
            <div class="form-group" style="margin:0">
              <label for="halfA">Název poloviny A</label>
              <input type="text" id="halfA" name="halfA" maxlength="40"
                     value="<?= View::e($field['halfLabels']['A'] ?? 'Levá polovina') ?>">
            </div>
            <div class="form-group" style="margin:0">
              <label for="halfB">Název poloviny B</label>
              <input type="text" id="halfB" name="halfB" maxlength="40"
                     value="<?= View::e($field['halfLabels']['B'] ?? 'Pravá polovina') ?>">
            </div>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Provozní doba tohoto hřiště</h2>
        <div class="form-group">
          <label class="check">
            <input type="checkbox" name="useOwnHours" value="1" id="useOwnHours" <?= $useOwnHours ? 'checked' : '' ?>>
            Použít vlastní provozní dobu (jinak platí globální nastavení)
          </label>
        </div>
        <div id="ownHoursBox" style="<?= $useOwnHours ? '' : 'display:none' ?>">
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
      </div>

      <div class="card" style="margin-bottom:1rem">
        <h2 style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Sezóna</h2>
        <p class="text-muted" style="margin-bottom:.75rem">
          Dva intervaly, kdy je hřiště otevřené. Mezi podzimem a jarem se rezervace negenerují.
          Při rezervaci lze zvolit opakování po podzimní sezónu, po jarní sezónu, nebo po obě sezóny.
        </p>
        <div class="season-grid">
          <div>
            <h3 class="season-heading">Podzim</h3>
            <div class="season-dates">
              <div class="form-group" style="margin:0">
                <label for="autumnFrom">Od</label>
                <input type="date" id="autumnFrom" name="autumnFrom" value="<?= View::e($field['autumnFrom'] ?? '') ?>">
              </div>
              <div class="form-group" style="margin:0">
                <label for="autumnTo">Do</label>
                <input type="date" id="autumnTo" name="autumnTo" value="<?= View::e($field['autumnTo'] ?? '') ?>">
              </div>
            </div>
          </div>
          <div>
            <h3 class="season-heading">Jaro</h3>
            <div class="season-dates">
              <div class="form-group" style="margin:0">
                <label for="springFrom">Od</label>
                <input type="date" id="springFrom" name="springFrom" value="<?= View::e($field['springFrom'] ?? '') ?>">
              </div>
              <div class="form-group" style="margin:0">
                <label for="springTo">Do</label>
                <input type="date" id="springTo" name="springTo" value="<?= View::e($field['springTo'] ?? '') ?>">
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="form-actions">
        <button type="submit" class="btn btn--primary">Uložit hřiště</button>
        <a href="/admin/fields" class="btn btn--ghost">Zrušit</a>
      </div>
    </form>
  </div>
</div>
