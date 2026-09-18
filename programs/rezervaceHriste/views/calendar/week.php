<?php
use App\Core\{View, Session};
use App\Domain\{SlotCalculator, ReservationStyle, Season};

$today        = date('Y-m-d');
$halvesEnabled = $field['halvesEnabled'] ?? false;
$halfA        = $field['halfLabels']['A'] ?? 'Polovina A';
$halfB        = $field['halfLabels']['B'] ?? 'Polovina B';
$slotMin      = (int)($settings['slotMinutes'] ?? 30);
$isAdmin      = Session::isAdmin();

// Collect all unique time slots across the week
$allSlotTimes = [];
foreach ($slotsPerDay as $date => $slots) {
    foreach ($slots as $slot) {
        $allSlotTimes[$slot['start']] = $slot;
    }
}
ksort($allSlotTimes);

// Day names (Czech)
$dayNames = ['Po','Út','St','Čt','Pá','So','Ne'];

// Build reservation map covering every occupied slot, not just the start
$resMap = [];
foreach ($reservations as $r) {
    $sMin = SlotCalculator::timeToMinutes($r['start']);
    $eMin = SlotCalculator::timeToMinutes($r['end']);
    for ($t = $sMin; $t < $eMin; $t += $slotMin) {
        $key = SlotCalculator::minutesToTime($t);
        $resMap[$r['date']][$r['part']][$key][] = $r;
    }
}
?>

