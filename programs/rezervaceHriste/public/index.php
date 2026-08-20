<?php
declare(strict_types=1);

require_once dirname(__DIR__) . '/src/bootstrap.php';

use App\Core\Router;
use App\Core\Request;
use App\Core\Response;
use App\Core\Session;

$router  = new Router();
$request = new Request();

// Middleware factories
$auth = function (Request $req): void {
    if (!Session::isLoggedIn()) {
        Response::redirect('/?login=1');
    }
};

$adminOnly = function (Request $req): void {
    if (!Session::isLoggedIn()) {
        Response::redirect('/?login=1');
    }
    if (!Session::isAdmin()) {
        Response::forbidden();
    }
};

// ─── Public ──────────────────────────────────────────────────────────────────
$router->get('/',                    [App\Controller\CalendarController::class, 'week']);
$router->get('/api/week',            [App\Controller\CalendarController::class, 'apiWeek']);

// ─── Auth ─────────────────────────────────────────────────────────────────────
$router->get('/login',               [App\Controller\AuthController::class, 'loginForm']);
$router->post('/login',              [App\Controller\AuthController::class, 'login']);
$router->get('/register',            [App\Controller\AuthController::class, 'registerForm']);
$router->post('/register',           [App\Controller\AuthController::class, 'register']);
$router->post('/logout',             [App\Controller\AuthController::class, 'logout']);

// ─── Reservations (logged-in) ─────────────────────────────────────────────────
$router->post('/reservation',        [App\Controller\ReservationController::class, 'create'],  [$auth]);
$router->post('/reservation/update', [App\Controller\ReservationController::class, 'update'],  [$auth]);
$router->post('/reservation/cancel', [App\Controller\ReservationController::class, 'cancel'],  [$auth]);

// ─── Admin ────────────────────────────────────────────────────────────────────
$router->get('/admin',               [App\Controller\Admin\DashboardController::class, 'index'],   [$adminOnly]);
$router->get('/admin/fields',        [App\Controller\Admin\FieldController::class,     'index'],   [$adminOnly]);
$router->get('/admin/fields/edit',   [App\Controller\Admin\FieldController::class,     'edit'],    [$adminOnly]);
$router->post('/admin/fields',       [App\Controller\Admin\FieldController::class,     'save'],    [$adminOnly]);
$router->post('/admin/fields/delete',[App\Controller\Admin\FieldController::class,     'delete'],  [$adminOnly]);
$router->get('/admin/settings',      [App\Controller\Admin\SettingsController::class,  'index'],   [$adminOnly]);
$router->post('/admin/settings',     [App\Controller\Admin\SettingsController::class,  'save'],    [$adminOnly]);
$router->get('/admin/users',         [App\Controller\Admin\UserController::class,      'index'],   [$adminOnly]);
$router->post('/admin/users',        [App\Controller\Admin\UserController::class,      'save'],    [$adminOnly]);
$router->get('/admin/reservations',  [App\Controller\Admin\ReservationController::class,'index'],  [$adminOnly]);
$router->post('/admin/reservations/cancel', [App\Controller\Admin\ReservationController::class,'cancel'], [$adminOnly]);

$router->dispatch($request);
