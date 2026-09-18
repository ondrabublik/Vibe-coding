<?php
declare(strict_types=1);

namespace App\Domain;

/**
 * Expands a reservation with weekly recurrence into individual date instances.
 */
class RecurrenceExpander
{
    /**
     * Returns array of date strings (YYYY-MM-DD).
     * If no recurrence, returns just the base date.
     *
     * @param string      $baseDate   YYYY-MM-DD
     * @param array|null  $recurrence ['type'=>'weekly','interval'=>1,'until'=>'YYYY-MM-DD']
     * @param int         $maxWeeks   safety cap
     */
    public static function expand(string $baseDate, ?array $recurrence, int $maxWeeks = 26): array
    {
        if (!$recurrence || ($recurrence['type'] ?? '') !== 'weekly') {
            return [$baseDate];
        }

        $interval = max(1, (int)($recurrence['interval'] ?? 1));
        $until    = $recurrence['until'] ?? '';
        if (!$until) {
            return [$baseDate];
        }

        $dates  = [];
        $cursor = new \DateTimeImmutable($baseDate);
        $end    = new \DateTimeImmutable($until);
        $step   = new \DateInterval("P{$interval}W");
        $cap    = $maxWeeks;
        $count  = 0;

        while ($cursor <= $end && $count < $cap) {
            $dates[] = $cursor->format('Y-m-d');
            $cursor  = $cursor->add($step);
            $count++;
        }
        return $dates;
    }
}
