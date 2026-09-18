<?php
declare(strict_types=1);

namespace App\Service;

use App\Storage\JsonFileStore;
use App\Repository\UserRepository;
use App\Repository\FieldRepository;
use App\Repository\SettingsRepository;

/**
 * Seeds default data on first run (when data files are absent).
 */
class SeedService
{
    public function run(): void
    {
        $store    = new JsonFileStore(DATA_DIR);
        $userRepo = new UserRepository($store);
        $fieldRepo= new FieldRepository($store);
        $settRepo = new SettingsRepository($store);

        // Seed settings
        if (!file_exists(DATA_DIR . '/settings.txt')) {
            $settRepo->save($settRepo->defaults());
        }

        // Seed fields
        if (!file_exists(DATA_DIR . '/fields.txt')) {
            $fieldRepo->create([
                'name'          => 'Hřiště 1',
                'halvesEnabled' => true,
                'halfLabels'    => ['A' => 'Levá polovina', 'B' => 'Pravá polovina'],
                'order'         => 1,
                'autumnFrom'    => date('Y') . '-08-01',
                'autumnTo'      => date('Y') . '-11-30',
                'springFrom'    => (date('Y') + 1) . '-03-01',
                'springTo'      => (date('Y') + 1) . '-06-30',
            ]);
            $fieldRepo->create([
                'name'          => 'Hřiště 2',
                'halvesEnabled' => true,
                'halfLabels'    => ['A' => 'Levá polovina', 'B' => 'Pravá polovina'],
                'order'         => 2,
                'autumnFrom'    => date('Y') . '-08-01',
                'autumnTo'      => date('Y') . '-11-30',
                'springFrom'    => (date('Y') + 1) . '-03-01',
                'springTo'      => (date('Y') + 1) . '-06-30',
            ]);
            $fieldRepo->create([
                'name'          => 'Hřiště 3',
                'halvesEnabled' => false,
                'halfLabels'    => ['A' => 'Polovina A', 'B' => 'Polovina B'],
                'order'         => 3,
                'autumnFrom'    => date('Y') . '-08-01',
                'autumnTo'      => date('Y') . '-11-30',
                'springFrom'    => (date('Y') + 1) . '-03-01',
                'springTo'      => (date('Y') + 1) . '-06-30',
            ]);
        }

        // Seed admin user
        if (!file_exists(DATA_DIR . '/users.txt')) {
            $userRepo->create([
                'email'        => 'admin@hriste.cz',
                'name'         => 'Administrátor',
                'phone'        => '',
                'passwordHash' => password_hash('admin123', PASSWORD_BCRYPT),
                'role'         => 'admin',
                'active'       => true,
            ]);
        }
    }
}
