<?php use App\Core\{View, Csrf}; ?>
<div class="form-card">
  <h1>Přihlášení</h1>
  <?php if ($error): ?>
    <div class="flash flash--error"><?= View::e($error) ?></div>
  <?php endif; ?>
  <form method="post" action="/login">
    <?= Csrf::field() ?>
    <div class="form-group">
      <label for="email">E-mail</label>
      <input type="email" id="email" name="email" required autofocus>
    </div>
    <div class="form-group">
      <label for="password">Heslo</label>
      <input type="password" id="password" name="password" required>
    </div>
    <div class="form-actions">
      <button type="submit" class="btn btn--primary w-full">Přihlásit se</button>
    </div>
  </form>
  <p class="text-muted mt-2 text-center">Nemáte účet? <a href="/register">Zaregistrujte se</a></p>
</div>
