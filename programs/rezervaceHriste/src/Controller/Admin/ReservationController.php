<?php
declare(strict_types=1);

namespace App\Controller\Admin;

use App\Core\{Request, Response, View, Session, Csrf};
use App\Storage\JsonFileStore;
use App\Repository\{ReservationRepository, FieldRepository, UserRepository, SettingsRepository};
use App\Service\ReservationService;

class ReservationController
{
    public function index(Request $request): void
    {
        $store = new JsonFileStore(DATA_DIR);
        $resRepo   = new ReservationRepository($store);
        $fieldRepo = new FieldRepository($store);
        $userRepo  = new UserRepository($store);

        $reservations = $resRepo->all();
        $fields = [];
        foreach ($fieldRepo->all() as $f) { $fields[$f['id']] = $f; }
        $users  = [];
        foreach ($userRepo->all() as $u)  { $users[$u['id']]  = $u; }

        // Filter
        $filterField  = $request->get('field', '');
        $filterStatus = $request->get('status', 'active');
        $filterDate   = $request->get('date', '');
        if ($filterField)  $reservations = array_filter($reservations, fn($r) => $r['fieldId'] === $filterField);
        if ($filterStatus) $reservations = array_filter($reservations, fn($r) => ($r['status'] ?? 'active') === $filterStatus);
        if ($filterDate)   $reservations = array_filter($reservations, fn($r) => $r['date'] === $filterDate);

        usort($reservations, fn($a,$b) => strcmp($b['date'].$b['start'], $a['date'].$a['start']));

        echo View::render('admin/reservations', [
            'pageTitle'    => 'Admin – Rezervace',
            'reservations' => array_values($reservations),
            'fields'       => $fields,
            'users'        => $users,
            'filterField'  => $filterField,
            'filterStatus' => $filterStatus,
            'filterDate'   => $filterDate,
            'allFields'    => $fieldRepo->all(),
        ]);
    }

    public function cancel(Request $request): void
    {
        Csrf::checkPost();
        $store = new JsonFileStore(DATA_DIR);
        $svc   = new ReservationService(
            new ReservationRepository($store),
            new FieldRepository($store),
            new SettingsRepository($store),
        );
        $id       = (string)$request->post('id', '');
        $seriesId = (string)$request->post('seriesId', '');
        $scope    = (string)$request->post('scope', 'one');

        if ($scope === 'series' && $seriesId) {
            $svc->cancelSeries($seriesId, Session::userId() ?? '', true);
        } else {
            $svc->cancel($id, Session::userId() ?? '', true);
        }
        Session::flash('success', 'Rezervace byla zrušena.');
        Response::redirect('/admin/reservations');
    }
}
