<?php
declare(strict_types=1);

namespace App\Core;

class Config
{
    private static array $data = [];

    public static function load(array $data): void
    {
        self::$data = $data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$data[$key] ?? $default;
    }

    public static function all(): array
    {
        return self::$data;
    }
}
