<?php
declare(strict_types=1);

namespace App\Domain;

/**
 * Generates time slots for a given date based on opening hours and slotMinutes.
 */
class SlotCalculator
{
    private static array $DOW_MAP = [
        1 => 'mon', 2 => 'tue', 3 => 'wed',
        4 => 'thu', 5 => 'fri', 6 => 'sat', 7 => 'sun',
    ];

    /**
     * Returns list of ['start'=>'HH:MM','end'=>'HH:MM'] for the given date.
     * If day is closed returns [].
     *
     * @param string $date       YYYY-MM-DD
     * @param array  $settings   settings record from SettingsRepository::get()
     * @param array|null $override  per-field openingHoursOverride or null
     */
    public static function slotsForDate(string $date, array $settings, ?array $override = null): array
    {
        $dow     = (int)(new \DateTimeImmutable($date))->format('N'); // 1=Mon,7=Sun
        $key     = self::$DOW_MAP[$dow];
        $hours   = $override ?? $settings['openingHours'];
        $dayConf = $hours[$key] ?? null;

        if (!$dayConf || ($dayConf['closed'] ?? false)) {
            return [];
        }

        $slotMin = (int)($settings['slotMinutes'] ?? 30);
        $from    = self::timeToMinutes($dayConf['from']);
        $to      = self::timeToMinutes($dayConf['to']);
        $slots   = [];

        for ($t = $from; $t + $slotMin <= $to; $t += $slotMin) {
            $slots[] = [
                'start' => self::minutesToTime($t),
                'end'   => self::minutesToTime($t + $slotMin),
            ];
        }
        return $slots;
    }

    public static function isWithinOpeningHours(string $date, string $start, string $end, array $settings, ?array $override = null): bool
    {
        $dow   = (int)(new \DateTimeImmutable($date))->format('N');
        $key   = self::$DOW_MAP[$dow];
        $hours = $override ?? $settings['openingHours'];
        $day   = $hours[$key] ?? null;
        if (!$day || ($day['closed'] ?? false)) return false;

        $from = self::timeToMinutes($day['from']);
        $to   = self::timeToMinutes($day['to']);
        $s    = self::timeToMinutes($start);
        $e    = self::timeToMinutes($end);
        return $s >= $from && $e <= $to && $s < $e;
    }

    public static function isOnGrid(string $time, int $slotMinutes): bool
    {
        $m = self::timeToMinutes($time);
        return ($m % $slotMinutes) === 0;
    }

    public static function timeToMinutes(string $time): int
    {
        [$h, $m] = explode(':', $time);
        return (int)$h * 60 + (int)$m;
    }

    public static function minutesToTime(int $minutes): string
    {
        return sprintf('%02d:%02d', intdiv($minutes, 60), $minutes % 60);
    }
}
