<?php
declare(strict_types=1);

namespace App\Domain;

use App\Domain\SlotCalculator;

/**
 * Detects collisions between reservations.
 *
 * part values: 'full' | 'A' | 'B'
 * Rules:
 *   - 'full' conflicts with anything (full, A, B)
 *   - 'A'    conflicts with full and A
 *   - 'B'    conflicts with full and B
 *   - 'A' and 'B' do NOT conflict with each other
 */
class CollisionChecker
{
    /**
     * Check a list of proposed {fieldId, part, date, start, end} against
     * existing active reservations.
     *
     * @param array $proposed  array of reservation-like arrays
     * @param array $existing  active reservations from the store (may include 'id')
     * @param string|null $excludeSeriesId  skip existing records with this seriesId
     * @return array  array of ['proposed'=>..., 'existing'=>...] collision pairs
     */
    public static function findCollisions(array $proposed, array $existing, ?string $excludeSeriesId = null): array
    {
        $collisions = [];
        foreach ($proposed as $p) {
            foreach ($existing as $e) {
                if ($excludeSeriesId && ($e['seriesId'] ?? null) === $excludeSeriesId) continue;
                if (($e['status'] ?? 'active') !== 'active') continue;
                if ($e['fieldId'] !== $p['fieldId']) continue;
                if ($e['date']    !== $p['date'])    continue;
                if (!self::partsConflict($p['part'], $e['part'])) continue;
                if (!self::timesOverlap($p['start'], $p['end'], $e['start'], $e['end'])) continue;
                $collisions[] = ['proposed' => $p, 'existing' => $e];
            }
        }
        return $collisions;
    }

    private static function partsConflict(string $a, string $b): bool
    {
        if ($a === 'full' || $b === 'full') return true;
        return $a === $b;
    }

    private static function timesOverlap(string $s1, string $e1, string $s2, string $e2): bool
    {
        $s1m = SlotCalculator::timeToMinutes($s1);
        $e1m = SlotCalculator::timeToMinutes($e1);
        $s2m = SlotCalculator::timeToMinutes($s2);
        $e2m = SlotCalculator::timeToMinutes($e2);
        return $s1m < $e2m && $s2m < $e1m;
    }
}
