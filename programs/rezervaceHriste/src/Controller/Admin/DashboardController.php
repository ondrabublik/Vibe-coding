<?php
declare(strict_types=1);

namespace App\Controller\Admin;

use App\Core\{Request, View};
use App\Storage\JsonFileStore;
use App\Repository\{ReservationRepository, FieldRepository, UserRepository};

class DashboardController
{
    public function index(Request $request): void
    {
        $store = new JsonFileStore(DATA_DIR);
        $total = count((new ReservationRepository($store))->active());
        $users = count((new UserRepository($store))->all());
        $fields = count((new FieldRepository($store))->active());
        echo View::render('admin/dashboard', [
            'pageTitle' => 'Admin – přehled',
            'totalRes'  => $total,
            'totalUsers'=> $users,
            'totalFields'=> $fields,
        ]);
    }
}
