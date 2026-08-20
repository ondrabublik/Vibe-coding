<?php use App\Core\View; ?>
<div class="admin-layout">
  <?php require __DIR__ . '/../partials/admin_nav.php'; ?>
  <div class="admin-content">
    <h1>Přehled</h1>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:1rem;margin-bottom:1.5rem">
      <div class="card text-center">
        <div style="font-size:2rem;font-weight:700;color:var(--color-primary)"><?= (int)$totalRes ?></div>
        <div class="text-muted">Aktivních rezervací</div>
      </div>
      <div class="card text-center">
        <div style="font-size:2rem;font-weight:700;color:var(--color-primary)"><?= (int)$totalFields ?></div>
        <div class="text-muted">Aktivních hřišť</div>
      </div>
      <div class="card text-center">
        <div style="font-size:2rem;font-weight:700;color:var(--color-primary)"><?= (int)$totalUsers ?></div>
        <div class="text-muted">Uživatelů</div>
      </div>
    </div>
    <p class="text-muted">Vyberte sekci v levém menu.</p>
  </div>
</div>
