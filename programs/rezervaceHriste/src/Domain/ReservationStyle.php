<?php
declare(strict_types=1);

namespace App\Domain;

class ReservationStyle
{
    public const DEFAULT = '#1a6b3a';
    public const OTHER   = '#64748b';

    public const PALETTE = [
        '#1a6b3a',
        '#0f766e',
        '#1d4ed8',
        '#7c3aed',
        '#db2777',
        '#ea580c',
        '#dc2626',
        '#64748b',
        '#92400e',
        '#0891b2',
    ];

    public static function sanitize(?string $color, string $fallback = self::DEFAULT): string
    {
        $color = strtolower(trim((string)$color));
        if (preg_match('/^#[0-9a-f]{6}$/', $color) && in_array($color, self::PALETTE, true)) {
            return $color;
        }
        return $fallback;
    }

    public static function textColor(string $bg): string
    {
        $bg = ltrim($bg, '#');
        if (strlen($bg) !== 6) return '#ffffff';
        $r = hexdec(substr($bg, 0, 2));
        $g = hexdec(substr($bg, 2, 2));
        $b = hexdec(substr($bg, 4, 2));
        $luma = (0.299 * $r + 0.587 * $g + 0.114 * $b) / 255;
        return $luma > 0.62 ? '#1e2532' : '#ffffff';
    }
}