<div class="calendar-page" id="calendarPage"
     data-field="<?= View::e($field['id'] ?? '') ?>"
     data-week="<?= View::e($weekStart) ?>"
     data-slot-min="<?= $slotMin ?>"
     data-max-slots="<?= (int)($settings['maxSlots'] ?? 8) ?>"
     data-halves="<?= $halvesEnabled ? '1' : '0' ?>"
     data-logged="<?= $isLogged ? '1' : '0' ?>"
     data-admin="<?= $isAdmin ? '1' : '0' ?>"
     data-half-a="<?= View::e($halfA) ?>"
     data-half-b="<?= View::e($halfB) ?>"
     data-autumn-from="<?= View::e($field['autumnFrom'] ?? '') ?>"
     data-autumn-to="<?= View::e($field['autumnTo'] ?? '') ?>"
     data-spring-from="<?= View::e($field['springFrom'] ?? '') ?>"
     data-spring-to="<?= View::e($field['springTo'] ?? '') ?>">

  <!-- Toolbar -->
  <div class="calendar-toolbar">
    <div class="field-tabs">
      <?php foreach ($fields as $f): ?>
        <a href="/?field=<?= View::e($f['id']) ?>&week=<?= View::e($weekStart) ?>"
           class="field-tab <?= $f['id'] === $field['id'] ? 'active' : '' ?>">
          <?= View::e($f['name']) ?>
        </a>
      <?php endforeach; ?>
    </div>

    <div class="week-nav">
      <a href="/?field=<?= View::e($field['id']) ?>&week=<?= View::e($prevWeek) ?>">&lsaquo; Předchozí</a>
      <span class="week-range"><?= View::e($weekRange) ?></span>
      <a href="/?field=<?= View::e($field['id']) ?>&week=<?= date('Y-m-d', strtotime('Monday this week')) ?>">Dnes</a>
      <a href="/?field=<?= View::e($field['id']) ?>&week=<?= View::e($nextWeek) ?>">Následující &rsaquo;</a>
    </div>
  </div>

  <!-- Legend -->
  <div class="calendar-legend">
    <span class="legend-item"><span class="legend-dot legend-dot--free"></span> Volno</span>
    <?php if ($isLogged): ?>
      <span class="legend-item"><span class="legend-dot legend-dot--mine"></span> Moje rezervace</span>
    <?php endif; ?>
    <span class="legend-item"><span class="legend-dot legend-dot--other"></span> Obsazeno</span>
    <span class="legend-item"><span class="legend-dot legend-dot--closed"></span> Mimo provoz</span>
    <?php if ($halvesEnabled): ?>
      <span class="text-muted">&nbsp;|&nbsp; Hřiště lze rezervovat celé nebo po polovinách (<?= View::e($halfA) ?> / <?= View::e($halfB) ?>)</span>
    <?php endif; ?>
    <?php $season = Season::fromField($field ?? []); if ($season): ?>
      <span class="text-muted">&nbsp;|&nbsp; <?= View::e($season->label()) ?></span>
    <?php endif; ?>
  </div>

  <!-- Grid -->
  <div class="calendar-wrap mt-2">
    <div class="calendar-grid <?= $halvesEnabled ? 'halves' : 'full' ?>" id="calGrid"
         style="--slot-h: var(--slot-h-<?= $slotMin ?>)">

      <!-- Header row -->
      <div class="cal-head-empty"></div>
      <?php foreach ($days as $i => $date): ?>
        <?php
          $dow     = (int)(new \DateTimeImmutable($date))->format('N') - 1;
          $isToday = $date === $today;
          $label   = $dayNames[$dow] . ' ' . date('j.n.', strtotime($date));
        ?>
        <?php if ($halvesEnabled): ?>
          <div class="cal-day-header <?= $isToday ? 'today' : '' ?> halves-label" style="grid-column: span 2">
            <span><?= View::e($label) ?></span>
            <div style="display:flex;width:100%;font-size:.68rem;color:var(--color-text-muted);margin-top:.1rem">
              <span style="flex:1;text-align:center"><?= View::e($halfA) ?></span>
              <span style="flex:1;text-align:center;border-left:1px dashed var(--color-border)"><?= View::e($halfB) ?></span>
            </div>
          </div>
        <?php else: ?>
          <div class="cal-day-header <?= $isToday ? 'today' : '' ?>"><?= View::e($label) ?></div>
        <?php endif; ?>
      <?php endforeach; ?>

      <!-- Time rows -->
      <?php foreach ($allSlotTimes as $slotStart => $slot): ?>
        <?php $showLabel = (SlotCalculator::timeToMinutes($slotStart) % 60 === 0); ?>
        <div class="cal-time-label"><?= $showLabel ? View::e($slotStart) : '' ?></div>

        <?php foreach ($days as $date): ?>
          <?php
            $isOpen   = isset($slotsPerDay[$date]) && !empty(array_filter($slotsPerDay[$date], fn($s) => $s['start'] === $slotStart));
            $isToday  = $date === $today;
            $parts = $halvesEnabled ? ['A', 'B'] : ['full'];
          ?>
          <?php foreach ($parts as $part): ?>
            <?php
              $cellClass  = 'cal-cell';
              $cellClass .= !$isOpen ? ' closed' : '';
              $cellClass .= $isToday ? ' today-col' : '';
              $cellClass .= ($part === 'B') ? ' half-B' : '';

              // Find reservation in this cell (part=full or specific)
              $cellRes = null;
              if ($halvesEnabled) {
                  // Show full-field reservation in both sub-cells; show A/B in their own
                  $cellRes = $resMap[$date]['full'][$slotStart][0]
                             ?? $resMap[$date][$part][$slotStart][0]
                             ?? null;
              } else {
                  $cellRes = $resMap[$date]['full'][$slotStart][0] ?? null;
              }

              $isStart = ($cellRes && $cellRes['start'] === $slotStart);
              // Calculate span (how many slots this reservation covers)
              $spanSlots = 0;
              if ($isStart && $cellRes) {
                  $sMin = SlotCalculator::timeToMinutes($cellRes['start']);
                  $eMin = SlotCalculator::timeToMinutes($cellRes['end']);
                  $spanSlots = max(1, ($eMin - $sMin) / $slotMin);
              }
              $cellClass .= $cellRes ? ' occupied' : '';
            ?>
            <div class="<?= $cellClass ?>"
                 data-date="<?= View::e($date) ?>"
                 data-start="<?= View::e($slotStart) ?>"
                 data-part="<?= View::e($part) ?>"
                 data-open="<?= $isOpen ? '1' : '0' ?>"
                 data-occupied="<?= $cellRes ? '1' : '0' ?>">
              <?php if ($isStart && $cellRes): ?>
                <?php
                  $isMine  = ($isLogged && $cellRes['userId'] === $userId);
                  $canEdit = $isMine || $isAdmin;
                  $blockCls = 'res-block ' . ($isMine ? 'res-block--mine' : 'res-block--other');
                  $blockCls .= ($cellRes['seriesId'] ? ' res-block--series' : '');
                  $fallbackColor = $isMine ? ReservationStyle::DEFAULT : ReservationStyle::OTHER;
                  $blockColor = ReservationStyle::sanitize($cellRes['color'] ?? null, $fallbackColor);
                  $textColor  = ReservationStyle::textColor($blockColor);
                  $displayName = $isLogged ? ($cellRes['note'] ?: 'Rezervace') : 'Obsazeno';
                  $partLabel = match($cellRes['part']) { 'A' => " ({$halfA})", 'B' => " ({$halfB})", default => '' };
                ?>
                <div class="<?= $blockCls ?>"
                     style="height: calc(<?= $spanSlots ?> * var(--slot-h-<?= $slotMin ?>) - 4px); background: <?= View::e($blockColor) ?>; color: <?= View::e($textColor) ?>;"
                     data-res-id="<?= View::e($cellRes['id']) ?>"
                     data-series-id="<?= View::e($cellRes['seriesId'] ?? '') ?>"
                     data-mine="<?= $isMine ? '1' : '0' ?>"
                     data-can-edit="<?= $canEdit ? '1' : '0' ?>"
                     data-note="<?= View::e($cellRes['note'] ?? '') ?>"
                     data-color="<?= View::e($blockColor) ?>">
                  <span class="res-name"><?= View::e($displayName . $partLabel) ?></span>
                  <span class="res-time"><?= View::e($cellRes['start']) ?>–<?= View::e($cellRes['end']) ?></span>
                </div>
              <?php endif; ?>
            </div>
          <?php endforeach; ?>
        <?php endforeach; ?>
      <?php endforeach; ?>

    </div><!-- /.calendar-grid -->
  </div><!-- /.calendar-wrap -->

  <?php if (empty($allSlotTimes)): ?>
    <p class="text-muted mt-2 text-center">Tento týden není žádný provozní den.</p>
  <?php endif; ?>

</div><!-- /.calendar-page -->

<!-- Reservation modal (injected by modal.js) -->
<div class="modal-overlay" id="resModalOverlay">
  <div class="modal" id="resModal">
    <button class="modal-close" id="resModalClose" aria-label="Zavřít">&times;</button>
    <h2 id="resModalTitle">Nová rezervace</h2>
    <div id="resModalBody"></div>
  </div>
</div>
