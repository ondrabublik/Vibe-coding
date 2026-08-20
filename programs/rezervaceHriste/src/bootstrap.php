<?php
declare(strict_types=1);

define('ROOT_DIR',   dirname(__DIR__));
define('SRC_DIR',    ROOT_DIR . '/src');
define('VIEWS_DIR',  ROOT_DIR . '/views');
define('DATA_DIR',   ROOT_DIR . '/data');

spl_autoload_register(function (string $class): void {
    $prefix = 'App\\';
    if (!str_starts_with($class, $prefix)) return;
    $relative = substr($class, strlen($prefix));
    $file = SRC_DIR . DIRECTORY_SEPARATOR . str_replace('\\', DIRECTORY_SEPARATOR, $relative) . '.php';
    if (file_exists($file)) {
        require_once $file;
    }
});

use App\Core\Session;
use App\Core\Config;
use App\Core\View;

Session::start();

Config::load([
    'app_name'  => 'Rezervace hřišť',
    'data_dir'  => DATA_DIR,
    'timezone'  => 'Europe/Prague',
    'base_url'  => '',
]);

date_default_timezone_set('Europe/Prague');

View::setViewsDir(VIEWS_DIR);

// Seed initial data if data files are missing
(new App\Service\SeedService())->run();
