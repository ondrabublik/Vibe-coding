<?php use App\Core\{View, Csrf}; ?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Rezervace</h1>

    <!-- Filters -->
    <form method="get" action="/admin/reservations" class="card" style="margin-bottom:1rem">
      <div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:flex-end">
        <div class="form-group" style="margin:0">
          <label>Hřiště</label>
          <select name="field">
            <option value="">Všechna</option>
            <?php foreach ($allFields as $f): ?>
              <option value="<?= View::e($f['id']) ?>" <?= $filterField === $f['id'] ? 'selected' : '' ?>>
                <?= View::e($f['name']) ?>
              </option>
            <?php endforeach; ?>
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Stav</label>
          <select name="status">
            <option value="active"    <?= $filterStatus === 'active'    ? 'selected' : '' ?>>Aktivní</option>
            <option value="cancelled" <?= $filterStatus === 'cancelled' ? 'selected' : '' ?>>Zrušené</option>
            <option value=""          <?= $filterStatus === ''          ? 'selected' : '' ?>>Vše</option>
          </select>
        </div>
        <div class="form-group" style="margin:0">
          <label>Datum</label>
          <input type="date" name="date" value="<?= View::e($filterDate) ?>">
        </div>
        <button type="submit" class="btn btn--primary btn--sm">Filtrovat</button>
        <a href="/admin/reservations" class="btn btn--ghost btn--sm">Reset</a>
      </div>
    </form>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Datum</th>
            <th>Čas</th>
            <th>Hřiště</th>
            <th>Část</th>
            <th>Uživatel</th>
            <th>Poznámka</th>
            <th>Opakování</th>
            <th>Stav</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($reservations as $r): ?>
          <?php
            $field = $fields[$r['fieldId']] ?? null;
            $user  = $users[$r['userId']]   ?? null;
            $partLabel = match($r['part'] ?? 'full') {
              'A' => $field['halfLabels']['A'] ?? 'A',
              'B' => $field['halfLabels']['B'] ?? 'B',
              default => 'Celé',
            };
          ?>
          <tr>
            <td><?= View::e($r['date']) ?></td>
            <td><?= View::e($r['start']) ?>–<?= View::e($r['end']) ?></td>
            <td><?= View::e($field['name'] ?? $r['fieldId']) ?></td>
            <td><?= View::e($partLabel) ?></td>
            <td><?= View::e($user['name'] ?? $r['userId']) ?><br><span class="text-muted" style="font-size:.78rem"><?= View::e($user['email'] ?? '') ?></span></td>
            <td><?= View::e($r['note'] ?? '') ?></td>
            <td><?= $r['seriesId'] ? '<span class="badge badge--blue">↻ Série</span>' : '–' ?></td>
            <td>
              <?php if (($r['status'] ?? 'active') === 'active'): ?>
                <span class="badge badge--green">Aktivní</span>
              <?php else: ?>
                <span class="badge badge--red">Zrušena</span>
              <?php endif; ?>
            </td>
            <td>
              <?php if (($r['status'] ?? 'active') === 'active'): ?>
                <form method="post" action="/admin/reservations/cancel" style="display:inline" onsubmit="return confirm('Zrušit rezervaci?')">
                  <?= Csrf::field() ?>
                  <input type="hidden" name="id" value="<?= View::e($r['id']) ?>">
                  <input type="hidden" name="scope" value="one">
                  <button type="submit" class="btn btn--danger btn--sm">Zrušit</button>
                </form>
                <?php if ($r['seriesId']): ?>
                <form method="post" action="/admin/reservations/cancel" style="display:inline" onsubmit="return confirm('Zrušit celou sérii?')">
                  <?= Csrf::field() ?>
                  <input type="hidden" name="seriesId" value="<?= View::e($r['seriesId']) ?>">
                  <input type="hidden" name="scope" value="series">
                  <button type="submit" class="btn btn--ghost btn--sm">Zrušit sérii</button>
                </form>
                <?php endif; ?>
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; ?>
          <?php if (empty($reservations)): ?>
            <tr><td colspan="9" class="text-center text-muted" style="padding:2rem">Žádné rezervace.</td></tr>
          <?php endif; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>
