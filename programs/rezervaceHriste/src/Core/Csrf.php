<?php
declare(strict_types=1);

namespace App\Core;

class Csrf
{
    private const KEY = '_csrf_token';

    public static function token(): string
    {
        if (empty($_SESSION[self::KEY])) {
            $_SESSION[self::KEY] = bin2hex(random_bytes(32));
        }
        return $_SESSION[self::KEY];
    }

    public static function field(): string
    {
        $token = self::token();
        return "<input type=\"hidden\" name=\"_csrf\" value=\"" . htmlspecialchars($token) . "\">";
    }

    public static function verify(string $token): bool
    {
        $stored = $_SESSION[self::KEY] ?? '';
        return hash_equals($stored, $token);
    }

    public static function checkPost(): void
    {
        $token = $_POST['_csrf'] ?? '';
        if (!self::verify($token)) {
            http_response_code(403);
            exit('CSRF token mismatch');
        }
    }
}
