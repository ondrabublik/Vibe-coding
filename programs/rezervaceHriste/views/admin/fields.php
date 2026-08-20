<?php use App\Core\{View, Csrf}; use App\Domain\Season; ?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Správa hřišť</h1>

    <!-- Add/Edit form -->
    <div class="card mb-2" id="fieldFormWrap" style="margin-bottom:1rem">
      <h2 id="fieldFormTitle" style="font-size:1rem;font-weight:700;margin-bottom:.75rem">Přidat hřiště</h2>
      <form method="post" action="/admin/fields">
        <?= Csrf::field() ?>
        <input type="hidden" name="id" id="fieldId" value="">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;margin-bottom:.75rem">
          <div class="form-group" style="margin:0">
            <label for="fieldName">Název hřiště</label>
            <input type="text" id="fieldName" name="name" required maxlength="80" placeholder="Hřiště 1">
          </div>
          <div class="form-group" style="margin:0">
            <label>&nbsp;</label>
            <label class="check" style="padding:.55rem 0">
              <input type="checkbox" name="halvesEnabled" value="1" id="halvesEnabled">
              Rezervace po polovinách
            </label>
          </div>
        </div>
        <div id="halvesBox" style="display:none;margin-bottom:.75rem">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem">
            <div class="form-group" style="margin:0">
              <label for="halfA">Název poloviny A</label>
              <input type="text" id="halfA" name="halfA" placeholder="Levá polovina" maxlength="40">
            </div>
            <div class="form-group" style="margin:0">
              <label for="halfB">Název poloviny B</label>
              <input type="text" id="halfB" name="halfB" placeholder="Pravá polovina" maxlength="40">
            </div>
          </div>
        </div>
        <div class="season-grid" style="margin-bottom:.75rem">
          <div>
            <h3 class="season-heading">Podzim</h3>
            <div class="season-dates">
              <div class="form-group" style="margin:0">
                <label for="addAutumnFrom">Od</label>
                <input type="date" id="addAutumnFrom" name="autumnFrom">
              </div>
              <div class="form-group" style="margin:0">
                <label for="addAutumnTo">Do</label>
                <input type="date" id="addAutumnTo" name="autumnTo">
              </div>
            </div>
          </div>
          <div>
            <h3 class="season-heading">Jaro</h3>
            <div class="season-dates">
              <div class="form-group" style="margin:0">
                <label for="addSpringFrom">Od</label>
                <input type="date" id="addSpringFrom" name="springFrom">
              </div>
              <div class="form-group" style="margin:0">
                <label for="addSpringTo">Do</label>
                <input type="date" id="addSpringTo" name="springTo">
              </div>
            </div>
          </div>
        </div>
        <input type="hidden" name="active" value="1">
        <div class="form-actions">
          <button type="submit" class="btn btn--primary" id="fieldSaveBtn">Přidat</button>
          <button type="button" class="btn btn--ghost" id="fieldCancelBtn" style="display:none">Zrušit</button>
        </div>
      </form>
    </div>

    <!-- Fields table -->
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Název</th>
            <th>Poloviny</th>
            <th>Sezóna</th>
            <th>Stav</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($fields as $f): ?>
          <tr>
            <td><?= View::e($f['order'] ?? '') ?></td>
            <td><?= View::e($f['name']) ?></td>
            <td>
              <?php if ($f['halvesEnabled']): ?>
                <span class="badge badge--blue"><?= View::e($f['halfLabels']['A'] ?? 'A') ?> / <?= View::e($f['halfLabels']['B'] ?? 'B') ?></span>
              <?php else: ?>
                <span class="text-muted">–</span>
              <?php endif; ?>
            </td>
            <td>
              <?php
                $season = Season::fromField($f);
                echo $season
                    ? View::e($season->label())
                    : '<span class="text-muted">nenastavena</span>';
              ?>
            </td>
            <td>
              <?php if ($f['active'] ?? true): ?>
                <span class="badge badge--green">Aktivní</span>
              <?php else: ?>
                <span class="badge badge--gray">Neaktivní</span>
              <?php endif; ?>
            </td>
            <td>
              <a href="/admin/fields/edit?id=<?= View::e($f['id']) ?>" class="btn btn--ghost btn--sm">Upravit hřiště</a>
              <?php if ($f['active'] ?? true): ?>
              <form method="post" action="/admin/fields/delete" style="display:inline" onsubmit="return confirm('Opravdu deaktivovat?')">
                <?= Csrf::field() ?>
                <input type="hidden" name="id" value="<?= View::e($f['id']) ?>">
                <input type="hidden" name="hard" value="0">
                <button type="submit" class="btn btn--danger btn--sm">Deaktivovat</button>
              </form>
              <?php else: ?>
              <form method="post" action="/admin/fields/delete" style="display:inline" onsubmit="return confirm('Trvale smazat? Tato akce je nevratná.')">
                <?= Csrf::field() ?>
                <input type="hidden" name="id" value="<?= View::e($f['id']) ?>">
                <input type="hidden" name="hard" value="1">
                <button type="submit" class="btn btn--danger btn--sm">Smazat</button>
              </form>
              <?php endif; ?>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>
