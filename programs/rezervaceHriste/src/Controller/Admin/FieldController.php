<?php
declare(strict_types=1);

namespace App\Controller\Admin;

use App\Core\{Request, Response, View, Session, Csrf};
use App\Storage\JsonFileStore;
use App\Repository\{FieldRepository, ReservationRepository, SettingsRepository};

class FieldController
{
    private const DAYS = ['mon','tue','wed','thu','fri','sat','sun'];

    private function repo(): FieldRepository
    {
        return new FieldRepository(new JsonFileStore(DATA_DIR));
    }

    public function index(Request $request): void
    {
        echo View::render('admin/fields', [
            'pageTitle' => 'Admin – Hřiště',
            'fields'    => $this->repo()->all(),
        ]);
    }

    public function edit(Request $request): void
    {
        $id    = (string)$request->get('id', '');
        $field = $this->repo()->findById($id);
        if (!$field) {
            Session::flash('error', 'Hřiště nenalezeno.');
            Response::redirect('/admin/fields');
        }

        $settings = (new SettingsRepository(new JsonFileStore(DATA_DIR)))->get();
        echo View::render('admin/field_edit', [
            'pageTitle' => 'Upravit hřiště – ' . ($field['name'] ?? ''),
            'field'     => $field,
            'settings'  => $settings,
        ]);
    }

    public function save(Request $request): void
    {
        Csrf::checkPost();
        $repo   = $this->repo();
        $id     = (string)$request->post('id', '');
        $name   = trim((string)$request->post('name', ''));
        $halves = $request->post('halvesEnabled', '0') === '1';
        $halfA  = trim((string)$request->post('halfA', 'Polovina A'));
        $halfB  = trim((string)$request->post('halfB', 'Polovina B'));
        $active = $request->post('active', '0') === '1';

        if (mb_strlen($name) < 1) {
            Session::flash('error', 'Název hřiště nesmí být prázdný.');
            Response::redirect($id ? '/admin/fields/edit?id=' . urlencode($id) : '/admin/fields');
        }

        $data = [
            'name'          => $name,
            'halvesEnabled' => $halves,
            'halfLabels'    => ['A' => $halfA ?: 'Polovina A', 'B' => $halfB ?: 'Polovina B'],
            'active'        => $active,
            'autumnFrom'    => $this->parseDate($request->post('autumnFrom', '')),
            'autumnTo'      => $this->parseDate($request->post('autumnTo', '')),
            'springFrom'    => $this->parseDate($request->post('springFrom', '')),
            'springTo'      => $this->parseDate($request->post('springTo', '')),
        ];

        $seasonError = $this->validateSeason($data);
        if ($seasonError) {
            Session::flash('error', $seasonError);
            Response::redirect($id ? '/admin/fields/edit?id=' . urlencode($id) : '/admin/fields');
        }

        if ($id) {
            $data['openingHoursOverride'] = $this->parseOpeningHours($request);
            $repo->update($id, $data);
            Session::flash('success', 'Hřiště bylo aktualizováno.');
        } else {
            $data['active'] = true;
            $repo->create($data);
            Session::flash('success', 'Hřiště bylo přidáno.');
        }
        Response::redirect('/admin/fields');
    }

    public function delete(Request $request): void
    {
        Csrf::checkPost();
        $id      = (string)$request->post('id', '');
        $hard    = $request->post('hard', '0') === '1';
        $resRepo = new ReservationRepository(new JsonFileStore(DATA_DIR));

        if ($hard) {
            if ($resRepo->hasFutureReservations($id)) {
                Session::flash('error', 'Hřiště má budoucí rezervace. Nejprve je zrušte.');
            } else {
                $this->repo()->hardDelete($id);
                Session::flash('success', 'Hřiště bylo trvale smazáno.');
            }
        } else {
            $this->repo()->deactivate($id);
            Session::flash('success', 'Hřiště bylo deaktivováno.');
        }
        Response::redirect('/admin/fields');
    }

    private function parseOpeningHours(Request $request): ?array
    {
        if ($request->post('useOwnHours', '0') !== '1') {
            return null;
        }
        $hours = [];
        foreach (self::DAYS as $d) {
            $hours[$d] = [
                'from'   => (string)$request->post("oh_{$d}_from", '08:00'),
                'to'     => (string)$request->post("oh_{$d}_to",   '22:00'),
                'closed' => $request->post("oh_{$d}_closed", '0') === '1',
            ];
        }
        return $hours;
    }

    private function parseDate(mixed $value): ?string
    {
        $value = trim((string)$value);
        return \App\Domain\Season::isDate($value) ? $value : null;
    }

    private function validateSeason(array $data): ?string
    {
        $pairs = [
            'Podzim' => [$data['autumnFrom'], $data['autumnTo']],
            'Jaro'   => [$data['springFrom'], $data['springTo']],
        ];
        foreach ($pairs as $name => [$from, $to]) {
            if (($from && !$to) || (!$from && $to)) {
                return "{$name}: vyplňte začátek i konec intervalu.";
            }
            if ($from && $to && $to < $from) {
                return "{$name}: konec musí být po začátku.";
            }
        }
        if ($data['autumnTo'] && $data['springFrom'] && $data['springFrom'] <= $data['autumnTo']) {
            return 'Jarní část sezóny musí začínat až po konci podzimu.';
        }
        return null;
    }
}
