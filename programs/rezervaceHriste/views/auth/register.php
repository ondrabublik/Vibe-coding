<?php use App\Core\{View, Csrf}; ?>
<div class="form-card">
  <h1>Registrace</h1>
  <?php if ($error): ?>
    <div class="flash flash--error"><?= View::e($error) ?></div>
  <?php endif; ?>
  <form method="post" action="/register">
    <?= Csrf::field() ?>
    <div class="form-group">
      <label for="name">Jméno a příjmení</label>
      <input type="text" id="name" name="name" value="<?= View::e($old['name'] ?? '') ?>" required autofocus>
    </div>
    <div class="form-group">
      <label for="email">E-mail</label>
      <input type="email" id="email" name="email" value="<?= View::e($old['email'] ?? '') ?>" required>
    </div>
    <div class="form-group">
      <label for="phone">Telefon <span class="text-muted">(nepovinné)</span></label>
      <input type="tel" id="phone" name="phone" value="<?= View::e($old['phone'] ?? '') ?>">
    </div>
    <div class="form-group">
      <label for="password">Heslo <span class="text-muted">(min. 6 znaků)</span></label>
      <input type="password" id="password" name="password" required minlength="6">
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn--primary w-full">Zaregistrovat se</button>
    </div>
  </form>
  <p class="text-muted mt-2 text-center">Máte účet? <a href="/login">Přihlaste se</a></p>
</div>
