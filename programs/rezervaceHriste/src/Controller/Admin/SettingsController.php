<?php
declare(strict_types=1);

namespace App\Controller\Admin;

use App\Core\{Request, Response, View, Session, Csrf};
use App\Storage\JsonFileStore;
use App\Repository\SettingsRepository;

class SettingsController
{
    private function repo(): SettingsRepository
    {
        return new SettingsRepository(new JsonFileStore(DATA_DIR));
    }

    public function index(Request $request): void
    {
        echo View::render('admin/settings', [
            'pageTitle' => 'Admin – Nastavení',
            'settings'  => $this->repo()->get(),
        ]);
    }

    public function save(Request $request): void
    {
        Csrf::checkPost();
        $repo = $this->repo();
        $cur  = $repo->get();
        $days = ['mon','tue','wed','thu','fri','sat','sun'];

        $openingHours = [];
        foreach ($days as $d) {
            $openingHours[$d] = [
                'from'   => $request->post("oh_{$d}_from", '08:00'),
                'to'     => $request->post("oh_{$d}_to",   '22:00'),
                'closed' => $request->post("oh_{$d}_closed", '0') === '1',
            ];
        }

        $settings = array_merge($cur, [
            'slotMinutes'        => (int)$request->post('slotMinutes', 30),
            'openingHours'       => $openingHours,
            'maxAdvanceDays'     => (int)$request->post('maxAdvanceDays', 60),
            'minSlots'           => (int)$request->post('minSlots', 1),
            'maxSlots'           => (int)$request->post('maxSlots', 8),
            'maxRecurrenceWeeks' => (int)$request->post('maxRecurrenceWeeks', 26),
        ]);

        $repo->save($settings);
        Session::flash('success', 'Nastavení bylo uloženo.');
        Response::redirect('/admin/settings');
    }
}
