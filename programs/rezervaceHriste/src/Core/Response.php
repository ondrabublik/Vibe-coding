<?php
declare(strict_types=1);

namespace App\Core;

class Response
{
    public static function json(mixed $data, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        exit;
    }

    public static function redirect(string $url, int $status = 302): never
    {
        http_response_code($status);
        header("Location: $url");
        exit;
    }

    public static function notFound(): never
    {
        http_response_code(404);
        echo '<h1>404 – Stránka nenalezena</h1>';
        exit;
    }

    public static function forbidden(): never
    {
        http_response_code(403);
        echo '<h1>403 – Přístup zamítnut</h1>';
        exit;
    }
}
