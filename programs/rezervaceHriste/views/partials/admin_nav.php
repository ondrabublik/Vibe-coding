<?php
$adminPath = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
function adminNavLink(string $href, string $label, string $current): string {
    $active = rtrim($current, '/') === $href ? 'active' : '';
    return "<a href=\"{$href}\" class=\"{$active}\">{$label}</a>";
}
?>
<div class="admin-sidebar">
  <nav>
    <?= adminNavLink('/admin',              'Přehled',     $adminPath) ?>
    <?= adminNavLink('/admin/fields',       'Hřiště',      $adminPath) ?>
    <?= adminNavLink('/admin/settings',     'Nastavení',   $adminPath) ?>
    <?= adminNavLink('/admin/users',        'Uživatelé',   $adminPath) ?>
    <?= adminNavLink('/admin/reservations', 'Rezervace',   $adminPath) ?>
  </nav>
  <div class="mt-2">
    <a href="/" class="btn btn--ghost btn--sm w-full" style="justify-content:center">← Na kalendář</a>
  </div>
</div>
