<?php
declare(strict_types=1);

namespace App\Core;

class View
{
    private static string $viewsDir = '';

    public static function setViewsDir(string $dir): void
    {
        self::$viewsDir = rtrim($dir, '/\\');
    }

    public static function render(string $template, array $data = [], bool $withLayout = true): string
    {
        $file = self::$viewsDir . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $template) . '.php';
        if (!file_exists($file)) {
            throw new \RuntimeException("View not found: $file");
        }
        extract($data, EXTR_SKIP);
        ob_start();
        require $file;
        $content = ob_get_clean();

        if ($withLayout) {
            $layoutFile = self::$viewsDir . DIRECTORY_SEPARATOR . 'layout.php';
            ob_start();
            require $layoutFile;
            return ob_get_clean();
        }
        return $content;
    }

    public static function renderPartial(string $template, array $data = []): string
    {
        return self::render($template, $data, false);
    }

    public static function e(mixed $value): string
    {
        return htmlspecialchars((string)$value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
