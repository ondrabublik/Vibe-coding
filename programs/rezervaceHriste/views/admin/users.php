<?php use App\Core\{View, Csrf}; ?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Uživatelé</h1>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Jméno</th>
            <th>E-mail</th>
            <th>Telefon</th>
            <th>Role</th>
            <th>Stav</th>
            <th>Registrován</th>
            <th>Akce</th>
          </tr>
        </thead>
        <tbody>
          <?php foreach ($users as $u): ?>
          <tr>
            <td><?= View::e($u['name']) ?></td>
            <td><?= View::e($u['email']) ?></td>
            <td><?= View::e($u['phone'] ?? '–') ?></td>
            <td>
              <?php if ($u['role'] === 'admin'): ?>
                <span class="badge badge--blue">Admin</span>
              <?php else: ?>
                <span class="badge badge--gray">Uživatel</span>
              <?php endif; ?>
            </td>
            <td>
              <?php if ($u['active'] ?? true): ?>
                <span class="badge badge--green">Aktivní</span>
              <?php else: ?>
                <span class="badge badge--red">Neaktivní</span>
              <?php endif; ?>
            </td>
            <td class="text-muted" style="font-size:.8rem"><?= View::e(substr($u['createdAt'] ?? '', 0, 10)) ?></td>
            <td>
              <form method="post" action="/admin/users" style="display:inline">
                <?= Csrf::field() ?>
                <input type="hidden" name="id" value="<?= View::e($u['id']) ?>">
                <input type="hidden" name="action" value="toggle_role">
                <button type="submit" class="btn btn--ghost btn--sm">
                  <?= $u['role'] === 'admin' ? 'Odebrat admin' : 'Povýšit na admin' ?>
                </button>
              </form>
              <form method="post" action="/admin/users" style="display:inline">
                <?= Csrf::field() ?>
                <input type="hidden" name="id" value="<?= View::e($u['id']) ?>">
                <input type="hidden" name="action" value="toggle_active">
                <button type="submit" class="btn btn--ghost btn--sm">
                  <?= ($u['active'] ?? true) ? 'Deaktivovat' : 'Aktivovat' ?>
                </button>
              </form>
              <button class="btn btn--ghost btn--sm" onclick="showPwdReset('<?= View::e($u['id']) ?>', '<?= View::e(addslashes($u['name'])) ?>')">Heslo</button>
            </td>
          </tr>
          <?php endforeach; ?>
        </tbody>
      </table>
    </div>
  </div>
</div>

<!-- Password reset modal -->
<div class="modal-overlay" id="pwdOverlay">
  <div class="modal" style="max-width:340px">
    <button class="modal-close" onclick="document.getElementById('pwdOverlay').classList.remove('open')">&times;</button>
    <h2>Změna hesla</h2>
    <p id="pwdUserName" class="text-muted mb-2" style="margin-bottom:.75rem"></p>
    <form method="post" action="/admin/users">
      <?= Csrf::field() ?>
      <input type="hidden" name="id" id="pwdUserId">
      <input type="hidden" name="action" value="reset_password">
      <div class="form-group">
        <label for="newPwd">Nové heslo</label>
        <input type="password" id="newPwd" name="new_password" minlength="6" required>
      </div>
      <button type="submit" class="btn btn--primary">Uložit heslo</button>
    </form>
  </div>
</div>
