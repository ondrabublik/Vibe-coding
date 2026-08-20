<?php
declare(strict_types=1);

namespace App\Controller;

use App\Core\{Request, Response, View, Session};
use App\Storage\JsonFileStore;
use App\Repository\{FieldRepository, ReservationRepository, SettingsRepository};
use App\Domain\SlotCalculator;

class CalendarController
{
    private function repos(): array
    {
        $store = new JsonFileStore(DATA_DIR);
        return [
            new FieldRepository($store),
            new ReservationRepository($store),
            new SettingsRepository($store),
        ];
    }

    public function week(Request $request): void
    {
        [$fieldRepo, $resRepo, $settRepo] = $this->repos();

        $fields = $fieldRepo->active();
        if (empty($fields)) {
            echo View::render('calendar/week', [
                'pageTitle' => 'Rezervace',
                'fields'    => [],
                'field'     => null,
                'days'      => [],
                'settings'  => [],
                'weekStart' => date('Y-m-d'),
                'weekEnd'   => date('Y-m-d'),
                'prevWeek'  => null,
                'nextWeek'  => null,
                'weekRange' => '',
                'reservations' => [],
                'slotsPerDay'  => [],
                'isLogged'  => Session::isLoggedIn(),
                'userId'    => Session::userId(),
            ]);
            return;
        }

        // Determine field
        $fieldId = $request->get('field', $fields[0]['id']);
        $field   = null;
        foreach ($fields as $f) {
            if ($f['id'] === $fieldId) { $field = $f; break; }
        }
        if (!$field) { $field = $fields[0]; $fieldId = $field['id']; }

        // Determine week
        $weekParam = $request->get('week', '');
        [$weekStart, $weekEnd] = $this->resolveWeek($weekParam);

        $settings     = $settRepo->get();
        $reservations = $resRepo->forWeek($fieldId, $weekStart, $weekEnd);

        $days        = [];
        $slotsPerDay = [];
        $cursor = new \DateTimeImmutable($weekStart);
        $override = $field['openingHoursOverride'] ?? null;
        for ($i = 0; $i < 7; $i++) {
            $date = $cursor->format('Y-m-d');
            $days[]                = $date;
            $slotsPerDay[$date]    = SlotCalculator::slotsForDate($date, $settings, $override);
            $cursor = $cursor->modify('+1 day');
        }

        $prevWeek = date('Y-m-d', strtotime('-7 days', strtotime($weekStart)));
        $nextWeek = date('Y-m-d', strtotime('+7 days', strtotime($weekStart)));
        $weekRange = $this->formatRange($weekStart, $weekEnd);

        echo View::render('calendar/week', [
            'pageTitle'    => 'Rezervace – ' . $field['name'],
            'fields'       => $fields,
            'field'        => $field,
            'days'         => $days,
            'settings'     => $settings,
            'weekStart'    => $weekStart,
            'weekEnd'      => $weekEnd,
            'prevWeek'     => $prevWeek,
            'nextWeek'     => $nextWeek,
            'weekRange'    => $weekRange,
            'reservations' => $reservations,
            'slotsPerDay'  => $slotsPerDay,
            'isLogged'     => Session::isLoggedIn(),
            'userId'       => Session::userId(),
        ]);
    }

    public function apiWeek(Request $request): void
    {
        [$fieldRepo, $resRepo, $settRepo] = $this->repos();

        $fieldId  = $request->get('field', '');
        $weekParam = $request->get('week', '');
        [$weekStart, $weekEnd] = $this->resolveWeek($weekParam);

        $field = $fieldRepo->findById($fieldId);
        if (!$field) Response::json(['error' => 'Field not found'], 404);

        $settings     = $settRepo->get();
        $reservations = $resRepo->forWeek($fieldId, $weekStart, $weekEnd);
        $slotsPerDay  = [];
        $override = $field['openingHoursOverride'] ?? null;

        $cursor = new \DateTimeImmutable($weekStart);
        for ($i = 0; $i < 7; $i++) {
            $date = $cursor->format('Y-m-d');
            $slotsPerDay[$date] = SlotCalculator::slotsForDate($date, $settings, $override);
            $cursor = $cursor->modify('+1 day');
        }

        // Sanitize reservation data for non-logged-in users
        $isLogged = Session::isLoggedIn();
        $userId   = Session::userId();
        $sanitized = array_map(function ($r) use ($isLogged, $userId) {
            if ($isLogged) return $r;
            // Hide personal info
            return array_merge($r, ['userId' => null, 'note' => '']);
        }, $reservations);

        Response::json([
            'field'        => $field,
            'weekStart'    => $weekStart,
            'weekEnd'      => $weekEnd,
            'slotsPerDay'  => $slotsPerDay,
            'reservations' => $sanitized,
            'settings'     => ['slotMinutes' => $settings['slotMinutes']],
            'userId'       => $userId,
        ]);
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    private function resolveWeek(string $weekParam): array
    {
        if ($weekParam && preg_match('/^\d{4}-\d{2}-\d{2}$/', $weekParam)) {
            $dt    = new \DateTimeImmutable($weekParam);
            $start = $dt->modify('Monday this week')->format('Y-m-d');
        } else {
            $start = (new \DateTimeImmutable())->modify('Monday this week')->format('Y-m-d');
        }
        $end = date('Y-m-d', strtotime('+6 days', strtotime($start)));
        return [$start, $end];
    }

    private function formatRange(string $start, string $end): string
    {
        $s = new \DateTimeImmutable($start);
        $e = new \DateTimeImmutable($end);
        $months = ['ledna','února','března','dubna','května','června',
                   'července','srpna','září','října','listopadu','prosince'];
        $sm = $months[(int)$s->format('n') - 1];
        $em = $months[(int)$e->format('n') - 1];
        if ($s->format('m') === $e->format('m')) {
            return $s->format('j') . '. – ' . $e->format('j') . '. ' . $sm . ' ' . $e->format('Y');
        }
        return $s->format('j') . '. ' . $sm . ' – ' . $e->format('j') . '. ' . $em . ' ' . $e->format('Y');
    }
}
