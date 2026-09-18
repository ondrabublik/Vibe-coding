<?php
declare(strict_types=1);

namespace App\Domain;

class Season
{
    /**
     * @param array{from:string,to:string}|null $autumn
     * @param array{from:string,to:string}|null $spring
     */
    public function __construct(
        public readonly ?array $autumn,
        public readonly ?array $spring,
    ) {}

    public static function fromField(array $field): ?self
    {
        $autumn = self::parseInterval($field['autumnFrom'] ?? '', $field['autumnTo'] ?? '');
        $spring = self::parseInterval($field['springFrom'] ?? '', $field['springTo'] ?? '');

        // Legacy single interval: split into autumn / spring at the calendar year
        if (!$autumn && !$spring) {
            $from = (string)($field['seasonFrom'] ?? '');
            $to   = (string)($field['seasonTo'] ?? '');
            if (self::isDate($from) && self::isDate($to) && $to >= $from) {
                $fromYear = substr($from, 0, 4);
                $novEnd   = $fromYear . '-11-30';
                $marStart = ((int)$fromYear + 1) . '-03-01';
                if ($to <= $novEnd) {
                    $autumn = ['from' => $from, 'to' => $to];
                } elseif ($from >= $marStart) {
                    $spring = ['from' => $from, 'to' => $to];
                } else {
                    $autumn = ['from' => $from, 'to' => min($to, $novEnd)];
                    $springToStart = max($from, $marStart);
                    if ($springToStart <= $to) {
                        $spring = ['from' => $springToStart, 'to' => $to];
                    }
                }
            }
        }

        if (!$autumn && !$spring) {
            return null;
        }
        return new self($autumn, $spring);
    }

    public function contains(string $date): bool
    {
        return $this->inAutumn($date) || $this->inSpring($date);
    }

    public function inAutumn(string $date): bool
    {
        return $this->autumn !== null && $date >= $this->autumn['from'] && $date <= $this->autumn['to'];
    }

    public function inSpring(string $date): bool
    {
        return $this->spring !== null && $date >= $this->spring['from'] && $date <= $this->spring['to'];
    }

    /** End of the first half (podzim). Null if the date is already in spring. */
    public function halfUntil(string $startDate): ?string
    {
        if ($this->inAutumn($startDate)) {
            return $this->autumn['to'];
        }
        return null;
    }

    public function fullUntil(string $startDate): ?string
    {
        if ($this->inAutumn($startDate)) {
            return $this->spring['to'] ?? $this->autumn['to'];
        }
        if ($this->inSpring($startDate)) {
            return $this->spring['to'];
        }
        return $this->lastDate();
    }

    /**
     * Recurrence scopes: autumn_season, spring_season, both_seasons
     * (plus legacy half_season / full_season).
     */
    public static function normalizeScope(string $mode): string
    {
        return match ($mode) {
            'half_season' => 'autumn_season',
            'full_season' => 'both_seasons',
            default       => $mode,
        };
    }

    public function scopeUntil(string $scope): ?string
    {
        $scope = self::normalizeScope($scope);
        return match ($scope) {
            'autumn_season' => $this->autumn['to'] ?? null,
            'spring_season' => $this->spring['to'] ?? null,
            'both_seasons'  => $this->lastDate(),
            default         => $this->lastDate(),
        };
    }

    public function scopeContains(string $date, string $scope): bool
    {
        $scope = self::normalizeScope($scope);
        return match ($scope) {
            'autumn_season' => $this->inAutumn($date),
            'spring_season' => $this->inSpring($date),
            'both_seasons'  => $this->contains($date),
            default         => $this->contains($date),
        };
    }

    public function scopeHasRemaining(string $scope, string $fromDate): bool
    {
        $until = $this->scopeUntil($scope);
        return $until !== null && $until >= $fromDate;
    }

    public function firstDate(): ?string
    {
        $dates = array_filter([
            $this->autumn['from'] ?? null,
            $this->spring['from'] ?? null,
        ]);
        return $dates ? min($dates) : null;
    }

    public function lastDate(): ?string
    {
        $dates = array_filter([
            $this->autumn['to'] ?? null,
            $this->spring['to'] ?? null,
        ]);
        return $dates ? max($dates) : null;
    }

    public function label(): string
    {
        $parts = [];
        if ($this->autumn) {
            $parts[] = 'Podzim ' . self::formatCs($this->autumn['from']) . ' – ' . self::formatCs($this->autumn['to']);
        }
        if ($this->spring) {
            $parts[] = 'Jaro ' . self::formatCs($this->spring['from']) . ' – ' . self::formatCs($this->spring['to']);
        }
        return implode(' · ', $parts);
    }

    public static function isDate(string $value): bool
    {
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return false;
        }
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $value);
        return $dt !== false && $dt->format('Y-m-d') === $value;
    }

    public static function formatCs(string $date): string
    {
        $dt = \DateTimeImmutable::createFromFormat('Y-m-d', $date);
        return $dt ? $dt->format('j. n. Y') : $date;
    }

    /** @return array{from:string,to:string}|null */
    private static function parseInterval(mixed $from, mixed $to): ?array
    {
        $from = (string)$from;
        $to   = (string)$to;
        if (!self::isDate($from) || !self::isDate($to) || $to < $from) {
            return null;
        }
        return ['from' => $from, 'to' => $to];
    }
}
