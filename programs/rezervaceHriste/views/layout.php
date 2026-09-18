<?php
use App\Core\Session;
use App\Core\View;
$appName = \App\Core\Config::get('app_name', 'Rezervace hřišť');
$userName = Session::get('user_name', '');
$isAdmin  = Session::isAdmin();
$isLogged = Session::isLoggedIn();
?>
<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= View::e($pageTitle ?? $appName) ?></title>
<link rel="stylesheet" href="/assets/css/app.css">
<meta name="csrf-token" content="<?= \App\Core\Csrf::token() ?>">
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a href="/" class="logo"><?= View::e($appName) ?></a>
    <nav class="header-nav">
      <?php if ($isLogged): ?>
        <span class="nav-user"><?= View::e($userName) ?></span>
        <?php if ($isAdmin): ?>
          <a href="/admin" class="nav-link nav-link--admin">Admin</a>
        <?php endif; ?>
        <form method="post" action="/logout" class="logout-form">
          <?= \App\Core\Csrf::field() ?>
          <button type="submit" class="btn-link">Odhlásit</button>
        </form>
      <?php else: ?>
        <a href="/login" class="nav-link">Přihlásit</a>
        <a href="/register" class="nav-link nav-link--primary">Registrovat</a>
      <?php endif; ?>
    </nav>
  </div>
</header>

<main class="site-main">
<?php
$flash = Session::flash('success');
if ($flash): ?>
  <div class="flash flash--success"><?= View::e($flash) ?></div>
<?php endif; ?>
<?php
$flashErr = Session::flash('error');
if ($flashErr): ?>
  <div class="flash flash--error"><?= View::e($flashErr) ?></div>
<?php endif; ?>

<?= $content ?>
</main>

<footer class="site-footer">
  <span>&copy; <?= date('Y') ?> <?= View::e($appName) ?></span>
</footer>
<script src="/assets/js/api.js?v=<?= filemtime(ROOT_DIR . '/public/assets/js/api.js') ?>"></script>
<script src="/assets/js/modal.js?v=<?= filemtime(ROOT_DIR . '/public/assets/js/modal.js') ?>"></script>
<script src="/assets/js/calendar.js?v=<?= filemtime(ROOT_DIR . '/public/assets/js/calendar.js') ?>"></script>
<?php if ($isAdmin): ?>
<script src="/assets/js/admin.js?v=<?= filemtime(ROOT_DIR . '/public/assets/js/admin.js') ?>"></script>
<?php endif; ?>
</body>
</html>
